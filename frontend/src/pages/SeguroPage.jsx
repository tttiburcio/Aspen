import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Shield, ShieldCheck, Calendar, Clock,
  AlertCircle, X, Plus, Pencil, Search,
  ChevronDown, ChevronUp, AlertTriangle, Ban, Building2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getSeguro, getSeguroSummary,
  criarSeguro, patchSeguro, deletarSeguro,
  removerVeiculoSeguro,
  dbListFrotaAll,
  getCorretores, criarCorretor, criarReembolso,
} from '../utils/api'
import { brl, dateBR } from '../utils/format'
import { withErrorToast } from '../utils/asyncHandler'
import { useCompanies } from '../contexts/CompanyContext'
import { useEnums } from '../contexts/EnumsContext'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import KPICard from '../components/KPICard'

// ── helpers ───────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'ativa')
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-700/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Ativa</span>
  if (status === 'vencendo')
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-700/30"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Vencendo</span>
  if (status === 'renovada')
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-700/30"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />Renovada</span>
  if (status === 'cancelada')
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-g-800/60 text-g-500 border border-g-700/40"><span className="w-1.5 h-1.5 rounded-full bg-g-600" />Cancelada</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-700/30"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Vencida</span>
}

const INPUT    = 'w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors'
const INPUT_SM = 'w-full px-2.5 py-1.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-xs placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors'

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-g-800">
      <Icon className="w-4 h-4 text-g-500" />
      <p className="text-g-400 text-xs font-bold uppercase tracking-widest">{label}</p>
    </div>
  )
}

function Field({ label, required, hint, children, col = 1 }) {
  return (
    <div className={`flex flex-col gap-1.5 ${col === 2 ? 'col-span-2' : ''}`}>
      <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-g-700 text-[10px] mt-0.5">{hint}</p>}
    </div>
  )
}


function parseBrl(str) {
  if (!str) return null
  const num = parseFloat(String(str).replace(/\./g, '').replace(',', '.'))
  return isNaN(num) ? null : num
}

