import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell, X, Receipt, Landmark, FileText,
  Banknote, Shield, MapPin,
  CheckCircle, ChevronDown, RefreshCw, Loader2,
  TrendingDown, TrendingUp, Info, Calendar,
} from 'lucide-react'
import { getNotifications } from '../utils/api'
import { brl, dateBR } from '../utils/format'

// ─── Prioridade — cor pontual ─────────────────────────────────────────────────
const PRI_DOT = {
  critica: '#ef4444',
  urgente: '#f97316',
  alerta:  '#d97706',
  info:    '#3b82f6',
}
const PRI_TEXT = {
  critica: 'text-red-500',
  urgente: 'text-orange-500',
  alerta:  'text-amber-600',
  info:    'text-blue-500',
}
const PRI_LABEL = {
  critica: 'Crítico',
  urgente: 'Urgente',
  alerta:  'Alerta',
  info:    'Info',
}

// ─── Ícone por módulo ─────────────────────────────────────────────────────────
const MODULE_ICON = {
  receipt:     Receipt,
  landmark:    Landmark,
  'file-text': FileText,
  banknote:    Banknote,
  shield:      Shield,
  'map-pin':   MapPin,
}

// ─── Grupos ───────────────────────────────────────────────────────────────────
const GROUPS = [
  {
    key:    'receber',
    label:  'Valores a Receber',
    Icon:   TrendingUp,
    tipos:  ['fatura_vencida', 'fatura_vencendo', 'reembolso_vencido', 'reembolso_vencendo'],
    sortBy: 'date',
  },
  {
    key:    'pagar',
    label:  'Valores a Pagar',
    Icon:   TrendingDown,
    tipos:  ['imposto_pendente', 'parcela_vencida', 'parcela_vencendo'],
    sortBy: 'tipo',
  },
  {
    key:    'vigencias',
    label:  'Contratos e Vigências',
    Icon:   Calendar,
    tipos:  ['seguro_vencendo', 'rastreamento_vencendo', 'contrato_vencido', 'contrato_vencendo'],
    sortBy: 'tipo',
  },
  {
    key:    'geral',
    label:  'Informações Gerais',
    Icon:   Info,
    tipos:  null,
    sortBy: 'date',
  },
]

// Ordem de exibição dos tipos dentro de cada grupo com sortBy: 'tipo'
const TIPO_ORDER = {
  imposto_pendente:      0,
  parcela_vencida:       1,
  parcela_vencendo:      2,
  seguro_vencendo:       10,
  rastreamento_vencendo: 11,
  contrato_vencido:      12,
  contrato_vencendo:     13,
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => {
    if (!a.data_ref && !b.data_ref) return 0
    if (!a.data_ref) return 1
    if (!b.data_ref) return -1
    return b.data_ref.localeCompare(a.data_ref)
  })
}

function sortByTipoThenDate(items) {
  return [...items].sort((a, b) => {
    const ta = TIPO_ORDER[a.tipo] ?? 99
    const tb = TIPO_ORDER[b.tipo] ?? 99
    if (ta !== tb) return ta - tb
    if (!a.data_ref && !b.data_ref) return 0
    if (!a.data_ref) return 1
    if (!b.data_ref) return -1
    return b.data_ref.localeCompare(a.data_ref)
  })
}

function groupItems(allItems) {
  const assigned = new Set()
  const result   = []

  for (const g of GROUPS) {
    let items = g.tipos
      ? allItems.filter(i => g.tipos.includes(i.tipo))
      : allItems.filter(i => !assigned.has(i.id))

    items.forEach(i => assigned.add(i.id))

    const sorted = g.sortBy === 'tipo'
      ? sortByTipoThenDate(items)
      : sortByDateDesc(items)

    result.push({ ...g, items: sorted })
  }

  return result
}

// ─── Item individual ──────────────────────────────────────────────────────────
function NotifItem({ item }) {
  const dotColor = PRI_DOT[item.prioridade]  || PRI_DOT.info
  const textCls  = PRI_TEXT[item.prioridade] || PRI_TEXT.info
  const Icon     = MODULE_ICON[item.icone]   || Bell

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors">
      {/* Dot de prioridade */}
      <span
        className="w-2 h-2 rounded-full shrink-0 mt-1.5"
        style={{ backgroundColor: dotColor }}
      />

      {/* Ícone do módulo */}
      <div className="shrink-0 mt-0.5 text-gray-400">
        <Icon className="w-3.5 h-3.5" />
      </div>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-gray-800 text-[12.5px] font-semibold leading-snug">{item.titulo}</p>
          {item.data_ref && (
            <span className="shrink-0 text-[10px] text-gray-400 font-mono tabular-nums mt-0.5 whitespace-nowrap">
              {dateBR(item.data_ref)}
            </span>
          )}
        </div>
        <p className="text-gray-500 text-[11px] mt-0.5 leading-snug">{item.descricao}</p>
        {item.valor > 0 && (
          <p className={`text-[11px] font-mono font-bold mt-1 ${textCls}`}>{brl(item.valor)}</p>
        )}
      </div>
    </div>
  )
}

