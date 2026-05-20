import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Banknote, AlertCircle, CheckCircle, TrendingUp, Search, X, Loader2, Plus, ArrowUpRight, Trash2, Pencil, Ban } from 'lucide-react'
import { getReembolsos, getReembolsosSummary, deletarReembolso, atualizarReembolso } from '../utils/api'
import { brl, brlShort, dateBR } from '../utils/format'
import { useCompanies } from '../contexts/CompanyContext'
import { MONTHS_BR } from '../constants/maintenanceStatus'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'
import ReembolsoFormModal from '../components/modals/ReembolsoFormModal'
import ReembolsosMesModal from '../components/modals/ReembolsosMesModal'
import PagarReembolsoModal from '../components/modals/PagarReembolsoModal'
import toast from 'react-hot-toast'

const TIPO_COLOR = {
  'Manutenção':             '#f97316',
  'Multa de Trânsito':      '#ef4444',
  'Franquia de Seguro':     '#a855f7',
  'Transporte':             '#3b82f6',
  'Encargo':                '#f59e0b',
  'Encargo de Faturamento': '#f59e0b',
  'Outro':                  '#94a3b8',
}

const STATUS_CLS = {
  Recebido:  'text-emerald-700 bg-emerald-500/10 border-emerald-700/30',
  Pendente:  'text-amber-600  bg-amber-400/10   border-amber-700/30',
  Vencido:   'text-red-400    bg-red-400/10     border-red-700/30',
  Cancelado: 'text-g-600      bg-g-800/50       border-g-700/30',
}

function parsePlacas(r) {
  if (r.placas_json) {
    try { return JSON.parse(r.placas_json).filter(Boolean) } catch { /* */ }
  }
  return r.placa ? [r.placa] : []
}

function KpiCard({ icon: Icon, label, value, sub, accent = 'g-500' }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="p-2.5 bg-g-850 border border-g-800 rounded-xl shrink-0">
        <Icon className={`w-4 h-4 text-${accent}`} />
      </div>
      <div className="min-w-0">
        <p className="text-g-600 text-[10px] uppercase tracking-wider truncate">{label}</p>
        <p className="text-g-100 font-bold text-lg font-mono tabular-nums truncate leading-tight">{value}</p>
        {sub && <p className="text-g-600 text-[10px] tabular-nums truncate">{sub}</p>}
      </div>
    </div>
  )
}


// Siglas que nunca devem aparecer na UI
const HIDDEN_SIGLAS = new Set(['TRH'])

