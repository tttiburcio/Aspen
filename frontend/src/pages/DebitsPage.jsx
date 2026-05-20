import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  FileWarning, AlertCircle, CheckCircle2, Car, Truck, Search, X,
  Loader2, Plus, ChevronRight, Shield, User, FileText,
  CreditCard, BadgeCheck, Ban, Send, RefreshCw, Edit2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getDebitos, getDebitosSummary, patchDebito,
  getMultas, getMultasSummary, criarMulta, patchMulta,
  criarNicMulta, dbListFrota,
} from '../utils/api'
import { brl, dateBR } from '../utils/format'
import { useCompanies } from '../contexts/CompanyContext'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'

// ─── Constants ────────────────────────────────────────────────────────────────
const ORGAOS = ['DETRAN-SP', 'PRF', 'SEMOB', 'CET-SP', 'ANTT', 'CETESB', 'DETRAN-MG', 'DER-SP']

// Tabela de encargos conforme legislação brasileira vigente (mai/2026)
// IPVA/Licen:  multa 0,33%/dia (teto 20%) + SELIC 1,09%/mês (mín. 1%/mês) — Lei 9.430/96 + ICMS-SP
// Multa CTB:   ≤30d → 0,33%/dia | >30d → 10% fixo + SELIC mensal + 1%/mês — CTB Art. 284
const ENCARGOS_CFG = {
  ipva:          { multaDiaria: 0.0033, multaMax: 0.20, jurosMensal: 0.0109 },
  licenciamento: { multaDiaria: 0.0033, multaMax: 0.20, jurosMensal: 0.01   },
  multa:         { multaDiaria: 0.0033, multaMax: 0.10, jurosMensal: 0.0109 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysDiff(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000)
}

// Calcula encargo oficial: retorna { multa, juros, total, diasAtraso }
function calcEncargos(valor, vencimento, tipo = 'ipva') {
  if (!valor || !vencimento) return { multa: 0, juros: 0, total: 0, diasAtraso: 0 }
  const dias = daysDiff(vencimento)
  if (dias === null || dias >= 0) return { multa: 0, juros: 0, total: 0, diasAtraso: 0 }
  const diasAtraso  = Math.abs(dias)
  const mesesAtraso = Math.floor(diasAtraso / 30)
  const cfg         = ENCARGOS_CFG[tipo] || ENCARGOS_CFG.ipva
  let multa, juros
  if (tipo === 'multa' && diasAtraso > 30) {
    // CTB: após mês seguinte ao vencimento — 10% fixo + SELIC mensal
    multa = valor * 0.10
    juros = valor * Math.max(cfg.jurosMensal, 0.01) * (mesesAtraso || 1)
  } else {
    multa = Math.min(diasAtraso * cfg.multaDiaria, cfg.multaMax) * valor
    juros = mesesAtraso > 0 ? valor * Math.max(cfg.jurosMensal, 0.01) * mesesAtraso : 0
  }
  multa = parseFloat(multa.toFixed(2))
  juros = parseFloat(juros.toFixed(2))
  return { multa, juros, total: parseFloat((multa + juros).toFixed(2)), diasAtraso }
}

function urgencyScore(d) {
  const ipvaDays  = daysDiff(d.vencimento_ipva)
  const licenDays = daysDiff(d.vencimento_licenciamento)
  const isOverdue = (d.status_ipva !== 'Pago' && ipvaDays !== null && ipvaDays < 0)
    || (d.status_licenciamento !== 'Pago' && licenDays !== null && licenDays < 0)
  const isApproach = !isOverdue && [ipvaDays, licenDays].some(v => v !== null && v >= 0 && v <= 30)
  if (isOverdue)  return 1000 + (d.atividade_score || 0)
  if (isApproach) return 500  + (d.atividade_score || 0)
  return d.atividade_score || 0
}

// ─── Design atoms ─────────────────────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm focus:outline-none focus:border-g-600 transition-colors'
const labelCls = 'text-g-500 text-[11px] font-semibold uppercase tracking-wider'

function FieldGroup({ label, children, span = 1 }) {
  return (
    <div className={`flex flex-col gap-1.5 ${span === 2 ? 'col-span-2' : ''}`}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'Pago')     return <span className="badge-green">{status}</span>
  if (status === 'Vencido')  return <span className="badge-red">{status}</span>
  if (status === 'Pendente') return <span className="badge-amber">{status}</span>
  if (status === 'Recorrido')
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">{status}</span>
  return <span className="badge-amber">{status}</span>
}

// Chip de filtro rápido
function FilterChip({ label, active, count, onClick, color = 'default' }) {
  const colors = {
    default: active ? 'bg-g-200 text-white border-g-200'       : 'bg-g-900 text-g-500 border-g-800 hover:border-g-700 hover:text-g-400',
    red:     active ? 'bg-red-600 text-white border-red-600'   : 'bg-g-900 text-g-500 border-g-800 hover:border-red-300 hover:text-red-600',
    amber:   active ? 'bg-amber-600 text-white border-amber-600' : 'bg-g-900 text-g-500 border-g-800 hover:border-amber-300 hover:text-amber-600',
    green:   active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-g-900 text-g-500 border-g-800 hover:border-emerald-300 hover:text-emerald-700',
    indigo:  active ? 'bg-indigo-600 text-white border-indigo-600'   : 'bg-g-900 text-g-500 border-g-800 hover:border-indigo-300 hover:text-indigo-600',
  }
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${colors[color]}`}>
      {label}
      {count !== undefined && (
        <span className={`text-[10px] font-bold px-1 rounded-full ${active ? 'bg-white/20' : 'bg-g-850'}`}>{count}</span>
      )}
    </button>
  )
}

// Accent bar lateral na linha da tabela
function RowAccent({ isOverdue, isApproach }) {
  return <td className={`p-0 w-[3px] ${isOverdue ? 'bg-red-400' : isApproach ? 'bg-amber-400' : 'bg-transparent'}`} />
}

// ─── Compact Debt Cell ────────────────────────────────────────────────────────
function DebtCell({ valor, status, vencimento, encargo, onEditEncargo }) {
  if (!valor && !vencimento) return <td className="td text-g-700 text-center">—</td>
  const dias       = daysDiff(vencimento)
  const isOverdue  = status !== 'Pago' && dias !== null && dias < 0
  const isApproach = !isOverdue && dias !== null && dias >= 0 && dias <= 30 && status !== 'Pago'
  const encSalvo   = encargo || 0
  const hasEncargo = encSalvo > 0
  const valorAtual = valor + encSalvo

  const displayStatus = isOverdue && status === 'Pendente' ? 'Vencido' : status

  return (
    <td className="td whitespace-nowrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono font-bold tabular-nums text-sm text-slate-800">
          {brl(hasEncargo ? valorAtual : valor)}
        </span>
        <StatusBadge status={displayStatus} />
        {status !== 'Pago' && onEditEncargo && (
          <button onClick={e => { e.stopPropagation(); onEditEncargo() }}
            title="Atualizar valor com encargo"
            className="p-0.5 rounded text-g-600 hover:text-g-400 hover:bg-g-850 transition-colors">
            <RefreshCw className="w-2.5 h-2.5" />
          </button>
        )}
      </div>
      {hasEncargo && (
        <div className="text-[9px] text-slate-400 font-mono tabular-nums mt-0.5 leading-none">
          {brl(valor)} + {brl(encSalvo)} enc.
        </div>
      )}
      {vencimento && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-g-600 text-[10px] font-mono tabular-nums">{dateBR(vencimento)}</span>
          {isOverdue  && dias !== null && <span className="text-red-500   text-[10px] font-medium">· {Math.abs(dias)}d atraso</span>}
          {isApproach && <span className="text-amber-600 text-[10px] font-medium">· vence em {dias}d</span>}
        </div>
      )}
    </td>
  )
}

// Phase dots for multa table
function PhaseDots({ m }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const limitePassou = m.data_limite_indicacao && m.data_limite_indicacao < hoje
  const p1 = 'done'
  const p2 = m.condutor_indicado ? 'done' : limitePassou ? 'error' : 'active'
  const p3 = m.data_emissao_multa ? 'done' : m.condutor_indicado ? 'active' : 'pending'
  const p4 = m.status_multa === 'Pago' ? 'done' : m.data_emissao_multa ? 'active' : 'pending'

  const DOT = { done: 'bg-emerald-500 border-emerald-500', active: 'bg-amber-400 border-amber-400', error: 'bg-red-500 border-red-500', pending: 'border-g-700 bg-transparent' }
  const LINE = (s) => s === 'done' ? 'bg-emerald-400/50' : 'bg-g-800'
  const Dot  = ({ s, title }) => <span title={title} className={`w-2 h-2 rounded-full border shrink-0 ${DOT[s]}`} />

  return (
    <div className="flex items-center gap-0">
      <Dot s={p1} title="Notificação" />
      <div className={`w-4 h-px ${LINE(p1)}`} />
      <Dot s={p2} title="Indicação" />
      <div className={`w-4 h-px ${LINE(p2)}`} />
      <Dot s={p3} title="Boleto" />
      <div className={`w-4 h-px ${LINE(p3)}`} />
      <Dot s={p4} title="Pagamento" />
    </div>
  )
}

// ─── Modal: Atualizar Encargo (IPVA ou Licenciamento) ─────────────────────────
function AtualizarEncargoModal({ debito, tipo, onClose, onSaved }) {
  const label     = tipo === 'ipva' ? 'IPVA' : 'Licenciamento'
  const valorBase = tipo === 'ipva' ? debito.valor_ipva        : debito.valor_licenciamento
  const venc      = tipo === 'ipva' ? debito.vencimento_ipva   : debito.vencimento_licenciamento
  const encAtual   = tipo === 'ipva' ? (debito.encargo_ipva||0) : (debito.encargo_licenciamento||0)
  const enc        = calcEncargos(valorBase, venc, tipo)
  // Usuário informa o valor total atual do boleto; encargo = total - valorBase
  const initTotal  = encAtual > 0 ? valorBase + encAtual : ''
  const [valorAtual, setValorAtual] = useState(String(initTotal))
  const [saving, setSaving] = useState(false)

  const totalNum    = parseFloat(valorAtual) || 0
  const encargoCalc = totalNum > valorBase ? parseFloat((totalNum - valorBase).toFixed(2)) : 0
  const totalOficial = parseFloat((valorBase + enc.total).toFixed(2))

  const handleSave = async () => {
    if (!totalNum || totalNum < valorBase) return toast.error('Valor deve ser maior que o original')
    setSaving(true)
    try {
      const payload = tipo === 'ipva'
        ? { encargo_ipva: encargoCalc }
        : { encargo_licenciamento: encargoCalc }
      await patchDebito(debito.id, payload)
      toast.success('Valor atualizado')
      onSaved(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao atualizar')
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-g-200 font-bold text-base">Atualizar Valor — {label}</h3>
            <p className="text-g-600 text-xs mt-0.5 font-mono">{debito.placa} · Exercício {debito.exercicio}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>

        {/* Estimativa oficial com breakdown */}
        {enc.diasAtraso > 0 && (
          <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 grid grid-cols-2 gap-y-1 text-xs">
            <span className="text-amber-600 font-semibold col-span-2 mb-0.5">Estimativa oficial ({enc.diasAtraso}d atraso)</span>
            <span className="text-amber-600/80">Valor original</span>
            <span className="font-mono tabular-nums text-amber-600 text-right">{brl(valorBase)}</span>
            <span className="text-amber-600/80">Multa de mora <span className="text-[9px] opacity-70">(0,33%/dia, máx {tipo === 'multa' ? '10%' : '20%'})</span></span>
            <span className="font-mono tabular-nums text-amber-600 text-right">+ {brl(enc.multa)}</span>
            <span className="text-amber-600/80">Juros SELIC <span className="text-[9px] opacity-70">(~{tipo === 'licenciamento' ? '1,00' : '1,09'}%/mês)</span></span>
            <span className="font-mono tabular-nums text-amber-600 text-right">+ {brl(enc.juros)}</span>
            <span className="text-amber-600 font-bold border-t border-amber-200 pt-1">Total estimado</span>
            <span className="font-mono font-bold tabular-nums text-amber-600 text-right border-t border-amber-200 pt-1">{brl(totalOficial)}</span>
          </div>
        )}

        <FieldGroup label="Valor Atual do Débito (R$)">
          <div className="relative">
            <input type="number" step="0.01" min={valorBase} value={valorAtual}
              onChange={e => setValorAtual(e.target.value)}
              placeholder={String(valorBase)}
              className={`${inputCls} font-mono pr-24`} />
            {enc.total > 0 && (
              <button onClick={() => setValorAtual(String(totalOficial))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 font-semibold hover:text-amber-600 whitespace-nowrap">
                Usar {brl(totalOficial)}
              </button>
            )}
          </div>
          <p className="text-[10px] text-g-600">Informe o valor total do boleto. O encargo é calculado automaticamente.</p>
        </FieldGroup>

        {encargoCalc > 0 && (
          <div className="px-3 py-2.5 rounded-lg bg-g-850 border border-g-800 text-xs grid grid-cols-2 gap-y-1">
            <span className="text-g-600">Valor original</span>
            <span className="font-mono tabular-nums text-g-400 text-right">{brl(valorBase)}</span>
            <span className="text-g-600">Encargo calculado</span>
            <span className="font-mono tabular-nums text-amber-600 text-right">+ {brl(encargoCalc)}</span>
            <span className="text-g-500 font-semibold border-t border-g-800 pt-1">Total a salvar</span>
            <span className="font-mono font-bold text-g-200 tabular-nums text-right border-t border-g-800 pt-1">{brl(totalNum)}</span>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !totalNum || totalNum < valorBase}
            className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>, document.body
  )
}

// ─── Modal: Pagar Débito Documental ───────────────────────────────────────────
function PagarDebitoModal({ debito, tipo, onClose, onSaved }) {
  const label     = tipo === 'ipva' ? 'IPVA' : 'Licenciamento'
  const valorBase = tipo === 'ipva' ? debito.valor_ipva        : debito.valor_licenciamento
  const venc      = tipo === 'ipva' ? debito.vencimento_ipva   : debito.vencimento_licenciamento
  const encAtual  = tipo === 'ipva' ? (debito.encargo_ipva||0) : (debito.encargo_licenciamento||0)
  const { total: sugerido } = calcEncargos(valorBase, venc, tipo)
  const initEnc   = encAtual > 0 ? encAtual : sugerido

  const [dataPgto, setDataPgto] = useState(new Date().toISOString().slice(0, 10))
  const [valorPago, setValorPago] = useState(String(valorBase || ''))
  const [encargo, setEncargo]    = useState(String(initEnc || ''))
  const [saving,  setSaving]     = useState(false)

  const encargoNum = parseFloat(encargo) || 0
  const totalFinal = (parseFloat(valorPago) || valorBase) + encargoNum

  const handleSubmit = async () => {
    if (!dataPgto) return toast.error('Informe a data de pagamento')
    setSaving(true)
    try {
      const payload = tipo === 'ipva'
        ? { status_ipva: 'Pago', valor_ipva_pago: parseFloat(valorPago) || valorBase, data_pgto_ipva: dataPgto, encargo_ipva: encargoNum }
        : { status_licenciamento: 'Pago', valor_licenciamento_pago: parseFloat(valorPago) || valorBase, data_pgto_licenciamento: dataPgto, encargo_licenciamento: encargoNum }
      await patchDebito(debito.id, payload)
      toast.success(`${label} registrado como pago`)
      onSaved(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao registrar pagamento')
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-g-200 font-bold text-base">Registrar Pagamento — {label}</h3>
            <p className="text-g-600 text-xs mt-0.5 font-mono">{debito.placa} · Exercício {debito.exercicio}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Data de Pagamento *" span={2}>
            <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} className={inputCls} />
          </FieldGroup>
          <FieldGroup label="Valor Pago (R$)">
            <input type="number" step="0.01" value={valorPago} onChange={e => setValorPago(e.target.value)} className={`${inputCls} font-mono`} />
          </FieldGroup>
          <FieldGroup label="Encargo / Mora (R$)">
            <div className="relative">
              <input type="number" step="0.01" min="0" value={encargo} onChange={e => setEncargo(e.target.value)} className={`${inputCls} font-mono pr-16`} />
              {sugerido > 0 && !encAtual && (
                <button onClick={() => setEncargo(String(sugerido))}
                  title="Usar valor sugerido"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 hover:text-amber-600 font-semibold">
                  calc.
                </button>
              )}
            </div>
          </FieldGroup>
        </div>
        <div className="px-3 py-2.5 rounded-xl bg-g-850 border border-g-800 text-xs grid grid-cols-2 gap-y-1">
          <span className="text-g-600">Valor original</span>
          <span className="font-mono font-semibold tabular-nums text-g-300 text-right">{brl(valorBase)}</span>
          {encargoNum > 0 && <>
            <span className="text-g-600">Encargo</span>
            <span className="font-mono text-amber-600 tabular-nums text-right">{brl(encargoNum)}</span>
            <span className="text-g-600 font-semibold">Total final</span>
            <span className="font-mono font-bold text-amber-600 tabular-nums text-right">{brl(totalFinal)}</span>
          </>}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar Pagamento
          </button>
        </div>
      </div>
    </div>, document.body
  )
}

// ─── Modal: Pagar Multa ───────────────────────────────────────────────────────
function PagarMultaModal({ multa, onClose, onSaved }) {
  const hoje      = new Date().toISOString().slice(0, 10)
  const antesVenc = hoje <= (multa.data_vencimento || hoje)
  const { total: sugerido } = calcEncargos(multa.valor_multa, multa.data_vencimento, 'multa')
  const [dataPgto,   setDataPgto]   = useState(hoje)
  const [valorPago,  setValorPago]  = useState(String(antesVenc ? (multa.valor_com_desconto || multa.valor_multa) : multa.valor_multa))
  const [encargo,    setEncargo]    = useState(String(!antesVenc && sugerido > 0 ? sugerido : 0))
  const [aplicouDesc,setAplicouDesc]= useState(antesVenc && !!multa.valor_com_desconto)
  const [saving,     setSaving]     = useState(false)

  const encargoNum = parseFloat(encargo) || 0
  const totalFinal = (parseFloat(valorPago) || multa.valor_multa) + encargoNum

  const handleSubmit = async () => {
    if (!dataPgto) return toast.error('Informe a data de pagamento')
    setSaving(true)
    try {
      await patchMulta(multa.id, { status_multa: 'Pago', data_pagamento: dataPgto, valor_pago: parseFloat(valorPago) || multa.valor_multa, encargo: encargoNum, aplicou_desconto: aplicouDesc })
      toast.success('Multa registrada como paga')
      onSaved(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro')
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-g-200 font-bold text-base">Registrar Pagamento — Multa</h3>
            <p className="text-g-600 text-xs mt-0.5 font-mono">{multa.placa} · AIT {multa.ait || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Data de Pagamento *" span={2}>
            <input type="date" value={dataPgto} onChange={e => setDataPgto(e.target.value)} className={inputCls} />
          </FieldGroup>
          <FieldGroup label="Valor Pago (R$)">
            <input type="number" step="0.01" value={valorPago} onChange={e => setValorPago(e.target.value)} className={`${inputCls} font-mono`} />
          </FieldGroup>
          <FieldGroup label="Encargo / Mora (R$)">
            <div className="relative">
              <input type="number" step="0.01" min="0" value={encargo} onChange={e => setEncargo(e.target.value)} className={`${inputCls} font-mono pr-16`} />
              {sugerido > 0 && (
                <button onClick={() => setEncargo(String(sugerido))}
                  title="Usar sugestão"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-600 hover:text-amber-600 font-semibold">
                  calc.
                </button>
              )}
            </div>
          </FieldGroup>
        </div>
        <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setAplicouDesc(v => !v)}>
          <div className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${aplicouDesc ? 'bg-emerald-500' : 'bg-g-800'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${aplicouDesc ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm text-g-500">Aplicou desconto de {multa.desconto_pct}% ({brl(multa.valor_com_desconto)})</span>
        </label>
        <div className="px-3 py-2.5 rounded-xl bg-g-850 border border-g-800 text-xs grid grid-cols-2 gap-y-1">
          <span className="text-g-600">Valor original</span>
          <span className="font-mono font-semibold tabular-nums text-g-300 text-right">{brl(multa.valor_multa)}</span>
          {multa.valor_com_desconto > 0 && <>
            <span className="text-g-600">Com desconto ({multa.desconto_pct}%)</span>
            <span className="font-mono text-emerald-700 tabular-nums text-right">{brl(multa.valor_com_desconto)}</span>
          </>}
          {encargoNum > 0 && <>
            <span className="text-g-600">Encargo</span>
            <span className="font-mono text-amber-600 tabular-nums text-right">{brl(encargoNum)}</span>
            <span className="text-g-600 font-semibold">Total a pagar</span>
            <span className="font-mono font-bold text-amber-600 tabular-nums text-right">{brl(totalFinal)}</span>
          </>}
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar Pagamento
          </button>
        </div>
      </div>
    </div>, document.body
  )
}

// ─── Modal: Indicar Condutor ──────────────────────────────────────────────────
function IndicarCondutorModal({ multa, onClose, onSaved }) {
  const [nome, setNome] = useState(multa.nome_condutor || '')
  const [cpf,  setCpf]  = useState(multa.cpf_condutor  || '')
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!nome.trim()) return toast.error('Informe o nome do condutor')
    setSaving(true)
    try {
      await patchMulta(multa.id, { condutor_indicado: true, nome_condutor: nome.trim(), cpf_condutor: cpf || null, data_indicacao: data })
      toast.success('Condutor indicado')
      onSaved(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro')
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-g-200 font-bold text-base">Indicar Condutor</h3>
            <p className="text-g-600 text-xs mt-0.5 font-mono">{multa.placa} · AIT {multa.ait || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-col gap-3">
          <FieldGroup label="Nome do Condutor *">
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" className={inputCls} />
          </FieldGroup>
          <FieldGroup label="CPF">
            <input type="text" value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" className={inputCls} />
          </FieldGroup>
          <FieldGroup label="Data de Indicação">
            <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputCls} />
          </FieldGroup>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar
          </button>
        </div>
      </div>
    </div>, document.body
  )
}

// ─── Modal: Cadastrar Boleto ──────────────────────────────────────────────────
function CadastrarBoletoModal({ multa, onClose, onSaved }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [valor,   setValor]   = useState(String(multa.valor_multa || ''))
  const [emissao, setEmissao] = useState(hoje)
  const [venc,    setVenc]    = useState(multa.data_vencimento || '')
  const [desc,    setDesc]    = useState(String(multa.desconto_pct || 20))
  const [saving,  setSaving]  = useState(false)
  const valorDesc = valor && desc ? (parseFloat(valor) * (1 - parseFloat(desc) / 100)).toFixed(2) : null

  const handleSubmit = async () => {
    if (!valor || parseFloat(valor) <= 0) return toast.error('Informe o valor')
    if (!venc) return toast.error('Informe o vencimento')
    setSaving(true)
    try {
      await patchMulta(multa.id, { valor_multa: parseFloat(valor), data_emissao_multa: emissao, data_vencimento: venc, desconto_pct: parseFloat(desc) || 20 })
      toast.success('Boleto cadastrado')
      onSaved(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro')
    } finally { setSaving(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-g-200 font-bold text-base">Cadastrar Boleto</h3>
            <p className="text-g-600 text-xs mt-0.5 font-mono">{multa.placa} · AIT {multa.ait || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldGroup label="Valor da Multa *" span={2}>
            <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} className={`${inputCls} font-mono`} />
          </FieldGroup>
          <FieldGroup label="Emissão">
            <input type="date" value={emissao} onChange={e => setEmissao(e.target.value)} className={inputCls} />
          </FieldGroup>
          <FieldGroup label="Vencimento *">
            <input type="date" value={venc} onChange={e => setVenc(e.target.value)} className={inputCls} />
          </FieldGroup>
          <FieldGroup label="Desconto antecip. (%)" span={2}>
            <input type="number" step="0.01" min="0" max="100" value={desc} onChange={e => setDesc(e.target.value)} className={`${inputCls} font-mono`} />
          </FieldGroup>
        </div>
        {valorDesc && (
          <div className="px-3 py-2.5 rounded-lg bg-g-850 border border-g-800 text-xs flex justify-between">
            <span className="text-g-600">Com desconto ({desc}%):</span>
            <span className="font-mono font-bold text-emerald-700 tabular-nums">{brl(parseFloat(valorDesc))}</span>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar Boleto
          </button>
        </div>
      </div>
    </div>, document.body
  )
}

// ─── Modal: Nova Multa (3 steps) ──────────────────────────────────────────────
function NovaMultaModal({ frota, onClose, onSaved }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [step, setStep] = useState(1)
  const [idVeiculo, setIdVeiculo] = useState('')
  const [dataInfracao, setDataInfracao] = useState(hoje)
  const [ait, setAit] = useState('')
  const [orgao, setOrgao] = useState('DETRAN-SP')
  const [motivo, setMotivo] = useState('')
  const [dataNotif, setDataNotif] = useState('')
  const [dataLimite, setDataLimite] = useState('')
  const [saving, setSaving] = useState(false)
  const veiculoSel = frota.find(f => String(f.id) === String(idVeiculo))

  const handleSubmit = async () => {
    if (!idVeiculo) return toast.error('Selecione o veículo')
    setSaving(true)
    try {
      await criarMulta({ id_veiculo: parseInt(idVeiculo), id_empresa: veiculoSel?.id_empresa || null, data_infracao: dataInfracao, ait: ait || null, orgao_emissor: orgao, motivo_infracao: motivo || null, data_emissao_notificacao: dataNotif || null, data_limite_indicacao: dataLimite || null, valor_multa: 0.01, tipo_multa: 'Infração', desconto_pct: 20.0 })
      toast.success('Notificação registrada — cadastre o boleto para informar o valor')
      onSaved(); onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro')
    } finally { setSaving(false) }
  }

  const STEPS = [{ n: 1, label: 'Veículo & Infração' }, { n: 2, label: 'Notificação' }, { n: 3, label: 'Revisão' }]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-g-800 flex items-center justify-between">
          <h3 className="text-g-200 font-bold text-base">Registrar Multa de Trânsito</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-3 border-b border-g-800 flex items-center gap-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-colors ${step > s.n ? 'bg-emerald-500 border-emerald-500 text-white' : step === s.n ? 'bg-g-200 border-g-200 text-g-900' : 'border-g-800 text-g-600'}`}>
                {step > s.n ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${step === s.n ? 'text-g-300' : 'text-g-600'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`w-6 h-px ml-1 ${step > s.n ? 'bg-emerald-400/50' : 'bg-g-800'}`} />}
            </div>
          ))}
        </div>
        <div className="px-6 py-5">
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Veículo *" span={2}>
                <select value={idVeiculo} onChange={e => setIdVeiculo(e.target.value)} className={inputCls}>
                  <option value="">Selecione…</option>
                  {frota.map(f => <option key={f.id} value={f.id}>{f.placa} — {f.modelo}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Data da Infração *">
                <input type="date" value={dataInfracao} onChange={e => setDataInfracao(e.target.value)} className={inputCls} />
              </FieldGroup>
              <FieldGroup label="Órgão Emissor">
                <select value={orgao} onChange={e => setOrgao(e.target.value)} className={inputCls}>
                  {ORGAOS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="AIT / Auto de Infração" span={2}>
                <input type="text" value={ait} onChange={e => setAit(e.target.value)} placeholder="Ex: AT-2025-12345678" className={inputCls} />
              </FieldGroup>
            </div>
          )}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label="Motivo da Infração" span={2}>
                <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Excesso de velocidade (CTB 218)" className={inputCls} />
              </FieldGroup>
              <FieldGroup label="Data da Notificação">
                <input type="date" value={dataNotif} onChange={e => setDataNotif(e.target.value)} className={inputCls} />
              </FieldGroup>
              <FieldGroup label="Prazo p/ Indicação">
                <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} className={inputCls} />
              </FieldGroup>
              <div className="col-span-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-600">
                Após salvar, use o drawer da multa para indicar o condutor e cadastrar o boleto com o valor definitivo.
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="p-4 bg-g-850 border border-g-800 rounded-xl grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <span className="text-g-600">Veículo</span>
              <span className="font-mono font-semibold text-g-200">{veiculoSel?.placa} — {veiculoSel?.modelo}</span>
              <span className="text-g-600">Data Infração</span>
              <span className="font-mono text-g-400">{dateBR(dataInfracao)}</span>
              <span className="text-g-600">AIT</span>
              <span className="font-mono text-g-400">{ait || '—'}</span>
              <span className="text-g-600">Órgão</span>
              <span className="text-g-400">{orgao}</span>
              {motivo && <><span className="text-g-600">Motivo</span><span className="text-g-400">{motivo}</span></>}
              {dataLimite && <><span className="text-g-600">Prazo Indicação</span><span className="font-mono text-g-400">{dateBR(dataLimite)}</span></>}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-g-800 flex justify-between">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">
            {step === 1 ? 'Cancelar' : '← Voltar'}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !idVeiculo}
              className="px-5 py-2 rounded-lg bg-g-850 border border-g-800 hover:bg-g-800 text-g-300 text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
              Próximo <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving}
              className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Registrar Multa
            </button>
          )}
        </div>
      </div>
    </div>, document.body
  )
}

