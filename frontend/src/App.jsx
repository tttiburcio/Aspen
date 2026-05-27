import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Toaster } from 'react-hot-toast'
import { getYears, getKpis, getMonthly, getVehicles, getRegions, runSync } from './utils/api'
import OverviewPage      from './pages/OverviewPage'
import VehiclesPage      from './pages/VehiclesPage'
import MaintenancePage   from './pages/MaintenancePage'
import AnalysisPage      from './pages/AnalysisPage'
import ReembolsosPage    from './pages/ReembolsosPage'
import FaturamentoPage   from './pages/FaturamentoPage'
import ContratosPage     from './pages/ContratosPage'
import DebitsPage        from './pages/DebitsPage'
import RastreamentoPage  from './pages/RastreamentoPage'
import SeguroPage        from './pages/SeguroPage'
import { ThemeProvider } from './contexts/ThemeContext'
import { CompanyProvider, useCompanies, GRUPO } from './contexts/CompanyContext'
import { EnumsProvider } from './contexts/EnumsContext'
import {
  Loader2, RefreshCw, ChevronDown, Building2, Bell, AlertCircle, Calendar,
  LayoutDashboard, Truck, Wrench, BarChart2, Banknote, CircleDollarSign,
  FileText, FileWarning, MapPin, Shield, DollarSign, ClipboardList,
} from 'lucide-react'

// ─── Mapa de navegação ────────────────────────────────────────────────────────
const NAV = [
  { key: 'overview',     label: 'Visão Geral',  Icon: LayoutDashboard },
  { key: 'vehicles',     label: 'Frota',        Icon: Truck           },
  {
    key: 'maintenance',  label: 'Manutenção',   Icon: Wrench,
    sub: [
      { tab: 'gestao',     label: 'Gestão de OS', Icon: ClipboardList },
      { tab: 'financeiro', label: 'Financeiro',   Icon: DollarSign    },
    ],
  },
  { key: 'analysis',     label: 'Intervalos',   Icon: BarChart2       },
  { key: 'reembolsos',   label: 'Reembolsos',   Icon: Banknote        },
  { key: 'faturamento',  label: 'Faturamento',  Icon: CircleDollarSign},
  { key: 'contratos',    label: 'Contratos',    Icon: FileText        },
  {
    key: 'debitos',      label: 'Débitos',      Icon: FileWarning,
    sub: [
      { tab: 'documentais',  label: 'IPVA & Licenciamento', Icon: FileWarning  },
      { tab: 'multas',       label: 'Multas de Trânsito',   Icon: AlertCircle  },
      { tab: 'documentacao', label: 'Documentação',         Icon: FileText     },
    ],
  },
  { key: 'rastreamento', label: 'Rastreamento', Icon: MapPin          },
  { key: 'seguro',       label: 'Seguro',       Icon: Shield          },
]

const PAGE_TITLE = {
  overview:     'Visão Geral — Índices',
  vehicles:     'Frota — Analítico',
  maintenance:  'Manutenção — Gestão de OS',
  analysis:     'Intervalos — KM & Tempo por Sistema',
  reembolsos:   'Reembolsos — Gestão',
  faturamento:  'Faturamento — Faturas & Impostos',
  contratos:    'Contratos — Administração',
  debitos:      'Débitos Veiculares — IPVA, Licenciamento & Multas',
  rastreamento: 'Rastreamento — Contratos & Veículos',
  seguro:       'Seguro — Apólices & Veículos',
}

