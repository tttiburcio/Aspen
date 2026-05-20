import { useState, useEffect, useCallback } from 'react'
import { Toaster } from 'react-hot-toast'
import { getYears, getKpis, getMonthly, getVehicles, getRegions, runSync } from './utils/api'
import Sidebar from './components/Sidebar'
import OverviewPage from './pages/OverviewPage'
import VehiclesPage from './pages/VehiclesPage'
import MaintenancePage from './pages/MaintenancePage'
import AnalysisPage from './pages/AnalysisPage'
import ReembolsosPage from './pages/ReembolsosPage'
import FaturamentoPage from './pages/FaturamentoPage'
import ContratosPage from './pages/ContratosPage'
import DebitsPage from './pages/DebitsPage'
import { ThemeProvider } from './contexts/ThemeContext'
import { CompanyProvider, useCompanies, GRUPO } from './contexts/CompanyContext'
import { Loader2, Plus, Menu, RefreshCw, ChevronDown, Building2, Bell, AlertCircle } from 'lucide-react'

function CompanyHeaderSelector() {
  const [open, setOpen] = useState(false)
  const { visibleCompanies, selectedCompany, setSelectedCompany } = useCompanies()
  if (!visibleCompanies.length) return null

  const options = [GRUPO, ...visibleCompanies]
  const isGrupo = selectedCompany?.id === 'grupo'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-g-800 bg-g-900 text-g-400 text-sm font-medium hover:border-g-750 hover:text-g-300 transition-all"
      >
        <Building2 className="w-3.5 h-3.5 text-g-600" />
        <span className="font-semibold">{selectedCompany?.sigla || '—'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-g-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-g-900 border border-g-800 rounded-lg shadow-lg z-30 min-w-[160px] overflow-hidden animate-fade-in">
          {options.map((c, i) => {
            const active = selectedCompany?.id === c.id
            return (
              <>
                {i === 1 && (
                  <div key="sep" className="border-t border-g-800 my-0.5" />
                )}
                <button
                  key={c.id}
                  onClick={() => { setSelectedCompany(c); setOpen(false) }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    active ? 'text-g-100 font-bold bg-g-850' : 'text-g-500 hover:bg-g-850 hover:text-g-300'
                  }`}
                  title={c.nome}
                >
                  {c.id === 'grupo'
                    ? <span className="flex items-center gap-1.5"><span className="text-[9px] font-bold px-1 py-0.5 rounded bg-g-800 text-g-500 uppercase tracking-wider">grupo</span>{c.sigla}</span>
                    : c.sigla || c.nome}
                </button>
              </>
            )
          })}
        </div>
      )}
    </div>
  )
}

const HEADER_ACTIONS = {}

const PAGE_TITLE = {
  overview:     'Visão Geral — Índices',
  vehicles:     'Frota — Analítico',
  maintenance:  'Manutenção — Gestão de OS',
  analysis:     'Intervalos — KM & Tempo por Sistema',
  reembolsos:   'Reembolsos — Gestão',
  faturamento:  'Faturamento — Faturas & Impostos',
  contratos:    'Contratos — Administração',
  debitos:      'Débitos Veiculares — IPVA, Licenciamento & Multas',
}

function AppContent() {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [page, setPage]           = useState('overview')
  const [headerTrigger, setHeaderTrigger] = useState({})
  const [years, setYears]       = useState([])
  const [year, setYear]         = useState(null)
  const [kpis, setKpis]         = useState(null)
  const [monthly, setMonthly]   = useState([])
  const [vehicles, setVehicles] = useState([])
  const [regions, setRegions]   = useState([])
  const [region, setRegion]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen]     = useState(false)
  const [finAlertDismissed, setFinAlertDismissed]   = useState(false)
  const [trackerFilter, setTrackerFilter]           = useState(null)

  useEffect(() => {
    getYears()
      .then(d => {
        setYears(d.years)
        if (d.years.length > 0) setYear(d.years[0])
      })
      .catch(() => setError('Não foi possível conectar ao servidor. Verifique se o backend está rodando.'))
  }, [])

  const loadData = useCallback(async (y, r, emp) => {
    if (!y) return
    setLoading(true)
    setError(null)
    try {
      const [k, m, v, reg] = await Promise.all([
        getKpis(y, emp),
        getMonthly(y, emp),
        getVehicles(y, r, emp),
        getRegions(y),
      ])
      setKpis(k)
      setMonthly(m.monthly || [])
      setVehicles(v.vehicles || [])
      setRegions(reg.regions || [])
    } catch {
      setError('Erro ao carregar os dados. Verifique a conexão com o backend.')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    runSync().catch(() => {})
    try {
      setLoading(true)
      const d = await getYears()
      setYears(d.years)
      if (d.years.length > 0 && !year) setYear(d.years[0])
      await loadData(year, region, empresa)
    } catch {
      setError('Erro ao atualizar os dados.')
    } finally {
      setLoading(false)
    }
  }, [year, region, empresa, loadData])

  useEffect(() => { loadData(year, region, empresa) }, [year, region, empresa, loadData])

  const handleRegionChange = (r) => { setRegion(r || null) }

  if (error && !year) {
    return (
      <div className="flex h-screen items-center justify-center bg-g-950">
        <div className="text-center p-8 card rounded-2xl max-w-md animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-g-850">
            <AlertCircle className="w-8 h-8 text-g-500" />
          </div>
          <h2 className="text-g-100 text-xl font-semibold mb-2">Erro de Conexão</h2>
          <p className="text-g-400 text-sm">{error}</p>
          <p className="text-g-600 text-xs mt-4">
            Inicie o backend:{' '}
            <code className="text-g-300 bg-g-800 px-1.5 py-0.5 rounded font-mono text-xs">
              uvicorn main:app --reload
            </code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-g-950">
      <Sidebar
        page={page}
        setPage={setPage}
        years={years}
        year={year}
        setYear={setYear}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-g-900/95 backdrop-blur-sm border-b border-g-800 px-4 sm:px-6 py-3 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 -ml-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors block md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {loading && (
              <Loader2 className="w-4 h-4 text-g-600 animate-spin" />
            )}
            {error && !loading && <span className="text-red-500 text-xs hidden sm:inline">{error}</span>}

            <CompanyHeaderSelector />

            {/* Sino — notificações (placeholder) */}
            <button
              title="Notificações"
              className="p-2 rounded-lg border border-g-800 bg-g-900 text-g-500 hover:text-g-300 hover:border-g-750 transition-all"
            >
              <Bell className="w-4 h-4" />
            </button>

            {/* Atualizar — apenas ícone */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              title="Atualizar dados"
              className="p-2 rounded-lg border transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-g-100"
              style={{ background: 'rgb(var(--g-100) / 0.08)', borderColor: 'rgb(var(--g-100) / 0.22)' }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {HEADER_ACTIONS[page]?.map(action => (
              <button
                key={action.key}
                onClick={() => setHeaderTrigger(t => ({ ...t, [action.key]: (t[action.key] || 0) + 1 }))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors"
                style={{ background: '#002a1c' }}
              >
                <Plus className="w-3.5 h-3.5" />
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-6">
          {loading && (
            <div className="flex flex-col items-center justify-center h-96 gap-4 animate-fade-in">
              <Loader2 className="w-10 h-10 text-g-700 animate-spin" />
              <p className="text-g-500 text-sm">Carregando dados de {year}…</p>
            </div>
          )}

          {!loading && (
            <div className="mb-6 animate-fade-up">
              <h1 className="text-g-200 font-bold text-2xl tracking-tight">
                {PAGE_TITLE[page]}
              </h1>
              <p className="text-g-600 text-sm mt-1">
                Aspen · Exercício {year}
                {region && <span className="ml-2 text-g-100">· {region}</span>}
              </p>
            </div>
          )}

          {!loading && kpis && page === 'overview' && (
            <div key={`overview-${year}-${empresa}`} className="animate-page-fade">
              <OverviewPage
                kpis={kpis} monthly={monthly} vehicles={vehicles} year={year}
                setPage={setPage}
                setTrackerFilter={setTrackerFilter}
              />
            </div>
          )}

          {!loading && page === 'vehicles' && (
            <div key={`vehicles-${year}-${region}-${empresa}`} className="animate-page-fade">
              <VehiclesPage
                vehicles={vehicles}
                year={year}
                regions={regions}
                region={region}
                onRegionChange={handleRegionChange}
                trackerFilter={trackerFilter}
                onTrackerFilterConsumed={() => setTrackerFilter(null)}
              />
            </div>
          )}

          {!loading && page === 'maintenance' && (
            <div key={`maintenance-${year}-${empresa}`} className="animate-page-fade">
              <MaintenancePage
                year={year}
                vehicles={vehicles}
                headerTrigger={headerTrigger}
                finAlertDismissed={finAlertDismissed}
                setFinAlertDismissed={setFinAlertDismissed}
                onRefreshData={() => loadData(year, region, empresa)}
              />
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
            <div key={`debitos-${year}-${empresa}`} className="animate-page-fade">
              <DebitsPage year={year} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1E293B',
            color: '#f1f5f9',
            border: '1px solid rgb(30 51 80)',
            borderRadius: '10px',
            fontSize: '13px',
            fontFamily: 'Sora, system-ui, sans-serif',
          },
          success: { iconTheme: { primary: '#002a1c', secondary: '#f0fdf4' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#1E293B' } },
        }}
      />
      <CompanyProvider>
        <AppContent />
      </CompanyProvider>
    </ThemeProvider>
  )
}
