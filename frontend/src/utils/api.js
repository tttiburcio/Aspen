import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api'
const api = axios.create({ baseURL: BASE })

api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    const url    = err.config?.url ?? ''
    if (status >= 500) {
      console.error(`[API] Erro ${status} em ${url}:`, err.response?.data)
    } else if (status >= 400) {
      console.warn(`[API] ${status} em ${url}:`, err.response?.data)
    }
    return Promise.reject(err)
  }
)

export const getYears              = ()                    => api.get('/years').then(r => r.data)
export const getKpis               = (year, empresa)       => api.get('/kpis',     { params: { year, ...(empresa ? { empresa } : {}) } }).then(r => r.data)
export const getMonthly            = (year, empresa)       => api.get('/monthly',  { params: { year, ...(empresa ? { empresa } : {}) } }).then(r => r.data)
export const getVehicles           = (year, region, empresa) => api.get('/vehicles', { params: { year, ...(region ? { region } : {}), ...(empresa ? { empresa } : {}) } }).then(r => r.data)
export const getVehicle            = (placa, year)         => api.get(`/vehicle/${encodeURIComponent(placa)}`, { params: { year } }).then(r => r.data)
export const getRegions            = (year)                => api.get('/regions',  { params: { year } }).then(r => r.data)
export const getMaintenanceAnalysis = (year, placa)        => api.get('/maintenance_analysis', { params: { year, ...(placa ? { placa } : {}) } }).then(r => r.data)
export const getImplementoAnalysis  = (year, empresa)      => api.get('/maintenance_analysis/implemento', { params: { year, ...(empresa ? { empresa } : {}) } }).then(r => r.data)
export const getIntervalosAnalysis  = (sistema)            => api.get('/maintenance_analysis/intervalos', { params: { sistema } }).then(r => r.data)
export const getCompanies           = ()                    => api.get('/companies').then(r => r.data)
export const getEnums               = ()                    => api.get('/enums').then(r => r.data)

// ── Reembolsos ───────────────────────────────────────────────────────
export const getReembolsos          = (params = {})         => api.get('/db/reembolsos', { params }).then(r => r.data)
export const getReembolsosSummary   = (params = {})         => api.get('/db/reembolsos/summary', { params }).then(r => r.data)
export const getProximoRecibo       = (empresa_id)          => api.get('/db/reembolsos/proximo-recibo', { params: { empresa_id } }).then(r => r.data)
export const criarReembolso         = (payload)             => api.post('/db/reembolsos', payload).then(r => r.data)
export const atualizarReembolso     = (id, payload)         => api.patch(`/db/reembolsos/${id}`, payload).then(r => r.data)
export const deletarReembolso       = (id)                  => api.delete(`/db/reembolsos/${id}`)
export const pagarReembolso         = (id, payload)         => api.post(`/db/reembolsos/${id}/pagar`, payload).then(r => r.data)

// ── Faturamento Mensal ───────────────────────────────────────────────
export const getFaturamento         = (params = {})         => api.get('/db/faturamento', { params }).then(r => r.data)
export const getFaturamentoSummary  = (params = {})         => api.get('/db/faturamento/summary', { params }).then(r => r.data)
export const getFaturamentoPrefill  = (contrato_id, mes)    => api.get('/db/faturamento/prefill', { params: { contrato_id, mes } }).then(r => r.data)
export const getProximoNumeroFatura = (empresa_id)          => api.get('/db/faturamento/proximo-numero', { params: { empresa_id } }).then(r => r.data)
export const criarFatura            = (payload)             => api.post('/db/faturamento', payload).then(r => r.data)
export const patchFatura            = (id, payload)         => api.patch(`/db/faturamento/${id}`, payload).then(r => r.data)
export const deletarFatura          = (id)                   => api.delete(`/db/faturamento/${id}`)
export const syncFaturaFat          = (id)                   => api.post(`/db/faturamento/${id}/sync-fat`).then(r => r.data)
export const getFaturaDetail        = (id)                   => api.get(`/db/faturamento/${id}/detail`).then(r => r.data)