export default function ReembolsosPage({ year }) {
  const { resolveNome, selectedCompany } = useCompanies()
  const [reembolsos, setReembolsos] = useState([])
  const [summary, setSummary]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [filterText, setFilterText] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sort, setSort]             = useState({ col: 'emissao', dir: 'desc' })
  const [modalNovo, setModalNovo]         = useState(false)
  const [mesSelecionado, setMesSelecionado] = useState(null)
  const [modalPagar, setModalPagar]       = useState(null)  // reembolso objeto
  const [modalEditar, setModalEditar]     = useState(null)  // reembolso objeto
  const [deletando, setDeletando]         = useState(null)  // id sendo deletado
  const [cancelando, setCancelando]       = useState(null)  // id sendo cancelado
  const [confirm, setConfirm]             = useState(null)  // { message, onConfirm, danger }
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Sigla da empresa selecionada (undefined = modo Grupo = sem filtro)
  const emissora = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const load = useCallback(async () => {
    setLoading(true)
    const params = emissora ? { emissora_sigla: emissora } : {}
    try {
      const [list, sum] = await Promise.all([
        getReembolsos({ year, ...params }),
        getReembolsosSummary({ year, ...params }),
      ])
      // Em modo Grupo filtra client-side empresas ocultas (TRH etc.)
      const rows = (list || []).filter(r =>
        !emissora ? !HIDDEN_SIGLAS.has((r.empresa_emissora || '').toUpperCase()) : true
      )
      setReembolsos(rows)
      setSummary(sum || null)
    } finally {
      setLoading(false)
    }
  }, [year, emissora])

  useEffect(() => { load() }, [load])

  const tipos   = useMemo(() => [...new Set(reembolsos.map(r => r.tipo || 'Outro'))].sort(), [reembolsos])
  const statuses = useMemo(() => [...new Set(reembolsos.map(r => r.status_recebimento).filter(Boolean))].sort(), [reembolsos])

  const filtered = useMemo(() => {
    let r = reembolsos
    if (filterTipo)   r = r.filter(x => (x.tipo || 'Outro') === filterTipo)
    if (filterStatus) r = r.filter(x => x.status_recebimento === filterStatus)
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      r = r.filter(x => [x.placa, x.modelo, x.empresa, x.recibo, x.descricao, x.empresa_emissora]
        .some(f => (f || '').toLowerCase().includes(q)))
    }
    return [...r].sort((a, b) => {
      const av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
      if (['valor_reembolso', 'valor_recebido', 'saldo', 'encargos'].includes(sort.col)) {
        return sort.dir === 'asc' ? (av - bv) : (bv - av)
      }
      const cmp = String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [reembolsos, filterText, filterTipo, filterStatus, sort])

  const totalFiltrado    = useMemo(() => filtered.reduce((s, r) => s + (r.valor_reembolso || 0), 0), [filtered])
  const recebidoFiltrado = useMemo(() => filtered.reduce((s, r) => s + (r.valor_recebido   || 0), 0), [filtered])

  const monthlyMax = useMemo(() =>
    Math.max(0, ...(summary?.por_mes?.map(m => m.recebido || 0) || [])), [summary])

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
      message: `Excluir reembolso #${r.recibo || r.id}? Esta ação não pode ser desfeita.`,
      danger: true,
      onConfirm: async () => {
        setConfirmLoading(true)
        setDeletando(r.id)
        try {
          await deletarReembolso(r.id)
          toast.success('Reembolso excluído')
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
      message: `Cancelar reembolso #${r.recibo || r.id}?`,
      danger: false,
      onConfirm: async () => {
        setConfirmLoading(true)
        setCancelando(r.id)
        try {
          await atualizarReembolso(r.id, { status_recebimento: 'Cancelado' })
          toast.success('Reembolso cancelado')
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

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Banknote}
          label="Total Emitido (ano)"
          value={brl(summary?.total_ano ?? 0)}
          sub={`Mês atual: ${brl(summary?.total_mes ?? 0)}`}
          accent="emerald-400"
        />
        <KpiCard
          icon={CheckCircle}
          label="Total Recebido"
          value={brl(summary?.total_recebido ?? 0)}
          sub={summary?.total_ano > 0
            ? `${((summary.total_recebido / summary.total_ano) * 100).toFixed(1)}% do emitido`
            : undefined}
          accent="emerald-500"
        />
        <KpiCard
          icon={AlertCircle}
          label="Pendentes (parcelas OS)"
          value={`${summary?.pendentes ?? 0}`}
          sub={`${brl(summary?.valor_pendente ?? 0)} a recuperar`}
          accent="amber-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Registros"
          value={summary?.quantidade ?? 0}
          sub={`${tipos.length} tipo${tipos.length !== 1 ? 's' : ''}`}
          accent="g-400"
        />
      </div>

      {/* ── Gráfico mensal + Por tipo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Mensal — clicável */}
        <div className="card p-4 lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-widest">
              Recebido por mês {year ? `· ${year}` : ''}
            </p>
            <p className="text-g-700 text-[10px]">clique numa barra para ver detalhes</p>
          </div>
          {/* flex-1: ocupa todo o espaço vertical restante da card */}
          <div className="grid grid-cols-12 gap-1.5 flex-1 min-h-0">
            {Array.from({ length: 12 }, (_, i) => {
              const mes      = i + 1
              const item     = summary?.por_mes?.find(m => m.mes === mes)
              const recebido = item?.recebido || 0
              const pct      = monthlyMax > 0 ? (recebido / monthlyMax) * 100 : 0
              const ativo    = mesSelecionado === mes
              const hasData  = (item?.valor || 0) > 0 || recebido > 0
              return (
                <div
                  key={mes}
                  className={`flex flex-col items-center h-full ${hasData ? 'cursor-pointer group' : ''}`}
                  onClick={() => hasData && setMesSelecionado(mes)}
                >
                  {/* label valor — horizontal */}
                  <div className="h-5 flex items-end justify-center pb-0.5 shrink-0">
                    <span className="text-[11px] font-semibold text-g-500 font-mono tabular-nums group-hover:text-g-300 transition-colors whitespace-nowrap">
                      {recebido > 0 ? brlShort(recebido) : ''}
                    </span>
                  </div>

                  {/* área da barra — flex-1, percentual relativo a este div */}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={`w-full rounded-t transition-all ${
                        ativo
                          ? 'bg-emerald-400'
                          : recebido > 0
                            ? 'bg-emerald-500/40 group-hover:bg-emerald-500/70'
                            : 'bg-g-850/60'
                      }`}
                      style={{ height: recebido > 0 ? `${Math.max(pct, 3)}%` : '2px' }}
                      title={`${MONTHS_BR[i]}: ${brl(recebido)} recebido`}
                    />
                  </div>

                  {/* label mês — altura fixa 20px */}
                  <span className={`h-5 flex items-center text-[10px] uppercase font-semibold transition-colors ${ativo ? 'text-emerald-400' : 'text-g-500 group-hover:text-g-300'}`}>
                    {MONTHS_BR[i].slice(0, 3)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Por tipo */}
        {summary?.por_tipo?.length > 0 && (
          <div className="card p-4">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-widest mb-4">Por Tipo</p>
            <div className="flex flex-col gap-3.5">
              {summary.por_tipo.map(t => {
                const color = TIPO_COLOR[t.tipo] || TIPO_COLOR['Outro']
                const pct   = summary.total_ano > 0 ? (t.total / summary.total_ano) * 100 : 0
                const recPct = t.total > 0 ? (t.recebido / t.total) * 100 : 0
                return (
                  <div key={t.tipo}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-g-400 text-xs font-semibold truncate flex-1">{t.tipo}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-g-600 text-[10px]">{t.quantidade}×</span>
                        <span className="text-g-300 text-xs tabular-nums font-mono">{brlShort(t.total)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-g-850 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    {t.recebido > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                        <span className="text-emerald-600 text-[10px] tabular-nums">
                          {brlShort(t.recebido)} recebido ({recPct.toFixed(0)}%)
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Filtros + Novo ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
          <input
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Filtrar por placa, empresa, recibo…"
            className="w-full pl-9 pr-9 py-2 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"
          />
          {filterText && (
            <button onClick={() => setFilterText('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-g-600 hover:text-g-400" />
            </button>
          )}
        </div>

        {tipos.length > 1 && (
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors">
            <option value="">Todos os tipos</option>
            {tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {statuses.length > 1 && (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors">
            <option value="">Todos os status</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <span className="text-g-600 text-xs font-semibold bg-g-850 border border-g-800 px-2.5 py-2 rounded-lg tabular-nums font-mono">
          {filtered.length} · {brlShort(totalFiltrado)}
        </span>

        <button
          onClick={() => setModalNovo(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo Reembolso
        </button>
      </div>

      {/* ── Tabela principal ── */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Banknote}
              title="Nenhum reembolso encontrado"
              message={filterText || filterTipo || filterStatus
                ? 'Ajuste os filtros para ver mais resultados.'
                : 'Não há reembolsos registrados para este período.'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-g-850 border-b border-g-800">
                <tr>
                  {thSort('recibo',             'Recibo')}
                  {thSort('empresa_emissora',   'Emissora')}
                  {thSort('tipo',               'Tipo')}
                  {thSort('placa',              'Placa(s)')}
                  {thSort('empresa',            'Cliente')}
                  {thSort('emissao',            'Emissão')}
                  {thSort('vencimento',         'Vencimento')}
                  {thSort('valor_reembolso',    'Valor',        'right')}
                  {thSort('valor_recebido',     'Recebido',     'right')}
                  {thSort('data_recebimento',   'Dt. Recebim.', 'right')}
                  {thSort('saldo',              'Saldo',        'right')}
                  {thSort('status_recebimento', 'Status')}
                  <th className="th whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const saldo = r.saldo ?? ((r.valor_reembolso != null && r.valor_recebido != null)
                    ? r.valor_reembolso - r.valor_recebido : null)
                  const isPendente = r.status_recebimento !== 'Recebido' && r.status_recebimento !== 'Cancelado'
                  const statusCls = STATUS_CLS[r.status_recebimento] || STATUS_CLS.Pendente
                  const placas = parsePlacas(r)
                  return (
                    <tr key={r.id} className="border-b border-g-800 hover:bg-g-850/60 transition-colors">
                      <td className="td whitespace-nowrap font-mono text-g-500">{r.recibo || '—'}</td>
                      <td className="td whitespace-nowrap font-semibold text-g-400">{r.empresa_emissora || '—'}</td>
                      <td className="td whitespace-nowrap text-g-400">{r.tipo || '—'}</td>
                      <td className="td whitespace-nowrap font-mono font-semibold text-g-300">
                        {placas.length > 1
                          ? <span title={placas.join(', ')}>{placas[0]} <span className="text-g-600">+{placas.length - 1}</span></span>
                          : placas[0] || '—'}
                      </td>
                      <td className="td text-g-500">
                        <span className="block truncate max-w-[130px]" title={r.empresa}>{r.empresa || '—'}</span>
                        {r.descricao && <span className="block text-g-700 text-[10px] truncate max-w-[130px]">{r.descricao}</span>}
                      </td>
                      <td className="td whitespace-nowrap text-g-500 tabular-nums">{r.emissao    ? dateBR(r.emissao)    : '—'}</td>
                      <td className="td whitespace-nowrap text-g-500 tabular-nums">{r.vencimento ? dateBR(r.vencimento) : '—'}</td>
                      <td className="td whitespace-nowrap text-right font-mono font-semibold text-g-200 tabular-nums">{brl(r.valor_reembolso ?? 0)}</td>
                      <td className="td whitespace-nowrap text-right font-mono tabular-nums text-emerald-800 font-semibold">
                        {r.valor_recebido != null ? brl(r.valor_recebido) : '—'}
                      </td>
                      <td className="td whitespace-nowrap text-right text-g-500 tabular-nums">
                        {r.data_recebimento ? dateBR(r.data_recebimento) : '—'}
                      </td>
                      <td className="td whitespace-nowrap text-right font-mono tabular-nums">
                        {saldo != null
                          ? <span className="text-g-600">{brl(saldo)}</span>
                          : <span className="text-g-700">—</span>}
                      </td>
                      <td className="td whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusCls}`}>
                          {r.status_recebimento || 'Pendente'}
                        </span>
                      </td>
                      <td className="td whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {/* Pago — slot fixo */}
                          <div className="w-[44px] flex justify-center">
                            {isPendente ? (
                              <button onClick={() => setModalPagar(r)}
                                className="px-2 py-0.5 text-[11px] font-semibold text-black-600 border border-black-800/50 rounded hover:bg-black-500/10 hover:text-emerald-600 transition-colors">
                                Pago
                              </button>
                            ) : null}
                          </div>
                          {/* Cancelar — ícone */}
                          <button onClick={() => handleCancelar(r)} title="Cancelar"
                            className={`p-1 rounded transition-colors ${isPendente ? 'text-g-600 hover:text-amber-400 hover:bg-amber-400/10' : 'invisible'}`}
                            tabIndex={isPendente ? 0 : -1}>
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                          {/* Editar */}
                          <button onClick={() => setModalEditar(r)} title="Editar"
                            className="p-1 rounded text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {/* Excluir */}
                          <button onClick={() => handleDeletar(r)} disabled={deletando === r.id} title="Excluir"
                            className="p-1 rounded text-red-900 hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                            {deletando === r.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-g-850 border-t-2 border-g-700">
                <tr>
                  <td colSpan={7} className="td text-g-600 uppercase text-[10px] font-semibold tracking-wider">
                    Total filtrado ({filtered.length} registros)
                  </td>
                  <td className="td text-right font-mono font-bold text-g-200 tabular-nums">{brl(totalFiltrado)}</td>
                  <td className="td text-right font-mono font-semibold text-emerald-800 tabular-nums">{brl(recebidoFiltrado)}</td>
                  <td colSpan={4} className="td" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Top veículos ── */}
      {summary?.por_veiculo?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-g-800">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-widest">Reembolsos por veículo</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-g-850 border-b border-g-800">
              <tr>
                <th className="th w-8 text-center">#</th>
                <th className="th">Placa</th>
                <th className="th">Modelo</th>
                <th className="th text-center">Qtd</th>
                <th className="th text-right">Total Emitido</th>
                <th className="th text-right">Recebido</th>
                <th className="th text-right">Pendente</th>
                <th className="th text-right w-24">% Rec.</th>
              </tr>
            </thead>
            <tbody>
              {summary.por_veiculo.slice(0, 10).map((v, i) => {
                const recebido = v.recebido || 0
                const pendente = (v.total || 0) - recebido
                const pct = v.total > 0 ? (recebido / v.total) * 100 : 0
                return (
                  <tr key={v.placa || i} className="border-b border-g-800 hover:bg-g-850/60 transition-colors">
                    <td className="td text-center text-g-700 tabular-nums">{i + 1}</td>
                    <td className="td font-mono font-semibold text-g-200">{v.placa || '—'}</td>
                    <td className="td text-g-500 truncate max-w-[160px]">{v.modelo || '—'}</td>
                    <td className="td text-center text-g-500 tabular-nums">{v.quantidade}</td>
                    <td className="td text-right font-mono text-g-300 tabular-nums">{brl(v.total)}</td>
                    <td className="td text-right font-mono text-g-400 tabular-nums">{brl(recebido)}</td>
                    <td className="td text-right font-mono tabular-nums">
                      <span className={pendente > 0.01 ? 'text-amber-500' : 'text-g-600'}>{brl(pendente)}</span>
                    </td>
                    <td className="td text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-g-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className={pct >= 100 ? 'text-emerald-500' : 'text-g-500'}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modais ── */}
      {modalNovo && (
        <ReembolsoFormModal onClose={() => setModalNovo(false)} onSaved={load} />
      )}
      {modalEditar && (
        <ReembolsoFormModal
          reembolso={modalEditar}
          onClose={() => setModalEditar(null)}
          onSaved={load}
        />
      )}
      {modalPagar && (
        <PagarReembolsoModal
          reembolso={modalPagar}
          onClose={() => setModalPagar(null)}
          onSaved={load}
        />
      )}
      {mesSelecionado && (
        <ReembolsosMesModal
          year={year}
          mes={mesSelecionado}
          emissora={emissora}
          onClose={() => setMesSelecionado(null)}
        />
      )}

      {/* Modal de confirmação */}
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
