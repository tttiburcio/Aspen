import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, Receipt, Truck, Hash, CreditCard, Landmark,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { patchFatura, getFaturaDetail, getContratoVeiculos } from '../../utils/api'
import { brl } from '../../utils/format'

// ─── Constants ───────────────────────────────────────────────────────
const FORMAS_PAGAMENTO = ['Boleto', 'Pix', 'TED', 'Depósito', 'Dinheiro', 'Débito Automático']
const STATUS_REC = ['Pendente', 'Recebido', 'Vencido', 'Cancelado']
const STATUS_IMP = ['Pendente', 'Pago', 'Isento']

function roundTo(v, d = 2) {
  return Math.round(v * Math.pow(10, d)) / Math.pow(10, d)
}

// ─── Sub-components ──────────────────────────────────────────────────
const inputCls  = 'w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors'
const selectCls = inputCls

function SectionHeader({ icon: Icon, label, color = 'text-g-500' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
      <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold">{label}</p>
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-g-500 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-g-700 text-[10px] mt-0.5">{hint}</p>}
    </div>
  )
}

function KpiMini({ label, value, accent = 'text-g-100' }) {
  return (
    <div className="flex flex-col gap-0.5 p-3 bg-g-900 border border-g-800 rounded-xl flex-1">
      <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold">{label}</p>
      <p className={`font-bold text-sm font-mono tabular-nums leading-tight ${accent}`}>{value}</p>
    </div>
  )
}