// ─── Side Drawer — Multa detail ───────────────────────────────────────────────
function MultaDrawer({ multa, onClose, onSaved, onOpenPagar, onOpenIndicar, onOpenBoleto }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const isNic = multa.tipo_multa === 'Não Indicação de Condutor'
  const limitePassou = multa.data_limite_indicacao && multa.data_limite_indicacao < hoje
  const isPago = multa.status_multa === 'Pago'
  const sugerido = calcEncargos(multa.valor_multa, multa.data_vencimento, 'multa').total
  const [nicLoading, setNicLoading] = useState(false)
  const [comunicadoLoading, setComunicadoLoading] = useState(false)

  const handleNic = async () => {
    setNicLoading(true)
    try { await criarNicMulta(multa.id); toast.success('Multa NIC gerada'); onSaved(); onClose() }
    catch (e) { toast.error(e.response?.data?.detail || 'Erro ao gerar NIC') }
    finally { setNicLoading(false) }
  }

  const handleComunicado = async (value) => {
    setComunicadoLoading(true)
    try {
      await patchMulta(multa.id, { comunicado_enviado: value, data_comunicado: value ? hoje : null })
      toast.success(value ? 'Comunicado marcado como enviado' : 'Comunicado desmarcado')
      onSaved()
    } catch (e) { toast.error('Erro ao atualizar') }
    finally { setComunicadoLoading(false) }
  }

  const statusDot = { done: 'bg-emerald-500', active: 'bg-amber-400', error: 'bg-red-500', pending: 'bg-g-700' }
  const p1 = 'done'
  const p2 = multa.condutor_indicado ? 'done' : limitePassou ? 'error' : 'active'
  const p3 = multa.data_emissao_multa ? 'done' : multa.condutor_indicado ? 'active' : 'pending'
  const p4 = isPago ? 'done' : multa.data_emissao_multa ? 'active' : 'pending'

  const phases = [
    {
      n: 1, label: 'Notificação', status: p1,
      body: (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <span className="text-g-600">Infração</span>
            <span className="font-mono text-g-400">{dateBR(multa.data_infracao)}</span>
            {multa.ait && <><span className="text-g-600">AIT</span><span className="font-mono text-g-400 text-[10px]">{multa.ait}</span></>}
            {multa.orgao_emissor && <><span className="text-g-600">Órgão</span><span className="text-g-400">{multa.orgao_emissor}</span></>}
            {multa.data_emissao_notificacao && <><span className="text-g-600">Notificação</span><span className="font-mono text-g-400">{dateBR(multa.data_emissao_notificacao)}</span></>}
          </div>
          {multa.motivo_infracao && <p className="text-g-500 text-xs mt-1 leading-relaxed">{multa.motivo_infracao}</p>}
        </div>
      ),
    },
    {
      n: 2, label: 'Indicação do Condutor', status: p2,
      body: multa.condutor_indicado ? (
        <div className="text-xs flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5"><User className="w-3 h-3 text-g-500" /><span className="text-g-300 font-medium">{multa.nome_condutor}</span>{multa.cpf_condutor && <span className="text-g-600 font-mono">{multa.cpf_condutor}</span>}</div>
          {multa.data_indicacao && <span className="text-g-600 text-[10px]">Indicado em {dateBR(multa.data_indicacao)}</span>}
        </div>
      ) : limitePassou ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-red-500 text-xs flex items-center gap-1"><Ban className="w-3 h-3" />Prazo expirado em {dateBR(multa.data_limite_indicacao)}</span>
          {!isPago && !isNic && <button onClick={handleNic} disabled={nicLoading} className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 flex items-center gap-1 disabled:opacity-50">{nicLoading && <Loader2 className="w-3 h-3 animate-spin" />}Gerar NIC (Dobra)</button>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-g-500 text-xs">{multa.data_limite_indicacao ? `Prazo: ${dateBR(multa.data_limite_indicacao)} (${Math.max(0, daysDiff(multa.data_limite_indicacao) || 0)}d)` : 'Aguardando indicação'}</span>
          {!isPago && <button onClick={() => { onOpenIndicar(multa); onClose() }} className="px-3 py-1 text-xs font-semibold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1"><User className="w-3 h-3" />Indicar</button>}
        </div>
      ),
    },
    {
      n: 3, label: 'Boleto', status: p3,
      body: multa.data_emissao_multa ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-g-600">Valor</span>
          <span className="font-mono font-semibold text-g-200 tabular-nums">{brl(multa.valor_multa)}</span>
          {multa.valor_com_desconto > 0 && <><span className="text-g-600">Com desconto</span><span className="font-mono text-emerald-700 tabular-nums">{brl(multa.valor_com_desconto)}</span></>}
          {multa.data_vencimento && <><span className="text-g-600">Vencimento</span><span className={`font-mono tabular-nums ${daysDiff(multa.data_vencimento) < 0 ? 'text-red-600' : 'text-g-400'}`}>{dateBR(multa.data_vencimento)}</span></>}
          {sugerido > 0 && !isPago && <><span className="text-g-600">Encargo sugerido</span><span className="font-mono text-amber-600 tabular-nums">{brl(sugerido)}</span></>}
        </div>
      ) : !multa.condutor_indicado ? <span className="text-g-700 text-xs">Aguardando indicação</span>
        : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-g-500 text-xs">Boleto não cadastrado</span>
            {!isPago && <button onClick={() => { onOpenBoleto(multa); onClose() }} className="px-3 py-1 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 flex items-center gap-1"><CreditCard className="w-3 h-3" />Cadastrar</button>}
          </div>
        ),
    },
    {
      n: 4, label: 'Pagamento', status: p4,
      body: isPago ? (
        <div className="text-xs flex flex-col gap-0.5">
          <span className="text-emerald-700 font-medium">Pago em {dateBR(multa.data_pagamento)}</span>
          <div className="flex gap-3 text-g-600"><span>Valor: <span className="font-mono text-g-400 tabular-nums">{brl(multa.valor_pago)}</span></span>{multa.encargo > 0 && <span>Encargo: <span className="font-mono text-amber-600 tabular-nums">{brl(multa.encargo)}</span></span>}</div>
        </div>
      ) : multa.data_emissao_multa ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-g-500 text-xs">Aguardando pagamento</span>
          <button onClick={() => { onOpenPagar(multa); onClose() }} className="px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Registrar</button>
        </div>
      ) : <span className="text-g-700 text-xs">Aguardando boleto</span>,
    },
  ]

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-[460px] max-w-full bg-g-900 border-l border-g-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-g-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-g-200 text-base tracking-wide">{multa.placa}</span>
              {isNic && <span className="badge-red text-[9px]">NIC</span>}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-g-850 border border-g-800 text-g-500 font-semibold">{multa.empresa_sigla}</span>
              <StatusBadge status={multa.status_multa} />
            </div>
            <p className="text-g-600 text-xs mt-0.5">{multa.modelo}</p>
            {/* Cliente / Contrato */}
            {multa.cliente_nome && multa.cliente_nome !== '—' && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-g-600 text-[10px]">Cliente responsável:</span>
                <span className="text-g-400 text-[10px] font-semibold">{multa.cliente_nome}</span>
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className={`font-mono font-bold text-base tabular-nums ${isNic ? 'text-red-600' : 'text-g-200'}`}>{brl(multa.valor_multa)}</p>
            {multa.valor_com_desconto > 0 && multa.status_multa !== 'Pago' && (
              <p className="text-emerald-700 font-mono text-[11px] tabular-nums">c/ desc: {brl(multa.valor_com_desconto)}</p>
            )}
          </div>
        </div>

        {/* Reembolso + Comunicado banner */}
        <div className="px-5 py-3 border-b border-g-800 flex items-center justify-between gap-3 flex-wrap">
          {/* Reembolso */}
          <div>
            {multa.reembolso_qtd > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                Reembolsado — {brl(multa.reembolso_valor)}
                {multa.reembolso_status === 'Pendente' && <span className="badge-amber ml-1 text-[9px]">Pend.</span>}
              </span>
            ) : (
              <span className="text-g-700 text-xs">Sem reembolso registrado</span>
            )}
          </div>
          {/* Comunicado */}
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <div onClick={() => !comunicadoLoading && handleComunicado(!multa.comunicado_enviado)}
              className={`w-8 h-4 rounded-full relative shrink-0 transition-colors ${multa.comunicado_enviado ? 'bg-indigo-500' : 'bg-g-800'} ${comunicadoLoading ? 'opacity-50' : ''}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${multa.comunicado_enviado ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className={`text-xs font-medium flex items-center gap-1 ${multa.comunicado_enviado ? 'text-indigo-600' : 'text-g-600'}`}>
              <Send className="w-3 h-3" />
              {multa.comunicado_enviado ? `Comunicado enviado${multa.data_comunicado ? ` em ${dateBR(multa.data_comunicado)}` : ''}` : 'Comunicado ao cliente'}
            </span>
          </label>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-0">
          {phases.map((ph, i) => (
            <div key={ph.n} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0 w-5">
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${statusDot[ph.status]}`} />
                {i < phases.length - 1 && <div className="w-px flex-1 bg-g-800 mt-1 mb-1 min-h-[12px]" />}
              </div>
              <div className="pb-4 min-w-0 flex-1">
                <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${ph.status === 'done' ? 'text-emerald-700' : ph.status === 'active' ? 'text-amber-600' : ph.status === 'error' ? 'text-red-500' : 'text-g-600'}`}>
                  {ph.n}. {ph.label}
                </p>
                {ph.body}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-g-800">
          <button onClick={onClose} className="w-full py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">
            Fechar
          </button>
        </div>
      </aside>
    </>, document.body
  )
}

// ─── Modal: Selecionar tipo de pagamento ──────────────────────────────────────
function SelecionarPagamentoModal({ debito, onClose, onSelect }) {
  const temIpva  = debito.status_ipva  !== 'Pago' && debito.valor_ipva  > 0
  const temLicen = debito.status_licenciamento !== 'Pago' && debito.valor_licenciamento > 0

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-g-200 font-bold text-base">Registrar Pagamento</h3>
            <p className="text-g-600 text-xs mt-0.5 font-mono">{debito.placa} · Ex. {debito.exercicio}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:bg-g-850"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-g-500 text-sm">Selecione o débito que deseja quitar:</p>
        <div className="flex flex-col gap-2">
          {temIpva && (
            <button onClick={() => onSelect('ipva')}
              className="flex items-center justify-between px-4 py-3 rounded-xl border border-g-800 hover:border-g-600 hover:bg-g-850 transition-all group">
              <div className="text-left">
                <p className="text-g-300 font-semibold text-sm group-hover:text-g-200">IPVA {debito.exercicio}</p>
                <p className="text-g-600 text-xs font-mono mt-0.5">
                  {brl(debito.valor_ipva + (debito.encargo_ipva || 0))}
                  {debito.encargo_ipva > 0 && <span className="text-slate-400"> · orig. {brl(debito.valor_ipva)}</span>}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-g-600 group-hover:text-g-400" />
            </button>
          )}
          {temLicen && (
            <button onClick={() => onSelect('licenciamento')}
              className="flex items-center justify-between px-4 py-3 rounded-xl border border-g-800 hover:border-g-600 hover:bg-g-850 transition-all group">
              <div className="text-left">
                <p className="text-g-300 font-semibold text-sm group-hover:text-g-200">Licenciamento {debito.exercicio}</p>
                <p className="text-g-600 text-xs font-mono mt-0.5">
                  {brl(debito.valor_licenciamento + (debito.encargo_licenciamento || 0))}
                  {debito.encargo_licenciamento > 0 && <span className="text-slate-400"> · orig. {brl(debito.valor_licenciamento)}</span>}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-g-600 group-hover:text-g-400" />
            </button>
          )}
          {!temIpva && !temLicen && (
            <p className="text-center text-g-600 text-sm py-4">Todos os débitos já foram pagos.</p>
          )}
        </div>
        <button onClick={onClose} className="w-full py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
      </div>
    </div>, document.body
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, accent, warn }) {
  return (
    <div className={`card p-4 flex items-center gap-3.5 ${warn ? 'border-l-[3px] border-l-red-400' : ''}`}>
      <div className="p-2 rounded-xl bg-g-850 border border-g-800 shrink-0">
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-g-600 text-[10px] font-semibold uppercase tracking-wider truncate">{label}</p>
        <p className="font-bold text-lg font-mono tabular-nums text-g-200 leading-tight truncate">{value}</p>
        {sub && <p className="text-g-600 text-[10px] tabular-nums mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Tabela: seção header ─────────────────────────────────────────────────────
function SectionRow({ icon: Icon, label, count, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-1.5 bg-g-850 border-b border-t border-g-800">
        <div className="flex items-center gap-2">
          <Icon className="w-3 h-3 text-g-600" />
          <span className="text-g-600 text-[10px] font-bold uppercase tracking-widest">{label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-g-800 text-g-600 font-mono">{count}</span>
        </div>
      </td>
    </tr>
  )
}

// ─── Table Row: Débito Documental ─────────────────────────────────────────────
function DebitRow({ d, onPagar, onEncargoIpva, onEncargoLicen }) {
  const ipvaDays  = daysDiff(d.vencimento_ipva)
  const licenDays = daysDiff(d.vencimento_licenciamento)
  const isOverdue = (d.status_ipva !== 'Pago' && ipvaDays !== null && ipvaDays < 0)
    || (d.status_licenciamento !== 'Pago' && licenDays !== null && licenDays < 0)
  const isApproach = !isOverdue && [ipvaDays, licenDays].some(v => v !== null && v >= 0 && v <= 30)
  const restricoesList = d.restricoes ? d.restricoes.split(',').map(s => s.trim()).filter(Boolean) : []

  const ipvaDev  = d.status_ipva          !== 'Pago' ? (d.valor_ipva          + (d.encargo_ipva          || 0)) : 0
  const licenDev = d.status_licenciamento !== 'Pago' ? (d.valor_licenciamento + (d.encargo_licenciamento || 0)) : 0
  const totalDevido = ipvaDev + licenDev + (d.valor_multas || 0) + (d.encargo_multas || 0)
  const tudoPago = d.status_ipva === 'Pago' && d.status_licenciamento === 'Pago'

  return (
    <tr className="table-row">
      <RowAccent isOverdue={isOverdue} isApproach={isApproach} />
      <td className="td">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono font-bold text-g-200 tracking-wide whitespace-nowrap">{d.placa}</span>
          {restricoesList.length > 0 && (
            <span title={restricoesList.join(', ')} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-red-50 border border-red-200 text-red-600 font-semibold">
              <Shield className="w-2 h-2" /> Restrição
            </span>
          )}
        </div>
        {d.exercicio && <p className="text-[9px] text-slate-400 font-mono mt-0.5">Ex. {d.exercicio}</p>}
      </td>
      <td className="td whitespace-nowrap">
        <span className="font-mono text-g-400 text-xs">{d.renavam !== '—' ? d.renavam : <span className="text-g-700 text-[10px]">—</span>}</span>
      </td>
      <td className="td whitespace-nowrap">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">{d.empresa_sigla}</span>
      </td>
      <td className="td">
        <div className="flex items-center gap-2">
          <div className="w-14 h-1 rounded-full bg-g-800 overflow-hidden shrink-0">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${d.atividade_score}%` }} />
          </div>
          <span className="text-g-600 text-[10px] font-mono tabular-nums whitespace-nowrap">{d.atividade_score}%</span>
        </div>
      </td>
      <DebtCell valor={d.valor_ipva} status={d.status_ipva} vencimento={d.vencimento_ipva} encargo={d.encargo_ipva} onEditEncargo={d.status_ipva !== 'Pago' ? onEncargoIpva : undefined} />
      <DebtCell valor={d.valor_licenciamento} status={d.status_licenciamento} vencimento={d.vencimento_licenciamento} encargo={d.encargo_licenciamento} onEditEncargo={d.status_licenciamento !== 'Pago' ? onEncargoLicen : undefined} />
      <td className="td whitespace-nowrap">
        {d.valor_multas > 0 ? (
          <div>
            <span className="font-mono tabular-nums text-red-600 font-semibold">
              {brl(d.valor_multas + (d.encargo_multas || 0))}
            </span>
            {(d.encargo_multas || 0) > 0 && (
              <div className="text-[9px] text-slate-400 font-mono tabular-nums mt-0.5 leading-none">
                {brl(d.valor_multas)} + {brl(d.encargo_multas)} enc.
              </div>
            )}
          </div>
        ) : <span className="text-g-700">—</span>}
      </td>
      <td className="td whitespace-nowrap">
        {totalDevido > 0
          ? <span className="font-mono font-bold tabular-nums text-slate-800 text-sm">{brl(totalDevido)}</span>
          : <span className="text-emerald-700 text-[11px] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Em dia</span>}
      </td>
      <td className="td">
        {!tudoPago ? (
          <button onClick={onPagar}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 transition-colors whitespace-nowrap">
            Pagar
          </button>
        ) : null}
      </td>
    </tr>
  )
}