// ── Contratos ─────────────────────────────────────────────────────────
export const getContratos              = (params = {})              => api.get('/db/contratos', { params }).then(r => r.data)
export const getContrato               = (id)                       => api.get(`/db/contratos/${id}`).then(r => r.data)
export const criarContrato             = (payload)                  => api.post('/db/contratos', payload).then(r => r.data)
export const atualizarContrato         = (id, payload)              => api.patch(`/db/contratos/${id}`, payload).then(r => r.data)
export const deletarContrato           = (id)                       => api.delete(`/db/contratos/${id}`)
export const getContratoVeiculos       = (id)                       => api.get(`/db/contratos/${id}/veiculos`).then(r => r.data)
export const adicionarVeiculoContrato  = (id, payload)              => api.post(`/db/contratos/${id}/veiculos`, payload).then(r => r.data)
export const syncVeiculosContrato      = (id, payload)              => api.put(`/db/contratos/${id}/veiculos`, payload).then(r => r.data)
export const removerVeiculoContrato    = (id, id_veiculo)           => api.delete(`/db/contratos/${id}/veiculos/${id_veiculo}`)
export const getContratoFaturas        = (id)                       => api.get(`/db/contratos/${id}/faturas`).then(r => r.data)
export const getContratoMetricas       = (id)                       => api.get(`/db/contratos/${id}/metricas-veiculos`).then(r => r.data)
export const getFrotaDisponivel        = ()                         => api.get('/db/contratos/frota-disponivel').then(r => r.data)
export const getClientes               = ()                         => api.get('/db/clientes').then(r => r.data)

// ── Débitos Veiculares ───────────────────────────────────────────────
export const getDebitos          = (params = {})         => api.get('/db/debitos', { params }).then(r => r.data)
export const getDebitosSummary   = (params = {})         => api.get('/db/debitos/summary', { params }).then(r => r.data)
export const criarDebito         = (payload)             => api.post('/db/debitos', payload).then(r => r.data)
export const patchDebito         = (id, payload)         => api.patch(`/db/debitos/${id}`, payload).then(r => r.data)
export const getMultas           = (params = {})         => api.get('/db/multas', { params }).then(r => r.data)
export const getMultasSummary    = (params = {})         => api.get('/db/multas/summary', { params }).then(r => r.data)
export const criarMulta          = (payload)             => api.post('/db/multas', payload).then(r => r.data)
export const patchMulta          = (id, payload)         => api.patch(`/db/multas/${id}`, payload).then(r => r.data)
export const criarNicMulta       = (id)                  => api.post(`/db/multas/${id}/nic`).then(r => r.data)
export const patchFrotaRestricoes = (id, payload)        => api.patch(`/db/frota/${id}/restricoes`, payload).then(r => r.data)

// ── Rastreamento ─────────────────────────────────────────────────────
export const getRastreamento        = (params = {})  => api.get('/db/rastreamento', { params }).then(r => r.data)
export const getRastreamentoSummary = (params = {})  => api.get('/db/rastreamento/summary', { params }).then(r => r.data)
export const criarRastreamento      = (payload)      => api.post('/db/rastreamento', payload).then(r => r.data)
export const patchRastreamento      = (id, payload)  => api.patch(`/db/rastreamento/${id}`, payload).then(r => r.data)
export const deletarRastreamento    = (id)           => api.delete(`/db/rastreamento/${id}`)

// ── Seguro Veicular ──────────────────────────────────────────────────
export const getSeguro             = (params = {})       => api.get('/db/seguro', { params }).then(r => r.data)
export const getSeguroSummary      = (params = {})       => api.get('/db/seguro/summary', { params }).then(r => r.data)
export const criarSeguro           = (payload)           => api.post('/db/seguro', payload).then(r => r.data)
export const patchSeguro           = (id, payload)       => api.patch(`/db/seguro/${id}`, payload).then(r => r.data)
export const deletarSeguro         = (id)                => api.delete(`/db/seguro/${id}`)
export const adicionarVeiculoSeguro = (id, payload)      => api.post(`/db/seguro/${id}/veiculos`, payload).then(r => r.data)
export const patchVeiculoSeguro    = (sv_id, payload)    => api.patch(`/db/seguro/veiculo/${sv_id}`, payload).then(r => r.data)
export const removerVeiculoSeguro  = (sv_id)             => api.delete(`/db/seguro/veiculo/${sv_id}`)
export const getCorretores         = ()                  => api.get('/db/corretores').then(r => r.data)
export const criarCorretor         = (payload)           => api.post('/db/corretores', payload).then(r => r.data)

