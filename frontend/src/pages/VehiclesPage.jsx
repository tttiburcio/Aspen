import { useState, useMemo, useEffect } from 'react'
import { brl, pct, dias, brlShort } from '../utils/format'
import VehicleModal from '../components/VehicleModal'
import VehicleKmBadge from '../components/tracker/VehicleKmBadge'
import TrackerStatusBadge from '../components/tracker/TrackerStatusBadge'
import { useTrackerData } from '../hooks/useTrackerData'
import { useCompanies } from '../contexts/CompanyContext'
import EmptyState from '../components/EmptyState'
import {
  Search, X, MapPin, Flame, ZapOff, Truck,
  TrendingUp, TrendingDown, DollarSign, BarChart3,
} from 'lucide-react'
import { HIGH_USAGE_THRESHOLD } from '../constants/trackerThresholds'
import { normalizePlaca } from '../utils/trackerApi'

const MAPWS_BASE = 'http://localhost:5174'

const EXCEPTIONS_STATUS = new Set(['VENDIDO', 'ADMINISTRAÇÃO', 'ADMINISTRACAO', 'ADM', 'DESATIVADO'])

// ─── Status badge ──────────────────────────────────────────────────────────
const STATUS_CLS = {
  'FROTA':        'text-emerald-600 bg-emerald-300/15 border-emerald-600/30',
  'ATIVO':        'text-emerald-600 bg-emerald-300/15 border-emerald-600/30',
  'LOCADO':       'text-emerald-600 bg-emerald-300/15 border-emerald-600/30',
  'ADMINISTRAÇÃO':          'text-sky-400     bg-sky-400/10     border-sky-600/30',
  'MANUTENÇÃO':   'text-black-400   bg-gray-400/10   border-gray-600/30',
  'VENDIDO':      'text-g-500       bg-g-800/50       border-g-700/30',
  'INATIVO':      'text-purple-800     bg-purple-300/10     border-purple-600/30',
  'DESATIVADO':   'text-red-400     bg-red-300/10     border-red-600/30',
  'PARADO':       'text-red-400     bg-red-300/10     border-red-600/30',
}