// ─── DebitsPage ───────────────────────────────────────────────────────────────
export default function DebitsPage({ year }) {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [tab,      setTab]      = useState('documentais')
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  // ── Estados documentais ──
  const [debitos,     setDebitos]    = useState([])
  const [summaryDeb,  setSummaryDeb] = useState(null)
  // Filtros documentais
  const [fDocStatus,  setFDocStatus] = useState('')   // '' | 'vencido' | 'proximo' | 'pendente' | 'pago'
  const [fDocTipo,    setFDocTipo]   = useState('')   // '' | 'caminhao' | 'carro'
  const [fDocRestr,   setFDocRestr]  = useState(false)

  // ── Estados multas ──
  const [multas,      setMultas]     = useState([])
  const [summaryMult, setSummaryMult]= useState(null)
  // Filtros multas
  const [fMStatus,   setFMStatus]   = useState('')   // '' | 'Pendente' | 'Vencido' | 'Pago' | 'Recorrido'
  const [fMTipo,     setFMTipo]     = useState('')   // '' | 'Infração' | 'NIC'
  const [fMReemb,    setFMReemb]    = useState('')   // '' | 'sim' | 'nao'
  const [fMComun,    setFMComun]    = useState('')   // '' | 'enviado' | 'pendente'

  const [frota, setFrota] = useState([])

  // Modais
  const [modalSelecionarPgto, setModalSelecionarPgto] = useState(null)
  const [modalPagarDeb,    setModalPagarDeb]    = useState(null)
  const [modalEncargoDoc,  setModalEncargoDoc]  = useState(null) // {debito, tipo}
  const [modalPagarMult,   setModalPagarMult]   = useState(null)
  const [modalIndicar,     setModalIndicar]     = useState(null)
  const [modalBoleto,      setModalBoleto]      = useState(null)
  const [modalNova,        setModalNova]         = useState(false)
  const [drawerMulta,      setDrawerMulta]      = useState(null)

  const params = useMemo(() => ({
    exercicio: year,
    ...(empresa ? { empresa } : {}),
  }), [year, empresa])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [deb, sdeb, mult, smult] = await Promise.all([
        getDebitos(params), getDebitosSummary(params),
        getMultas(params),  getMultasSummary(params),
      ])
      setDebitos(deb || [])
      setSummaryDeb(sdeb || null)
      setMultas(mult || [])
      setSummaryMult(smult || null)
    } finally { setLoading(false) }
  }, [params])

  useEffect(() => { load() }, [load])
  useEffect(() => { dbListFrota().then(d => setFrota(d || [])) }, [])

  // ─── Filtros documentais ───────────────────────────────────────────────────
  const sortedDebitos = useMemo(() => {
    let r = [...debitos].sort((a, b) => urgencyScore(b) - urgencyScore(a))
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(d => [d.placa, d.renavam, d.modelo, d.empresa_sigla].some(f => (f || '').toLowerCase().includes(q)))
    }
    if (fDocTipo)  r = r.filter(d => d.tipo_veiculo === fDocTipo)
    if (fDocRestr) r = r.filter(d => d.restricoes && d.restricoes.trim())
    if (fDocStatus === 'vencido')
      r = r.filter(d => d.status_ipva === 'Vencido' || d.status_licenciamento === 'Vencido'
        || (d.status_ipva !== 'Pago' && daysDiff(d.vencimento_ipva) !== null && daysDiff(d.vencimento_ipva) < 0)
        || (d.status_licenciamento !== 'Pago' && daysDiff(d.vencimento_licenciamento) !== null && daysDiff(d.vencimento_licenciamento) < 0))
    else if (fDocStatus === 'proximo')
      r = r.filter(d => [daysDiff(d.vencimento_ipva), daysDiff(d.vencimento_licenciamento)].some(v => v !== null && v >= 0 && v <= 30))
    else if (fDocStatus === 'pendente')
      r = r.filter(d => d.status_ipva !== 'Pago' || d.status_licenciamento !== 'Pago')
    else if (fDocStatus === 'pago')
      r = r.filter(d => {
        const ipvaDev  = d.status_ipva          !== 'Pago' ? (d.valor_ipva          + (d.encargo_ipva          || 0)) : 0
        const licenDev = d.status_licenciamento !== 'Pago' ? (d.valor_licenciamento + (d.encargo_licenciamento || 0)) : 0
        return ipvaDev + licenDev + (d.valor_multas || 0) + (d.encargo_multas || 0) === 0
      })
    return r
  }, [debitos, search, fDocStatus, fDocTipo, fDocRestr])

  const caminhoes = useMemo(() => sortedDebitos.filter(d => d.tipo_veiculo === 'caminhao'), [sortedDebitos])
  const carros    = useMemo(() => sortedDebitos.filter(d => d.tipo_veiculo !== 'caminhao'), [sortedDebitos])

  // ─── Filtros multas ────────────────────────────────────────────────────────
  const filteredMultas = useMemo(() => {
    let r = multas
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(m => [m.placa, m.modelo, m.ait, m.orgao_emissor, m.motivo_infracao, m.empresa_sigla, m.cliente_nome].some(f => (f || '').toLowerCase().includes(q)))
    }
    if (fMStatus) r = r.filter(m => m.status_multa === fMStatus)
    if (fMTipo === 'NIC')      r = r.filter(m => m.tipo_multa === 'Não Indicação de Condutor')
    else if (fMTipo)           r = r.filter(m => m.tipo_multa === fMTipo)
    if (fMReemb === 'sim')     r = r.filter(m => m.reembolso_qtd > 0)
    else if (fMReemb === 'nao')r = r.filter(m => m.reembolso_qtd === 0)
    if (fMComun === 'enviado') r = r.filter(m => m.comunicado_enviado)
    else if (fMComun === 'pendente') r = r.filter(m => !m.comunicado_enviado)
    return r
  }, [multas, search, fMStatus, fMTipo, fMReemb, fMComun])

  // Counts for filter chips
  const hoje = new Date().toISOString().slice(0, 10)
  const cntDocVencido = useMemo(() => debitos.filter(d =>
    (d.status_ipva !== 'Pago' && d.vencimento_ipva && daysDiff(d.vencimento_ipva) < 0)
    || (d.status_licenciamento !== 'Pago' && d.vencimento_licenciamento && daysDiff(d.vencimento_licenciamento) < 0)
  ).length, [debitos])
  const cntDocProximo = useMemo(() => debitos.filter(d =>
    [daysDiff(d.vencimento_ipva), daysDiff(d.vencimento_licenciamento)].some(v => v !== null && v >= 0 && v <= 30)
  ).length, [debitos])
  const cntMVencido       = useMemo(() => multas.filter(m => m.status_multa === 'Vencido').length, [multas])
  const cntMSemComunicado = useMemo(() => multas.filter(m => !m.comunicado_enviado && m.status_multa !== 'Pago').length, [multas])

  // Next action for multa row
  const multaNextAction = (m) => {
    if (['Pago', 'Cancelado'].includes(m.status_multa)) return null
    const isNicType    = m.tipo_multa === 'Não Indicação de Condutor'
    const limitePassou = m.data_limite_indicacao && m.data_limite_indicacao < hoje
    if (!m.condutor_indicado && !limitePassou && !isNicType)
      return { label: 'Indicar', cls: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100', fn: e => { e.stopPropagation(); setModalIndicar(m) } }
    if (!m.condutor_indicado && limitePassou && !isNicType)
      return { label: 'Gerar NIC', cls: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100', fn: async e => {
        e.stopPropagation()
        try { await criarNicMulta(m.id); toast.success('NIC gerada'); load() } catch(ex) { toast.error(ex.response?.data?.detail || 'Erro') }
      }}
    if (!m.data_emissao_multa)
      return { label: 'Boleto', cls: 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100', fn: e => { e.stopPropagation(); setModalBoleto(m) } }
    return { label: 'Pagar', cls: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100', fn: e => { e.stopPropagation(); setModalPagarMult(m) } }
  }

  if (loading) return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={FileWarning}  label="IPVA Pendente"
          value={brl(summaryDeb?.pendente_ipva ?? 0)}
          sub={`${summaryDeb?.qtd_ipva_pendente ?? 0} veículos`}
          accent="#d97706" warn={(summaryDeb?.pendente_ipva ?? 0) > 0} />
        <KpiCard icon={Car}          label="Licenciamento Pendente"
          value={brl(summaryDeb?.pendente_licenciamento ?? 0)}
          sub={`${summaryDeb?.qtd_lic_pendente ?? 0} veículos`}
          accent="#ea580c" warn={(summaryDeb?.pendente_licenciamento ?? 0) > 0} />
        <KpiCard icon={AlertCircle}  label="Multas Pendentes"
          value={brl(summaryMult?.pendente ?? 0)}
          sub={`${summaryMult?.qtd_pendente ?? 0} multas · ${summaryMult?.qtd_nic ?? 0} NIC`}
          accent="#dc2626" warn={(summaryMult?.pendente ?? 0) > 0} />
        <KpiCard icon={CheckCircle2} label="Total Pago"
          value={brl((summaryDeb?.pago_ipva ?? 0) + (summaryDeb?.pago_licenciamento ?? 0))}
          sub={`IPVA ${brl(summaryDeb?.pago_ipva ?? 0)} · Licen. ${brl(summaryDeb?.pago_licenciamento ?? 0)}`}
          accent="#16a34a" />
      </div>

      {/* Toolbar: Tabs + Search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-g-850 border border-g-800 rounded-xl p-1">
          {['documentais', 'multas'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-g-900 text-g-200 shadow-sm border border-g-800' : 'text-g-600 hover:text-g-400'}`}>
              {t === 'documentais' ? 'IPVA & Licenciamento' : 'Multas de Trânsito'}
              {t === 'multas' && (summaryMult?.qtd_pendente ?? 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold badge-red rounded-full">{summaryMult.qtd_pendente}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'documentais' ? 'Placa, modelo…' : 'Placa, AIT, cliente…'}
              className="pl-8 pr-7 py-1.5 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 w-48" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-g-600" /></button>}
          </div>
          {tab === 'multas' && (
            <button onClick={() => setModalNova(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-g-200 hover:bg-g-300 text-white">
              <Plus className="w-3.5 h-3.5" /> Nova Multa
            </button>
          )}
        </div>
      </div>

      {/* ── Filtros contextuais ── */}
      {tab === 'documentais' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Status:</span>
          <FilterChip label="Todos" active={fDocStatus === ''} onClick={() => setFDocStatus('')} />
          <FilterChip label="Vencidos" active={fDocStatus === 'vencido'} count={cntDocVencido} onClick={() => setFDocStatus(s => s === 'vencido' ? '' : 'vencido')} color="red" />
          <FilterChip label="Próximos (≤30d)" active={fDocStatus === 'proximo'} count={cntDocProximo} onClick={() => setFDocStatus(s => s === 'proximo' ? '' : 'proximo')} color="amber" />
          <FilterChip label="Pendentes" active={fDocStatus === 'pendente'} onClick={() => setFDocStatus(s => s === 'pendente' ? '' : 'pendente')} color="amber" />
          <FilterChip label="Em dia" active={fDocStatus === 'pago'} onClick={() => setFDocStatus(s => s === 'pago' ? '' : 'pago')} color="green" />
          <span className="text-g-700 mx-1">·</span>
          <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Tipo:</span>
          <FilterChip label="Todos" active={fDocTipo === ''} onClick={() => setFDocTipo('')} />
          <FilterChip label="Caminhões" active={fDocTipo === 'caminhao'} onClick={() => setFDocTipo(t => t === 'caminhao' ? '' : 'caminhao')} />
          <FilterChip label="Carros" active={fDocTipo === 'carro'} onClick={() => setFDocTipo(t => t === 'carro' ? '' : 'carro')} />
          <span className="text-g-700 mx-1">·</span>
          <FilterChip label="Com Restrição" active={fDocRestr} onClick={() => setFDocRestr(v => !v)} color="red" />
          <span className="ml-auto text-g-600 text-xs font-mono">{sortedDebitos.length} veículos</span>
        </div>
      )}

      {tab === 'multas' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Status:</span>
          <FilterChip label="Todos"     active={fMStatus === ''} onClick={() => setFMStatus('')} />
          <FilterChip label="Pendente"  active={fMStatus === 'Pendente'} onClick={() => setFMStatus(s => s === 'Pendente' ? '' : 'Pendente')} color="amber" />
          <FilterChip label={`Vencido${cntMVencido > 0 ? ` (${cntMVencido})` : ''}`} active={fMStatus === 'Vencido'} onClick={() => setFMStatus(s => s === 'Vencido' ? '' : 'Vencido')} color="red" />
          <FilterChip label="Pago"      active={fMStatus === 'Pago'} onClick={() => setFMStatus(s => s === 'Pago' ? '' : 'Pago')} color="green" />
          <FilterChip label="Recorrido" active={fMStatus === 'Recorrido'} onClick={() => setFMStatus(s => s === 'Recorrido' ? '' : 'Recorrido')} color="indigo" />
          <span className="text-g-700 mx-1">·</span>
          <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Tipo:</span>
          <FilterChip label="Infração" active={fMTipo === 'Infração'} onClick={() => setFMTipo(t => t === 'Infração' ? '' : 'Infração')} />
          <FilterChip label="NIC" active={fMTipo === 'NIC'} onClick={() => setFMTipo(t => t === 'NIC' ? '' : 'NIC')} color="red" />
          <span className="text-g-700 mx-1">·</span>
          <span className="text-g-600 text-[10px] font-semibold uppercase tracking-wider mr-1">Reembolso:</span>
          <FilterChip label="Reembolsado" active={fMReemb === 'sim'} onClick={() => setFMReemb(v => v === 'sim' ? '' : 'sim')} color="green" />
          <FilterChip label="Sem reembolso" active={fMReemb === 'nao'} onClick={() => setFMReemb(v => v === 'nao' ? '' : 'nao')} />
          <span className="text-g-700 mx-1">·</span>
          <FilterChip label={`Sem comunicado${cntMSemComunicado > 0 ? ` (${cntMSemComunicado})` : ''}`} active={fMComun === 'pendente'} onClick={() => setFMComun(v => v === 'pendente' ? '' : 'pendente')} color="indigo" />
          <FilterChip label="Comunicado enviado" active={fMComun === 'enviado'} onClick={() => setFMComun(v => v === 'enviado' ? '' : 'enviado')} color="green" />
          <span className="ml-auto text-g-600 text-xs font-mono">{filteredMultas.length} registros</span>
        </div>
      )}

      {/* ═══════ TAB: IPVA & LICENCIAMENTO ═══════ */}
      {tab === 'documentais' && (
        <div className="card overflow-hidden">
          {sortedDebitos.length === 0 ? (
            <div className="p-8"><EmptyState icon={Car} title="Nenhum registro" message="Sem débitos para os filtros selecionados." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[860px]">
                <thead className="border-b border-g-800">
                  <tr>
                    <th className="w-[3px] p-0" />
                    <th className="th">Placa</th>
                    <th className="th">RENAVAM</th>
                    <th className="th">Empresa</th>
                    <th className="th">Atividade</th>
                    <th className="th">IPVA</th>
                    <th className="th">Licenciamento</th>
                    <th className="th">Multas</th>
                    <th className="th">Total Devido</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {caminhoes.length > 0 && (
                    <>
                      <SectionRow icon={Truck} label="Caminhões" count={caminhoes.length} colSpan={10} />
                      {caminhoes.map(d => (
                        <DebitRow key={d.id} d={d}
                          onPagar={() => setModalSelecionarPgto(d)}
                          onEncargoIpva={() => setModalEncargoDoc({ debito: d, tipo: 'ipva' })}
                          onEncargoLicen={() => setModalEncargoDoc({ debito: d, tipo: 'licenciamento' })} />
                      ))}
                    </>
                  )}
                  {carros.length > 0 && (
                    <>
                      <SectionRow icon={Car} label="Carros & Caminhonetes" count={carros.length} colSpan={10} />
                      {carros.map(d => (
                        <DebitRow key={d.id} d={d}
                          onPagar={() => setModalSelecionarPgto(d)}
                          onEncargoIpva={() => setModalEncargoDoc({ debito: d, tipo: 'ipva' })}
                          onEncargoLicen={() => setModalEncargoDoc({ debito: d, tipo: 'licenciamento' })} />
                      ))}
                    </>
                  )}
                </tbody>
                <tfoot className="border-t border-g-800 bg-g-850">
                  <tr>
                    <td className="w-[3px] p-0" />
                    <td colSpan={4} className="td text-g-600 font-semibold">{sortedDebitos.length} veículos</td>
                    <td className="td font-mono font-semibold tabular-nums text-g-300">{brl(sortedDebitos.reduce((s, d) => s + d.valor_ipva, 0))}</td>
                    <td className="td font-mono font-semibold tabular-nums text-g-300">{brl(sortedDebitos.reduce((s, d) => s + d.valor_licenciamento, 0))}</td>
                    <td className="td font-mono font-semibold tabular-nums text-red-600">{brl(sortedDebitos.reduce((s, d) => s + d.valor_multas + (d.encargo_multas || 0), 0))}</td>
                    <td className="td font-mono font-bold tabular-nums text-slate-800">
                      {brl(sortedDebitos.reduce((s, d) => {
                        const iv = d.status_ipva          !== 'Pago' ? d.valor_ipva          + (d.encargo_ipva          || 0) : 0
                        const lv = d.status_licenciamento !== 'Pago' ? d.valor_licenciamento + (d.encargo_licenciamento || 0) : 0
                        return s + iv + lv + (d.valor_multas || 0)
                      }, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: MULTAS ═══════ */}
      {tab === 'multas' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total',           val: summaryMult?.total    ?? 0, sub: `${summaryMult?.quantidade   ?? 0} registros`, color: '#475569' },
              { label: 'Pendente',        val: summaryMult?.pendente ?? 0, sub: `${summaryMult?.qtd_pendente ?? 0} multas`,    color: '#dc2626' },
              { label: 'Pago',            val: summaryMult?.pago     ?? 0, sub: `${summaryMult?.qtd_pago     ?? 0} multas`,    color: '#16a34a' },
              { label: 'NIC',             val: summaryMult?.nic      ?? 0, sub: `${summaryMult?.qtd_nic      ?? 0} registros`, color: '#ea580c' },
            ].map(({ label, val, sub, color }) => (
              <div key={label} className="card p-3">
                <p className="text-g-600 text-[10px] font-semibold uppercase tracking-wider">{label}</p>
                <p className="font-bold font-mono tabular-nums text-base mt-1" style={{ color }}>{brl(val)}</p>
                <p className="text-g-600 text-[10px] mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            {filteredMultas.length === 0 ? (
              <div className="p-8"><EmptyState icon={AlertCircle} title="Nenhuma multa" message="Sem registros para os filtros selecionados." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1000px]">
                  <thead className="border-b border-g-800">
                    <tr>
                      <th className="th">Placa</th>
                      <th className="th">Empresa</th>
                      <th className="th">Cliente / Contrato</th>
                      <th className="th">Infração</th>
                      <th className="th">AIT / Órgão</th>
                      <th className="th text-right">Valor</th>
                      <th className="th">Status</th>
                      <th className="th">Fases</th>
                      <th className="th text-center">Comunicado</th>
                      <th className="th text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMultas.map(m => {
                      const isNic = m.tipo_multa === 'Não Indicação de Condutor'
                      const nextAction = multaNextAction(m)
                      const sugerido  = calcEncargos(m.valor_multa, m.data_vencimento, 'multa').total

                      return (
                        <tr key={m.id} onClick={() => setDrawerMulta(m)}
                          className={`table-row cursor-pointer ${isNic ? 'border-l-[3px] border-l-red-400' : ''}`}>
                          <td className="td">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-g-200 tracking-wide">{m.placa}</span>
                              {isNic && <span className="badge-red text-[9px]">NIC</span>}
                            </div>
                            <p className="text-g-600 text-[10px] mt-0.5 truncate max-w-[90px]">{m.modelo}</p>
                          </td>
                          <td className="td whitespace-nowrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">{m.empresa_sigla}</span>
                          </td>
                          {/* Cliente */}
                          <td className="td max-w-[140px]">
                            {m.cliente_nome && m.cliente_nome !== '—' ? (
                              <span className="truncate block text-g-400 text-[11px]" title={m.cliente_nome}>{m.cliente_nome}</span>
                            ) : <span className="text-g-700">—</span>}
                            {m.reembolso_qtd > 0 && (
                              <span className="inline-flex items-center gap-0.5 mt-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                                <CheckCircle2 className="w-2 h-2" /> {brl(m.reembolso_valor)}
                              </span>
                            )}
                          </td>
                          <td className="td font-mono tabular-nums whitespace-nowrap">{dateBR(m.data_infracao)}</td>
                          <td className="td">
                            <p className="font-mono text-g-400 text-[10px] whitespace-nowrap">{m.ait || '—'}</p>
                            <p className="text-g-600 text-[10px] mt-0.5">{m.orgao_emissor || '—'}</p>
                          </td>
                          <td className="td text-right whitespace-nowrap">
                            <p className={`font-mono font-semibold tabular-nums ${isNic ? 'text-red-600' : 'text-slate-800'}`}>{brl(m.valor_multa)}</p>
                            {m.valor_com_desconto > 0 && m.status_multa !== 'Pago' && (
                              <p className="text-emerald-700 font-mono text-[9px] tabular-nums leading-none mt-0.5">c/ desc: {brl(m.valor_com_desconto)}</p>
                            )}
                            {sugerido > 0 && m.status_multa !== 'Pago' && (
                              <p className="text-slate-400 font-mono text-[9px] tabular-nums leading-none mt-0.5">+{brl(sugerido)} enc.</p>
                            )}
                          </td>
                          <td className="td"><StatusBadge status={m.status_multa} /></td>
                          <td className="td"><PhaseDots m={m} /></td>
                          {/* Comunicado inline toggle */}
                          <td className="td text-center" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={async () => {
                                const newVal = !m.comunicado_enviado
                                try {
                                  await patchMulta(m.id, { comunicado_enviado: newVal, data_comunicado: newVal ? hoje : null })
                                  toast.success(newVal ? 'Comunicado marcado' : 'Comunicado desmarcado')
                                  load()
                                } catch { toast.error('Erro') }
                              }}
                              title={m.comunicado_enviado ? `Enviado${m.data_comunicado ? ` em ${dateBR(m.data_comunicado)}` : ''}` : 'Marcar como comunicado'}
                              className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${m.comunicado_enviado ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-g-700 hover:border-indigo-400'}`}>
                              {m.comunicado_enviado && <CheckCircle2 className="w-2.5 h-2.5" />}
                            </button>
                          </td>
                          <td className="td text-right" onClick={e => e.stopPropagation()}>
                            {nextAction ? (
                              <button onClick={nextAction.fn} className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${nextAction.cls}`}>
                                {nextAction.label}
                              </button>
                            ) : m.status_multa === 'Pago' ? (
                              <span className="text-emerald-700 text-[11px] flex items-center justify-end gap-1"><CheckCircle2 className="w-3 h-3" />Pago</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t border-g-800 bg-g-850">
                    <tr>
                      <td colSpan={5} className="td text-g-600 font-semibold">{filteredMultas.length} registros</td>
                      <td className="td text-right font-mono font-semibold tabular-nums text-g-300">{brl(filteredMultas.reduce((s, m) => s + m.valor_multa, 0))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modais ── */}
      {modalSelecionarPgto && (
        <SelecionarPagamentoModal
          debito={modalSelecionarPgto}
          onClose={() => setModalSelecionarPgto(null)}
          onSelect={tipo => { setModalSelecionarPgto(null); setModalPagarDeb({ debito: modalSelecionarPgto, tipo }) }} />
      )}
      {modalEncargoDoc && (
        <AtualizarEncargoModal debito={modalEncargoDoc.debito} tipo={modalEncargoDoc.tipo}
          onClose={() => setModalEncargoDoc(null)} onSaved={load} />
      )}
      {modalPagarDeb && (
        <PagarDebitoModal debito={modalPagarDeb.debito} tipo={modalPagarDeb.tipo}
          onClose={() => setModalPagarDeb(null)} onSaved={load} />
      )}
      {modalPagarMult && (
        <PagarMultaModal multa={modalPagarMult}
          onClose={() => setModalPagarMult(null)} onSaved={load} />
      )}
      {modalIndicar && (
        <IndicarCondutorModal multa={modalIndicar}
          onClose={() => setModalIndicar(null)} onSaved={load} />
      )}
      {modalBoleto && (
        <CadastrarBoletoModal multa={modalBoleto}
          onClose={() => setModalBoleto(null)} onSaved={load} />
      )}
      {modalNova && (
        <NovaMultaModal frota={frota}
          onClose={() => setModalNova(false)} onSaved={load} />
      )}
      {drawerMulta && (
        <MultaDrawer multa={drawerMulta}
          onClose={() => setDrawerMulta(null)}
          onSaved={() => { load(); setDrawerMulta(null) }}
          onOpenPagar={setModalPagarMult}
          onOpenIndicar={setModalIndicar}
          onOpenBoleto={setModalBoleto} />
      )}
    </div>
  )
}