// ── Banco SQLite — CRUD legado (manutenções) ─────────────────────────
export const dbListFrota           = ()                    => api.get('/db/frota').then(r => r.data)
export const dbListFrotaAll        = ()                    => api.get('/db/frota/all').then(r => r.data)
export const dbPneuSpecs           = (placa)               => api.get(`/db/pneu-specs/${encodeURIComponent(placa)}`).then(r => r.data)
export const dbListManutencoes     = (status, placa)       => api.get('/db/manutencoes', { params: { ...(status ? { status } : {}), ...(placa ? { placa } : {}) } }).then(r => r.data)
export const dbGetManutencao       = (id)                  => api.get(`/db/manutencoes/${id}`).then(r => r.data)
export const dbAbrirManutencao     = (payload)             => api.post('/db/manutencoes', payload).then(r => r.data)
export const dbAtualizarManutencao = (id, payload)         => api.patch(`/db/manutencoes/${id}`, payload).then(r => r.data)
export const dbFinalizarManutencao = (id, payload)         => api.post(`/db/manutencoes/${id}/finalizar`, payload).then(r => r.data)
export const dbDeletarManutencao   = (id)                  => api.delete(`/db/manutencoes/${id}`)
export const dbAtualizarParcela    = (id, payload)         => api.patch(`/db/parcelas/${id}`, payload).then(r => r.data)
export const dbListParcelas        = (year, empresa)       => api.get('/db/parcelas', { params: { ...(year ? { year } : {}), ...(empresa ? { empresa } : {}) } }).then(r => r.data)

// ── Ordens de Serviço (novo modelo) ─────────────────────────────────
export const dbListOs              = (status, placa, empresa) => api.get('/db/os', { params: { ...(status ? { status } : {}), ...(placa ? { placa } : {}), ...(empresa ? { empresa } : {}) } }).then(r => r.data)
export const dbGetOs               = (id)                  => api.get(`/db/os/${id}`).then(r => r.data)
export const dbAbrirOs             = (payload)             => api.post('/db/os', payload).then(r => r.data)
export const dbAtualizarOs         = (id, payload)         => api.patch(`/db/os/${id}`, payload).then(r => r.data)
export const dbEditarOsFinalizada  = (id, payload)         => api.patch(`/db/os/${id}/editar`, payload).then(r => r.data)
export const dbDeletarOs           = (id)                  => api.delete(`/db/os/${id}`)
export const dbExecutarOs          = (id, payload)         => api.post(`/db/os/${id}/executar`, payload).then(r => r.data)
export const dbFinalizarOs         = (id)                  => api.post(`/db/os/${id}/finalizar`).then(r => r.data)
export const dbValidarOs           = (id)                  => api.get(`/db/os/${id}/validacao`).then(r => r.data)

// ── Itens da OS ──────────────────────────────────────────────────────
export const dbCriarOsItem         = (os_id, payload)      => api.post(`/db/os/${os_id}/itens`, payload).then(r => r.data)
export const dbAtualizarOsItem     = (os_id, item_id, p)   => api.patch(`/db/os/${os_id}/itens/${item_id}`, p).then(r => r.data)
export const dbDeletarOsItem       = (os_id, item_id)      => api.delete(`/db/os/${os_id}/itens/${item_id}`)

// ── Notas Fiscais ────────────────────────────────────────────────────
export const dbListNfs             = (os_id)               => api.get(`/db/os/${os_id}/nfs`).then(r => r.data)
export const dbCriarNf             = (os_id, payload)      => api.post(`/db/os/${os_id}/nfs`, payload).then(r => r.data)
export const dbSyncNfs             = (os_id, payload)      => api.put(`/db/os/${os_id}/nfs-sync`, payload).then(r => r.data)
export const dbAtualizarNf         = (nf_id, payload)      => api.patch(`/db/nfs/${nf_id}`, payload).then(r => r.data)
export const dbDeletarNf           = (nf_id)               => api.delete(`/db/nfs/${nf_id}`)
export const dbCriarParcelaNf      = (nf_id, payload)      => api.post(`/db/nfs/${nf_id}/parcelas`, payload).then(r => r.data)

// ── Merge assistido ──────────────────────────────────────────────────
export const dbMergeSugestoes      = ()                    => api.get('/db/os/merge-sugestoes').then(r => r.data)
export const dbConfirmarMerge      = (payload)             => api.post('/db/os/merge', payload).then(r => r.data)

// ── Sincronização Excel ↔ SQLite ─────────────────────────────────────
export const runSync               = ()                    => api.post('/sync').then(r => r.data)

// ── Pneu rodízio ─────────────────────────────────────────────────────
export const listPneuRodizios      = (placa)               => api.get(`/manut/pneu-rodizios/${encodeURIComponent(placa)}`).then(r => r.data)
export const createPneuRodizio     = (payload)             => api.post('/manut/pneu-rodizios', payload).then(r => r.data)
export const deletePneuRodizio     = (id)                  => api.delete(`/manut/pneu-rodizios/${id}`)
