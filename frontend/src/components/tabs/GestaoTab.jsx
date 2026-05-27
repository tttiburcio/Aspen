import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import html2pdf from 'html2pdf.js'
import toast from 'react-hot-toast'
import { dbListOs, dbAtualizarOs, dbDeletarOs } from '../../utils/api'
import MergeOsModal from '../modals/MergeOsModal'
import { brl, dateBR, num } from '../../utils/format'
import { diasParados, applyFilterSort } from '../../utils/maintenanceHelpers'
import { useCompanies } from '../../contexts/CompanyContext'
import StatusBadge from '../maintenance/StatusBadge'
import AbrirOsModal from '../modals/AbrirOsModal'
import FinalizarOsModal from '../modals/FinalizarOsModal'
import DetalhesOsModal from '../modals/DetalhesOsModal'
import EmptyState from '../EmptyState'
import Skeleton from '../Skeleton'
import {
  Clock, AlertCircle, CreditCard, CheckCircle, Plus, Search, X,
  Loader2, Truck, FileText, Printer, Pencil, Trash2, GitMerge,
} from 'lucide-react'

function getFornecedoresUnicos(os) {
  if (!os.notas_fiscais?.length) return os.fornecedor || '—'
  const forns = new Set(os.notas_fiscais.map(nf => nf.fornecedor).filter(Boolean))
  return forns.size === 0 ? os.fornecedor || '—' : Array.from(forns).join(' / ')
}

