/**
 * Smoke tests — rede de segurança antes do desacoplamento dos God Components.
 *
 * Estratégia: mockar toda a camada de API e verificar que os componentes
 * principais renderizam sem lançar erros. Se uma refatoração estrutural
 * quebrar algo, estes testes falham antes de chegar ao browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendingUp } from 'lucide-react'

// ── Mock da camada de API (antes de importar App) ────────────────────────────
vi.mock('../utils/api', () => ({
  getYears:               vi.fn().mockResolvedValue({ years: [2025, 2024] }),
  getKpis:                vi.fn().mockResolvedValue({ receita: 100000, custo: 40000 }),
  getMonthly:             vi.fn().mockResolvedValue({ monthly: [] }),
  getVehicles:            vi.fn().mockResolvedValue({ vehicles: [] }),
  getRegions:             vi.fn().mockResolvedValue({ regions: [] }),
  runSync:                vi.fn().mockResolvedValue({ ok: true }),
  dbListOs:               vi.fn().mockResolvedValue([]),
  dbListManutencoes:      vi.fn().mockResolvedValue([]),
  dbListFrota:            vi.fn().mockResolvedValue([]),
  dbListParcelas:         vi.fn().mockResolvedValue([]),
  getMaintenanceAnalysis: vi.fn().mockResolvedValue({}),
  getImplementoAnalysis:  vi.fn().mockResolvedValue({}),
}))

// Mock do tracker (serviço externo opcional)
vi.mock('../utils/trackerApi', () => ({
  trackerGetKpis:   vi.fn().mockResolvedValue({}),
  trackerGetUsage:  vi.fn().mockResolvedValue([]),
  trackerGetStatus: vi.fn().mockResolvedValue([]),
}))

import KPICard from '../components/KPICard'
import App from '../App'


// ── KPICard ──────────────────────────────────────────────────────────────────

describe('KPICard', () => {
  it('renderiza com props mínimas sem lançar erro', () => {
    render(<KPICard label="Receita" value="R$ 100.000" />)
    expect(screen.getByText('Receita')).toBeInTheDocument()
    expect(screen.getByText('R$ 100.000')).toBeInTheDocument()
  })

  it('renderiza com ícone e trend positivo', () => {
    render(
      <KPICard
        icon={TrendingUp}
        label="Faturamento"
        value="R$ 50.000"
        trend={12.5}
        trendLabel="vs mês anterior"
      />
    )
    expect(screen.getByText('Faturamento')).toBeInTheDocument()
  })

  it('renderiza com accent sem crash', () => {
    render(<KPICard label="Meta" value="95%" accent />)
    expect(screen.getByText('Meta')).toBeInTheDocument()
  })
})


// ── App (integração com mocks) ───────────────────────────────────────────────

describe('App', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renderiza sem lançar erro', () => {
    expect(() => render(<App />)).not.toThrow()
  })

  it('monta o ThemeProvider e estrutura raiz', () => {
    const { container } = render(<App />)
    // Deve existir pelo menos um elemento no DOM
    expect(container.firstChild).not.toBeNull()
  })
})
