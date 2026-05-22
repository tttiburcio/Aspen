import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  MapPin, ShieldCheck, ShieldOff, Calendar, Clock,
  AlertCircle, X, Plus, Pencil, Search, Building2,
  ChevronDown, ChevronUp, AlertTriangle, Ban,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getRastreamento, getRastreamentoSummary,
  criarRastreamento, patchRastreamento, deletarRastreamento,
  dbListFrotaAll,
} from '../utils/api'
import { brl, dateBR } from '../utils/format'
import { useCompanies } from '../contexts/CompanyContext'
import { withErrorToast } from '../utils/asyncHandler'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import KPICard from '../components/KPICard'

// ── helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'ativo')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-700/30">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Ativo
      </span>
    )
  if (status === 'vencendo')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-700/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Vencendo
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-700/30">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Vencido
    </span>
  )
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

// ── Modal de criação de novo registro ─────────────────────────────────────────
function NovoCadastroModal({ frota, empresas, onClose, onSave }) {
  const [form, setForm] = useState({
    id_veiculo: '', id_empresa: '', empresa_rastreamento: '', numero_contrato: '',
    modelo_rastreador: '', tem_bloqueador: false, valor_mensal: '', valor_total_contrato: '',
    data_inicio: '', vencimento: '', dia_vencimento: '', dias_sem_sinal: '', observacoes: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id_veiculo) { toast.error('Selecione o veículo'); return }
    setSaving(true)
    try {
      await criarRastreamento({
        ...form,
        id_veiculo:           Number(form.id_veiculo),
        id_empresa:           form.id_empresa ? Number(form.id_empresa) : null,
        valor_mensal:         form.valor_mensal         ? Number(form.valor_mensal) : null,
        valor_total_contrato: form.valor_total_contrato ? Number(form.valor_total_contrato) : null,
        dia_vencimento:       form.dia_vencimento       ? Number(form.dia_vencimento) : null,
        dias_sem_sinal:       form.dias_sem_sinal !== '' ? Number(form.dias_sem_sinal) : 0,
        data_inicio:          form.data_inicio || null,
        vencimento:           form.vencimento || null,
      })
      toast.success('Registro criado')
      onSave()
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '94vh' }}>
        {/* Cabeçalho */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-g-850 border border-g-800">
              <MapPin className="w-5 h-5 text-g-400" />
            </div>
            <div>
              <h2 className="text-g-50 font-bold text-base">Novo Rastreamento</h2>
              <p className="text-g-600 text-xs mt-0.5">Cadastre um novo contrato de rastreamento veicular</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 flex flex-col gap-6">
            {/* Identificação */}
            <div>
              <SectionHeader icon={Building2} label="Identificação do Veículo" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Veículo" required col={2}>
                  <select className={INPUT} value={form.id_veiculo} onChange={e => set('id_veiculo', e.target.value)} required>
                    <option value="">Selecione...</option>
                    {frota.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>)}
                  </select>
                </Field>
                <Field label="Empresa (frota)">
                  <select className={INPUT} value={form.id_empresa} onChange={e => set('id_empresa', e.target.value)}>
                    <option value="">—</option>
                    {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.sigla || emp.nome}</option>)}
                  </select>
                </Field>
                <Field label="Empresa de Rastreamento">
                  <input className={INPUT} placeholder="Sascar, Onixsat..." value={form.empresa_rastreamento} onChange={e => set('empresa_rastreamento', e.target.value)} />
                </Field>
              </div>
            </div>

            {/* Contrato */}
            <div>
              <SectionHeader icon={MapPin} label="Contrato de Rastreamento" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nº do Contrato">
                  <input className={INPUT} placeholder="CONT-001" value={form.numero_contrato} onChange={e => set('numero_contrato', e.target.value)} />
                </Field>
                <Field label="Modelo do Rastreador">
                  <input className={INPUT} placeholder="ST300..." value={form.modelo_rastreador} onChange={e => set('modelo_rastreador', e.target.value)} />
                </Field>
                <Field label="Valor Mensal (R$)">
                  <input className={INPUT} type="number" step="0.01" min="0" placeholder="0,00" value={form.valor_mensal} onChange={e => set('valor_mensal', e.target.value)} />
                </Field>
                <Field label="Valor Total Contrato (R$)">
                  <input className={INPUT} type="number" step="0.01" min="0" placeholder="0,00" value={form.valor_total_contrato} onChange={e => set('valor_total_contrato', e.target.value)} />
                </Field>
              </div>
            </div>

            {/* Vigência */}
            <div>
              <SectionHeader icon={Calendar} label="Vigência & Cobrança" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data de Início">
                  <input className={INPUT} type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
                </Field>
                <Field label="Validade do Contrato">
                  <input className={INPUT} type="date" value={form.vencimento} onChange={e => set('vencimento', e.target.value)} />
                </Field>
                <Field label="Dia de Vencimento (1–28)">
                  <input className={INPUT} type="number" min="1" max="28" placeholder="Ex: 10" value={form.dia_vencimento} onChange={e => set('dia_vencimento', e.target.value)} />
                </Field>
                <Field label="Dias sem Sinal">
                  <input className={INPUT} type="number" min="0" placeholder="0" value={form.dias_sem_sinal} onChange={e => set('dias_sem_sinal', e.target.value)} />
                </Field>
              </div>
            </div>

            {/* Extras */}
            <div>
              <SectionHeader icon={ShieldCheck} label="Configurações" />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 py-1">
                  <input type="checkbox" id="bloq_new" checked={form.tem_bloqueador} onChange={e => set('tem_bloqueador', e.target.checked)} className="w-4 h-4 rounded accent-emerald-500" />
                  <label htmlFor="bloq_new" className="text-sm text-g-300 font-medium cursor-pointer">Possui Bloqueador</label>
                </div>
                <Field label="Observações" col={2}>
                  <textarea className={INPUT + ' resize-none'} rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="px-8 py-5 border-t border-g-800 shrink-0 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm rounded-lg border border-g-800 text-g-500 hover:bg-g-850 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar Rastreamento'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

