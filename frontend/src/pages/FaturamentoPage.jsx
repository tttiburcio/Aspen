import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FileText, CheckCircle, AlertCircle, TrendingDown, Search, X, Loader2, ChevronDown, Plus,
} from 'lucide-react'
import { getFaturamento, getFaturamentoSummary } from '../utils/api'
import FaturaFormModal from '../components/modals/FaturaFormModal'
import { brl, brlShort, dateBR } from '../utils/format'
import { useCompanies } from '../contexts/CompanyContext'
import { MONTHS_BR } from '../constants/maintenanceStatus'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'
import PagarFaturaModal from '../components/modals/PagarFaturaModal'
import toast from 'react-hot-toast'

// ── Status styles ─────────────────────────────────────────────────────
const REC_CLS = {
  Recebido:  'text-emerald-500 bg-emerald-500/10 border-emerald-700/30',
  Pendente:  'text-amber-400  bg-amber-400/10   border-amber-700/30',
  Vencido:   'text-red-400    bg-red-400/10     border-red-700/30',
  Cancelado: 'text-g-600      bg-g-800/50       border-g-700/30',
}
const IMP_CLS = {
  Pago:    'text-emerald-500 bg-emerald-500/10 border-emerald-700/30',
  Pendente:'text-amber-400  bg-amber-400/10   border-amber-700/30',
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

export default function FaturamentoPage({ year }) {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [faturas,  setFaturas]  = useState([])
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [filterText,   setFilterText]   = useState('')
  const [filterRecStatus, setFilterRecStatus] = useState('')
  const [filterImpStatus, setFilterImpStatus] = useState('')
  const [sort, setSort] = useState({ col: 'emissao', dir: 'desc' })
  const [modalPagar, setModalPagar]   = useState(null) // { fatura, mode }
  const [modalNova,  setModalNova]    = useState(false)
  const [expandedEmp, setExpandedEmp] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = { ...(year ? { year } : {}), ...(empresa ? { empresa } : {}) }
    try {
      const [list, sum] = await Promise.all([
        getFaturamento(params),
        getFaturamentoSummary(params),
      ])
      setFaturas(list || [])
      setSummary(sum || null)
    } finally {
      setLoading(false)
    }
  }, [year, empresa])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let r = faturas
    if (filterRecStatus) r = r.filter(x => x.status_recebimento === filterRecStatus)
    if (filterImpStatus) r = r.filter(x => x.status_imposto === filterImpStatus)
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      r = r.filter(x => [x.empresa, x.empresa_sigla, x.contrato_cliente, x.emissao_display]
        .some(f => (f || '').toLowerCase().includes(q)))
    }
    return [...r].sort((a, b) => {
      const av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
      if (['valor_locacoes','valor_recebido','valor_imposto','valor_liquido','encargo_imposto'].includes(sort.col))
        return sort.dir === 'asc' ? (av - bv) : (bv - av)
      const cmp = String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [faturas, filterText, filterRecStatus, filterImpStatus, sort])

  const totalFiltrado     = useMemo(() => filtered.reduce((s, r) => s + r.valor_locacoes, 0), [filtered])
  const impostoFiltrado   = useMemo(() => filtered.reduce((s, r) => s + r.valor_imposto, 0), [filtered])
  const liquidoFiltrado   = useMemo(() => filtered.reduce((s, r) => s + r.valor_liquido, 0), [filtered])
  const recebidoFiltrado  = useMemo(() => filtered.reduce((s, r) => s + r.valor_recebido, 0), [filtered])

  const monthlyMax = useMemo(() =>
    Math.max(0, ...(summary?.por_mes?.map(m => m.locacoes || 0) || [])), [summary])

  const thSort = (key, label, align = 'left') => (
    <th
      key={key}
      onClick={() => setSort(s => ({ col: key, dir: s.col === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
      className={`th whitespace-nowrap cursor-pointer hover:text-g-300 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}{sort.col === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

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

      {/* ── Gráfico mensal + Por empresa ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Mensal */}
        <div className="card p-4 lg:col-span-2 flex flex-col">
          <p className="text-g-600 text-xs font-semibold uppercase tracking-widest mb-4 shrink-0">
            Faturamento por mês {year ? `· ${year}` : ''}
          </p>
          <div className="grid grid-cols-12 gap-1.5 flex-1 min-h-0" style={{ minHeight: 140 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const mes     = i + 1
              const item    = summary?.por_mes?.find(m => m.mes === mes)
              const val     = item?.locacoes || 0
              const imp     = item?.imposto  || 0
              const pct     = monthlyMax > 0 ? (val / monthlyMax) * 100 : 0
              const impPct  = val > 0 ? (imp / val) * 100 : 0
              return (
                <div key={mes} className="flex flex-col items-center h-full">
                  <div className="h-5 flex items-end justify-center pb-0.5 shrink-0">
                    <span className="text-[11px] font-semibold text-g-500 font-mono tabular-nums whitespace-nowrap">
                      {val > 0 ? brlShort(val) : ''}
                    </span>
                  </div>
                  <div className="flex-1 w-full flex items-end relative">
                    {/* Barra locações */}
                    <div
                      className="w-full rounded-t bg-emerald-500/30 hover:bg-emerald-500/50 transition-all relative overflow-hidden"
                      style={{ height: val > 0 ? `${Math.max(pct, 3)}%` : '2px' }}
                      title={`${MONTHS_BR[i]}: ${brl(val)} faturado · ${brl(imp)} imposto`}
                    >
                      {/* Faixa de imposto (parte superior da barra) */}
                      {impPct > 0 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-amber-500/50"
                          style={{ height: `${impPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <span className="h-5 flex items-center text-[10px] uppercase font-semibold text-g-500">
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
          </div>
        </div>

        {/* Por empresa */}
        {summary?.por_empresa?.length > 0 && (
          <div className="card p-4 flex flex-col">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-widest mb-4">Por Emissora</p>
            <div className="flex flex-col gap-4 flex-1">
              {summary.por_empresa.map(e => {
                const pct     = summary.total_locacoes > 0 ? (e.locacoes / summary.total_locacoes) * 100 : 0
                const recPct  = e.locacoes > 0 ? (e.recebido / e.locacoes) * 100 : 0
                const isOpen  = expandedEmp === e.empresa
                return (
                  <div key={e.empresa}>
                    <button
                      onClick={() => setExpandedEmp(isOpen ? null : e.empresa)}
                      className="w-full text-left flex items-center justify-between mb-1 hover:opacity-80 transition-opacity"
                    >
                      <span className="text-g-300 text-xs font-bold">{e.empresa}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-g-600 text-[10px]">{e.quantidade}×</span>
                        <span className="text-g-300 text-xs tabular-nums font-mono">{brlShort(e.locacoes)}</span>
                        <ChevronDown className={`w-3 h-3 text-g-700 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    <div className="h-1.5 bg-g-850 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-600/60" style={{ width: `${pct}%` }} />
                    </div>
                    {isOpen && (
                      <div className="mt-1.5 pl-2 border-l border-g-800 flex flex-col gap-0.5">
                        <span className="text-g-500 text-[10px]">Recebido: <span className="font-mono text-emerald-600">{brlShort(e.recebido)}</span> <span className="text-g-700">({recPct.toFixed(0)}%)</span></span>
                        <span className="text-g-500 text-[10px]">Imposto: <span className="font-mono text-amber-600">{brlShort(e.imposto)}</span></span>
                        <span className="text-g-500 text-[10px]">Líquido: <span className="font-mono text-g-400">{brlShort(e.locacoes - e.imposto)}</span></span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
              message={filterText || filterRecStatus || filterImpStatus
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
                  {thSort('valor_locacoes',   'Faturado',  'right')}
                  {thSort('valor_imposto',    'Imposto',   'right')}
                  {thSort('aliquota_imposto', 'Alíq. %',   'right')}
                  {thSort('valor_liquido',    'Líquido',   'right')}
                  {thSort('valor_recebido',   'Recebido',  'right')}
                  {thSort('status_recebimento', 'St. Rec.')}
                  {thSort('status_imposto',   'St. Imp.')}
                  <th className="th text-right whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isPendRec = r.status_recebimento === 'Pendente' || r.status_recebimento === 'Vencido'
                  const isPendImp = r.status_imposto === 'Pendente'
                  return (
                    <tr key={r.id} className="border-b border-g-800 hover:bg-g-850/60 transition-colors">
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
                      <td className="td whitespace-nowrap text-right font-mono font-semibold text-g-200 tabular-nums">
                        {brl(r.valor_locacoes)}
                      </td>
                      <td className="td whitespace-nowrap text-right font-mono tabular-nums text-amber-500">
                        {brl(r.valor_imposto)}
                        {r.encargo_imposto > 0 && (
                          <span className="block text-[10px] text-amber-700 tabular-nums">+{brl(r.encargo_imposto)} enc.</span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-right text-g-600 tabular-nums">
                        {r.aliquota_imposto?.toFixed(2)}%
                      </td>
                      <td className="td whitespace-nowrap text-right font-mono tabular-nums text-indigo-400">
                        {brl(r.valor_liquido)}
                      </td>
                      <td className="td whitespace-nowrap text-right font-mono tabular-nums text-emerald-600">
                        {r.valor_recebido > 0 ? brl(r.valor_recebido) : '—'}
                      </td>
                      <td className="td whitespace-nowrap">
                        <Badge status={r.status_recebimento || 'Pendente'} map={REC_CLS} />
                      </td>
                      <td className="td whitespace-nowrap">
                        <Badge status={r.status_imposto || 'Pendente'} map={IMP_CLS} />
                        {r.data_pgto_imposto && (
                          <span className="block text-[10px] text-g-700 tabular-nums mt-0.5">
                            {dateBR(r.data_pgto_imposto)}
                          </span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isPendRec && (
                            <button
                              onClick={() => setModalPagar({ fatura: r, mode: 'recebimento' })}
                              className="px-2 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-800/50 rounded hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors whitespace-nowrap"
                            >
                              Receber
                            </button>
                          )}
                          {isPendImp && (
                            <button
                              onClick={() => setModalPagar({ fatura: r, mode: 'imposto' })}
                              className="px-2 py-0.5 text-[11px] font-semibold text-amber-500 border border-amber-700/40 rounded hover:bg-amber-500/10 hover:text-amber-400 transition-colors whitespace-nowrap"
                            >
                              Imp.
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
                  <td className="td text-right font-mono font-bold text-g-200 tabular-nums">{brl(totalFiltrado)}</td>
                  <td className="td text-right font-mono font-bold text-amber-500 tabular-nums">{brl(impostoFiltrado)}</td>
                  <td className="td" />
                  <td className="td text-right font-mono font-bold text-indigo-400 tabular-nums">{brl(liquidoFiltrado)}</td>
                  <td className="td text-right font-mono font-bold text-emerald-600 tabular-nums">{brl(recebidoFiltrado)}</td>
                  <td colSpan={3} className="td" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Modais ── */}
      {modalNova && (
        <FaturaFormModal
          onClose={() => setModalNova(false)}
          onSaved={load}
        />
      )}

      {modalPagar && (
        <PagarFaturaModal
          fatura={modalPagar.fatura}
          mode={modalPagar.mode}
          onClose={() => setModalPagar(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
