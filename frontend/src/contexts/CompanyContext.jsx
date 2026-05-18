import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getCompanies } from '../utils/api'

const CompanyContext = createContext(null)

// Siglas ocultas da UI (mantidas no banco)
const HIDDEN_SIGLAS = new Set(['TRH'])

// Pseudo-empresa que representa o grupo completo (sem TRH)
export const GRUPO = { id: 'grupo', sigla: 'Grupo', nome: 'Grupo Comercial' }

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState(GRUPO)

  const load = useCallback(async () => {
    try {
      const data = await getCompanies()
      setCompanies(data)
    } catch (err) {
      console.warn('[CompanyContext] Falha ao carregar empresas:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Mapas derivados ────────────────────────────────────────────────
  const visibleCompanies = companies.filter(c => !HIDDEN_SIGLAS.has((c.sigla || '').toUpperCase()))

  const siglaMap = {}
  const nomeMap  = {}
  companies.forEach(c => {
    const sigla = c.sigla || c.nome
    siglaMap[String(c.id)]               = sigla
    siglaMap[sigla.toUpperCase()]        = sigla
    nomeMap[String(c.id)]               = c.nome
    nomeMap[sigla.toUpperCase()]         = c.nome
  })

  /**
   * Resolve um código/sigla de empresa para sua sigla de exibição.
   * Fallback: retorna o valor original em uppercase.
   */
  function resolveNome(cod) {
    if (!cod) return '—'
    const k = String(cod).toUpperCase().trim()
    const byId = siglaMap[String(parseInt(cod))]
    return siglaMap[k] || byId || k
  }

  /**
   * Cor de destaque para gráficos/badges.
   * Usa a sigla como chave. Extensível conforme as empresas crescerem.
   */
  function empColor(sigla) {
    if (!sigla) return '#6b7280'
    const s = String(sigla).toUpperCase()
    // Cores dos primeiros N registros — fallback para slate
    const PALETTE = ['#22C55E', '#6366f1', '#f97316', '#06b6d4', '#a855f7', '#f59e0b']
    const match = companies.find(c => (c.sigla || '').toUpperCase() === s)
    if (match) {
      const idx = companies.indexOf(match)
      return PALETTE[idx % PALETTE.length]
    }
    return '#6b7280'
  }

  return (
    <CompanyContext.Provider value={{
      companies, visibleCompanies, siglaMap, nomeMap,
      loading, resolveNome, empColor,
      selectedCompany, setSelectedCompany,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanies() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompanies must be used within CompanyProvider')
  return ctx
}