// ─── NavItem com dropdown via portal ─────────────────────────────────────────
// O portal evita que o overflow-x-auto do nav clips o dropdown
function NavItem({ label, Icon, active, onClick, sub, activeSubTab, onSubClick }) {
  const [open,   setOpen]   = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const timerRef  = useRef(null)
  const btnRef    = useRef(null)
  const hasDropdown = sub && sub.length > 0

  const openDrop = () => {
    if (!hasDropdown) return
    clearTimeout(timerRef.current)
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 6, left: r.left })
    }
    setOpen(true)
  }

  const closeDrop = () => {
    if (!hasDropdown) return
    timerRef.current = setTimeout(() => setOpen(false), 200)
  }

  const keepOpen = () => {
    clearTimeout(timerRef.current)
  }

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const dropdown = open && hasDropdown
    ? createPortal(
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 99999 }}
          className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden min-w-[210px]"
          onMouseEnter={keepOpen}
          onMouseLeave={closeDrop}
        >
          {/* Cabeçalho do grupo */}
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 flex items-center gap-2">
            <Icon className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
          </div>
          {sub.map(s => {
            const subActive = active && activeSubTab === s.tab
            return (
              <button
                key={s.tab}
                onClick={() => { onSubClick(s.tab); setOpen(false) }}
                className={`
                  w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors
                  ${subActive
                    ? 'bg-gray-50 text-gray-900 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                `}
              >
                <s.Icon className={`w-4 h-4 shrink-0 ${subActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span>{s.label}</span>
                {subActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                )}
              </button>
            )
          })}
        </div>,
        document.body
      )
    : null

  return (
    <>
      <button
        ref={btnRef}
        onClick={onClick}
        onMouseEnter={openDrop}
        onMouseLeave={closeDrop}
        className={`
          flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
          transition-all duration-150 whitespace-nowrap select-none shrink-0
          ${active
            ? 'bg-gray-100 text-gray-900 font-semibold'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}
        `}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-gray-700' : 'text-gray-400'}`} />
        <span>{label}</span>
        {hasDropdown && (
          <ChevronDown
            className={`w-3 h-3 ml-0.5 transition-transform duration-200 ${
              open ? 'rotate-180 text-gray-500' : 'text-gray-300'
            }`}
          />
        )}
        {active && !hasDropdown && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-0.5" />
        )}
      </button>
      {dropdown}
    </>
  )
}

// ─── Seletor de Ano ───────────────────────────────────────────────────────────
function YearSelector({ years, year, setYear }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:border-gray-300 hover:text-gray-800 transition-all shadow-sm"
      >
        <Calendar className="w-3.5 h-3.5 text-gray-400" />
        <span className="font-mono font-semibold tabular-nums">{year || '—'}</span>
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden min-w-[90px]">
          {years.map(y => (
            <button key={y} onClick={() => { setYear(y); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 text-sm font-mono transition-colors ${
                y === year ? 'text-gray-900 font-bold bg-gray-50' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}>
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Seletor de Empresa ───────────────────────────────────────────────────────
function CompanySelector() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { visibleCompanies, selectedCompany, setSelectedCompany } = useCompanies()

  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!visibleCompanies.length) return null
  const options = [GRUPO, ...visibleCompanies]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:border-gray-300 hover:text-gray-800 transition-all shadow-sm"
      >
        <Building2 className="w-3.5 h-3.5 text-gray-400" />
        <span className="font-semibold">{selectedCompany?.sigla || '—'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
          {options.map((c, i) => {
            const active = selectedCompany?.id === c.id
            return (
              <React.Fragment key={c.id}>
                {i === 1 && <div className="border-t border-gray-100" />}
                <button
                  onClick={() => { setSelectedCompany(c); setOpen(false) }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    active ? 'text-gray-900 font-bold bg-gray-50' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                  title={c.nome}
                >
                  {c.id === 'grupo'
                    ? <span className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 uppercase tracking-wider">grupo</span>
                        {c.sigla}
                      </span>
                    : (c.sigla || c.nome)
                  }
                </button>
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── AppContent ───────────────────────────────────────────────────────────────
function AppContent() {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [page,    setPage]    = useState('overview')
  const [years,   setYears]   = useState([])
  const [year,    setYear]    = useState(null)
  const [kpis,    setKpis]    = useState(null)
  const [monthly, setMonthly] = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [regions,   setRegions]   = useState([])
  const [region,    setRegion]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [isSlowConnection, setIsSlowConnection] = useState(false)
  const [error,     setError]     = useState(null)
  const [finAlertDismissed, setFinAlertDismissed] = useState(false)
  const [trackerFilter, setTrackerFilter]         = useState(null)

  // ── Tabs das páginas com sub-módulos ──
  const [maintenanceTab, setMaintenanceTab] = useState('gestao')
  const [debitsTab,      setDebitsTab]      = useState('documentais')
  const [debitsKey,      setDebitsKey]      = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setIsSlowConnection(true), 3000)
    getYears()
      .then(d => {
        clearTimeout(timer); setIsSlowConnection(false)
        setYears(d.years)
        if (d.years.length > 0) setYear(d.years[0])
      })
      .catch(() => {
        clearTimeout(timer); setIsSlowConnection(false)
        setError('Não foi possível conectar ao servidor. Verifique se o backend está rodando.')
      })
  }, [])

  const loadData = useCallback(async (y, r, emp) => {
    if (!y) return
    setLoading(true); setError(null)
    try {
      const [k, m, v, reg] = await Promise.all([
        getKpis(y, emp), getMonthly(y, emp), getVehicles(y, r, emp), getRegions(y),
      ])
      setKpis(k); setMonthly(m.monthly || []); setVehicles(v.vehicles || []); setRegions(reg.regions || [])
    } catch { setError('Erro ao carregar os dados. Verifique a conexão com o backend.') }
    finally   { setLoading(false) }
  }, [])

  const handleRefresh = useCallback(async () => {
    runSync().catch(() => {})
    try {
      setLoading(true)
      const d = await getYears()
      setYears(d.years)
      if (d.years.length > 0 && !year) setYear(d.years[0])
      await loadData(year, region, empresa)
    } catch { setError('Erro ao atualizar os dados.') }
    finally   { setLoading(false) }
  }, [year, region, empresa, loadData])

  useEffect(() => { loadData(year, region, empresa) }, [year, region, empresa, loadData])

  // ── Helpers de navegação com sub-tab ──
  const navTo = (pageKey, subTab) => {
    setPage(pageKey)
    if (pageKey === 'maintenance') setMaintenanceTab(subTab || 'gestao')
    if (pageKey === 'debitos') {
      const t = subTab || 'documentais'
      setDebitsTab(t); setDebitsKey(k => k + 1)
    }
  }

  if (error && !year) {
    return (
      <div className="flex h-screen items-center justify-center bg-g-950">
        <div className="text-center p-8 card rounded-2xl max-w-md animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-g-850">
            <AlertCircle className="w-8 h-8 text-g-500" />
          </div>
          <h2 className="text-g-100 text-xl font-semibold mb-2">Erro de Conexão</h2>
          <p className="text-g-400 text-sm mb-4">{error}</p>
          {import.meta.env.VITE_API_BASE_URL
            ? <p className="text-g-600 text-xs">Se o problema persistir, o serviço do backend ({import.meta.env.VITE_API_BASE_URL}) pode estar temporariamente indisponível.</p>
            : <p className="text-g-600 text-xs">Inicie o backend:{' '}<code className="text-g-300 bg-g-800 px-1.5 py-0.5 rounded font-mono text-xs">uvicorn main:app --reload</code></p>
          }
        </div>
      </div>
    )
  }

  if (!years.length && loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-g-950">
        <div className="text-center p-8 max-w-md animate-fade-in flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-g-500 animate-spin mb-4" />
          <p className="text-g-300 text-sm font-medium">Conectando ao servidor...</p>
          {isSlowConnection && (
            <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-200/90 text-xs text-left animate-fade-up max-w-sm">
              <div className="flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Servidor em Modo de Demonstração (Render)</p>
                  <p className="text-amber-300/70 leading-relaxed">
                    O backend está no plano gratuito da Render. Por inatividade pode levar 30–50 s para inicializar.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const currentNav = NAV.find(n => n.key === page)
  const activeSubLabel = page === 'maintenance'
    ? NAV.find(n => n.key === 'maintenance')?.sub?.find(s => s.tab === maintenanceTab)?.label
    : page === 'debitos'
      ? NAV.find(n => n.key === 'debitos')?.sub?.find(s => s.tab === debitsTab)?.label
      : null

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-g-950">

      {/* ══════════════════════════════════════════════════════════════
          NAVBAR SUPERIOR — fundo branco
      ══════════════════════════════════════════════════════════════ */}
      <header className="shrink-0 z-20 bg-white border-b border-gray-200 shadow-sm no-print">
        <div className="flex items-center h-[70px] px-5 gap-3">

          {/* ── Logo (sem texto) ── */}
          <div className="shrink-0 pr-4 border-r border-gray-200 flex items-center">
            <img src="/logo.png" alt="Aspen" className="h-14 w-auto object-contain" />
          </div>

          {/* ── Navegação — scroll horizontal sem clipping
              Truque: outer div com overflow-x-auto + inner div com w-max
              O overflow-x está no wrapper, não no flex direto, evitando
              que o dropdown (portal) seja afetado  ── */}
          <div
            className="flex-1 min-w-0 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex items-center gap-1 py-1 w-max">
              {NAV.map(({ key, label, Icon, sub }) => (
                <NavItem
                  key={key}
                  label={label}
                  Icon={Icon}
                  active={page === key}
                  sub={sub}
                  activeSubTab={key === 'maintenance' ? maintenanceTab : key === 'debitos' ? debitsTab : undefined}
                  onClick={() => navTo(key)}
                  onSubClick={tab => navTo(key, tab)}
                />
              ))}
            </div>
          </div>

          {/* ── Controles direita ── */}
          <div className="flex items-center gap-2 shrink-0 pl-4 border-l border-gray-200">
            {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}

            <YearSelector years={years} year={year} setYear={setYear} />
            <CompanySelector />

            <div className="w-px h-5 bg-gray-200 mx-0.5" />

            <button title="Notificações"
              className="p-2 rounded-xl border border-gray-200 bg-white text-gray-400 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm">
              <Bell className="w-4 h-4" />
            </button>

            <button onClick={handleRefresh} disabled={loading} title="Atualizar dados"
              className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════
          CONTEÚDO
      ══════════════════════════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 py-6">

          {loading && (
            <div className="flex flex-col items-center justify-center h-96 gap-4 animate-fade-in">
              <Loader2 className="w-10 h-10 text-g-700 animate-spin" />
              <p className="text-g-500 text-sm">Carregando dados de {year}…</p>
            </div>
          )}

          {!loading && (
            <div className="mb-6 animate-fade-up flex items-center gap-3">
              {currentNav && (
                <div className="p-2 rounded-xl bg-g-850 border border-g-800 shrink-0">
                  <currentNav.Icon className="w-4 h-4 text-g-400" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-g-200 font-bold text-xl tracking-tight truncate">
                  {PAGE_TITLE[page]}
                </h1>
                <p className="text-g-600 text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Aspen · Exercício {year}</span>
                  {region && <span className="text-g-400">· {region}</span>}
                  {error && !loading && (
                    <span className="text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {error}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* ── Páginas ── */}
          {!loading && kpis && page === 'overview' && (
            <div key={`overview-${year}-${empresa}`} className="animate-page-fade">
              <OverviewPage kpis={kpis} monthly={monthly} vehicles={vehicles} year={year}
                setPage={setPage} setTrackerFilter={setTrackerFilter} />
            </div>
          )}

          {!loading && page === 'vehicles' && (
            <div key={`vehicles-${year}-${region}-${empresa}`} className="animate-page-fade">
              <VehiclesPage vehicles={vehicles} year={year} regions={regions} region={region}
                onRegionChange={r => setRegion(r || null)}
                trackerFilter={trackerFilter}
                onTrackerFilterConsumed={() => setTrackerFilter(null)} />
            </div>
          )}

          {!loading && page === 'maintenance' && (
            <div key={`maintenance-${year}-${empresa}`} className="animate-page-fade">
              <MaintenancePage year={year} vehicles={vehicles}
                finAlertDismissed={finAlertDismissed}
                setFinAlertDismissed={setFinAlertDismissed}
                onRefreshData={() => loadData(year, region, empresa)}
                activeTab={maintenanceTab}
                onTabChange={setMaintenanceTab} />
            </div>
          )}

          {!loading && page === 'analysis' && (
            <div key={`analysis-${year}-${empresa}`} className="animate-page-fade">
              <AnalysisPage year={year} />
            </div>
          )}

          {!loading && page === 'reembolsos' && (
            <div key={`reembolsos-${year}-${empresa}`} className="animate-page-fade">
              <ReembolsosPage year={year} />
            </div>
          )}

          {!loading && page === 'faturamento' && (
            <div key={`faturamento-${year}-${empresa}`} className="animate-page-fade">
              <FaturamentoPage year={year} />
            </div>
          )}

          {page === 'contratos' && (
            <div key={`contratos-${empresa}`} className="animate-page-fade">
              <ContratosPage />
            </div>
          )}

          {page === 'debitos' && (
            <div key={`debits-${year}-${empresa}-${debitsKey}`} className="animate-page-fade">
              <DebitsPage year={year} initialTab={debitsTab} />
            </div>
          )}

          {page === 'rastreamento' && (
            <div key={`rastreamento-${empresa}`} className="animate-page-fade">
              <RastreamentoPage year={year} />
            </div>
          )}

          {page === 'seguro' && (
            <div key={`seguro-${empresa}`} className="animate-page-fade">
              <SeguroPage />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1E293B', color: '#f1f5f9',
            border: '1px solid rgb(30 51 80)',
            borderRadius: '10px', fontSize: '13px',
            fontFamily: 'Sora, system-ui, sans-serif',
          },
          success: { iconTheme: { primary: '#002a1c', secondary: '#f0fdf4' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#1E293B' } },
        }}
      />
      <CompanyProvider>
        <EnumsProvider>
          <AppContent />
        </EnumsProvider>
      </CompanyProvider>
    </ThemeProvider>
  )
}