function formatBrl(num) {
  if (num == null || num === '') return ''
  return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Modal Nova / Editar Apólice ────────────────────────────────────────────────
function ApoliceFormModal({ apolice, frota, empresas, corretores, onClose, onSave }) {
  const isEdit = !!apolice
  const { coberturas_seguro: COBERTURAS = [] } = useEnums()

  const [form, setForm] = useState({
    seguradora:          apolice?.seguradora          ?? '',
    numero_apolice:      apolice?.numero_apolice      ?? '',
    modelo_cobertura:    apolice?.modelo_cobertura    ?? '',
    corretor_id:         apolice?.corretor_id != null ? String(apolice.corretor_id) : '',
    id_empresa:          apolice?.id_empresa != null  ? String(apolice.id_empresa) : '',
    data_inicio:         apolice?.data_inicio         ?? '',
    data_fim:            apolice?.data_fim             ?? '',
    num_parcelas:        apolice?.num_parcelas != null ? String(apolice.num_parcelas) : '12',
    dia_vencimento:      apolice?.dia_vencimento != null ? String(apolice.dia_vencimento) : '',
    valor_total_apolice: apolice?.valor_total_apolice != null ? formatBrl(apolice.valor_total_apolice) : '',
    status_apolice:      apolice?.status_apolice      ?? 'Ativa',
  })

  const [veiculos, setVeiculos] = useState(
    (apolice?.veiculos ?? []).map(v => ({
      sv_id:            v.sv_id,
      id_veiculo:       String(v.id_veiculo),
      valor_veiculo:    String(v.valor_veiculo),
      cobre_implemento: v.cobre_implemento ?? false,
      implemento:       v.implemento || null,
    }))
  )
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleBrlChange = (raw) => set('valor_total_apolice', raw.replace(/[^\d,]/g, ''))
  const handleBrlBlur   = () => {
    const num = parseBrl(form.valor_total_apolice)
    if (num != null) set('valor_total_apolice', formatBrl(num))
  }

  const addVeiculo = () => setVeiculos(vs => [...vs, { sv_id: null, id_veiculo: '', valor_veiculo: '', cobre_implemento: false, implemento: null }])
  const removeVeiculo = (i) => setVeiculos(vs => vs.filter((_, idx) => idx !== i))
  const setVField = (i, k, v) => setVeiculos(vs => vs.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  const setVehicleId = (i, newId) => {
    const fItem = frota.find(f => String(f.id) === String(newId))
    setVeiculos(vs => vs.map((row, idx) => idx === i
      ? { ...row, id_veiculo: newId, implemento: fItem?.implemento || null, cobre_implemento: false }
      : row
    ))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.seguradora || !form.numero_apolice || !form.id_empresa) {
      toast.error('Preencha seguradora, número da apólice e empresa')
      return
    }
    setSaving(true)
    try {
      const payload = {
        seguradora:          form.seguradora,
        numero_apolice:      form.numero_apolice,
        modelo_cobertura:    form.modelo_cobertura || null,
        id_empresa:          Number(form.id_empresa),
        data_inicio:         form.data_inicio || null,
        data_fim:            form.data_fim || null,
        num_parcelas:        form.num_parcelas ? Number(form.num_parcelas) : 12,
        dia_vencimento:      form.dia_vencimento ? Number(form.dia_vencimento) : null,
        valor_total_apolice: parseBrl(form.valor_total_apolice),
        status_apolice:      form.status_apolice || 'Ativa',
        corretor_id: form.corretor_id ? Number(form.corretor_id) : null,
        veiculos: veiculos
          .filter(v => v.id_veiculo && v.valor_veiculo)
          .map(v => ({ id_veiculo: Number(v.id_veiculo), valor_veiculo: Number(v.valor_veiculo), cobre_implemento: v.cobre_implemento })),
      }
      if (isEdit) {
        await patchSeguro(apolice.id, payload)
        toast.success('Apólice atualizada')
      } else {
        await criarSeguro(payload)
        toast.success('Apólice criada')
      }
      onSave()
    } catch (err) {
      if (err.response?.status === 409) toast.error('Número de apólice já cadastrado')
      else toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col" style={{ maxHeight: '96vh' }}>
        {/* Cabeçalho */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-g-850 border border-g-800">
              <Shield className="w-5 h-5 text-g-400" />
            </div>
            <div>
              <h2 className="text-g-50 font-bold text-base">{isEdit ? 'Editar Apólice' : 'Nova Apólice de Seguro'}</h2>
              <p className="text-g-600 text-xs mt-0.5">
                {isEdit ? `${apolice.seguradora} · ${apolice.numero_apolice}` : 'Preencha os dados e vincule os veículos à apólice'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 flex flex-col gap-6">
            {/* Dados da apólice */}
            <div>
              <SectionHeader icon={Shield} label="Dados da Apólice" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Seguradora" required>
                  <input className={INPUT} placeholder="Porto Seguro, Zurich..." value={form.seguradora} onChange={e => set('seguradora', e.target.value)} required />
                </Field>
                <Field label="Número da Apólice" required>
                  <input className={INPUT} placeholder="AP-2024-0001" value={form.numero_apolice} onChange={e => set('numero_apolice', e.target.value)} required />
                </Field>
                <Field label="Modelo de Cobertura">
                  <select className={INPUT} value={form.modelo_cobertura} onChange={e => set('modelo_cobertura', e.target.value)}>
                    <option value="">—</option>
                    {COBERTURAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Empresa (frota)" required>
                  <select className={INPUT} value={form.id_empresa} onChange={e => set('id_empresa', e.target.value)} required>
                    <option value="">Selecione...</option>
                    {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.sigla || emp.nome}</option>)}
                  </select>
                </Field>
                <Field label="Corretor">
                  <select className={INPUT} value={form.corretor_id} onChange={e => set('corretor_id', e.target.value)}>
                    <option value="">— Sem corretor —</option>
                    {corretores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className={INPUT} value={form.status_apolice} onChange={e => set('status_apolice', e.target.value)}>
                    {['Ativa', 'Vencida', 'Cancelada', 'Renovada'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {/* Vigência */}
            <div>
              <SectionHeader icon={Calendar} label="Vigência & Cobrança" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Field label="Data de Início">
                  <input type="date" className={INPUT} value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
                </Field>
                <Field label="Vigência (fim)">
                  <input type="date" className={INPUT} value={form.data_fim} onChange={e => set('data_fim', e.target.value)} />
                </Field>
                <Field label="Nº de Parcelas">
                  <input type="number" min="1" max="48" className={INPUT} value={form.num_parcelas} onChange={e => set('num_parcelas', e.target.value)} />
                </Field>
                <Field label="Dia de Vencimento (1–28)">
                  <input type="number" min="1" max="28" className={INPUT} placeholder="Ex: 10" value={form.dia_vencimento} onChange={e => set('dia_vencimento', e.target.value)} />
                </Field>
                <Field label="Prêmio Total (R$)">
                  <input type="text" inputMode="decimal" className={INPUT} placeholder="0,00"
                    value={form.valor_total_apolice}
                    onChange={e => handleBrlChange(e.target.value)}
                    onBlur={handleBrlBlur} />
                </Field>
              </div>
            </div>

            {/* Veículos */}
            <div>
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-g-800">
                <Shield className="w-4 h-4 text-g-500" />
                <p className="text-g-400 text-xs font-bold uppercase tracking-widest flex-1">Veículos na Apólice ({veiculos.length})</p>
                <button type="button" onClick={addVeiculo}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-g-800 text-g-400 hover:border-g-600 hover:text-g-200 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Adicionar Veículo
                </button>
              </div>

              {veiculos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-g-800 px-4 py-8 text-center text-sm text-g-700">
                  Nenhum veículo adicionado. Clique em "Adicionar Veículo" para incluir veículos nesta apólice.
                </div>
              ) : (
                <div className="rounded-xl border border-g-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="border-b border-g-800 bg-g-850">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Veículo</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Prêmio Anual (R$)</th>
                        <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-600 uppercase tracking-wider">Parcela/mês</th>
                        <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Implemento</th>
                        <th className="px-3 py-2.5 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {veiculos.map((v, i) => {
                        const parcela = v.valor_veiculo && form.num_parcelas
                          ? Number(v.valor_veiculo) / Number(form.num_parcelas)
                          : null
                        const otherSelected = new Set(
                          veiculos.filter((_, idx) => idx !== i).map(r => r.id_veiculo).filter(Boolean)
                        )
                        const hasImplemento = v.implemento || frota.find(f => String(f.id) === String(v.id_veiculo))?.implemento
                        return (
                          <tr key={i} className="border-b border-g-800/60 last:border-0">
                            <td className="px-4 py-2">
                              <select className={INPUT_SM}
                                value={v.id_veiculo}
                                onChange={e => setVehicleId(i, e.target.value)}>
                                <option value="">Selecione...</option>
                                {frota
                                  .filter(f => !otherSelected.has(String(f.id)))
                                  .map(f => <option key={f.id} value={f.id}>{f.placa} — {f.modelo}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" step="0.01" min="0"
                                className={INPUT_SM + ' w-28'}
                                value={v.valor_veiculo}
                                onChange={e => setVField(i, 'valor_veiculo', e.target.value)} />
                            </td>
                            <td className="px-3 py-2 text-g-600 tabular-nums font-mono">
                              {parcela ? brl(parcela) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {hasImplemento ? (
                                <input type="checkbox" checked={v.cobre_implemento}
                                  onChange={e => setVField(i, 'cobre_implemento', e.target.checked)}
                                  className="w-3.5 h-3.5 accent-emerald-500"
                                  title={`Implemento: ${hasImplemento}`} />
                              ) : (
                                <span className="text-g-700 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => removeVeiculo(i)}
                                className="p-1 rounded text-g-600 hover:text-red-400 hover:bg-red-950/20 transition-colors">
                                <X className="w-3.5 h-3.5" />
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
          </div>

          <div className="px-8 py-5 border-t border-g-800 shrink-0 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm rounded-lg border border-g-800 text-g-500 hover:bg-g-850 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white disabled:opacity-50 transition-colors">
              {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Apólice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

// ── Modal Cancelar Apólice ─────────────────────────────────────────────────────
function CancelarApoliceModal({ apolice, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try { await onConfirm() }
    finally { setLoading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-g-100">Cancelar Apólice</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-3 py-2.5 rounded-lg bg-g-850 border border-g-800 text-xs flex flex-col gap-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Seguradora</span>
            <span className="text-g-200 font-semibold">{apolice.seguradora || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Apólice</span>
            <span className="text-g-300 font-mono">{apolice.numero_apolice || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Cobertura</span>
            <span className="text-g-400">{apolice.modelo_cobertura || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Veículos</span>
            <span className="text-g-400">{apolice.total_veiculos} veículo{apolice.total_veiculos !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>A apólice será marcada como <strong className="text-amber-300">Cancelada</strong> e permanecerá no histórico. O registro não será excluído.</span>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Voltar</button>
          <button onClick={handleConfirm} disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40">
            {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Modal Excluir Apólice ──────────────────────────────────────────────────────
function ExcluirApoliceModal({ apolice, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try { await onConfirm() }
    finally { setLoading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-g-100">Excluir Apólice</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Esta ação excluirá permanentemente a apólice <strong className="text-red-300">{apolice.numero_apolice}</strong> e todos os seus registros mensais. Esta ação não pode ser desfeita.</span>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Voltar</button>
          <button onClick={handleConfirm} disabled={loading}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40">
            {loading ? 'Excluindo...' : 'Excluir Definitivamente'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Modal Cancelar Seguro de Veículo ───────────────────────────────────────────
function CancelarVeiculoSeguroModal({ veiculo, apolice, onClose, onRefresh }) {
  const [haverReembolso, setHaverReembolso] = useState(false)
  const [valorReembolso, setValorReembolso] = useState('')
  const [parcelasAte,    setParcelasAte]    = useState('1')
  const [loading,        setLoading]        = useState(false)

  const previsaoData = useMemo(() => {
    if (!haverReembolso) return null
    const n = parseInt(parcelasAte)
    if (isNaN(n) || n < 0) return null
    const today = new Date()
    const totalMonths = today.getMonth() + n
    const targetYear  = today.getFullYear() + Math.floor(totalMonths / 12)
    const targetMonth = totalMonths % 12
    const dia     = apolice.dia_vencimento || 1
    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
    return new Date(targetYear, targetMonth, Math.min(dia, lastDay))
  }, [haverReembolso, parcelasAte, apolice.dia_vencimento])

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await removerVeiculoSeguro(veiculo.sv_id)
      if (haverReembolso && valorReembolso) {
        const today = new Date().toISOString().slice(0, 10)
        await criarReembolso({
          tipo:               'Franquia de Seguro',
          id_empresa:         apolice.id_empresa,
          id_veiculo:         veiculo.id_veiculo,
          emissao:            today,
          vencimento:         previsaoData ? previsaoData.toISOString().slice(0, 10) : null,
          valor_reembolso:    parseBrl(valorReembolso),
          status_recebimento: 'Pendente',
          descricao:          `Cancelamento de seguro — Apólice ${apolice.numero_apolice} · ${apolice.seguradora}`,
        })
        toast.success('Veículo removido e reembolso registrado')
      } else {
        toast.success('Veículo removido da apólice')
      }
      onRefresh()
    } catch {
      toast.error('Erro ao cancelar seguro do veículo')
    } finally {
      setLoading(false)
    }
  }

  const valorMensal = apolice.num_parcelas ? veiculo.valor_veiculo / apolice.num_parcelas : null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-g-850 border border-g-800">
              <Ban className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-g-100">Cancelar Seguro do Veículo</h2>
              <p className="text-xs text-g-600">Remoção da apólice {apolice.numero_apolice}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Vehicle info */}
        <div className="rounded-xl bg-g-850 border border-g-800 p-3 flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-g-200 text-sm">{veiculo.placa}</span>
            <span className="text-g-500">{veiculo.marca || ''} {veiculo.modelo || ''}</span>
          </div>
          <div className="flex gap-4 pt-1 border-t border-g-800">
            <div>
              <span className="text-g-600 block text-[10px] uppercase tracking-wider">Prêmio anual</span>
              <span className="font-semibold text-g-300">{brl(veiculo.valor_veiculo)}</span>
            </div>
            {valorMensal && (
              <div>
                <span className="text-g-600 block text-[10px] uppercase tracking-wider">Parcela/mês</span>
                <span className="font-semibold text-g-300">{brl(valorMensal)}</span>
              </div>
            )}
            <div>
              <span className="text-g-600 block text-[10px] uppercase tracking-wider">Seguradora</span>
              <span className="font-semibold text-g-300">{apolice.seguradora}</span>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>O veículo será removido permanentemente desta apólice. As parcelas mensais serão regeneradas automaticamente.</span>
        </div>

        {/* Reembolso toggle */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-g-300 text-sm font-semibold">Haverá reembolso da seguradora?</span>
            <button
              type="button"
              onClick={() => setHaverReembolso(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${haverReembolso ? 'bg-emerald-600' : 'bg-g-800 border border-g-700'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${haverReembolso ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {haverReembolso && (
            <div className="flex flex-col gap-3 border-t border-g-800 pt-3">
              <Field label="Valor do Reembolso (R$)" required>
                <input
                  className={INPUT}
                  placeholder="0,00"
                  value={valorReembolso}
                  onChange={e => setValorReembolso(e.target.value.replace(/[^\d,]/g, ''))}
                  onBlur={() => {
                    const num = parseBrl(valorReembolso)
                    if (num != null) setValorReembolso(formatBrl(num))
                  }}
                />
              </Field>
              <Field
                label="Parcelas a pagar até o reembolso"
                hint="Quantas parcelas ainda precisam ser pagas antes do reembolso?">
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="24"
                    className={INPUT}
                    value={parcelasAte}
                    onChange={e => setParcelasAte(e.target.value)}
                  />
                  {previsaoData && (
                    <span className="text-emerald-600 text-xs font-semibold whitespace-nowrap shrink-0">
                      → {previsaoData.toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </Field>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Voltar</button>
          <button
            onClick={handleConfirm}
            disabled={loading || (haverReembolso && !valorReembolso)}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors">
            {loading ? 'Removendo...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Card de apólice ────────────────────────────────────────────────────────────
function ApoliceCard({ apolice, onEdit, onCancelar, onExcluir, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [cancelV, setCancelV] = useState(null)

  const statusGlobal = apolice.status
  const totalPremio = apolice.veiculos.reduce((s, v) => s + (v.valor_veiculo || 0), 0)

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setExpanded(v => !v)}>
          <div className="w-8 h-8 rounded-lg bg-g-850 border border-g-800 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-g-200 truncate">{apolice.seguradora || 'Sem seguradora'}</p>
            <p className="text-xs text-g-500">{apolice.numero_apolice ? `Apólice: ${apolice.numero_apolice}` : 'Sem número'}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-g-300 tabular-nums">{brl(totalPremio)}<span className="text-xs font-normal text-g-500">/ano</span></p>
            <p className="text-xs text-g-600">{apolice.total_veiculos} veículo{apolice.total_veiculos !== 1 ? 's' : ''}</p>
          </div>
          {apolice.data_fim && (
            <div className="text-right hidden md:block">
              <p className="text-xs text-g-600">Vigência</p>
              <p className="text-xs font-semibold text-g-400">{dateBR(apolice.data_fim)}</p>
            </div>
          )}
          {apolice.modelo_cobertura && (
            <div className="hidden lg:flex items-center gap-1 text-xs text-g-500 bg-g-850 border border-g-800 rounded-full px-2 py-0.5 truncate max-w-[140px]">
              <ShieldCheck className="w-3 h-3 shrink-0" />{apolice.modelo_cobertura}
            </div>
          )}
          <StatusBadge status={statusGlobal} />
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button onClick={() => onEdit(apolice)} title="Editar apólice"
            className="p-1.5 rounded-lg text-g-600 hover:text-blue-400 hover:bg-g-800 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {apolice.status !== 'cancelada' && (
            <button onClick={() => onCancelar(apolice)} title="Cancelar apólice"
              className="p-1.5 rounded-lg text-g-600 hover:text-amber-400 hover:bg-g-800 transition-colors">
              <Ban className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => onExcluir(apolice)} title="Excluir apólice"
            className="p-1.5 rounded-lg text-g-600 hover:text-red-400 hover:bg-red-950/20 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-g-600 hover:bg-g-850 transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-g-800">
          <div className="px-5 py-3 bg-g-850 border-b border-g-800 grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
            <div><span className="text-g-600 text-[10px] uppercase tracking-wider block">Início</span><span className="font-semibold text-g-300">{apolice.data_inicio ? dateBR(apolice.data_inicio) : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] uppercase tracking-wider block">Vigência</span><span className="font-semibold text-g-300">{apolice.data_fim ? dateBR(apolice.data_fim) : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] uppercase tracking-wider block">Parcelas</span><span className="font-semibold text-g-300">{apolice.num_parcelas ?? '—'}</span></div>
            <div><span className="text-g-600 text-[10px] uppercase tracking-wider block">Dia cobr.</span><span className="font-semibold text-g-300">{apolice.dia_vencimento != null ? `Dia ${apolice.dia_vencimento}` : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] uppercase tracking-wider block">Parcela/mês</span><span className="font-semibold text-g-300">{apolice.valor_mensal ? brl(apolice.valor_mensal) : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] uppercase tracking-wider block">Prêmio total</span><span className="font-semibold text-g-300">{apolice.valor_total_apolice ? brl(apolice.valor_total_apolice) : '—'}</span></div>
            {apolice.corretor_nome && (
              <div className="col-span-3 sm:col-span-6 border-t border-g-800 pt-2 mt-1">
                <span className="text-g-600 text-[10px] uppercase tracking-wider">Corretor: </span>
                <span className="font-semibold text-g-300">{apolice.corretor_nome}</span>
              </div>
            )}
          </div>

          {apolice.veiculos.length === 0 ? (
            <div className="px-5 py-4 text-xs text-g-600 text-center">Nenhum veículo vinculado a esta apólice.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[560px]">
                <thead className="border-b border-g-800 bg-g-850">
                  <tr>
                    <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Placa</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Modelo</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Marca</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Implemento</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Prêmio Anual</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Parcela/mês</th>
                    <th className="px-3 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {apolice.veiculos.map(v => (
                    <tr key={v.sv_id} className="border-b border-g-800/50 hover:bg-g-850 transition-colors">
                      <td className="px-5 py-2.5 font-mono font-bold text-g-200">{v.placa || '—'}</td>
                      <td className="px-3 py-2.5 text-g-400 truncate max-w-[130px]">{v.modelo || '—'}</td>
                      <td className="px-3 py-2.5 text-g-500">{v.marca || '—'}</td>
                      <td className="px-3 py-2.5">
                        {v.implemento ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${v.cobre_implemento ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-700/30' : 'bg-g-800/60 text-g-500 border border-g-700/40'}`}>
                            {v.cobre_implemento ? 'Sim' : 'Não'}
                          </span>
                        ) : <span className="text-g-700 text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-g-200">{brl(v.valor_veiculo)}</td>
                      <td className="px-3 py-2.5 font-mono text-g-500">
                        {apolice.num_parcelas ? brl(v.valor_veiculo / apolice.num_parcelas) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => setCancelV({ ...v, apolice })}
                          title="Cancelar seguro deste veículo"
                          className="p-1 rounded text-g-700 hover:text-amber-400 hover:bg-amber-950/20 transition-colors">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-g-800 bg-g-850">
                  <tr>
                    <td colSpan={5} className="px-5 py-2 text-g-600 text-xs font-semibold">{apolice.veiculos.length} veículos</td>
                    <td className="px-3 py-2 font-mono font-semibold text-g-200">{brl(totalPremio)}</td>
                    <td className="px-3 py-2 font-mono text-g-500">
                      {apolice.num_parcelas ? brl(totalPremio / apolice.num_parcelas) : '—'}/mês
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {cancelV && (
        <CancelarVeiculoSeguroModal
          veiculo={cancelV}
          apolice={cancelV.apolice}
          onClose={() => setCancelV(null)}
          onRefresh={() => { setCancelV(null); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function SeguroPage() {
  const { selectedCompany, companies: empresas } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [records,    setRecords]    = useState(null)
  const [summary,    setSummary]    = useState(null)
  const [frota,      setFrota]      = useState([])
  const [corretores, setCorretores] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,   setSearch]   = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fSeg,     setFSeg]     = useState('')
  const [view,     setView]     = useState('apolices')
  const [modal,    setModal]    = useState(null)
  // modal: null | {type:'new'} | {type:'edit', apolice}
  //       | {type:'cancelar', apolice} | {type:'excluir', apolice}

  const params = useMemo(() => ({ ...(empresa ? { empresa } : {}) }), [empresa])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recs, sum] = await Promise.all([
        getSeguro(params),
        getSeguroSummary(params),
      ])
      setRecords(recs || [])
      setSummary(sum || null)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => { load() }, [load])
  useEffect(() => { withErrorToast(() => dbListFrotaAll().then(d => setFrota(d || [])), 'Erro ao carregar frota') }, [])
  useEffect(() => { withErrorToast(() => getCorretores().then(d => setCorretores(d || [])), 'Erro ao carregar corretores') }, [])

  const filtered = useMemo(() => {
    if (!records) return []
    let r = records
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(a => [a.seguradora, a.numero_apolice, a.modelo_cobertura, a.empresa_sigla]
        .some(f => (f || '').toLowerCase().includes(q)))
    }
    if (fStatus) r = r.filter(a => a.status === fStatus)
    if (fSeg)    r = r.filter(a => a.seguradora === fSeg)
    return r
  }, [records, search, fStatus, fSeg])

  // Vehicles flat list (for "Por Veículo" view)
  const veiculosFlat = useMemo(() => {
    const list = []
    for (const a of filtered) {
      for (const v of a.veiculos) {
        list.push({
          ...v,
          apolice_id:          a.id,
          numero_apolice:      a.numero_apolice,
          seguradora:          a.seguradora,
          modelo_cobertura:    a.modelo_cobertura,
          corretor_nome:       a.corretor_nome,
          empresa_sigla:       a.empresa_sigla,
          data_inicio:         a.data_inicio,
          data_fim:            a.data_fim,
          num_parcelas:        a.num_parcelas,
          dia_vencimento:      a.dia_vencimento,
          status:              a.status,
          valor_mensal_veiculo: a.num_parcelas ? v.valor_veiculo / a.num_parcelas : null,
        })
      }
    }
    return list
  }, [filtered])

  const segOptions = useMemo(() => {
    if (!records) return []
    return [...new Set(records.map(r => r.seguradora).filter(Boolean))].sort()
  }, [records])

  const handleCancelar = async () => {
    const { apolice } = modal
    try {
      await patchSeguro(apolice.id, { status_apolice: 'Cancelada' })
      toast.success('Apólice cancelada')
      setModal(null)
      load()
    } catch { toast.error('Erro ao cancelar') }
  }

  const handleExcluir = async () => {
    const { apolice } = modal
    try {
      await deletarSeguro(apolice.id)
      toast.success('Apólice excluída')
      setModal(null)
      load()
    } catch { toast.error('Erro ao excluir') }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── KPIs ── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard icon={Shield}       label="Veículos Segurados"
            value={String(summary.total_veiculos)} sub={`${summary.ativas} apólice${summary.ativas !== 1 ? 's' : ''} ativa${summary.ativas !== 1 ? 's' : ''}`} />
          <KPICard icon={Calendar}     label="Custo Mensal"
            value={brl(summary.total_mensal)} sub={`Anual est. ${brl(summary.total_anual)}`} />
          <KPICard icon={ShieldCheck}  label="Apólices Ativas"
            value={String(summary.ativas)} sub={`de ${summary.total_apolices} total`} accent />
          <KPICard icon={Building2}    label="Seguradoras"
            value={String(summary.seguradoras.length)} sub={`${summary.coberturas.length} modelo${summary.coberturas.length !== 1 ? 's' : ''} de cobertura`} />
          <KPICard icon={Clock}        label="Vencendo ≤30d"
            value={String(summary.vencendo_30d)} sub="renovação urgente"
            danger={summary.vencendo_30d > 0} />
          <KPICard icon={AlertCircle}  label="Vencidas"
            value={String(summary.vencidas)} sub={`${summary.canceladas} cancelada${summary.canceladas !== 1 ? 's' : ''}`}
            danger={summary.vencidas > 0} />
        </div>
      )}

      {/* ── Barra de ações ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g-600" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar seguradora, número da apólice..."
            className="w-full pl-9 pr-4 py-2 bg-g-900 border border-g-800 rounded-lg text-sm text-g-300 placeholder-g-600 focus:outline-none focus:border-g-600"
          />
        </div>
        <button onClick={() => setModal({ type: 'new' })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white shrink-0 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nova Apólice
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap -mt-3">
        <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Status:</span>
        {[['', 'Todos'], ['ativa', 'Ativa'], ['vencendo', 'Vencendo'], ['vencida', 'Vencida'], ['cancelada', 'Cancelada']].map(([val, lbl]) => (
          <FilterChip key={val} label={lbl} active={fStatus === val} onClick={() => setFStatus(val)}
            color={val === 'ativa' ? 'green' : val === 'vencendo' ? 'amber' : val === 'vencida' || val === 'cancelada' ? 'red' : 'default'} />
        ))}
        {segOptions.length > 1 && (
          <>
            <span className="text-g-700 mx-1">·</span>
            <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Seguradora:</span>
            <FilterChip label="Todas" active={fSeg === ''} onClick={() => setFSeg('')} />
            {segOptions.map(s => (
              <FilterChip key={s} label={s} active={fSeg === s} onClick={() => setFSeg(v => v === s ? '' : s)} />
            ))}
          </>
        )}
        <span className="text-g-700 mx-1">·</span>
        <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Visualizar:</span>
        <FilterChip label="Por Apólice" active={view === 'apolices'}  onClick={() => setView('apolices')} />
        <FilterChip label="Por Veículo" active={view === 'veiculos'}  onClick={() => setView('veiculos')} />
        <span className="ml-auto text-g-600 text-xs font-mono">{filtered.length} apólice{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Nenhuma apólice encontrada"
          message="Cadastre apólices de seguro ou ajuste os filtros."
          action={
            <button onClick={() => setModal({ type: 'new' })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white transition-colors">
              <Plus className="w-3.5 h-3.5" /> Nova Apólice
            </button>
          }
        />
      ) : view === 'apolices' ? (
        <div className="flex flex-col gap-3">
          {filtered.map(a => (
            <ApoliceCard
              key={a.id}
              apolice={a}
              onEdit={(ap) => setModal({ type: 'edit', apolice: ap })}
              onCancelar={(ap) => setModal({ type: 'cancelar', apolice: ap })}
              onExcluir={(ap) => setModal({ type: 'excluir', apolice: ap })}
              onRefresh={load}
            />
          ))}
        </div>
      ) : (
        /* ── Visualização por veículo ── */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[960px]">
              <thead className="border-b border-g-800 bg-g-850">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Placa</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Modelo</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Empresa</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Seguradora</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Corretor</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Apólice</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Cobertura</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Dia cobr.</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Implemento</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Prêmio Anual</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Parcela/mês</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Vigência</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {veiculosFlat.map((v, i) => (
                  <tr key={`${v.sv_id}-${i}`} className="border-b border-g-800/50 hover:bg-g-850 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-g-200">{v.placa || '—'}</td>
                    <td className="px-3 py-2.5 text-g-400 truncate max-w-[110px]">{v.modelo || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500">{v.empresa_sigla || '—'}</td>
                    <td className="px-3 py-2.5 text-g-300 font-medium">{v.seguradora || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500">{v.corretor_nome || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500 font-mono">{v.numero_apolice || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500 truncate max-w-[120px]">{v.modelo_cobertura || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500">
                      {v.dia_vencimento != null ? `Dia ${v.dia_vencimento}` : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {v.implemento ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${v.cobre_implemento ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-700/30' : 'bg-g-800/60 text-g-500 border border-g-700/40'}`}>
                          {v.cobre_implemento ? 'Sim' : 'Não'}
                        </span>
                      ) : <span className="text-g-700 text-[10px]">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-g-200">{brl(v.valor_veiculo)}</td>
                    <td className="px-3 py-2.5 font-mono text-g-500">
                      {v.valor_mensal_veiculo ? brl(v.valor_mensal_veiculo) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-g-500">{v.data_fim ? dateBR(v.data_fim) : '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={v.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-g-800 bg-g-850">
                <tr>
                  <td colSpan={9} className="px-4 py-2 text-g-600 text-xs font-semibold">{veiculosFlat.length} veículos</td>
                  <td className="px-3 py-2 font-mono font-semibold text-g-200">
                    {brl(veiculosFlat.reduce((s, v) => s + (v.valor_veiculo || 0), 0))}
                  </td>
                  <td className="px-3 py-2 font-mono text-g-500">
                    {brl(veiculosFlat.reduce((s, v) => s + (v.valor_mensal_veiculo || 0), 0))}/mês
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Modais ── */}
      {modal?.type === 'new' && (
        <ApoliceFormModal frota={frota} empresas={empresas} corretores={corretores}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'edit' && (
        <ApoliceFormModal apolice={modal.apolice} frota={frota} empresas={empresas} corretores={corretores}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'cancelar' && (
        <CancelarApoliceModal apolice={modal.apolice}
          onClose={() => setModal(null)}
          onConfirm={handleCancelar} />
      )}
      {modal?.type === 'excluir' && (
        <ExcluirApoliceModal apolice={modal.apolice}
          onClose={() => setModal(null)}
          onConfirm={handleExcluir} />
      )}
    </div>
  )
}

// ── FilterChip ─────────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick, color = 'default' }) {
  const colors = {
    default: active ? 'bg-g-200 text-white border-g-200'         : 'bg-g-900 text-g-500 border-g-800 hover:border-g-700 hover:text-g-400',
    red:     active ? 'bg-red-600 text-white border-red-600'     : 'bg-g-900 text-g-500 border-g-800 hover:border-red-300 hover:text-red-600',
    amber:   active ? 'bg-amber-600 text-white border-amber-600' : 'bg-g-900 text-g-500 border-g-800 hover:border-amber-300 hover:text-amber-600',
    green:   active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-g-900 text-g-500 border-g-800 hover:border-emerald-300 hover:text-emerald-700',
  }
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${colors[color]}`}>
      {label}
    </button>
  )
}