// ─── Main modal ──────────────────────────────────────────────────────
export default function FaturaEditModal({ fatura, onClose, onSaved }) {
  // ── Form state ──
  const [numeroFatura, setNumeroFatura] = useState(fatura.numero_fatura ?? '')
  const [emissao,      setEmissao]      = useState(fatura.emissao ?? '')
  const [vencimento,   setVencimento]   = useState(fatura.vencimento ?? '')
  const [aliquota,     setAliquota]     = useState(fatura.aliquota_imposto ?? 11.33)
  const [valorRec,     setValorRec]     = useState(fatura.valor_recebido > 0 ? fatura.valor_recebido : '')
  const [statusRec,    setStatusRec]    = useState(
    // Normalise: 'Vencido' is derived; store as 'Pendente' in DB
    fatura.status_recebimento === 'Vencido' ? 'Pendente' : (fatura.status_recebimento ?? 'Pendente')
  )
  const [statusImp,    setStatusImp]    = useState(fatura.status_imposto ?? 'Pendente')
  const [dataPgtoImp,  setDataPgtoImp]  = useState(fatura.data_pgto_imposto ?? '')
  const [encargo,      setEncargo]      = useState(fatura.encargo_imposto > 0 ? fatura.encargo_imposto : '')
  const [formaPgto,    setFormaPgto]    = useState(fatura.forma_pagamento ?? '')

  // ── Vehicle rows ──
  const [veiculoRows,   setVeiculoRows]   = useState([])
  const [detailLoading, setDetailLoading] = useState(true)

  // ── Load vehicle detail + contract vehicles ──
  useEffect(() => {
    const fetchAll = async () => {
      setDetailLoading(true)
      try {
        const [detail, contratoVeiculos] = await Promise.all([
          getFaturaDetail(fatura.id),
          fatura.id_contrato ? getContratoVeiculos(fatura.id_contrato) : Promise.resolve([]),
        ])

        // Map fatura's current per-vehicle breakdown
        const fatMap = new Map((detail.por_veiculo || []).map(r => [r.id_veiculo, r]))

        // Start with all contract vehicles (ordered by contract sequence)
        const rows = (contratoVeiculos || []).map(cv => {
          const fat = fatMap.get(cv.id_veiculo)
          if (fat) {
            return {
              id_veiculo:   fat.id_veiculo,
              placa:        fat.placa  || cv.placa  || '—',
              modelo:       fat.modelo || cv.modelo || '—',
              qtd_dias:     fat.trabalhado || 30,
              valor_diaria: fat.valor_diaria || 0,
              subtotal:     fat.medicao || 0,
              inFatura:     fat.fonte === 'fatura',
            }
          }
          // Contract vehicle not yet in fatura — pre-fill with contract defaults
          const vm = cv.valor_mensal || 0
          return {
            id_veiculo:   cv.id_veiculo,
            placa:        cv.placa  || '—',
            modelo:       cv.modelo || '—',
            qtd_dias:     30,
            valor_diaria: vm > 0 ? roundTo(vm / 30, 4) : 0,
            subtotal:     roundTo(vm, 2),
            inFatura:     false,
          }
        })

        // Also include any fatura vehicles not in contract (edge case)
        for (const [id, fat] of fatMap) {
          if (!rows.find(r => r.id_veiculo === id)) {
            rows.push({
              id_veiculo:   fat.id_veiculo,
              placa:        fat.placa  || '—',
              modelo:       fat.modelo || '—',
              qtd_dias:     fat.trabalhado || 30,
              valor_diaria: fat.valor_diaria || 0,
              subtotal:     fat.medicao || 0,
              inFatura:     fat.fonte === 'fatura',
            })
          }
        }

        setVeiculoRows(rows)
      } catch {
        toast.error('Erro ao carregar detalhamento por veículo')
      } finally {
        setDetailLoading(false)
      }
    }
    fetchAll()
  }, [fatura.id, fatura.id_contrato])

  // ── Computed totals (driven by vehicle table) ──
  const totalLoc   = useMemo(() => roundTo(veiculoRows.reduce((s, r) => s + (parseFloat(r.subtotal) || 0), 0)), [veiculoRows])
  const aliqNum    = parseFloat(aliquota) || 0
  const imposto    = roundTo(totalLoc * aliqNum / 100)
  const liquido    = roundTo(totalLoc - imposto)
  const recNum     = parseFloat(valorRec)  || 0
  const encargoNum = parseFloat(encargo)   || 0

  const updateRow = (idx, field, raw) => {
    setVeiculoRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: raw === '' ? '' : parseFloat(raw) || 0 }
      updated.subtotal = roundTo((parseFloat(updated.valor_diaria) || 0) * (parseFloat(updated.qtd_dias) || 0))
      return updated
    }))
  }

  // ── Save ──
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!emissao)    return toast.error('Informe a data de emissão')
    if (!vencimento) return toast.error('Informe a data de vencimento')
    if (!totalLoc)   return toast.error('Valor total deve ser maior que zero')

    setSaving(true)
    try {
      await patchFatura(fatura.id, {
        numero_fatura:      numeroFatura !== '' ? parseInt(numeroFatura) : null,
        emissao,
        vencimento,
        valor_locacoes:     totalLoc,
        aliquota_imposto:   aliqNum,
        valor_imposto:      imposto,
        valor_liquido:      liquido,
        valor_recebido:     recNum     > 0 ? recNum     : null,
        status_recebimento: statusRec,
        status_imposto:     statusImp,
        data_pgto_imposto:  dataPgtoImp || null,
        encargo_imposto:    encargoNum  > 0 ? encargoNum : null,
        forma_pagamento:    formaPgto   || null,
        por_veiculo: veiculoRows
          .filter(r => (r.subtotal || 0) > 0)
          .map(r => ({ id_veiculo: r.id_veiculo, subtotal: r.subtotal, qtd_dias: r.qtd_dias || 30 })),
      })
      toast.success('Fatura atualizada')
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao atualizar fatura')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-g-800 shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl shrink-0">
                <Receipt className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-g-100 font-bold text-base leading-tight">
                  Editar Fatura #{fatura.numero_fatura ?? fatura.id}
                </h2>
                <p className="text-g-500 text-xs mt-0.5 truncate">
                  {fatura.empresa_sigla}
                  {fatura.contrato_cliente && ` · ${fatura.contrato_cliente}`}
                  {fatura.emissao_display  && ` · ${fatura.emissao_display}`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors shrink-0 ml-3 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-6">

          {/* ── Identificação ── */}
          <div>
            <SectionHeader icon={Hash} label="Identificação" />
            <div className="grid grid-cols-4 gap-3">
              <Field label="Nº Fatura">
                <input type="number" min="1" value={numeroFatura}
                  onChange={e => setNumeroFatura(e.target.value)}
                  placeholder="—" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Emissão" required>
                <input type="date" value={emissao}
                  onChange={e => setEmissao(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Vencimento" required>
                <input type="date" value={vencimento}
                  onChange={e => setVencimento(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Forma de Pgto.">
                <select value={formaPgto} onChange={e => setFormaPgto(e.target.value)} className={selectCls}>
                  <option value="">—</option>
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* ── Detalhamento por Veículo ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-g-500 shrink-0" />
                <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold">Detalhamento por Veículo</p>
              </div>
              {!detailLoading && veiculoRows.some(r => !r.inFatura) && (
                <p className="text-amber-500/70 text-[10px]">
                  * Veículos do contrato não incluídos na fatura original
                </p>
              )}
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-g-600 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando veículos…
              </div>
            ) : veiculoRows.length === 0 ? (
              <p className="text-g-600 text-xs text-center py-6">
                Nenhum veículo vinculado ao contrato desta fatura.
              </p>
            ) : (
              <div className="rounded-xl border border-g-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-g-850 border-b border-g-800">
                    <tr>
                      <th className="th text-left">Placa</th>
                      <th className="th text-left">Modelo</th>
                      <th className="th text-center w-24">Dias</th>
                      <th className="th text-right w-36">R$/Dia</th>
                      <th className="th text-right w-36">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {veiculoRows.map((row, idx) => (
                      <tr
                        key={row.id_veiculo}
                        className={`border-b border-g-800/60 last:border-0 ${
                          !row.inFatura ? 'bg-amber-500/5' : 'hover:bg-g-900/40'
                        } transition-colors`}
                      >
                        <td className="td">
                          <span className={`font-bold tracking-wide ${row.inFatura ? 'text-g-100' : 'text-g-400'}`}>
                            {row.placa}
                          </span>
                        </td>
                        <td className="td">
                          <span className="text-g-500 truncate block max-w-[140px]">{row.modelo}</span>
                        </td>
                        <td className="td text-center">
                          <input
                            type="number" min="1" max="31" step="1"
                            value={row.qtd_dias === '' ? '' : row.qtd_dias}
                            onChange={e => updateRow(idx, 'qtd_dias', e.target.value)}
                            className="w-16 text-center px-2 py-1 bg-g-850 border border-g-700 rounded-lg text-g-200 font-mono focus:outline-none focus:border-g-500 transition-colors"
                          />
                        </td>
                        <td className="td text-right">
                          <input
                            type="number" min="0" step="0.01"
                            value={row.valor_diaria === '' ? '' : row.valor_diaria}
                            onChange={e => updateRow(idx, 'valor_diaria', e.target.value)}
                            className="w-32 text-right px-2 py-1 bg-g-850 border border-g-700 rounded-lg text-g-200 font-mono focus:outline-none focus:border-g-500 transition-colors"
                          />
                        </td>
                        <td className="td text-right font-mono font-semibold tabular-nums">
                          <span className={row.subtotal > 0 ? 'text-g-100' : 'text-g-700'}>
                            {brl(row.subtotal || 0)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-g-850 border-t-2 border-g-700">
                    <tr>
                      <td colSpan={4} className="td text-g-500 text-[10px] font-bold uppercase tracking-wider">
                        Total ({veiculoRows.length} veículo{veiculoRows.length !== 1 ? 's' : ''})
                      </td>
                      <td className="td text-right font-mono font-bold text-g-100 tabular-nums">
                        {brl(totalLoc)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Financial summary cards */}
            {totalLoc > 0 && (
              <div className="flex gap-2 mt-3">
                <KpiMini label="Faturado"  value={brl(totalLoc)} accent="text-g-100" />
                <KpiMini label={`Imposto (${aliqNum.toFixed(2)}%)`} value={brl(imposto)} accent="text-amber-500" />
                <KpiMini label="Líquido"   value={brl(liquido)}  accent="text-indigo-400" />
                {recNum > 0 && <KpiMini label="Recebido" value={brl(recNum)} accent="text-emerald-500" />}
              </div>
            )}
          </div>

          {/* ── Imposto + Recebimento ── */}
          <div className="grid grid-cols-2 gap-6">

            {/* Imposto */}
            <div>
              <SectionHeader icon={Landmark} label="Imposto" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Alíquota (%)" hint="Padrão: 11,33%">
                  <input type="number" step="0.01" min="0" max="100"
                    value={aliquota} onChange={e => setAliquota(e.target.value)}
                    className={`${inputCls} font-mono`} />
                </Field>
                <Field label="Status">
                  <select value={statusImp} onChange={e => setStatusImp(e.target.value)} className={selectCls}>
                    {STATUS_IMP.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Data Pgto. Imposto">
                  <input type="date" value={dataPgtoImp}
                    onChange={e => setDataPgtoImp(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Encargo (R$)">
                  <input type="number" step="0.01" min="0"
                    value={encargo} onChange={e => setEncargo(e.target.value)}
                    placeholder="0,00" className={`${inputCls} font-mono`} />
                </Field>
              </div>
            </div>

            {/* Recebimento */}
            <div>
              <SectionHeader icon={CreditCard} label="Recebimento" />
              <div className="flex flex-col gap-3">
                <Field label="Status de Recebimento">
                  <select value={statusRec} onChange={e => setStatusRec(e.target.value)} className={selectCls}>
                    {STATUS_REC.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Valor Recebido (R$)">
                  <input type="number" step="0.01" min="0"
                    value={valorRec} onChange={e => setValorRec(e.target.value)}
                    placeholder="0,00" className={`${inputCls} font-mono`} />
                </Field>
              </div>
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-g-800 shrink-0 flex items-center justify-between gap-4">
          <p className="text-g-700 text-[10px] hidden sm:block">
            {veiculoRows.filter(r => r.subtotal > 0).length} veículo(s) com valor · total {brl(totalLoc)}
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose}
              className="px-5 py-2 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 hover:text-g-200 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || detailLoading || !totalLoc}
              className="px-6 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Salvar Alterações
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  )
}
