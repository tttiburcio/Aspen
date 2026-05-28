import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText, CheckCircle, AlertCircle, TrendingDown, Search, X, Loader2, ChevronDown, Plus,
  Ban, Pencil, Trash2,
} from 'lucide-react'
import { getFaturamento, getFaturamentoSummary, patchFatura, deletarFatura } from '../utils/api'
import FaturaFormModal from '../components/modals/FaturaFormModal'
import { brl, brlShort, dateBR } from '../utils/format'
import { useCompanies } from '../contexts/CompanyContext'
import { MONTHS_BR } from '../constants/maintenanceStatus'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'
import PagarFaturaModal from '../components/modals/PagarFaturaModal'
import FaturaDetailModal from '../components/modals/FaturaDetailModal'
import FaturaEditModal from '../components/modals/FaturaEditModal'
import toast from 'react-hot-toast'

// ── Status styles ─────────────────────────────────────────────────────
const REC_CLS = {
  Recebido:  'text-emerald-700 bg-emerald-500/10 border-emerald-700/30',
  Pendente:  'text-amber-600  bg-amber-400/10   border-amber-700/30',
  Vencido:   'text-red-400    bg-red-400/10     border-red-700/30',
  Cancelado: 'text-g-600      bg-g-800/50       border-g-700/30',
}
const IMP_CLS = {
  Pago:    'text-emerald-700 bg-emerald-500/10 border-emerald-700/30',
  Pendente:'text-amber-600  bg-amber-400/10   border-amber-700/30',
  Isento:  'text-g-500      bg-g-800/50       border-g-700/30',
}

function KpiCard({ icon: Icon, label, value, sub, accent = '#94a3b8' }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="p-2.5 bg-g-850 border border-g-800 rounded-xl shrink-0">
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-g-600 text-[10px] uppercase tracking-wider truncate">{label}</p>
        <p className="text-g-100 font-bold text-lg font-mono tabular-nums truncate leading-tight">{value}</p>
        {sub && <p className="text-g-600 text-[10px] tabular-nums truncate">{sub}</p>}
      </div>
    </div>
  )
}

function Badge({ status, map }) {
  const cls = map[status] || map['Pendente']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {status}
    </span>
  )
}