function StatusBadge({ status }) {
  const s = (status || '').toUpperCase()
  const cls = STATUS_CLS[s]
    ?? (s.includes('FROTA') || s.includes('ATIVO') || s.includes('LOCADO') ? STATUS_CLS['FROTA']
      : s.includes('MANUT') ? STATUS_CLS['MANUTENÇÃO']
      : s.includes('ADM')   ? STATUS_CLS['ADM']
      : s.includes('VENDIDO') ? STATUS_CLS['VENDIDO']
      : s.includes('INATIVO') || s.includes('DESATIVADO') || s.includes('PARADO') ? STATUS_CLS['INATIVO']
      : 'text-g-500 bg-g-800/50 border-g-700/30')
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cls}`}>
      {status || '—'}
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, accent = 'g-400' }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="p-3 bg-g-850 border border-g-800 rounded-xl shrink-0">
        <Icon className={`w-5 h-5 text-${accent}`} />
      </div>
      <div className="min-w-0">
        <p className="text-g-600 text-[11px] uppercase tracking-wider font-semibold truncate">{label}</p>
        <p className="text-g-100 font-bold text-2xl font-mono tabular-nums truncate leading-tight">{value}</p>
        {sub && <p className="text-g-500 text-xs tabular-nums truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── VehiclesPage ──────────────────────────────────────────────────────────
export default function VehiclesPage({
  vehicles, year, regions = [], region, onRegionChange,
  trackerFilter = null, onTrackerFilterConsumed,
}) {
  const { selectedCompany } = useCompanies()
  const primarySigla = import.meta.env.VITE_PRIMARY_COMPANY_SIGLA || 'EMPRESA_A'
  const isTkj = selectedCompany?.sigla?.toUpperCase() === primarySigla.toUpperCase()

  const { trackerOnline, trackerUsage, getVehicleKm, highUsageVehicles, idleVehicles } = useTrackerData({ year })

  const [selectedPlaca, setSelectedPlaca] = useState(null)
  const [search,        setSearch]        = useState('')
  const [sortCol,       setSortCol]       = useState('margem')
  const [sortDir,       setSortDir]       = useState('desc')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterImplemento, setFilterImplemento] = useState('')
  const [showOnly, setShowOnly] = useState(() => {
    try { return trackerFilter || localStorage.getItem('vehicles_filter') || 'all' } catch { return 'all' }
  })

  useEffect(() => {
    if (trackerFilter && onTrackerFilterConsumed) onTrackerFilterConsumed()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleShowOnly(val) {
    setShowOnly(val)
    try { localStorage.setItem('vehicles_filter', val) } catch {}
  }

  const highUsagePlacas = useMemo(() => new Set(highUsageVehicles.map(v => v.placa)), [highUsageVehicles])
  const idlePlacas      = useMemo(() => new Set(idleVehicles.map(v => v.placa)),      [idleVehicles])

  const isHighUsage = useMemo(() => {
    if (!selectedPlaca) return false
    const vkm = getVehicleKm(selectedPlaca)
    return vkm !== null && vkm.kmDia > HIGH_USAGE_THRESHOLD
  }, [selectedPlaca, getVehicleKm])

  const vehiclesEnriched = useMemo(() =>
    vehicles.map(v => {
      const isAdm = v.placa && (v.placa.toUpperCase() === 'TJW7I85' || v.placa.toUpperCase() === 'ERA6A58')
      const sVal  = isAdm || (v.status && v.status.toUpperCase() === 'ADM') ? 'Administração' : v.status
      const isException = EXCEPTIONS_STATUS.has((sVal || '').toUpperCase())

      let displayStatus
      if (v.tem_os_parado && !isException) {
        // OS aberta com veículo parado → exibe Manutenção independente do status cadastral
        displayStatus = 'Manutenção'
      } else if (isTkj && !isException) {
        // Empresa primária: oculta distinção Frota/Sublocado, mostra "Frota"
        displayStatus = 'Frota'
      } else {
        displayStatus = sVal
      }

      return { ...v, status: displayStatus, _km_mes: getVehicleKm(v.placa)?.km ?? null }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, trackerUsage, isTkj],
  )

  const statuses   = useMemo(() => [...new Set(vehiclesEnriched.map(v => v.status).filter(Boolean))].sort(),     [vehiclesEnriched])
  const implementos = useMemo(() => [...new Set(vehiclesEnriched.map(v => v.implemento).filter(Boolean))].sort(), [vehiclesEnriched])

  const filtered = useMemo(() => {
    let list = [...vehiclesEnriched]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(v =>
        v.placa.toLowerCase().includes(q) ||
        v.modelo.toLowerCase().includes(q) ||
        v.marca.toLowerCase().includes(q)
      )
    }
    if (filterStatus)     list = list.filter(v => v.status === filterStatus)
    if (filterImplemento) list = list.filter(v => v.implemento === filterImplemento)
    if (showOnly === 'profit')     list = list.filter(v => v.margem >= 0)
    if (showOnly === 'loss')       list = list.filter(v => v.margem < 0)
    if (showOnly === 'high_usage') list = list.filter(v => highUsagePlacas.has(normalizePlaca(v.placa)))
    if (showOnly === 'idle')       list = list.filter(v => idlePlacas.has(normalizePlaca(v.placa)))

    list.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return list
  }, [vehiclesEnriched, search, sortCol, sortDir, filterStatus, filterImplemento, showOnly, highUsagePlacas, idlePlacas])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const thSort = (key, label, align = 'left') => (
    <th key={key}
      onClick={() => handleSort(key)}
      className={`th whitespace-nowrap cursor-pointer hover:text-g-300 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {label}{sortCol === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  const totals = useMemo(() => ({
    receita_total:      filtered.reduce((s, v) => s + v.receita_total,      0),
    custo_total:        filtered.reduce((s, v) => s + v.custo_total,        0),
    margem:             filtered.reduce((s, v) => s + v.margem,             0),
    dias_trabalhado:    filtered.reduce((s, v) => s + v.dias_trabalhado,    0),
    custo_manutencao:   filtered.reduce((s, v) => s + v.custo_manutencao,   0),
    custo_seguro:       filtered.reduce((s, v) => s + v.custo_seguro,       0),
    custo_impostos:     filtered.reduce((s, v) => s + v.custo_impostos,     0),
    custo_rastreamento: filtered.reduce((s, v) => s + v.custo_rastreamento, 0),
  }), [filtered])

  const resetFilters = () => {
    setSearch('')
    if (onRegionChange) onRegionChange(null)
    setFilterStatus('')
    setFilterImplemento('')
    handleShowOnly('all')
  }

  const hasActiveFilter = !!(region || filterStatus || filterImplemento || search || showOnly !== 'all')

  return (
    <div className="flex flex-col gap-6">

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={DollarSign}
          label="Receita filtrada"
          value={brl(totals.receita_total)}
          sub={`${filtered.length} veículo${filtered.length !== 1 ? 's' : ''}`}
          accent="emerald-400"
        />
        <KpiCard
          icon={TrendingDown}
          label="Custo filtrado"
          value={brl(totals.custo_total)}
          sub={`Manutenção: ${brlShort(totals.custo_manutencao)}`}
          accent="amber-400"
        />
        <KpiCard
          icon={TrendingUp}
          label="Margem filtrada"
          value={brl(totals.margem)}
          sub={totals.receita_total > 0
            ? `${((totals.margem / totals.receita_total) * 100).toFixed(1)}% da receita`
            : undefined}
          accent={totals.margem >= 0 ? 'emerald-400' : 'red-400'}
        />
        <KpiCard
          icon={BarChart3}
          label="% Margem"
          value={totals.receita_total > 0 ? pct(totals.margem / totals.receita_total * 100) : '—'}
          sub={`${dias(totals.dias_trabalhado)} trabalhados`}
          accent={totals.margem >= 0 ? 'emerald-400' : 'red-400'}
        />
      </div>

      {/* ── Filtros ── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Busca */}
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar placa, modelo ou marca…"
            className="w-full pl-9 pr-9 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-g-600 hover:text-g-400" />
            </button>
          )}
        </div>

        {/* Região */}
        {regions.length > 0 && (
          <select value={region || ''} onChange={e => onRegionChange && onRegionChange(e.target.value || null)}
            className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-600 transition-colors">
            <option value="">Todas as regiões</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {/* Status */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-600 transition-colors">
          <option value="">Todos os status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Implemento */}
        {implementos.length > 0 && (
          <select value={filterImplemento} onChange={e => setFilterImplemento(e.target.value)}
            className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-600 transition-colors">
            <option value="">Todos os implementos</option>
            {implementos.map(imp => <option key={imp} value={imp}>{imp}</option>)}
          </select>
        )}

        {/* Resultado financeiro */}
        <div className="flex items-center gap-1 bg-g-900 border border-g-800 rounded-lg p-0.5">
          {[
            { val: 'all',    label: 'Todos'       },
            { val: 'profit', label: 'Lucrativos'  },
            { val: 'loss',   label: 'Deficitários' },
          ].map(o => (
            <button key={o.val} onClick={() => handleShowOnly(o.val)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-all ${
                showOnly === o.val
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm'
                  : 'text-g-500 hover:text-g-200'
              }`}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Filtros tracker */}
        {trackerOnline === true && (highUsageVehicles.length > 0 || idleVehicles.length > 0) && (
          <div className="flex items-center gap-1 bg-g-900 border border-g-800 rounded-lg p-0.5">
            {highUsageVehicles.length > 0 && (
              <button onClick={() => handleShowOnly(showOnly === 'high_usage' ? 'all' : 'high_usage')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  showOnly === 'high_usage' ? 'bg-red-500/20 text-red-400' : 'text-g-600 hover:text-red-400'
                }`}
                title="Alto uso de KM">
                <Flame className="w-3.5 h-3.5" /> {highUsageVehicles.length}
              </button>
            )}
            {idleVehicles.length > 0 && (
              <button onClick={() => handleShowOnly(showOnly === 'idle' ? 'all' : 'idle')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  showOnly === 'idle' ? 'bg-amber-500/20 text-amber-500' : 'text-g-600 hover:text-amber-500'
                }`}
                title="Veículos ociosos">
                <ZapOff className="w-3.5 h-3.5" /> {idleVehicles.length}
              </button>
            )}
          </div>
        )}

        {/* Limpar filtros */}
        {hasActiveFilter && (
          <button onClick={resetFilters}
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-xs font-bold uppercase tracking-wide transition-all">
            <X className="w-3.5 h-3.5" /> Limpar
          </button>
        )}

        {/* Contador */}
        <span className="text-g-500 text-xs font-semibold bg-g-850 border border-g-800 px-2.5 py-2 rounded-lg tabular-nums font-mono">
          {filtered.length} {filtered.length === 1 ? 'veículo' : 'veículos'}
        </span>

        {/* Status tracker + link MapWS */}
        {trackerOnline === true && (
          <a href={MAPWS_BASE} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide text-blue-800 border border-blue-500/20 hover:bg-blue-500/10 hover:border-indigo-500/30 transition-all shadow-sm">
            <MapPin className="w-3.5 h-3.5" /> Rastreamento
          </a>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Truck}
              title="Nenhum veículo encontrado"
              message="Tente ajustar os filtros ou limpar sua busca."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-g-850 border-b border-g-800">
                <tr>
                  {thSort('placa',              'Placa')}
                  {thSort('modelo',             'Modelo')}
                  <th className="th">Status</th>
                  {thSort('receita_total',      'Receita',       'left')}
                  {thSort('custo_total',        'Custo',         'left')}
                  {thSort('margem',             'Margem',        'left')}
                  {thSort('margem_pct',         '% Margem',      'left')}
                  {thSort('dias_trabalhado',    'Dias Trab.',    'left')}
                  {thSort('receita_por_dia',    'R$/Dia',        'left')}
                  {thSort('custo_manutencao',   'Manutenção',    'left')}
                  {thSort('custo_seguro',       'Seguro',        'left')}
                  {thSort('custo_impostos',     'Impostos',      'left')}
                  {thSort('custo_rastreamento', 'Rastreamento',  'left')}
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const vkm = getVehicleKm(v.placa)
                  const isIdle   = idlePlacas.has(normalizePlaca(v.placa))
                  const isHigh   = vkm?.kmDia > HIGH_USAGE_THRESHOLD
                  return (
                    <tr key={v.placa}
                      onClick={() => setSelectedPlaca(v.placa)}
                      className="border-b border-g-800 hover:bg-g-850/70 transition-colors cursor-pointer">

                      {/* Placa */}
                      <td className="td whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-bold text-g-100 tracking-wide">{v.placa}</span>
                          {isHigh && <Flame   className="w-3 h-3 text-red-400 shrink-0" />}
                          {isIdle && <ZapOff  className="w-3 h-3 text-amber-500 shrink-0" />}
                        </span>
                      </td>

                      {/* Modelo */}
                      <td className="td whitespace-nowrap">
                        <span className="text-[14px] text-g-200">{v.modelo}</span>
                        {v.implemento && (
                          <span className="ml-1.5 text-g-500 text-[11px]">{v.implemento}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="td whitespace-nowrap">
                        <StatusBadge status={v.status} />
                      </td>

                      {/* Receita */}
                      <td className="td whitespace-nowrap text-left font-bold text-g-100 tabular-nums">
                        {brl(v.receita_total)}
                      </td>

                      {/* Custo */}
                      <td className="td whitespace-nowrap text-left text-g-200 tabular-nums">
                        {brl(v.custo_total)}
                      </td>

                      {/* Margem */}
                      <td className="td whitespace-nowrap text-left font-bold tabular-nums">
                        <span className={v.margem >= 0 ? 'text-emerald-800' : 'text-red-500'}>
                          {brl(v.margem)}
                        </span>
                      </td>

                      {/* % Margem */}
                      <td className="td whitespace-nowrap text-left font-bold tabular-nums">
                        <span className={v.margem_pct >= 0 ? 'text-emerald-800' : 'text-red-500'}>
                          {pct(v.margem_pct)}
                        </span>
                      </td>

                      {/* Dias trab. */}
                      <td className="td whitespace-nowrap text-left text-g-200 tabular-nums">
                        {dias(v.dias_trabalhado)}
                      </td>

                      {/* R$/Dia */}
                      <td className="td whitespace-nowrap text-left tabular-nums">
                        {v.receita_por_dia > 0
                          ? <span className="text-g-300">{brlShort(v.receita_por_dia)}</span>
                          : <span className="text-g-700">—</span>}
                      </td>

                      {/* Manutenção */}
                      <td className="td whitespace-nowrap text-left text-g-200 tabular-nums">
                        {brl(v.custo_manutencao)}
                      </td>

                      {/* Seguro */}
                      <td className="td whitespace-nowrap text-left text-g-200 tabular-nums">
                        {brl(v.custo_seguro)}
                      </td>

                      {/* Impostos */}
                      <td className="td whitespace-nowrap text-left text-g-200 tabular-nums">
                        {brl(v.custo_impostos)}
                      </td>

                      {/* Rastreamento */}
                      <td className="td whitespace-nowrap text-left text-g-200 tabular-nums">
                        {brl(v.custo_rastreamento)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totais */}
              {filtered.length > 1 && (
                <tfoot className="bg-g-850 border-t-2 border-g-700">
                  <tr>
                    <td colSpan={3} className="td text-g-500 uppercase text-[10px] font-bold tracking-wider whitespace-nowrap">
                      Totais ({filtered.length})
                    </td>
                    <td className="td text-right font-mono font-bold text-g-100 tabular-nums whitespace-nowrap">
                      {brl(totals.receita_total)}
                    </td>
                    <td className="td text-right font-mono text-g-400 tabular-nums whitespace-nowrap">
                      {brl(totals.custo_total)}
                    </td>
                    <td className="td text-right font-mono font-bold tabular-nums whitespace-nowrap">
                      <span className={totals.margem >= 0 ? 'text-emerald-500' : 'text-red-400'}>
                        {brl(totals.margem)}
                      </span>
                    </td>
                    <td className="td text-right font-bold tabular-nums whitespace-nowrap">
                      <span className={totals.margem >= 0 ? 'text-emerald-500' : 'text-red-400'}>
                        {totals.receita_total > 0 ? pct(totals.margem / totals.receita_total * 100) : '—'}
                      </span>
                    </td>
                    <td className="td text-right text-g-400 tabular-nums whitespace-nowrap">
                      {dias(totals.dias_trabalhado)}
                    </td>
                    <td className="td text-g-700 text-right">—</td>
                    <td className="td text-right font-mono text-g-400 tabular-nums whitespace-nowrap">
                      {brl(totals.custo_manutencao)}
                    </td>
                    <td className="td text-right font-mono text-g-400 tabular-nums whitespace-nowrap">
                      {brl(totals.custo_seguro)}
                    </td>
                    <td className="td text-right font-mono text-g-400 tabular-nums whitespace-nowrap">
                      {brl(totals.custo_impostos)}
                    </td>
                    <td className="td text-right font-mono text-g-400 tabular-nums whitespace-nowrap">
                      {brl(totals.custo_rastreamento)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <p className="text-g-700 text-xs text-center">
        Clique em qualquer linha para abrir a análise detalhada do veículo
      </p>

      {selectedPlaca && (
        <VehicleModal
          placa={selectedPlaca}
          year={year}
          trackerOnline={trackerOnline}
          isHighUsage={isHighUsage}
          onClose={() => setSelectedPlaca(null)}
        />
      )}
    </div>
  )
}