export default function GestaoTab({ year }) {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [abertas, setAbertas] = useState([])
  const [finalizadas, setFinalizadas] = useState([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState('em_andamento')
  const [modalAbrir, setModalAbrir] = useState(false)
  const [modalFin, setModalFin] = useState(null)
  const [modalEdit, setModalEdit] = useState(null)
  const [modalDetalhe, setModalDetalhe] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [filterAberta, setFilterAberta] = useState('')
  const [filterFin, setFilterFin] = useState('')
  const [sortAberta, setSortAberta] = useState({ col: 'data_entrada', dir: 'desc' })
  const [sortFin, setSortFin] = useState({ col: 'data_execucao', dir: 'desc' })
  const [filterTipo, setFilterTipo] = useState('todos')
  const [modalMerge, setModalMerge] = useState(false)
  const [dossieOpen, setDossieOpen] = useState(false)
  const [dossiePlaca, setDossiePlaca] = useState('')
  const [isDossieGenerating, setIsDossieGenerating] = useState(false)
  const dossieRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await dbListOs(null, null, empresa)
      setAbertas(all.filter(o => o.status_os !== 'finalizada'))
      setFinalizadas(all.filter(o => o.status_os === 'finalizada'))
    } finally {
      setLoading(false)
    }
  }, [empresa])

  useEffect(() => { load() }, [load])

  const handleSaved = () => {
    setModalAbrir(false)
    setModalFin(null)
    setModalEdit(null)
    setModalDetalhe(null)
    load()
  }

  const handleStatusChange = async (os, newStatus) => {
    await dbAtualizarOs(os.id, { status_os: newStatus })
    load()
  }

  const handleDelete = async (id) => {
    try {
      await dbDeletarOs(id)
      setConfirmDel(null)
      toast.success('OS excluída com sucesso!')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao excluir OS')
      setConfirmDel(null)
    }
  }

  const sortAbertaBy = col => setSortAberta(s => s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : { col: null, dir: 'asc' })
  const sortFinBy = col => setSortFin(s => s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : { col: null, dir: 'asc' })

  // OS em andamento são exibidas sempre, independente do ano selecionado,
  // pois são ordens ativas em curso. O filtro de ano só faz sentido para finalizadas.
  const abertasDoAno = useMemo(() => abertas, [abertas])

  const emAndamento = abertasDoAno.filter(o => o.status_os === 'em_andamento')
  const aguardando = abertasDoAno.filter(o => o.status_os === 'aguardando_peca')
  const agNf = abertasDoAno.filter(o => o.status_os === 'executado_aguardando_nf')
  const todasAbertas = abertasDoAno

  const withDisplay = list => list.map(o => {
    const allParcelas = (o.notas_fiscais || []).flatMap(nf => nf.parcelas || [])
    const boletosUnicos = []
    const mapaBoletos = {}
    allParcelas.forEach(p => {
      if (p.data_vencimento) {
        if (!mapaBoletos[p.data_vencimento]) {
          mapaBoletos[p.data_vencimento] = []
          boletosUnicos.push(mapaBoletos[p.data_vencimento])
        }
        mapaBoletos[p.data_vencimento].push(p)
      } else {
        boletosUnicos.push([p])
      }
    })
    const totalParcelas = boletosUnicos.length
    const pagas = boletosUnicos.filter(grupo => grupo.every(p => p.status_pagamento === 'Pago')).length
    return {
      ...o,
      _sistema: [...new Set((o.itens || []).map(i => i.sistema).filter(Boolean))].join(' · ') || '',
      _servico: [...new Set((o.itens || []).map(i => i.servico).filter(Boolean))].join(' · ') || '',
      _categorias: [...new Set((o.itens || []).map(i => (i.categoria || '').toLowerCase()).filter(Boolean))],
      _sistemas: [...new Set((o.itens || []).map(i => (i.sistema || '').toLowerCase()).filter(Boolean))],
      _totalNfs: (o.notas_fiscais || []).reduce((s, nf) => s + (nf.valor_total_nf || 0), 0),
      _allParcelas: allParcelas,
      _totalParcelas: totalParcelas,
      _pagas: pagas,
    }
  })

  const applyTipoFilter = list => list.filter(o => {
    if (filterTipo === 'todos') return true
    if (filterTipo === 'implemento') return o._sistemas.some(s => s === 'implemento')
    return o._categorias.includes(filterTipo)
  })

  const filteredAbertas = useMemo(() =>
    applyTipoFilter(applyFilterSort(withDisplay(todasAbertas), filterAberta, sortAberta, ['placa', 'fornecedor', 'status_os', 'modelo', '_sistema', '_servico'])),
    [todasAbertas, filterAberta, sortAberta, filterTipo]
  )

  const finalizadasDoAno = useMemo(() => {
    if (!year) return finalizadas
    return finalizadas.filter(o => {
      const dateStr = o.data_execucao || o.data_entrada || o.criado_em || (o.notas_fiscais?.[0]?.data_emissao)
      if (!dateStr) return true
      return new Date(dateStr).getFullYear() === parseInt(year)
    })
  }, [finalizadas, year])

  const filteredFin = useMemo(() => {
    return applyTipoFilter(applyFilterSort(withDisplay(finalizadasDoAno), filterFin, sortFin, ['placa', 'fornecedor', 'modelo', '_sistema', '_servico', 'numero_os']))
  }, [finalizadasDoAno, filterFin, sortFin, filterTipo])

  const allPlacas = useMemo(() =>
    [...new Set([...abertas, ...finalizadas].map(o => o.placa).filter(Boolean))].sort(),
    [abertas, finalizadas]
  )

  const handleDossie = async () => {
    if (!dossiePlaca) return
    setIsDossieGenerating(true)
    try {
      await html2pdf().set({
        margin: [10, 10],
        filename: `Dossie_${dossiePlaca}_${year || 'Todos'}.pdf`,
        image: { type: 'png' },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(dossieRef.current).save()
    } finally {
      setIsDossieGenerating(false)
      setDossieOpen(false)
    }
  }

  const { resolveNome, empColor } = useCompanies()

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Em andamento</p>
            <p className="text-g-200 font-bold text-xl">{emAndamento.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Aguardando peça</p>
            <p className="text-g-200 font-bold text-xl">{aguardando.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
            <CreditCard className="w-4 h-4 text-purple-600" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Aguardando NF</p>
            <p className="text-g-200 font-bold text-xl">{agNf.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Finalizadas (total)</p>
            <p className="text-g-200 font-bold text-xl">{finalizadasDoAno.length}</p>
          </div>
        </div>
      </div>

      {/* Sub-tabs + botões de ação */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-g-850 border border-g-800 rounded-xl p-1">
          {[
            { key: 'em_andamento', label: `Em andamento (${todasAbertas.length})` },
            { key: 'finalizadas', label: `Finalizadas (${finalizadasDoAno.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${subTab === t.key
                  ? 'bg-white shadow-sm text-g-200 border border-g-800'
                  : 'text-g-600 hover:text-g-400'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalMerge(true)}
            className="p-2 text-g-700 hover:text-g-400 hover:bg-g-850 rounded-lg transition-colors"
            title="Verificar OS duplicadas"
          >
            <GitMerge className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDossieOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-g-850 border border-g-800 text-g-300 rounded-lg text-sm font-medium hover:bg-g-800 hover:text-g-100 transition-colors"
          >
            <FileText className="w-4 h-4" /> Dossiê por Placa
          </button>
          {subTab === 'em_andamento' && (
            <button
              onClick={() => setModalAbrir(true)}
              className="flex items-center gap-2 px-4 py-2 bg-g-100 text-white rounded-lg text-sm font-medium hover:bg-g-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova OS
            </button>
          )}
        </div>
      </div>

      {/* Filtro por tipo de item */}
      <div className="flex gap-1 bg-g-850 border border-g-800 rounded-xl p-1 self-start">
        {[
          { key: 'todos', label: 'Todos' },
          { key: 'serviço', label: 'Serviço' },
          { key: 'compra', label: 'Compra' },
          { key: 'implemento', label: 'Implemento' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilterTipo(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterTipo === t.key
              ? 'bg-white shadow-sm text-g-200 border border-g-800'
              : 'text-g-600 hover:text-g-400'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* Tabela Em Andamento */}
      {subTab === 'em_andamento' && (
        <>
          <div className="flex items-center gap-3 relative">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
              <input
                value={filterAberta}
                onChange={e => setFilterAberta(e.target.value)}
                placeholder="Filtrar por placa, fornecedor, status, modelo, sistema, serviço…"
                className="w-full pl-9 pr-9 py-2 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"
              />
              {filterAberta && (
                <button onClick={() => setFilterAberta('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-g-600 hover:text-g-400" />
                </button>
              )}
            </div>
            <select
              value={`${sortAberta.col || 'data_entrada'}-${sortAberta.dir}`}
              onChange={e => {
                const [col, dir] = e.target.value.split('-');
                setSortAberta({ col, dir });
              }}
              className="w-48 px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-100 transition-colors cursor-pointer"
            >
              <option value="data_entrada-desc">Mais recentes</option>
              <option value="data_entrada-asc">Mais antigas</option>
              <option value="placa-asc">Placa (A-Z)</option>
              <option value="status_os-asc">Status</option>
            </select>
          </div>
          <div>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="border-l-4 border-g-800 rounded-xl bg-g-900/20 p-6 flex flex-col gap-5">
                    <div className="flex items-start justify-between pb-3 border-b border-g-800">
                      <div>
                        <Skeleton className="w-24 h-6 mb-2" />
                        <Skeleton className="w-32 h-3" />
                      </div>
                      <Skeleton className="w-20 h-5 rounded-md" />
                    </div>
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="w-full h-14 rounded-lg" />
                        <Skeleton className="w-full h-14 rounded-lg" />
                      </div>
                      <Skeleton className="w-full h-10" />
                      <Skeleton className="w-full h-10" />
                    </div>
                  </div>
                ))}
              </div>
            ) : todasAbertas.length === 0 ? (
              <EmptyState 
                icon={Truck}
                title="Nenhuma OS em andamento"
                message="Você não tem nenhuma ordem de serviço aberta no momento."
                action={
                  <button onClick={() => setModalAbrir(true)} className="px-4 py-2 bg-g-100 text-white rounded-lg text-sm font-medium hover:bg-g-50 transition-colors">
                    Abrir Nova OS
                  </button>
                }
              />
            ) : filteredAbertas.length === 0 ? (
              <EmptyState 
                icon={Search}
                title="Nenhum resultado"
                message={`Sua busca por "${filterAberta}" não encontrou nenhuma ordem de serviço.`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {filteredAbertas.map(o => {
                  const dias = o.indisponivel && o.data_entrada ? diasParados(o.data_entrada) : null;
                  const borderCol = o.status_os === 'aguardando_peca' ? 'border-orange-500' :
                    o.status_os === 'executado_aguardando_nf' ? 'border-purple-500' :
                      'border-amber-500';

                  return (
                    <div
                      key={o.id}
                      onClick={() => setModalDetalhe(o)}
                      className={`border-l-4 ${borderCol} rounded-xl bg-white shadow-sm hover:shadow-md transition-all cursor-pointer p-6 flex flex-col gap-5 relative group`}
                    >
                      <div className="flex items-start justify-between pb-3 border-b border-g-800">
                        <div>
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className="font-mono font-bold text-g-100 text-xl tracking-tight">{o.placa}</span>
                            <span className="text-g-500 text-[10px] px-2 py-0.5 bg-g-900 rounded-md border border-g-800 font-mono uppercase font-bold">
                              {o.numero_os || 'Sem OS'}
                            </span>
                          </div>
                          <span className="text-g-500 text-xs font-semibold uppercase tracking-wider">{o.modelo || 'Sem modelo'}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusBadge status={o.status_os} />
                          {dias !== null && (
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${dias > 30 ? 'text-red-500' : dias > 7 ? 'text-amber-600' : 'text-g-500'}`}>
                              {dias} dias na oficina
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-g-950/30 p-3 rounded-lg border border-g-900/50">
                            <span className="block text-g-600 text-[10px] uppercase font-bold mb-1 tracking-widest">Entrada</span>
                            <span className="text-g-200 text-sm font-medium">{dateBR(o.data_entrada) || '—'}</span>
                          </div>
                          <div className="bg-g-950/30 p-3 rounded-lg border border-g-900/50">
                            <span className="block text-g-600 text-[10px] uppercase font-bold mb-1 tracking-widest">Mecânico</span>
                            <span className="text-g-200 text-sm font-medium truncate block">{o.responsavel_tec || 'Não definido'}</span>
                          </div>
                        </div>

                        <div>
                          <span className="block text-g-600 text-[10px] uppercase font-bold mb-1 tracking-widest">Fornecedores</span>
                          <span className="text-g-300 text-sm font-medium truncate block" title={getFornecedoresUnicos(o)}>{getFornecedoresUnicos(o)}</span>
                        </div>

                        <div>
                          <span className="block text-g-600 text-[10px] uppercase font-bold mb-1 tracking-widest">Serviço Principal</span>
                          <div className="text-g-400 text-sm line-clamp-2 leading-relaxed" title={`${o._sistema || ''} - ${o._servico || ''}`}>
                            {o._sistema && <span className="text-g-200 font-semibold">{o._sistema}</span>}
                            {o._servico && <span className="text-g-500 text-xs"> · {o._servico}</span>}
                            {!o._sistema && !o._servico && <span className="text-g-700 italic text-xs">Não informado</span>}
                          </div>
                        </div>

                        {(o.km || o.prox_km) && (
                          <div className="flex items-center gap-3 pt-1">
                            {o.km && <span className="text-xs font-mono text-g-500 border border-g-800 px-2 py-0.5 rounded font-bold">KM {num(o.km)}</span>}
                            {o.prox_km && <span className="text-xs font-mono text-blue-500 border border-blue-200 px-2 py-0.5 rounded bg-blue-50 font-bold">Próx: {num(o.prox_km)}</span>}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-g-800 pt-3 mt-1" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {o.status_os === 'em_andamento' && (
                            <button
                              onClick={() => handleStatusChange(o, 'aguardando_peca')}
                              title="Aguardando peça"
                              className="px-2.5 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors"
                            >
                              Ag. peça
                            </button>
                          )}
                          {o.status_os === 'aguardando_peca' && (
                            <button
                              onClick={() => handleStatusChange(o, 'em_andamento')}
                              title="Retomar andamento"
                              className="px-2.5 py-1.5 text-xs font-semibold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                            >
                              Retomar
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setModalEdit(o)}
                            title="Editar OS"
                            className="p-2 text-g-500 bg-g-900 border border-g-800 hover:text-g-100 hover:bg-g-850 rounded-lg transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setModalFin(o)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors border border-emerald-500 shadow-sm"
                          >
                            Finalizar
                          </button>
                          <button
                            onClick={() => setConfirmDel(o.id)}
                            className="p-2 text-g-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tabela Finalizadas */}
      {subTab === 'finalizadas' && (
        <>
          <div className="flex items-center gap-3 relative">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
              <input
                value={filterFin}
                onChange={e => setFilterFin(e.target.value)}
                placeholder="Filtrar por placa, fornecedor, modelo, sistema, serviço, nº OS…"
                className="w-full pl-9 pr-9 py-2 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"
              />
              {filterFin && (
                <button onClick={() => setFilterFin('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-g-600 hover:text-g-400" />
                </button>
              )}
            </div>
            <select
              value={`${sortFin.col || 'data_execucao'}-${sortFin.dir}`}
              onChange={e => {
                const [col, dir] = e.target.value.split('-');
                setSortFin({ col, dir });
              }}
              className="w-48 px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-100 transition-colors cursor-pointer"
            >
              <option value="data_execucao-desc">Mais recentes</option>
              <option value="data_execucao-asc">Mais antigas</option>
              <option value="placa-asc">Placa (A-Z)</option>
              <option value="_totalNfs-desc">Maior valor</option>
              <option value="_totalNfs-asc">Menor valor</option>
            </select>
          </div>
          <div>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="rounded-xl bg-white shadow-md p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Skeleton className="w-24 h-6 mb-2 bg-g-200" />
                        <Skeleton className="w-32 h-3 bg-g-200" />
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Skeleton className="w-20 h-6 bg-g-200" />
                        <Skeleton className="w-16 h-3 bg-g-200" />
                      </div>
                    </div>
                    <Skeleton className="w-full h-px bg-g-200 my-2" />
                    <Skeleton className="w-24 h-3 bg-g-200" />
                    <Skeleton className="w-full h-8 bg-g-200" />
                    <Skeleton className="w-full h-4 bg-g-200 mt-2" />
                  </div>
                ))}
              </div>
            ) : finalizadas.length === 0 ? (
              <EmptyState 
                icon={CheckCircle}
                title="Nenhuma OS finalizada"
                message="Nenhuma ordem de serviço foi finalizada no sistema ainda."
              />
            ) : filteredFin.length === 0 ? (
              <EmptyState 
                icon={Search}
                title="Nenhum resultado"
                message={`Sua busca por "${filterFin}" não encontrou nenhuma ordem de serviço finalizada.`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {filteredFin.map(o => {
                  const dias = o.indisponivel && o.data_entrada && o.data_execucao ? diasParados(o.data_entrada, o.data_execucao) : null
                  const totalParcelas = o._totalParcelas ?? 0
                  const pagas = o._pagas ?? 0
                  const pgtoProgresso = totalParcelas > 0 ? Math.round((pagas / totalParcelas) * 100) : 0
                  const pagoTotal = totalParcelas > 0 && pagas === totalParcelas
                  const pagoNenhum = pagas === 0 || totalParcelas === 0
                  const pagoParc = !pagoTotal && !pagoNenhum
                  const barTopColor = pagoTotal ? '#10b981' : pagoParc ? '#615cf6' : '#6b7280'
                  const pgBarFill = pagoTotal ? '#10b981' : pagoParc ? '#615cf6' : '#9ca3af'
                  const pgStatusLabel = pagoTotal ? 'Quitado' : pagoParc ? `${pagas} de ${totalParcelas} pagas` : 'Não pago'
                  const pgLabelStyle = pagoTotal
                    ? { color: '#10b981', background: 'rgba(16,185,129,0.1)' }
                    : pagoParc
                      ? { color: '#615cf6', background: 'rgba(139,92,246,0.1)' }
                      : { color: '#9ca3af', background: 'rgba(107,114,128,0.1)' }

                  const empresas = o.notas_fiscais
                    ? [...new Set(o.notas_fiscais.map(nf => resolveNome(nf.id_empresa)).filter(Boolean))]
                    : []

                  return (
                    <div
                      key={o.id}
                      onClick={() => setModalDetalhe(o)}
                      className="rounded-xl bg-white shadow-md hover:shadow-xl transition-all cursor-pointer flex flex-col overflow-hidden"
                      style={{ border: '1px solid rgba(0,0,0,0.07)' }}
                    >
                      <div style={{ height: '5px', background: barTopColor, flexShrink: 0 }} />

                      <div className="px-5 pt-4 pb-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono font-extrabold text-g-100" style={{ fontSize: '1.2rem', letterSpacing: '-0.02em' }}>{o.placa}</span>
                              <span className="text-g-600 font-mono text-[10px] font-bold uppercase tracking-wider">
                                {o.numero_os || ''}
                              </span>
                            </div>
                            <span className="text-g-500 text-[10px] font-semibold uppercase tracking-widest">{o.modelo || 'Sem modelo'}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-extrabold text-g-100 text-base">{brl(o._totalNfs)}</div>
                            <div className="text-g-600 text-xs mt-0.5">{dateBR(o.data_execucao) || '—'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap mt-2">
                          {empresas.length > 0
                            ? empresas.map(emp => (
                              <span key={emp} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: empColor(emp), letterSpacing: '0.04em' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: empColor(emp), display: 'inline-block', flexShrink: 0 }} />
                                {emp}
                              </span>
                            ))
                            : <span className="text-g-700 text-xs">—</span>
                          }
                        </div>
                      </div>

                      <div style={{ height: '1px', background: 'rgba(0,0,0,0.06)', margin: '0 20px' }} />

                      <div className="px-5 py-3 flex flex-col gap-2.5 flex-1">
                        <div>
                          <div className="text-g-600 text-[10px] font-bold uppercase tracking-widest mb-1">Fornecedor</div>
                          <div className="text-g-300 text-sm font-medium truncate" title={getFornecedoresUnicos(o)}>{getFornecedoresUnicos(o)}</div>
                        </div>

                        <div>
                          <div className="text-g-600 text-[10px] font-bold uppercase tracking-widest mb-1">Serviço</div>
                          <div className="text-g-400 text-sm line-clamp-2 leading-relaxed">
                            {o._sistema && <span className="text-g-200 font-semibold">{o._sistema}</span>}
                            {o._servico && <span className="text-g-500 text-xs"> · {o._servico}</span>}
                            {!o._sistema && !o._servico && <span className="text-g-700 italic text-xs">Não informado</span>}
                          </div>
                        </div>

                        {(o.km || dias !== null) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {o.km && (
                              <span className="text-xs font-mono text-g-500 border border-g-800 px-2 py-0.5 rounded">{num(o.km)} km</span>
                            )}
                            {dias !== null && (
                              <span className="text-xs text-g-600 border border-g-800 px-2 py-0.5 rounded">{dias}d na oficina</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="px-5 pb-4 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold text-g-500 uppercase tracking-widest">Pagamento</span>
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={pgLabelStyle}>{pgStatusLabel}</span>
                        </div>
                        <div style={{ height: '5px', background: 'rgba(0,0,0,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pgtoProgresso}%`, height: '100%', background: pgBarFill, borderRadius: '999px', transition: 'width 0.5s ease' }} />
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-2.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setModalEdit(o)} title="Editar" className="p-1.5 text-g-600 hover:text-g-300 rounded-lg hover:bg-g-900 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setConfirmDel(o.id)} className="p-1.5 text-g-700 hover:text-red-500 rounded-lg hover:bg-red-50/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal confirmação exclusão */}
      {confirmDel && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-g-900 border border-g-800 rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 animate-fade-up">
            <p className="text-g-200 font-semibold mb-2">Excluir OS?</p>
            <p className="text-g-600 text-sm mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850">Cancelar</button>
              <button onClick={() => handleDelete(confirmDel)} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">Excluir</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {modalAbrir && (
        <AbrirOsModal onClose={() => setModalAbrir(false)} onSaved={handleSaved} />
      )}
      {modalFin && (
        <FinalizarOsModal os={modalFin} onClose={() => setModalFin(null)} onSaved={handleSaved} />
      )}
      {modalEdit && modalEdit.status_os === 'finalizada' ? (
        <FinalizarOsModal os={modalEdit} onClose={() => setModalEdit(null)} onSaved={handleSaved} editMode={true} />
      ) : modalEdit ? (
        <AbrirOsModal os={modalEdit} onClose={() => setModalEdit(null)} onSaved={handleSaved} />
      ) : null}

      {modalDetalhe && (
        <DetalhesOsModal manutencao={modalDetalhe} onClose={() => setModalDetalhe(null)} onDeleted={() => { setModalDetalhe(null); load() }} />
      )}

      {modalMerge && (
        <MergeOsModal onClose={() => setModalMerge(false)} onMerged={() => { load(); }} />
      )}

      {/* Modal Dossiê por Placa */}
      {dossieOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-g-100 font-bold text-base">Dossiê por Placa</p>
                <p className="text-g-600 text-xs mt-0.5">Relatório completo de manutenções{year ? ` — ${year}` : ''}</p>
              </div>
              <button onClick={() => setDossieOpen(false)} className="p-1.5 text-g-600 hover:text-g-300 rounded-lg hover:bg-g-850">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <select
                value={dossiePlaca}
                onChange={e => setDossiePlaca(e.target.value)}
                className="w-full px-3 py-2.5 bg-g-850 border border-g-800 rounded-lg text-g-200 text-sm focus:outline-none focus:border-g-100"
              >
                <option value="">Selecione uma placa…</option>
                {allPlacas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={handleDossie}
                disabled={!dossiePlaca || isDossieGenerating}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-g-100 text-white rounded-lg text-sm font-bold hover:bg-g-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDossieGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando…</> : <><Printer className="w-4 h-4" /> Gerar PDF</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Template oculto do Dossiê */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={dossieRef} style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#1a1a1a', background: '#fff', padding: '20px', width: '794px' }}>
          <div style={{ borderBottom: '2px solid #0f4a27', paddingBottom: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f4a27', margin: 0 }}>Dossiê de Manutenções</h1>
                <p style={{ color: '#555', fontSize: '12px', margin: '4px 0 0' }}>Placa: <strong>{dossiePlaca}</strong>{year ? ` · Período: ${year}` : ''}</p>
              </div>
              <p style={{ color: '#888', fontSize: '10px', textAlign: 'right', margin: 0 }}>
                Gerado em {new Date().toLocaleString('pt-BR')}<br />
                Total de OS: {[...abertas, ...finalizadas].filter(o => o.placa === dossiePlaca).length}
              </p>
            </div>
          </div>

          {[...abertas, ...finalizadas]
            .filter(o => o.placa === dossiePlaca)
            .sort((a, b) => {
              const da = a.data_execucao || a.data_entrada || ''
              const db2 = b.data_execucao || b.data_entrada || ''
              return db2.localeCompare(da)
            })
            .map((o, idx) => {
              const totalNfs = (o.notas_fiscais || []).reduce((s, nf) => s + (nf.valor_total_nf || 0), 0)
              return (
                <div key={o.id} style={{ marginBottom: '24px', pageBreakInside: 'avoid', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ background: '#f0fdf4', borderBottom: '1px solid #d1fae5', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#065f46' }}>OS #{o.numero_os || 'S/N'}</span>
                      <span style={{ color: '#6b7280', fontSize: '11px', marginLeft: '10px' }}>{o.modelo || ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#374151' }}>
                      <span>Status: <strong>{o.status_os || '—'}</strong></span>
                      {o.data_entrada && <span>Entrada: <strong>{dateBR(o.data_entrada)}</strong></span>}
                      {o.data_execucao && <span>Execução: <strong>{dateBR(o.data_execucao)}</strong></span>}
                      {totalNfs > 0 && <span style={{ color: '#065f46', fontWeight: 'bold' }}>Total: {brl(totalNfs)}</span>}
                    </div>
                  </div>

                  <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '10px' }}>
                      {o.fornecedor && <div><span style={{ color: '#6b7280', display: 'block' }}>Fornecedor</span><strong>{o.fornecedor}</strong></div>}
                      {o.responsavel_tec && <div><span style={{ color: '#6b7280', display: 'block' }}>Mecânico</span><strong>{o.responsavel_tec}</strong></div>}
                      {o.km && <div><span style={{ color: '#6b7280', display: 'block' }}>KM</span><strong>{num(o.km)}</strong></div>}
                      {o.prox_km && <div><span style={{ color: '#6b7280', display: 'block' }}>Próx. KM</span><strong>{num(o.prox_km)}</strong></div>}
                    </div>

                    {(o.itens || []).length > 0 && (
                      <div>
                        <p style={{ fontWeight: 'bold', fontSize: '10px', color: '#374151', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Itens / Serviços</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb' }}>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Categoria</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Sistema</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Serviço</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Descrição</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'center' }}>Qtd</th>
                            </tr>
                          </thead>
                          <tbody>
                            {o.itens.map((it, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{it.categoria || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{it.sistema || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{it.servico || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{it.descricao || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'center' }}>{it.qtd_itens || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {(o.notas_fiscais || []).length > 0 && (
                      <div>
                        <p style={{ fontWeight: 'bold', fontSize: '10px', color: '#374151', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas Fiscais</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb' }}>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Nº NF</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Fornecedor</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Emissão</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Valor</th>
                              <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Tipo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {o.notas_fiscais.map((nf, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{nf.numero_nf || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{nf.fornecedor || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{dateBR(nf.data_emissao) || '—'}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>{brl(nf.valor_total_nf)}</td>
                                <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{nf.tipo_nf || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {o.notas_fiscais.some(nf => (nf.parcelas || []).length > 0) && (
                          <div style={{ marginTop: '6px' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '10px', color: '#374151', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parcelas</p>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                              <thead>
                                <tr style={{ background: '#f9fafb' }}>
                                  <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>NF</th>
                                  <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Vencimento</th>
                                  <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>Valor</th>
                                  <th style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'left' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.notas_fiscais.flatMap((nf, ni) =>
                                  (nf.parcelas || []).map((p, pi) => (
                                    <tr key={`${ni}-${pi}`} style={{ background: (ni + pi) % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                      <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{nf.numero_nf || '—'}</td>
                                      <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px' }}>{dateBR(p.data_vencimento) || '—'}</td>
                                      <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px', textAlign: 'right' }}>{brl(p.valor_parcela)}</td>
                                      <td style={{ border: '1px solid #e5e7eb', padding: '4px 6px', color: p.status_pagamento === 'Pago' ? '#065f46' : '#b91c1c', fontWeight: 'bold' }}>{p.status_pagamento || '—'}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {o.observacoes && (
                      <div>
                        <p style={{ fontWeight: 'bold', fontSize: '10px', color: '#374151', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações</p>
                        <p style={{ fontSize: '10px', color: '#4b5563', background: '#f9fafb', padding: '6px 8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>{o.observacoes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