export default function FaturamentoPage({ year, onFaturaSaved }) {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [faturas,  setFaturas]  = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [filterText,       setFilterText]       = useState('')
  const [filterRecStatus,  setFilterRecStatus]  = useState('')
  const [filterImpStatus,  setFilterImpStatus]  = useState('')
  const [filterMes,        setFilterMes]        = useState(null)   // 1–12 or null
  const [filterPlaca,      setFilterPlaca]      = useState(null)   // placa string or null
  const [sort,             setSort]             = useState({ col: 'emissao', dir: 'desc' })
  const [modalPagar,   setModalPagar]   = useState(null)
  const [modalNova,    setModalNova]    = useState(false)
  const [modalEditar,  setModalEditar]  = useState(null)
  const [modalDetalhe, setModalDetalhe] = useState(null)
  const [deletando,    setDeletando]    = useState(null)
  const [cancelando,   setCancelando]   = useState(null)
  const [confirm,      setConfirm]      = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const load = useCallback(async (triggerGlobalRefresh = false) => {
    setLoading(true)
    const params = { ...(year ? { year } : {}), ...(empresa ? { empresa } : {}) }
    try {
      const [list, sum] = await Promise.all([
        getFaturamento(params),
        getFaturamentoSummary(params),
      ])
      setFaturas(list || [])
      setSummary(sum || null)
      if (triggerGlobalRefresh) onFaturaSaved?.()
    } finally {
      setLoading(false)
    }
  }, [year, empresa, onFaturaSaved])

  useEffect(() => { load() }, [load])

  // Reset chart filters when period/company changes
  useEffect(() => { setFilterMes(null); setFilterPlaca(null) }, [year, empresa])

  // Map placa → Set<fatura_id> para filtro cruzado
  const veiculoFaturaIds = useMemo(() => {
    if (!summary?.por_veiculo) return {}
    return Object.fromEntries(
      summary.por_veiculo.map(v => [v.placa, new Set(v.fatura_ids || [])])
    )
  }, [summary])

  const filtered = useMemo(() => {
    let r = faturas
    if (filterRecStatus) r = r.filter(x => x.status_recebimento === filterRecStatus)
    if (filterImpStatus) r = r.filter(x => x.status_imposto === filterImpStatus)
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      r = r.filter(x => [x.empresa, x.empresa_sigla, x.contrato_cliente, x.emissao_display]
        .some(f => (f || '').toLowerCase().includes(q)))
    }
    if (filterMes) {
      r = r.filter(x => x.emissao && parseInt(x.emissao.split('-')[1]) === filterMes)
    }
    if (filterPlaca) {
      const ids = veiculoFaturaIds[filterPlaca] || new Set()
      r = r.filter(x => ids.has(x.id))
    }
    return [...r].sort((a, b) => {
      const av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
      if (['valor_locacoes','valor_recebido','valor_imposto','valor_liquido','encargo_imposto'].includes(sort.col))
        return sort.dir === 'asc' ? (av - bv) : (bv - av)
      const cmp = String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [faturas, filterText, filterRecStatus, filterImpStatus, sort, filterMes, filterPlaca, veiculoFaturaIds])

  const totalFiltrado    = useMemo(() => filtered.reduce((s, r) => s + r.valor_locacoes, 0), [filtered])
  const impostoFiltrado  = useMemo(() => filtered.reduce((s, r) => s + r.valor_imposto, 0), [filtered])
  const liquidoFiltrado  = useMemo(() => filtered.reduce((s, r) => s + r.valor_liquido, 0), [filtered])
  const recebidoFiltrado = useMemo(() => filtered.reduce((s, r) => s + r.valor_recebido, 0), [filtered])

  const monthlyMax = useMemo(() =>
    Math.max(0, ...(summary?.por_mes?.map(m => m.locacoes || 0) || [])), [summary])

  const vehicleMax = useMemo(() =>
    summary?.por_veiculo?.[0]?.total || 1, [summary])

  const hasChartFilter = filterMes !== null || filterPlaca !== null

  const thSort = (key, label, align = 'left') => (
    <th
      key={key}
      onClick={() => setSort(s => ({ col: key, dir: s.col === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
      className={`th whitespace-nowrap cursor-pointer hover:text-g-300 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const handleDeletar = (r) => {
    setConfirm({
      message: `Excluir fatura #${r.numero_fatura || r.id}? Esta ação não pode ser desfeita.`,
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true)
        setDeletando(r.id)
        try {
          await deletarFatura(r.id)
          toast.success('Fatura excluída')
          setConfirm(null)
          load()
        } catch (e) {
          toast.error(e.response?.data?.detail || 'Erro ao excluir')
        } finally {
          setDeletando(null)
          setConfirmLoading(false)
        }
      },
    })
  }

  const handleCancelar = (r) => {
    setConfirm({
      message: `Cancelar fatura #${r.numero_fatura || r.id}?`,
      danger: false,
      onConfirm: async () => {
        setConfirmLoading(true)
        setCancelando(r.id)
        try {
          await patchFatura(r.id, { status_recebimento: 'Cancelado' })
          toast.success('Fatura cancelada')
          setConfirm(null)
          load()
        } catch (e) {
          toast.error(e.response?.data?.detail || 'Erro ao cancelar')
        } finally {
          setCancelando(null)
          setConfirmLoading(false)
        }
      },
    })
  }

  if (loading) return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-52 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )

  return (
    <div className="flex flex-col gap-6">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={FileText}
          label="Total Faturado"
          value={brl(summary?.total_locacoes ?? 0)}
          sub={`${summary?.quantidade ?? 0} faturas`}
          accent="#22c55e"
        />
        <KpiCard
          icon={CheckCircle}
          label="Total Recebido"
          value={brl(summary?.total_recebido ?? 0)}
          sub={summary?.total_locacoes > 0
            ? `${((summary.total_recebido / summary.total_locacoes) * 100).toFixed(1)}% do faturado`
            : undefined}
          accent="#10b981"
        />
        <KpiCard
          icon={AlertCircle}
          label="Imposto Pendente"
          value={brl(summary?.total_imposto_pendente ?? 0)}
          sub={`Total: ${brl(summary?.total_imposto ?? 0)}`}
          accent="#f59e0b"
        />
        <KpiCard
          icon={TrendingDown}
          label="Valor Líquido"
          value={brl(summary?.total_liquido ?? 0)}
          sub="Faturado − Imposto"
          accent="#6366f1"
        />
      </div>

      {/* ── Gráfico mensal + Por veículo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Gráfico Mensal (clicável) ── */}
        <div className="card p-4 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-widest">
              Faturamento por mês {year ? `· ${year}` : ''}
            </p>
            {filterMes !== null && (
              <button
                onClick={() => setFilterMes(null)}
                className="flex items-center gap-1 text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                <X className="w-3 h-3" /> {MONTHS_BR[filterMes - 1]}
              </button>
            )}
          </div>
          <div className="grid grid-cols-12 gap-1.5 flex-1 min-h-0" style={{ minHeight: 140 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const mes    = i + 1
              const item   = summary?.por_mes?.find(m => m.mes === mes)
              const val    = item?.locacoes || 0
              const imp    = item?.imposto  || 0
              const pct    = monthlyMax > 0 ? (val / monthlyMax) * 100 : 0
              const impPct = val > 0 ? (imp / val) * 100 : 0
              const isActive  = filterMes === mes
              const isDimmed  = filterMes !== null && !isActive
              return (
                <div
                  key={mes}
                  onClick={() => setFilterMes(isActive ? null : mes)}
                  className={`flex flex-col items-center h-full cursor-pointer group transition-opacity ${isDimmed ? 'opacity-40' : 'opacity-100'}`}
                >
                  <div className="h-5 flex items-end justify-center pb-0.5 shrink-0">
                    <span className={`text-[11px] font-semibold font-mono tabular-nums whitespace-nowrap ${isActive ? 'text-emerald-400' : 'text-g-500'}`}>
                      {val > 0 ? brlShort(val) : ''}
                    </span>
                  </div>
                  <div className="flex-1 w-full flex items-end relative">
                    <div
                      className={`w-full rounded-t transition-all relative overflow-hidden ${
                        isActive
                          ? 'bg-emerald-500/60 ring-1 ring-emerald-500/40'
                          : 'bg-emerald-500/30 group-hover:bg-emerald-500/50'
                      }`}
                      style={{ height: val > 0 ? `${Math.max(pct, 3)}%` : '2px' }}
                      title={`${MONTHS_BR[i]}: ${brl(val)} faturado · ${brl(imp)} imposto`}
                    >
                      {impPct > 0 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-amber-500/50"
                          style={{ height: `${impPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <span className={`h-5 flex items-center text-[10px] uppercase font-semibold transition-colors ${
                    isActive ? 'text-emerald-400' : 'text-g-500 group-hover:text-g-400'
                  }`}>
                    {MONTHS_BR[i].slice(0, 3)}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Legenda */}
          <div className="flex items-center gap-4 mt-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
              <span className="text-[10px] text-g-600">Faturamento bruto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-amber-500/50" />
              <span className="text-[10px] text-g-600">Imposto (11,33%)</span>
            </div>
            {filterMes !== null && (
              <span className="ml-auto text-[10px] text-g-600 italic">
                Clique novamente para desfiltrar
              </span>
            )}
          </div>
        </div>

        {/* ── Gráfico Por Veículo (clicável) ── */}
        <div className="card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-widest">Por Veículo</p>
            {filterPlaca && (
              <button
                onClick={() => setFilterPlaca(null)}
                className="flex items-center gap-1 text-[10px] text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                <X className="w-3 h-3" /> {filterPlaca}
              </button>
            )}
          </div>

          {!summary?.por_veiculo?.length ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-g-600 text-xs text-center py-4">
                Nenhum veículo com dados vinculados.<br />
                <span className="text-g-700">Sincronize faturas pelo botão ↺ no detalhe.</span>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto" style={{ maxHeight: 220 }}>
              {summary.por_veiculo.map(v => {
                const barPct  = (v.total / vehicleMax) * 100
                const isActive = filterPlaca === v.placa
                const isDimmed = filterPlaca !== null && !isActive
                return (
                  <button
                    key={v.placa}
                    onClick={() => setFilterPlaca(isActive ? null : v.placa)}
                    className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                      isActive  ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20' :
                      isDimmed  ? 'opacity-40 hover:opacity-70 hover:bg-g-850' :
                                  'hover:bg-g-850'
                    }`}
                  >
                    {/* Placa + Modelo */}
                    <div className="w-[72px] shrink-0">
                      <span className={`text-[11px] font-bold tracking-wide leading-tight block ${isActive ? 'text-emerald-400' : 'text-g-200'}`}>
                        {v.placa}
                      </span>
                      <span className="text-[9px] text-g-600 leading-none truncate block">{v.modelo}</span>
                    </div>
                    {/* Barra */}
                    <div className="flex-1 min-w-0">
                      <div className="h-1.5 bg-g-850 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isActive ? 'bg-emerald-500' : 'bg-emerald-600/50'}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                    {/* Valor */}
                    <span className={`text-[10px] font-mono tabular-nums shrink-0 ${isActive ? 'text-emerald-400 font-semibold' : 'text-g-500'}`}>
                      {brlShort(v.total)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
          <input
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Filtrar por cliente, empresa, mês…"
            className="w-full pl-9 pr-9 py-2 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"
          />
          {filterText && (
            <button onClick={() => setFilterText('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-g-600 hover:text-g-400" />
            </button>
          )}
        </div>

        <select
          value={filterRecStatus}
          onChange={e => setFilterRecStatus(e.target.value)}
          className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors"
        >
          <option value="">Recebimento — todos</option>
          <option value="Recebido">Recebido</option>
          <option value="Pendente">Pendente</option>
          <option value="Vencido">Vencido</option>
          <option value="Cancelado">Cancelado</option>
        </select>

        <select
          value={filterImpStatus}
          onChange={e => setFilterImpStatus(e.target.value)}
          className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors"
        >
          <option value="">Imposto — todos</option>
          <option value="Pendente">Pendente</option>
          <option value="Pago">Pago</option>
          <option value="Isento">Isento</option>
        </select>

        {/* Chips de filtro dos gráficos */}
        {filterMes !== null && (
          <button
            onClick={() => setFilterMes(null)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
          >
            <X className="w-3 h-3" /> {MONTHS_BR[filterMes - 1]}/{year}
          </button>
        )}
        {filterPlaca && (
          <button
            onClick={() => setFilterPlaca(null)}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
          >
            <X className="w-3 h-3" /> {filterPlaca}
          </button>
        )}
        {hasChartFilter && (
          <button
            onClick={() => { setFilterMes(null); setFilterPlaca(null) }}
            className="py-2 px-2.5 rounded-lg text-xs text-g-600 hover:text-g-400 hover:bg-g-850 transition-colors whitespace-nowrap"
          >
            Limpar tudo
          </button>
        )}

        <span className="text-g-600 text-xs font-semibold bg-g-850 border border-g-800 px-2.5 py-2 rounded-lg tabular-nums font-mono whitespace-nowrap">
          {filtered.length} · {brlShort(totalFiltrado)}
        </span>

        <button
          onClick={() => setModalNova(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova Fatura
        </button>
      </div>

      {/* ── Tabela ── */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={FileText}
              title="Nenhuma fatura encontrada"
              message={filterText || filterRecStatus || filterImpStatus || hasChartFilter
                ? 'Ajuste os filtros para ver mais resultados.'
                : 'Não há faturas registradas para este período.'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-g-850 border-b border-g-800">
                <tr>
                  {thSort('numero_fatura',    'Nº Fat.')}
                  {thSort('empresa_sigla',    'Emissora')}
                  {thSort('contrato_cliente', 'Cliente')}
                  {thSort('emissao',          'Mês')}
                  {thSort('vencimento',       'Vencimento')}
                  {thSort('valor_locacoes',   'Faturado',  'left')}
                  {thSort('valor_imposto',    'Imposto',   'left')}
                  {thSort('aliquota_imposto', 'Alíq. %',   'left')}
                  {thSort('valor_liquido',    'Líquido',   'left')}
                  {thSort('valor_recebido',   'Recebido',  'left')}
                  {thSort('status_recebimento', 'Status',  'left')}
                  <th className="th text-left whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isPendente = r.status_recebimento !== 'Recebido' && r.status_recebimento !== 'Cancelado'
                  return (
                    <tr key={r.id}
                      onClick={() => setModalDetalhe(r.id)}
                      className="border-b border-g-800 hover:bg-g-850/60 transition-colors cursor-pointer">
                      <td className="td whitespace-nowrap font-mono text-g-500 tabular-nums text-center">
                        {r.numero_fatura ?? '—'}
                      </td>
                      <td className="td whitespace-nowrap font-semibold text-g-400">{r.empresa_sigla}</td>
                      <td className="td text-g-400">
                        <span className="block truncate max-w-[160px]" title={r.contrato_cliente}>
                          {r.contrato_cliente || r.empresa || '—'}
                        </span>
                        {r.contrato_cidade && (
                          <span className="block text-g-700 text-[10px] truncate max-w-[160px]">{r.contrato_cidade}</span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap font-semibold text-g-300">{r.emissao_display || r.emissao}</td>
                      <td className="td whitespace-nowrap text-g-500 tabular-nums">
                        {r.vencimento ? dateBR(r.vencimento) : '—'}
                      </td>
                      <td className="td whitespace-nowrap text-left font-mono font-semibold text-g-200 tabular-nums">
                        {brl(r.valor_locacoes)}
                      </td>
                      <td className="td whitespace-nowrap text-left font-mono tabular-nums text-gray-600">
                        {brl(r.valor_imposto)}
                        {r.encargo_imposto > 0 && (
                          <span className="block text-[10px] text-amber-600 tabular-nums">+{brl(r.encargo_imposto)} enc.</span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-left text-g-600 tabular-nums">
                        {r.aliquota_imposto?.toFixed(2)}%
                      </td>
                      <td className="td whitespace-nowrap text-left font-mono font-semibold text-g-200 tabular-nums">
                        {brl(r.valor_liquido)}
                      </td>
                      <td className="td whitespace-nowrap text-left font-mono tabular-nums font-semibold text-emerald-700">
                        {r.valor_recebido > 0 ? brl(r.valor_recebido) : '—'}
                      </td>
                      <td className="td whitespace-nowrap">
                        <Badge status={r.status_recebimento || 'Pendente'} map={REC_CLS} />
                      </td>
                      <td className="td text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-start gap-0.5">
                          <button onClick={() => setModalEditar(r)} title="Editar"
                            className="p-1 rounded text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeletar(r)} disabled={deletando === r.id} title="Excluir"
                            className="p-1 rounded text-red-900 hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                            {deletando === r.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleCancelar(r)} title="Cancelar"
                            className={`p-1 rounded transition-colors ${isPendente ? 'text-g-600 hover:text-amber-600 hover:bg-amber-400/10' : 'invisible pointer-events-none'}`}>
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                          {isPendente && (
                            <button
                              onClick={() => setModalPagar({ fatura: r, mode: 'recebimento' })}
                              className="px-2 py-0.5 ml-1 text-[11px] font-semibold text-emerald-700 border border-emerald-700/30 bg-emerald-500/5 rounded hover:bg-emerald-500/15 transition-colors whitespace-nowrap"
                            >
                              Pago
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-g-850 border-t-2 border-g-700">
                <tr>
                  <td colSpan={5} className="td text-g-600 uppercase text-[10px] font-semibold tracking-wider">
                    Total filtrado ({filtered.length})
                  </td>
                  <td className="td text-left font-mono font-bold text-g-200 tabular-nums">{brl(totalFiltrado)}</td>
                  <td className="td text-left font-mono font-bold text-g-200 tabular-nums">{brl(impostoFiltrado)}</td>
                  <td className="td" />
                  <td className="td text-left font-mono font-bold text-g-200 tabular-nums">{brl(liquidoFiltrado)}</td>
                  <td className="td text-left font-mono font-bold text-emerald-700 tabular-nums">{brl(recebidoFiltrado)}</td>
                  <td colSpan={2} className="td" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Modais ── */}
      {modalDetalhe && (
        <FaturaDetailModal
          faturaId={modalDetalhe}
          onClose={() => setModalDetalhe(null)}
          onSynced={() => { onFaturaSaved?.(); load() }}
        />
      )}

      {modalNova && (
        <FaturaFormModal
          onClose={() => setModalNova(false)}
          onSaved={() => load(true)}
        />
      )}

      {modalEditar && (
        <FaturaEditModal
          fatura={modalEditar}
          onClose={() => setModalEditar(null)}
          onSaved={() => load(true)}
        />
      )}

      {modalPagar && (
        <PagarFaturaModal
          fatura={modalPagar.fatura}
          mode={modalPagar.mode}
          onClose={() => setModalPagar(null)}
          onSaved={() => load(true)}
        />
      )}

      {confirm && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <p className="text-g-200 text-sm leading-relaxed mb-6">{confirm.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setConfirm(null); setConfirmLoading(false) }}
                disabled={confirmLoading}
                className="px-4 py-2 text-sm rounded-lg text-g-400 hover:text-g-200 hover:bg-g-800 transition-colors disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                onClick={confirm.onConfirm}
                disabled={confirmLoading}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 ${
                  confirm.danger
                    ? 'bg-red-700 hover:bg-red-600 text-white border border-red-600'
                    : 'bg-g-800 hover:bg-g-700 text-g-200 border border-g-700'
                }`}
              >
                {confirmLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