const TIPO_LABEL = {
  fatura_vencida:        'Faturas',
  fatura_vencendo:       'Faturas',
  reembolso_vencido:     'Reembolsos',
  reembolso_vencendo:    'Reembolsos',
  imposto_pendente:      'Impostos',
  parcela_vencida:       'Parcelas NF',
  parcela_vencendo:      'Parcelas NF',
  seguro_vencendo:       'Seguros',
  rastreamento_vencendo: 'Rastreamento',
  contrato_vencido:      'Contratos',
  contrato_vencendo:     'Contratos',
}

// ─── Seção de grupo ───────────────────────────────────────────────────────────
function GroupSection({ group, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!group.items.length) return null
  const { label, Icon, items, sortBy } = group

  // Cor dominante do grupo (prioridade mais alta presente)
  const topPri = ['critica', 'urgente', 'alerta', 'info'].find(p => items.some(i => i.prioridade === p))
  const dotColor = PRI_DOT[topPri] || '#9ca3af'

  // Insere separadores de tipo quando sortBy === 'tipo'
  const rendered = []
  if (sortBy === 'tipo') {
    let lastTipo = null
    items.forEach(item => {
      const tipoLabel = TIPO_LABEL[item.tipo] || item.tipo
      if (tipoLabel !== lastTipo) {
        rendered.push(
          <div key={`sep_${tipoLabel}`} className="px-4 py-1.5 bg-gray-50 border-y border-gray-100 first:border-t-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{tipoLabel}</span>
          </div>
        )
        lastTipo = tipoLabel
      }
      rendered.push(<NotifItem key={item.id} item={item} />)
    })
  } else {
    items.forEach(item => rendered.push(<NotifItem key={item.id} item={item} />))
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-[11px] font-bold text-gray-600 flex-1 text-left">{label}</span>
        <span
          className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: dotColor }}
        >
          {items.length}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <div className="divide-y divide-gray-50 bg-white">
          {rendered}
        </div>
      )}
    </div>
  )
}

// ─── Badge no sino ────────────────────────────────────────────────────────────
export function NotificationBadge({ count, prioridade }) {
  if (!count) return null
  const bg = prioridade === 'critica' ? 'bg-red-500'
    : prioridade === 'urgente'        ? 'bg-orange-500'
    : 'bg-amber-500'
  return (
    <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${bg} ring-1 ring-white`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

// ─── Painel principal ─────────────────────────────────────────────────────────
export default function NotificationsPanel({ empresa, anchorRef, onClose }) {
  const panelRef = useRef(null)
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [geradoEm,  setGeradoEm]  = useState(null)
  const [pos,       setPos]       = useState({ top: 0, right: 0 })

  const load = () => {
    setLoading(true)
    getNotifications(empresa)
      .then(d => { setData(d); setGeradoEm(new Date()) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    if (anchorRef?.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
  }, [empresa])

  useEffect(() => {
    const handler = e => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        anchorRef?.current && !anchorRef.current.contains(e.target)
      ) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const groups   = data ? groupItems(data.items || []) : []
  const total    = data?.total || 0
  const geradoStr = geradoEm
    ? geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  // Prioridade mais alta global para o sumário
  const topPri = ['critica', 'urgente', 'alerta'].find(p => (data?.[p === 'alerta' ? 'alertas' : p + 's'] || 0) > 0)

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 99998 }}
      className="w-[420px] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <Bell className="w-4 h-4 text-gray-400" />
          <span className="text-[13px] font-bold text-gray-700">Notificações</span>
          {total > 0 && (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">
              {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {geradoStr && (
            <span className="text-[10px] text-gray-300 mr-1">
              {geradoStr}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            title="Atualizar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Sumário de prioridades ── */}
      {total > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100">
          {[
            { label: 'Crítico', val: data.criticas, color: '#ef4444' },
            { label: 'Urgente', val: data.urgentes, color: '#f97316' },
            { label: 'Alerta',  val: data.alertas,  color: '#d97706' },
            { label: 'Info',    val: data.infos,    color: '#3b82f6' },
          ].filter(s => s.val > 0).map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] font-bold tabular-nums" style={{ color: s.color }}>{s.val}</span>
              <span className="text-[10px] text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Grupos ── */}
      <div className="overflow-y-auto max-h-[64vh]">
        {loading && !data ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <CheckCircle className="w-7 h-7 text-emerald-400" />
            <p className="text-gray-600 text-sm font-semibold">Tudo em dia</p>
            <p className="text-gray-400 text-[11px] text-center px-10 leading-relaxed">
              Nenhum vencimento ou alerta pendente
            </p>
            {geradoStr && (
              <p className="text-gray-300 text-[10px]">Verificado às {geradoStr}</p>
            )}
          </div>
        ) : (
          groups.map((g, i) => (
            <GroupSection
              key={g.key}
              group={g}
              defaultOpen={i === 0 || g.items.some(it => ['critica', 'urgente'].includes(it.prioridade))}
            />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      {total > 0 && geradoStr && (
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-300 text-center">
            Gerado em {geradoEm.toLocaleDateString('pt-BR')} às {geradoStr}
          </p>
        </div>
      )}
    </div>,
    document.body
  )
}
