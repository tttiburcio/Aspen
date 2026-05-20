import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Plus, Search, X, Building2, Truck, Receipt,
  Loader2, Edit2, Trash2, AlertTriangle, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getContratos, deletarContrato } from '../utils/api'
import { dateBR } from '../utils/format'
import { useCompanies } from '../contexts/CompanyContext'
import ContratoFormModal from '../components/modals/ContratoFormModal'
import ContratoDetailModal from '../components/modals/ContratoDetailModal'

const STATUS_CLS = {
  Ativo:     'bg-emerald-500/10 text-emerald-400 border-emerald-700/30',
  Encerrado: 'bg-g-800/50       text-g-500       border-g-700/30',
  Renovado:  'bg-amber-500/10   text-amber-400   border-amber-700/30',
}
const STATUS_LIST = ['Todos', 'Ativo', 'Encerrado', 'Renovado']

function KpiCard({ icon: Icon, label, value, accent = '#94a3b8', sub }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="p-2.5 bg-g-850 border border-g-800 rounded-xl shrink-0">
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-g-600 text-[10px] uppercase tracking-wider truncate">{label}</p>
        <p className="text-g-100 font-bold text-xl font-mono tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-g-600 text-[10px] tabular-nums">{sub}</p>}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_CLS[status] || STATUS_CLS.Encerrado}`}>
      {status}
    </span>
  )
}

function PgtoBadge({ forma }) {
  if (!forma) return <span className="text-g-700 text-[10px]">—</span>
  const cls = forma === 'PIX'
    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-700/30'
    : 'bg-amber-500/10 text-amber-400 border-amber-700/30'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{forma}</span>
}

function DaysChip({ days }) {
  if (days == null) return null
  if (days === 0) return <span className="text-red-400 text-[10px] font-semibold">Vencido</span>
  const color = days > 90 ? 'text-emerald-400' : days > 30 ? 'text-amber-400' : 'text-red-400'
  return <span className={`text-[10px] font-semibold ${color}`}>{days}d</span>
}

export default function ContratosPage() {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [contratos,    setContratos]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filterText,   setFilterText]   = useState('')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [modalNovo,    setModalNovo]    = useState(false)
  const [modalEdit,    setModalEdit]    = useState(null)
  const [modalDetail,  setModalDetail]  = useState(null)
  const [confirmDel,   setConfirmDel]   = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  const load = () => {
    setLoading(true)
    getContratos({ incluir_inativos: true, ...(empresa ? { empresa } : {}) })
      .then(d => setContratos(d || []))
      .catch(() => toast.error('Erro ao carregar contratos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [empresa]) // eslint-disable-line

  const ativos     = useMemo(() => contratos.filter(c => c.status === 'Ativo').length, [contratos])
  const encerrados = useMemo(() => contratos.filter(c => c.status !== 'Ativo').length, [contratos])
  const ativosVeic = useMemo(() => contratos.filter(c => c.status === 'Ativo').reduce((s, c) => s + (c.qtd_veiculos || 0), 0), [contratos])
  const semVeiculo = useMemo(() => contratos.filter(c => c.status === 'Ativo' && !c.qtd_veiculos).length, [contratos])

  const filtered = useMemo(() => {
    let list = contratos
    if (filterStatus !== 'Todos') list = list.filter(c => c.status === filterStatus)
    if (filterText) {
      const q = filterText.toLowerCase()
      list = list.filter(c =>
        c.nome_cliente?.toLowerCase().includes(q) ||
        c.empresa_sigla?.toLowerCase().includes(q) ||
        c.cidade_operacao?.toLowerCase().includes(q) ||
        c.placas?.some(p => p.toLowerCase().includes(q)) ||
        String(c.id).includes(q)
      )
    }
    return list
  }, [contratos, filterStatus, filterText])

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await deletarContrato(confirmDel.id)
      toast.success(`Contrato #${confirmDel.id} excluído`)
      setConfirmDel(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao excluir contrato')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-g-850 border border-g-800">
            <FileText className="w-5 h-5 text-g-400" />
          </div>
          <div>
            <h1 className="text-g-50 font-bold text-xl leading-tight">Contratos</h1>
            <p className="text-g-600 text-xs mt-0.5">Administração de contratos de locação por empresa</p>
          </div>
        </div>
        <button
          onClick={() => setModalNovo(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> Novo Contrato
        </button>
      </div>

      {/* Aviso contratos sem veículo */}
      {semVeiculo > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/25 text-amber-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="text-sm">
            <span className="font-bold">{semVeiculo} contrato{semVeiculo !== 1 ? 's' : ''} ativo{semVeiculo !== 1 ? 's' : ''}</span> sem veículos vinculados.
            Edite-{semVeiculo !== 1 ? 'os' : 'o'} para corrigir.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={FileText}  label="Contratos Ativos"    value={ativos}     accent="#22c55e" sub={`${encerrados} encerrado${encerrados !== 1 ? 's' : ''}`} />
        <KpiCard icon={Truck}     label="Veículos em Locação" value={ativosVeic} accent="#6366f1" sub="em contratos ativos" />
        <KpiCard icon={Building2} label="Empresas"            value={[...new Set(contratos.map(c => c.empresa_sigla).filter(Boolean))].length} accent="#f59e0b" />
        <KpiCard icon={Receipt}   label="Total de Contratos"  value={contratos.length} accent="#94a3b8" />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
          <input
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder="Buscar por cliente, empresa, placa…"
            className="w-full pl-8 pr-8 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
          />
          {filterText && (
            <button onClick={() => setFilterText('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-g-600 hover:text-g-400">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {STATUS_LIST.map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              filterStatus === s ? 'bg-g-700 text-g-100 border-g-600' : 'bg-g-900 text-g-600 border-g-800 hover:border-g-700 hover:text-g-400'
            }`}
          >{s}</button>
        ))}
        <span className="text-g-700 text-xs ml-auto">
          {filtered.length} contrato{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-g-600 py-16">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando contratos…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-g-700 py-16 text-sm">Nenhum contrato encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-g-850 border-b border-g-800">
                <tr>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-16">NºCT</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-16">Empresa</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Cliente</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-20">Status</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-20">Assinatura</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-16">Pgto</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Veículos</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-28">Início</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-28">Prev. Enc.</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-28">Encerrado em</th>
                  <th className="px-3 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold w-20">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const semVeic = !c.qtd_veiculos && c.status === 'Ativo'
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-g-800/60 hover:bg-g-900/60 transition-colors cursor-pointer text-left"
                      onClick={() => setModalDetail(c)}
                    >
                      {/* NºCT */}
                      <td className="px-3 py-3">
                        <span className="text-g-400 text-xs font-mono font-semibold">{c.id}</span>
                      </td>
                      {/* Empresa */}
                      <td className="px-3 py-3">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-g-800 text-g-300">{c.empresa_sigla}</span>
                      </td>
                      {/* Cliente */}
                      <td className="px-3 py-3">
                        <p className="text-g-100 font-semibold text-sm leading-snug">{c.nome_cliente}</p>
                        {c.cidade_operacao && (
                          <p className="text-g-700 text-[10px] mt-0.5">
                            {c.cidade_operacao}{c.estado_operacao ? ` · ${c.estado_operacao}` : ''}
                          </p>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-3 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      {/* Assinatura */}
                      <td className="px-3 py-3">
                        {c.assinado
                          ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">✓ Assinado</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400">⚠ Pendente</span>
                        }
                      </td>
                      {/* Pgto */}
                      <td className="px-3 py-3">
                        <PgtoBadge forma={c.forma_pagamento} />
                      </td>
                      {/* Veículos */}
                      <td className="px-3 py-3">
                        {semVeic ? (
                          <div className="flex items-center gap-1 text-amber-500">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span className="text-[10px] font-semibold">Sem veículos</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-wrap">
                            {c.placas?.slice(0, 3).map(p => (
                              <span key={p} className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-g-850 border border-g-800 text-g-400">{p}</span>
                            ))}
                            {(c.placas?.length || 0) > 3 && (
                              <span className="text-g-600 text-[10px] font-semibold">+{c.placas.length - 3}</span>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Início */}
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs text-g-400">{dateBR(c.data_inicio)}</span>
                      </td>
                      {/* Prev. Enc. */}
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs text-g-400">{dateBR(c.data_fim)}</span>
                          {c.status === 'Ativo' && <DaysChip days={c.dias_restantes} />}
                        </div>
                      </td>
                      {/* Encerrado em */}
                      <td className="px-3 py-3">
                        {c.status !== 'Ativo'
                          ? <span className="font-mono text-xs text-g-500">{dateBR(c.data_encerramento)}</span>
                          : <span className="text-g-800 text-xs">—</span>
                        }
                      </td>
                      {/* Ações */}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => setModalEdit(c)} title="Editar"
                            className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors">
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button onClick={() => setConfirmDel(c)} title="Excluir"
                            className="p-1.5 rounded-lg text-g-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modais */}
      {modalNovo && <ContratoFormModal onClose={() => setModalNovo(false)} onSaved={() => { setModalNovo(false); load() }} />}
      {modalEdit && <ContratoFormModal contrato={modalEdit} onClose={() => setModalEdit(null)} onSaved={() => { setModalEdit(null); load() }} />}
      {modalDetail && <ContratoDetailModal contrato={modalDetail} onClose={() => setModalDetail(null)} onEdit={c => { setModalDetail(null); setModalEdit(c) }} />}

      {/* Confirmar exclusão */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-g-50 font-bold">Excluir contrato?</h3>
                <p className="text-g-500 text-sm">{confirmDel.id} · {confirmDel.nome_cliente}</p>
              </div>
            </div>
            <p className="text-g-400 text-sm leading-relaxed">
              Esta ação é irreversível. Contratos com faturas vinculadas não podem ser excluídos — encerre-os ao invés disso.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 transition-colors">Cancelar</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2">
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
