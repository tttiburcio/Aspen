import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, FileText, Plus, Trash2, AlertCircle, CheckCircle,
  Calendar, TrendingUp, Truck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getContratoVeiculos, getFrotaDisponivel, criarAditivo } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'

const inputCls  = 'w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors'
const selectCls = inputCls

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider">{label}</label>
      {children}
      {hint && <p className="text-g-700 text-[10px] leading-tight">{hint}</p>}
    </div>
  )
}

export default function AditivoContratoModal({ contrato, onClose, onSaved }) {
  const backdropRef = useRef(null)

  // ── Dados atuais ──
  const [veiculosAtuais, setVeiculosAtuais] = useState([])
  const [frotaDisp,      setFrotaDisp]      = useState([])
  const [loadingInit,    setLoadingInit]    = useState(true)

  // ── Campos do aditivo ──
  const [novaDataFim,  setNovaDataFim]  = useState(contrato.data_fim || '')
  const [reajustePct,  setReajustePct]  = useState('')
  const [rows,         setRows]         = useState([])      // [{id_veiculo, placa, modelo, valorAtual, valorNovo}]
  const [remover,      setRemover]      = useState(new Set())
  const [adicionar,    setAdicionar]    = useState([])      // [{id_veiculo, placa, modelo, valor_mensal}]
  const [novoVeicId,   setNovoVeicId]   = useState('')
  const [novoVeicValor,setNovoVeicValor]= useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoadingInit(true)
    Promise.allSettled([
      getContratoVeiculos(contrato.id),
      getFrotaDisponivel(contrato.id),
    ]).then(([rv, rf]) => {
      const veics = rv.status === 'fulfilled' ? (rv.value || []) : []
      setVeiculosAtuais(veics)
      setRows(veics.map(v => ({
        id_veiculo: v.id_veiculo,
        placa:      v.placa,
        modelo:     v.modelo,
        valorAtual: v.valor_mensal || 0,
        valorNovo:  v.valor_mensal || 0,
      })))
      setFrotaDisp(rf.status === 'fulfilled' ? (rf.value || []) : [])
    }).finally(() => setLoadingInit(false))
  }, [contrato.id])

  // ── Aplicar reajuste global ──
  const aplicarReajuste = () => {
    const pct = parseFloat(reajustePct)
    if (isNaN(pct)) return
    const factor = 1 + pct / 100
    setRows(prev => prev.map(r => ({
      ...r,
      valorNovo: Math.round(r.valorAtual * factor * 100) / 100,
    })))
  }

  const updateValorNovo = (id_veiculo, raw) => {
    setRows(prev => prev.map(r =>
      r.id_veiculo === id_veiculo
        ? { ...r, valorNovo: raw === '' ? '' : parseFloat(raw) || 0 }
        : r
    ))
  }

  const toggleRemover = (id_veiculo) => {
    setRemover(prev => {
      const next = new Set(prev)
      next.has(id_veiculo) ? next.delete(id_veiculo) : next.add(id_veiculo)
      return next
    })
  }

  const adicionarVeiculo = () => {
    if (!novoVeicId) return toast.error('Selecione um veículo')
    const v = frotaDisp.find(f => String(f.id) === String(novoVeicId))
    if (!v) return
    if (adicionar.some(a => a.id_veiculo === v.id)) return
    setAdicionar(prev => [...prev, {
      id_veiculo:   v.id,
      placa:        v.placa,
      modelo:       v.modelo,
      valor_mensal: parseFloat(novoVeicValor) || 0,
    }])
    setNovoVeicId('')
    setNovoVeicValor('')
  }

  const removerAdicionado = (id_veiculo) => {
    setAdicionar(prev => prev.filter(v => v.id_veiculo !== id_veiculo))
  }

  // ── Computados ──
  const novasMedicoes = useMemo(() => {
    if (!contrato.data_inicio || !novaDataFim) return null
    const ini = new Date(contrato.data_inicio)
    const fim = new Date(novaDataFim)
    if (isNaN(ini) || isNaN(fim) || fim <= ini) return null
    return (fim.getFullYear() - ini.getFullYear()) * 12 + (fim.getMonth() - ini.getMonth()) + 1
  }, [contrato.data_inicio, novaDataFim])

  const medicoesMaisAditivo = novasMedicoes
    ? novasMedicoes - (contrato.medicoes_total || 0)
    : null

  const veiculosFinais = useMemo(() => {
    const mantidos = rows.filter(r => !remover.has(r.id_veiculo))
    return mantidos.length + adicionar.length
  }, [rows, remover, adicionar])

  const valorMensalTotal = useMemo(() => {
    const mantidos = rows
      .filter(r => !remover.has(r.id_veiculo))
      .reduce((s, r) => s + (r.valorNovo || 0), 0)
    const novos = adicionar.reduce((s, v) => s + (v.valor_mensal || 0), 0)
    return mantidos + novos
  }, [rows, remover, adicionar])

  // ── Submit ──
  const handleSubmit = async () => {
    if (!novaDataFim) return toast.error('Informe a nova data de término')
    const fim = new Date(novaDataFim)
    const ini = new Date(contrato.data_inicio || '')
    if (!isNaN(ini) && fim <= ini) return toast.error('A nova data de término deve ser posterior ao início')

    setSaving(true)
    try {
      const result = await criarAditivo(contrato.id, {
        nova_data_fim: novaDataFim,
        reajuste_pct:  reajustePct !== '' ? parseFloat(reajustePct) : null,
        veiculos: rows
          .filter(r => !remover.has(r.id_veiculo))
          .map(r => ({ id_veiculo: r.id_veiculo, valor_mensal: r.valorNovo || null })),
        adicionar: adicionar.length > 0
          ? adicionar.map(v => ({ id_veiculo: v.id_veiculo, valor_mensal: v.valor_mensal || null }))
          : null,
        remover: remover.size > 0 ? [...remover] : null,
      })
      toast.success('Aditivo aplicado com sucesso')
      onSaved?.(result)
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao aplicar aditivo')
    } finally {
      setSaving(false)
    }
  }

  const frotaOpcoes = frotaDisp.filter(
    f => !veiculosAtuais.some(v => v.id_veiculo === f.id) &&
         !adicionar.some(a => a.id_veiculo === f.id)
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-g-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <FileText className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <h2 className="text-g-100 font-bold text-sm">Aditivo de Contrato</h2>
                <p className="text-g-600 text-xs mt-0.5">
                  #{contrato.id} · {contrato.empresa_sigla} · {contrato.nome_cliente}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loadingInit ? (
          <div className="flex-1 flex items-center justify-center py-12 gap-2 text-g-600">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando dados do contrato…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

            {/* ── Situação atual ── */}
            <div className="grid grid-cols-3 gap-3 p-4 bg-g-900 border border-g-800 rounded-xl text-center">
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold mb-1">Período atual</p>
                <p className="text-g-300 text-xs font-mono">
                  {dateBR(contrato.data_inicio) || '—'} → {dateBR(contrato.data_fim) || '—'}
                </p>
              </div>
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold mb-1">Medições totais</p>
                <p className="text-g-200 text-base font-bold tabular-nums">{contrato.medicoes_total ?? '—'}</p>
              </div>
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold mb-1">Veículos</p>
                <p className="text-g-200 text-base font-bold tabular-nums">{contrato.qtd_veiculos ?? rows.length}</p>
              </div>
            </div>

            {/* ── Novo prazo ── */}
            <div>
              <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> Novo Prazo
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nova data de término" hint="O início do contrato permanece inalterado.">
                  <input
                    type="date"
                    value={novaDataFim}
                    onChange={e => setNovaDataFim(e.target.value)}
                    min={contrato.data_fim || undefined}
                    className={inputCls}
                  />
                </Field>
                <div className="flex flex-col justify-center gap-1 px-4 py-3 bg-g-900 border border-g-800 rounded-lg">
                  <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold">Novo total de medições</p>
                  {novasMedicoes ? (
                    <>
                      <p className="text-g-100 text-xl font-bold tabular-nums">{novasMedicoes}</p>
                      {medicoesMaisAditivo !== null && (
                        <p className={`text-[11px] font-semibold ${medicoesMaisAditivo > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                          {medicoesMaisAditivo > 0 ? `+${medicoesMaisAditivo} meses` : `${medicoesMaisAditivo} meses`} em relação ao atual
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-g-700 text-sm">Defina a nova data</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Reajuste de valores ── */}
            <div>
              <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" /> Reajuste de Valores
              </p>

              {/* Reajuste global */}
              <div className="flex items-end gap-3 mb-4">
                <Field label="% de reajuste global" hint="Aplica o percentual a todos os veículos mantidos.">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 10,5"
                    value={reajustePct}
                    onChange={e => setReajustePct(e.target.value)}
                    className={`${inputCls} w-40`}
                  />
                </Field>
                <button
                  type="button"
                  onClick={aplicarReajuste}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-g-800 hover:bg-g-700 border border-g-700 text-g-200 transition-colors whitespace-nowrap"
                >
                  Aplicar
                </button>
              </div>

              {/* Tabela por veículo */}
              {rows.length > 0 && (
                <div className="rounded-xl border border-g-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-g-850 border-b border-g-800">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Placa</th>
                        <th className="px-4 py-2.5 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Modelo</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Valor Atual</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Novo Valor</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Δ%</th>
                        <th className="px-4 py-2.5 text-center text-g-500 text-[10px] uppercase tracking-wider font-semibold">Remover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const isRem = remover.has(r.id_veiculo)
                        const deltaVal = r.valorAtual > 0
                          ? (((r.valorNovo || 0) - r.valorAtual) / r.valorAtual * 100)
                          : 0
                        const deltaCls = deltaVal > 0
                          ? 'text-emerald-600'
                          : deltaVal < 0 ? 'text-red-400' : 'text-g-600'
                        return (
                          <tr
                            key={r.id_veiculo}
                            className={`border-b border-g-800/60 last:border-0 transition-opacity ${isRem ? 'opacity-40' : ''}`}
                          >
                            <td className="px-4 py-2.5">
                              <span className="font-bold text-g-200">{r.placa}</span>
                            </td>
                            <td className="px-4 py-2.5 text-g-500 truncate max-w-[120px]">{r.modelo}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-g-500 tabular-nums">
                              {brl(r.valorAtual)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                disabled={isRem}
                                value={r.valorNovo === '' ? '' : r.valorNovo}
                                onChange={e => updateValorNovo(r.id_veiculo, e.target.value)}
                                className="w-28 text-right px-2 py-1 bg-g-850 border border-g-700 rounded-lg text-g-200 text-xs font-mono focus:outline-none focus:border-g-500 transition-colors tabular-nums disabled:opacity-40"
                              />
                            </td>
                            <td className={`px-4 py-2.5 text-right font-semibold tabular-nums text-[11px] ${deltaCls}`}>
                              {isRem ? '—' : deltaVal !== 0 ? `${deltaVal > 0 ? '+' : ''}${deltaVal.toFixed(1)}%` : '0%'}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => toggleRemover(r.id_veiculo)}
                                title={isRem ? 'Cancelar remoção' : 'Marcar para remoção'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isRem
                                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                                    : 'text-g-700 hover:text-red-400 hover:bg-red-500/10'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Adicionar veículos ── */}
            <div>
              <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
                <Truck className="w-3.5 h-3.5" /> Adicionar Veículos
              </p>
              <div className="flex items-end gap-3 mb-3">
                <div className="flex-1">
                  <Field label="Veículo disponível">
                    <select value={novoVeicId} onChange={e => setNovoVeicId(e.target.value)} className={selectCls}>
                      <option value="">Selecione um veículo…</option>
                      {frotaOpcoes.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.placa} · {f.modelo} ({f.empresa})
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="w-36">
                  <Field label="Valor mensal (R$)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={novoVeicValor}
                      onChange={e => setNovoVeicValor(e.target.value)}
                      placeholder="0,00"
                      className={`${inputCls} font-mono`}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={adicionarVeiculo}
                  disabled={!novoVeicId}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white transition-colors disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
              {adicionar.length > 0 && (
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-500/5 overflow-hidden">
                  {adicionar.map(v => (
                    <div key={v.id_veiculo} className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-700/20 last:border-0">
                      <div>
                        <span className="font-bold text-g-200 text-xs">{v.placa}</span>
                        <span className="text-g-600 text-[10px] ml-2">{v.modelo}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-emerald-600 text-xs tabular-nums">{brl(v.valor_mensal)}</span>
                        <button type="button" onClick={() => removerAdicionado(v.id_veiculo)}
                          className="p-1 rounded text-g-700 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Resumo do aditivo ── */}
            <div className="p-4 bg-g-900 border border-g-800 rounded-xl flex flex-col gap-3">
              <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold">Resumo do Aditivo</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-g-600 text-[10px] uppercase tracking-wider mb-0.5">Nova vigência</p>
                  <p className="text-g-200 text-xs font-mono">{novaDataFim ? dateBR(novaDataFim) : '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-g-600 text-[10px] uppercase tracking-wider mb-0.5">Total medições</p>
                  <p className={`font-bold text-base tabular-nums ${novasMedicoes ? 'text-g-100' : 'text-g-700'}`}>
                    {novasMedicoes ?? '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-g-600 text-[10px] uppercase tracking-wider mb-0.5">Veículos</p>
                  <p className="text-g-100 font-bold text-base tabular-nums">{veiculosFinais}</p>
                </div>
                <div className="text-center">
                  <p className="text-g-600 text-[10px] uppercase tracking-wider mb-0.5">Valor mensal total</p>
                  <p className="text-emerald-600 font-bold text-base tabular-nums">{brl(valorMensalTotal)}</p>
                </div>
              </div>
              {remover.size > 0 && (
                <p className="text-amber-500 text-[11px] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {remover.size} veículo{remover.size !== 1 ? 's' : ''} será{remover.size !== 1 ? 'ão' : ''} removido{remover.size !== 1 ? 's' : ''} do contrato.
                </p>
              )}
              {adicionar.length > 0 && (
                <p className="text-emerald-600 text-[11px] flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  {adicionar.length} veículo{adicionar.length !== 1 ? 's' : ''} novo{adicionar.length !== 1 ? 's' : ''} será{adicionar.length !== 1 ? 'ão' : ''} adicionado{adicionar.length !== 1 ? 's' : ''}.
                </p>
              )}
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-g-800 shrink-0 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !novaDataFim}
            className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 border border-amber-500 text-white transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <FileText className="w-4 h-4" />
            Aplicar Aditivo
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