// ── Modal de edição de contrato ────────────────────────────────────────────────
function ContratoEditModal({ veiculos, onClose, onSave }) {
  const v0 = veiculos[0] || {}
  const [cForm, setCForm] = useState({
    empresa_rastreamento: v0.empresa_rastreamento ?? '',
    numero_contrato:      v0.numero_contrato      ?? '',
    modelo_rastreador:    v0.modelo_rastreador     ?? '',
    data_inicio:          v0.data_inicio           ?? '',
    vencimento:           v0.vencimento            ?? '',
    dia_vencimento:       v0.dia_vencimento != null ? String(v0.dia_vencimento) : '',
  })
  const [vForms, setVForms] = useState(
    Object.fromEntries(veiculos.map(v => [v.id, {
      valor_mensal:   v.valor_mensal != null ? String(v.valor_mensal) : '',
      tem_bloqueador: v.tem_bloqueador ?? false,
      dias_sem_sinal: v.dias_sem_sinal ?? 0,
      observacoes:    v.observacoes ?? '',
    }]))
  )
  const [saving, setSaving] = useState(false)

  const setC = (k, val) => setCForm(f => ({ ...f, [k]: val }))
  const setV = (id, k, val) => setVForms(f => ({ ...f, [id]: { ...f[id], [k]: val } }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const contratoPayload = {
        empresa_rastreamento: cForm.empresa_rastreamento || null,
        numero_contrato:      cForm.numero_contrato      || null,
        modelo_rastreador:    cForm.modelo_rastreador    || null,
        data_inicio:          cForm.data_inicio          || null,
        vencimento:           cForm.vencimento           || null,
        dia_vencimento:       cForm.dia_vencimento ? Number(cForm.dia_vencimento) : null,
      }
      await Promise.all(veiculos.map(v => {
        const vf = vForms[v.id] || {}
        return patchRastreamento(v.id, {
          ...contratoPayload,
          valor_mensal:   vf.valor_mensal  ? Number(vf.valor_mensal) : null,
          tem_bloqueador: vf.tem_bloqueador,
          dias_sem_sinal: Number(vf.dias_sem_sinal) || 0,
          observacoes:    vf.observacoes   || null,
        })
      }))
      toast.success('Contrato atualizado')
      onSave()
    } catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col" style={{ maxHeight: '94vh' }}>
        {/* Cabeçalho */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-g-850 border border-g-800">
              <MapPin className="w-5 h-5 text-g-400" />
            </div>
            <div>
              <h2 className="text-g-50 font-bold text-base">Editar Contrato de Rastreamento</h2>
              <p className="text-g-600 text-xs mt-0.5">{v0.empresa_rastreamento || '—'} · {v0.numero_contrato || '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">
          {/* Dados do contrato */}
          <div>
            <SectionHeader icon={MapPin} label="Dados do Contrato" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Empresa de Rastreamento">
                <input className={INPUT} value={cForm.empresa_rastreamento} onChange={e => setC('empresa_rastreamento', e.target.value)} />
              </Field>
              <Field label="Nº do Contrato">
                <input className={INPUT} value={cForm.numero_contrato} onChange={e => setC('numero_contrato', e.target.value)} />
              </Field>
              <Field label="Modelo do Rastreador">
                <input className={INPUT} value={cForm.modelo_rastreador} onChange={e => setC('modelo_rastreador', e.target.value)} />
              </Field>
              <Field label="Data de Início">
                <input type="date" className={INPUT} value={cForm.data_inicio} onChange={e => setC('data_inicio', e.target.value)} />
              </Field>
              <Field label="Validade do Contrato">
                <input type="date" className={INPUT} value={cForm.vencimento} onChange={e => setC('vencimento', e.target.value)} />
              </Field>
              <Field label="Dia de Vencimento (1–28)">
                <input type="number" min="1" max="28" className={INPUT} placeholder="Ex: 10" value={cForm.dia_vencimento} onChange={e => setC('dia_vencimento', e.target.value)} />
              </Field>
            </div>
          </div>

          {/* Veículos */}
          <div>
            <SectionHeader icon={Building2} label={`Veículos no Contrato (${veiculos.length})`} />
            <div className="rounded-xl border border-g-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[580px]">
                  <thead className="border-b border-g-800 bg-g-850">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Placa</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Modelo</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Valor/mês</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Bloq.</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-amber-600 uppercase tracking-wider">S/ sinal</th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {veiculos.map(v => {
                      const vf = vForms[v.id] || {}
                      return (
                        <tr key={v.id} className="border-b border-g-800/60 last:border-0">
                          <td className="px-4 py-2 font-mono font-bold text-g-200">{v.placa || '—'}</td>
                          <td className="px-3 py-2 text-g-500 truncate max-w-[110px]">{v.modelo_veiculo || '—'}</td>
                          <td className="px-3 py-2">
                            <input type="number" step="0.01" min="0"
                              className={INPUT_SM + ' w-24'}
                              value={vf.valor_mensal}
                              onChange={e => setV(v.id, 'valor_mensal', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="checkbox" checked={vf.tem_bloqueador}
                              onChange={e => setV(v.id, 'tem_bloqueador', e.target.checked)}
                              className="w-3.5 h-3.5 accent-emerald-500" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0"
                              className={INPUT_SM + ' w-16'}
                              value={vf.dias_sem_sinal}
                              onChange={e => setV(v.id, 'dias_sem_sinal', e.target.value)} />
                          </td>
                          <td className="px-3 py-2">
                            <input className={INPUT_SM}
                              value={vf.observacoes}
                              onChange={e => setV(v.id, 'observacoes', e.target.value)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-g-800 shrink-0 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm rounded-lg border border-g-800 text-g-500 hover:bg-g-850 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Contrato'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Modal de cancelamento de veículo ─────────────────────────────────────────
function CancelVeiculoModal({ veiculo, onClose, onConfirm }) {
  const [devolvido, setDevolvido] = useState(null)
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
          <h2 className="text-sm font-bold text-g-100">Cancelar Rastreamento</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-3 py-2.5 rounded-lg bg-g-850 border border-g-800 text-xs flex flex-col gap-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Placa</span>
            <span className="text-g-200 font-mono font-bold">{veiculo.placa || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Modelo</span>
            <span className="text-g-400">{veiculo.modelo_veiculo || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Rastreadora</span>
            <span className="text-g-400">{veiculo.empresa_rastreamento || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Contrato</span>
            <span className="text-g-400 font-mono">{veiculo.numero_contrato || '—'}</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-g-400 mb-3">O aparelho foi devolvido à empresa rastreadora?</p>
          <div className="flex gap-3">
            <button onClick={() => setDevolvido(true)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${devolvido === true ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-g-800 text-g-500 hover:border-g-700 hover:text-g-400'}`}>
              Sim, devolvido
            </button>
            <button onClick={() => setDevolvido(false)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${devolvido === false ? 'bg-red-700 border-red-700 text-white' : 'border-g-800 text-g-500 hover:border-g-700 hover:text-g-400'}`}>
              Não devolvido
            </button>
          </div>
        </div>

        {devolvido === false && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Aparelhos não devolvidos podem gerar <strong className="text-amber-300">multa por não devolução</strong> conforme contrato. Registre junto ao financeiro antes de prosseguir.</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">Voltar</button>
          <button onClick={handleConfirm} disabled={devolvido === null || loading}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold border border-red-600 transition-colors disabled:opacity-40">
            {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Modal de cancelamento de contrato ─────────────────────────────────────────
function CancelContratoModal({ contrato, veiculos, onClose, onConfirm }) {
  const [temMulta, setTemMulta] = useState(null)
  const [valorMulta, setValorMulta] = useState('')
  const [loading, setLoading] = useState(false)

  const canConfirm = temMulta !== null && (temMulta === false || valorMulta !== '')

  const handleConfirm = async () => {
    setLoading(true)
    try { await onConfirm() }
    finally { setLoading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-g-100">Cancelar Contrato</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-3 py-2.5 rounded-lg bg-g-850 border border-g-800 text-xs flex flex-col gap-1.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Rastreadora</span>
            <span className="text-g-200 font-semibold">{contrato.empresa_rastreamento || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Contrato</span>
            <span className="text-g-300 font-mono">{contrato.numero_contrato || '—'}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-g-600">Veículos</span>
            <span className="text-g-400">{veiculos.length} veículo{veiculos.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-950/30 border border-red-800/40 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Esta ação removerá <strong className="text-red-300">todos os {veiculos.length} veículos</strong> deste contrato do sistema de rastreamento.</span>
        </div>

        <div>
          <p className="text-xs font-semibold text-g-400 mb-3">Existe multa por quebra contratual?</p>
          <div className="flex gap-3 mb-3">
            <button onClick={() => setTemMulta(false)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${temMulta === false ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-g-800 text-g-500 hover:border-g-700 hover:text-g-400'}`}>
              Sem multa
            </button>
            <button onClick={() => setTemMulta(true)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${temMulta === true ? 'bg-amber-600 border-amber-600 text-white' : 'border-g-800 text-g-500 hover:border-g-700 hover:text-g-400'}`}>
              Existe multa
            </button>
          </div>
          {temMulta === true && (
            <div>
              <label className="block text-[10px] font-semibold text-g-600 mb-1 uppercase tracking-wider">Valor da multa (R$)</label>
              <input type="number" step="0.01" min="0"
                className={INPUT} placeholder="0,00"
                value={valorMulta} onChange={e => setValorMulta(e.target.value)} />
              <p className="text-[10px] text-amber-500 mt-1.5">Registre este valor no departamento financeiro antes de confirmar o cancelamento.</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">Voltar</button>
          <button onClick={handleConfirm} disabled={!canConfirm || loading}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold border border-red-600 transition-colors disabled:opacity-40">
            {loading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Card de contrato (agrupado) ───────────────────────────────────────────────
function ContratoCard({ contrato, veiculos, onEditContrato, onCancelContrato, onCancelVeiculo }) {
  const [expanded, setExpanded] = useState(false)
  const v0 = veiculos[0] || {}
  const totalMensal = veiculos.reduce((s, v) => s + (v.valor_mensal || 0), 0)
  const comBloq = veiculos.filter(v => v.tem_bloqueador).length
  const statusGlobal = veiculos.some(v => v.status === 'vencido') ? 'vencido'
    : veiculos.some(v => v.status === 'vencendo') ? 'vencendo' : 'ativo'

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setExpanded(v => !v)}>
          <div className="w-8 h-8 rounded-lg bg-g-850 border border-g-800 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-g-200 truncate">{contrato.empresa_rastreamento || 'Sem empresa'}</p>
            <p className="text-xs text-g-600">{contrato.numero_contrato ? `Contrato: ${contrato.numero_contrato}` : 'Sem número'}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-g-200 tabular-nums font-mono">{brl(totalMensal)}<span className="text-xs font-normal text-g-600">/mês</span></p>
            <p className="text-xs text-g-600">{veiculos.length} veículo{veiculos.length > 1 ? 's' : ''}</p>
          </div>
          {v0.vencimento && (
            <div className="text-right hidden md:block">
              <p className="text-[10px] text-g-600 uppercase tracking-wider">Validade</p>
              <p className="text-xs font-semibold text-g-400">{dateBR(v0.vencimento)}</p>
            </div>
          )}
          {comBloq > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-700/30 rounded-full px-2 py-0.5">
              <ShieldCheck className="w-3 h-3" />{comBloq}
            </div>
          )}
          <StatusBadge status={statusGlobal} />
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button onClick={() => onEditContrato(veiculos)} title="Editar contrato"
            className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onCancelContrato(contrato, veiculos)} title="Cancelar contrato"
            className="p-1.5 rounded-lg text-g-600 hover:text-red-400 hover:bg-red-950/20 transition-colors">
            <Ban className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-g-600 hover:bg-g-800 transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-g-800">
          {/* Sumário do contrato */}
          <div className="px-5 py-3 bg-g-850 border-b border-g-800 grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
            <div><span className="text-g-600 text-[10px] block uppercase tracking-wider">Início</span><span className="font-semibold text-g-300">{v0.data_inicio ? dateBR(v0.data_inicio) : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] block uppercase tracking-wider">Validade</span><span className="font-semibold text-g-300">{v0.vencimento ? dateBR(v0.vencimento) : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] block uppercase tracking-wider">Dia cobr.</span><span className="font-semibold text-g-300">{v0.dia_vencimento != null ? `Dia ${v0.dia_vencimento}` : '—'}</span></div>
            <div><span className="text-g-600 text-[10px] block uppercase tracking-wider">Modelo</span><span className="font-semibold text-g-300">{v0.modelo_rastreador || '—'}</span></div>
            <div><span className="text-g-600 text-[10px] block uppercase tracking-wider">Custo/mês</span><span className="font-semibold text-g-300 font-mono">{brl(totalMensal)}</span></div>
            <div><span className="text-g-600 text-[10px] block uppercase tracking-wider">Total contrato</span><span className="font-semibold text-g-300 font-mono">{brl(veiculos.reduce((s, v) => s + (v.valor_total_contrato || 0), 0))}</span></div>
          </div>

          {/* Tabela de veículos */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="border-b border-g-800 bg-g-850">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Placa</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Modelo</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Empresa</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Bloq.</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Dia cobr.</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Valor/mês</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Total contrato</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Dias rast.</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-amber-600 uppercase tracking-wider">S/ sinal</th>
                  <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {veiculos.map(v => (
                  <tr key={v.id} className="border-b border-g-800/50 hover:bg-g-850 transition-colors">
                    <td className="px-5 py-2.5 font-mono font-bold text-g-200">{v.placa || '—'}</td>
                    <td className="px-3 py-2.5 text-g-400 truncate max-w-[130px]">{v.modelo_veiculo || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500">{v.empresa_sigla || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {v.tem_bloqueador
                        ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                        : <ShieldOff   className="w-3.5 h-3.5 text-g-700 mx-auto" />}
                    </td>
                    <td className="px-3 py-2.5 text-center text-g-500">
                      {v.dia_vencimento != null ? `Dia ${v.dia_vencimento}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-g-200">{v.valor_mensal ? brl(v.valor_mensal) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-g-500">{v.valor_total_contrato ? brl(v.valor_total_contrato) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-g-400 tabular-nums">
                      {v.dias_rastreados != null ? `${v.dias_rastreados.toLocaleString('pt-BR')}d` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={v.dias_sem_sinal > 0 ? 'text-amber-500 font-semibold' : 'text-g-700'}>
                        {v.dias_sem_sinal > 0 ? `${v.dias_sem_sinal}d` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={v.status} /></td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => onCancelVeiculo(v)} title="Cancelar rastreamento deste veículo"
                        className="p-1 rounded text-g-700 hover:text-red-400 hover:bg-red-950/20 transition-colors">
                        <Ban className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function RastreamentoPage() {
  const { selectedCompany, companies: empresas } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [records,  setRecords]  = useState(null)
  const [summary,  setSummary]  = useState(null)
  const [frota,    setFrota]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fBloq,    setFBloq]    = useState(false)
  const [fEmpRast, setFEmpRast] = useState('')
  const [view,     setView]     = useState('contratos')
  const [modal,    setModal]    = useState(null)

  const params = useMemo(() => ({ ...(empresa ? { empresa } : {}) }), [empresa])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recs, sum] = await Promise.all([
        getRastreamento(params),
        getRastreamentoSummary(params),
      ])
      setRecords(recs || [])
      setSummary(sum || null)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => { load() }, [load])
  useEffect(() => { withErrorToast(() => dbListFrotaAll().then(d => setFrota(d || [])), 'Erro ao carregar frota') }, [])

  const filtered = useMemo(() => {
    if (!records) return []
    let r = records
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(v => [v.placa, v.modelo_veiculo, v.empresa_rastreamento, v.numero_contrato, v.modelo_rastreador, v.empresa_sigla]
        .some(f => (f || '').toLowerCase().includes(q)))
    }
    if (fStatus)  r = r.filter(v => v.status === fStatus)
    if (fBloq)    r = r.filter(v => v.tem_bloqueador)
    if (fEmpRast) r = r.filter(v => v.empresa_rastreamento === fEmpRast)
    return r
  }, [records, search, fStatus, fBloq, fEmpRast])

  const contratos = useMemo(() => {
    const map = {}
    for (const v of filtered) {
      const key = `${v.empresa_rastreamento || ''}|${v.numero_contrato || ''}`
      if (!map[key]) map[key] = { empresa_rastreamento: v.empresa_rastreamento, numero_contrato: v.numero_contrato, veiculos: [] }
      map[key].veiculos.push(v)
    }
    return Object.values(map).sort((a, b) => (a.empresa_rastreamento || '').localeCompare(b.empresa_rastreamento || ''))
  }, [filtered])

  const empRastOptions = useMemo(() => {
    if (!records) return []
    return [...new Set(records.map(r => r.empresa_rastreamento).filter(Boolean))].sort()
  }, [records])

  const handleCancelVeiculo = async () => {
    const { veiculo } = modal
    try {
      await deletarRastreamento(veiculo.id)
      toast.success(`Rastreamento de ${veiculo.placa} cancelado`)
      setModal(null)
      load()
    } catch { toast.error('Erro ao cancelar') }
  }

  const handleCancelContrato = async () => {
    const { veiculos } = modal
    try {
      await Promise.all(veiculos.map(v => deletarRastreamento(v.id)))
      toast.success('Contrato cancelado')
      setModal(null)
      load()
    } catch { toast.error('Erro ao cancelar') }
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
          <KPICard icon={MapPin}      label="Veículos Rastreados"
            value={String(summary.total_veiculos)} sub={`${summary.ativos} ativos`} />
          <KPICard icon={Calendar}    label="Custo Mensal"
            value={brl(summary.total_mensal)} sub={`Anual est. ${brl(summary.total_anual)}`} />
          <KPICard icon={ShieldCheck} label="Com Bloqueador"
            value={String(summary.com_bloqueador)} sub={`${summary.sem_bloqueador} sem bloqueador`} accent />
          <KPICard icon={Clock}       label="Dias Rastreados"
            value={summary.total_dias_rastreados?.toLocaleString('pt-BR') ?? '—'} sub={`média ${summary.media_dias_rast}d/veículo`} />
          <KPICard icon={AlertCircle} label="Dias sem Sinal"
            value={String(summary.total_dias_sem_sinal ?? 0)} sub="falha ou sem cobertura"
            danger={summary.total_dias_sem_sinal > 0} />
          <KPICard icon={X}           label="Vencidos / Vencendo"
            value={`${summary.vencidos} / ${summary.vencendo_30d}`} sub="expirados / próx. 30d"
            danger={summary.vencidos > 0} />
        </div>
      )}

      {/* ── Barra de ações ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g-600" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar placa, empresa, contrato..."
            className="w-full pl-9 pr-4 py-2 bg-g-900 border border-g-800 rounded-lg text-sm text-g-300 placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
          />
        </div>
        <button onClick={() => setModal({ type: 'new' })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5" /> Novo
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap -mt-3">
        <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Status:</span>
        {[['', 'Todos'], ['ativo', 'Ativo'], ['vencendo', 'Vencendo'], ['vencido', 'Vencido']].map(([val, lbl]) => (
          <FilterChip key={val} label={lbl} active={fStatus === val} onClick={() => setFStatus(val)}
            color={val === 'ativo' ? 'green' : val === 'vencendo' ? 'amber' : val === 'vencido' ? 'red' : 'default'} />
        ))}
        <span className="text-g-800 mx-1">·</span>
        <FilterChip label="Com Bloqueador" active={fBloq} onClick={() => setFBloq(v => !v)} color="green" />
        {empRastOptions.length > 1 && (
          <>
            <span className="text-g-800 mx-1">·</span>
            <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Empresa:</span>
            <FilterChip label="Todas" active={fEmpRast === ''} onClick={() => setFEmpRast('')} />
            {empRastOptions.map(emp => (
              <FilterChip key={emp} label={emp} active={fEmpRast === emp} onClick={() => setFEmpRast(v => v === emp ? '' : emp)} />
            ))}
          </>
        )}
        <span className="text-g-800 mx-1">·</span>
        <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Visualizar:</span>
        <FilterChip label="Por Contrato" active={view === 'contratos'} onClick={() => setView('contratos')} />
        <FilterChip label="Por Veículo"  active={view === 'veiculos'}  onClick={() => setView('veiculos')} />
        <span className="ml-auto text-g-600 text-xs font-mono">{filtered.length} veículos</span>
      </div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nenhum registro encontrado"
          message="Adicione veículos rastreados ou ajuste os filtros."
          action={
            <button onClick={() => setModal({ type: 'new' })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Adicionar Rastreamento
            </button>
          }
        />
      ) : view === 'contratos' ? (
        <div className="flex flex-col gap-3">
          {contratos.map(c => (
            <ContratoCard
              key={`${c.empresa_rastreamento}|${c.numero_contrato}`}
              contrato={c}
              veiculos={c.veiculos}
              onEditContrato={(veics) => setModal({ type: 'edit_contrato', veiculos: veics })}
              onCancelContrato={(cont, veics) => setModal({ type: 'cancel_contrato', contrato: cont, veiculos: veics })}
              onCancelVeiculo={(v) => setModal({ type: 'cancel_veiculo', veiculo: v })}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1060px]">
              <thead className="border-b border-g-800 bg-g-850">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Placa</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Modelo</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Empresa</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Rastreadora</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold text-g-500 uppercase tracking-wider">Equip.</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Bloq.</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Dia cobr.</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Valor/mês</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Total contrato</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Início</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Validade</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold text-g-500 uppercase tracking-wider">Dias rast.</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold text-amber-600 uppercase tracking-wider">S/ sinal</th>
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-g-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id} className="border-b border-g-800/50 hover:bg-g-850 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-g-200">{v.placa || '—'}</td>
                    <td className="px-3 py-2.5 text-g-400 truncate max-w-[110px]">{v.modelo_veiculo || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500">{v.empresa_sigla || '—'}</td>
                    <td className="px-3 py-2.5 text-g-300 font-medium">{v.empresa_rastreamento || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500 font-mono">{v.numero_contrato || '—'}</td>
                    <td className="px-3 py-2.5 text-g-500">{v.modelo_rastreador || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {v.tem_bloqueador
                        ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                        : <ShieldOff   className="w-3.5 h-3.5 text-g-700 mx-auto" />}
                    </td>
                    <td className="px-3 py-2.5 text-center text-g-500">
                      {v.dia_vencimento != null ? `Dia ${v.dia_vencimento}` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-g-200">{v.valor_mensal ? brl(v.valor_mensal) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-g-500">{v.valor_total_contrato ? brl(v.valor_total_contrato) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-g-500">{v.data_inicio ? dateBR(v.data_inicio) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-g-500">{v.vencimento ? dateBR(v.vencimento) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-g-400 tabular-nums">
                      {v.dias_rastreados != null ? `${v.dias_rastreados.toLocaleString('pt-BR')}d` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={v.dias_sem_sinal > 0 ? 'text-amber-500 font-semibold' : 'text-g-700'}>
                        {v.dias_sem_sinal > 0 ? `${v.dias_sem_sinal}d` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={v.status} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-g-800 bg-g-850">
                <tr>
                  <td colSpan={8} className="px-4 py-2.5 text-g-600 text-xs font-semibold">{filtered.length} veículos</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-g-200">{brl(filtered.reduce((s, v) => s + (v.valor_mensal || 0), 0))}/mês</td>
                  <td className="px-3 py-2.5 text-right font-mono text-g-500">{brl(filtered.reduce((s, v) => s + (v.valor_total_contrato || 0), 0))}</td>
                  <td colSpan={3} />
                  <td className="px-3 py-2.5 text-right font-semibold text-amber-500">{filtered.reduce((s, v) => s + (v.dias_sem_sinal || 0), 0)}d</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Modais ── */}
      {modal?.type === 'new' && (
        <NovoCadastroModal frota={frota} empresas={empresas}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'edit_contrato' && (
        <ContratoEditModal veiculos={modal.veiculos}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'cancel_veiculo' && (
        <CancelVeiculoModal veiculo={modal.veiculo}
          onClose={() => setModal(null)}
          onConfirm={handleCancelVeiculo} />
      )}
      {modal?.type === 'cancel_contrato' && (
        <CancelContratoModal contrato={modal.contrato} veiculos={modal.veiculos}
          onClose={() => setModal(null)}
          onConfirm={handleCancelContrato} />
      )}
    </div>
  )
}

// ── FilterChip ────────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick, color = 'default' }) {
  const colors = {
    default: active ? 'bg-g-200 text-white border-g-200'             : 'bg-g-900 text-g-500 border-g-800 hover:border-g-700 hover:text-g-400',
    red:     active ? 'bg-red-600 text-white border-red-600'         : 'bg-g-900 text-g-500 border-g-800 hover:border-red-800 hover:text-red-400',
    amber:   active ? 'bg-amber-600 text-white border-amber-600'     : 'bg-g-900 text-g-500 border-g-800 hover:border-amber-800 hover:text-amber-500',
    green:   active ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-g-900 text-g-500 border-g-800 hover:border-emerald-800 hover:text-emerald-600',
  }
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${colors[color]}`}>
      {label}
    </button>
  )
}
