import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import html2pdf from 'html2pdf.js'
import toast from 'react-hot-toast'
import { dbListParcelas, dbListOs, dbAtualizarParcela, dbCriarParcelaNf } from '../../utils/api'
import { brl, dateBR, shortenProviderName } from '../../utils/format'
import { statusFinanceiro } from '../../utils/financialCalcs'
import { useCompanies } from '../../contexts/CompanyContext'
import { MONTHS_BR } from '../../constants/maintenanceStatus'
import FinBadge from '../maintenance/FinBadge'
import AlertContasDiaModal from '../modals/AlertContasDiaModal'
import ProrrogarParcelaModal from '../modals/ProrrogarParcelaModal'
import DetalheParcelaModal from '../modals/DetalheParcelaModal'
import EmptyState from '../EmptyState'
import Skeleton from '../Skeleton'
import {
  CreditCard, AlertCircle, Bell, CheckCircle, Search, X,
  ChevronDown, ChevronUp, AlertTriangle, CalendarClock,
  Loader2, Printer, FileText,
} from 'lucide-react'

export default function FinanceiroTab({ year, alertDismissed, onAlertDismiss }) {
  const { resolveNome, selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined
  const [parcelas, setParcelas] = useState([])
  const [osList, setOsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('notas')
  const [categoria, setCategoria] = useState('pendente')
  const [alertVisible, setAlertVisible] = useState(false)
  const [modalProrrogar, setModalProrrogar] = useState(null)
  const [modalDetalhe, setModalDetalhe] = useState(null)
  const [filterText, setFilterText] = useState('')
  const [filterEmpresa, setFilterEmpresa] = useState('')
  const [filterDataDe, setFilterDataDe] = useState('')
  const [filterDataAte, setFilterDataAte] = useState('')
  const [sort, setSort] = useState({ col: 'data_vencimento', dir: 'asc' })
  const [expandedNfs, setExpandedNfs] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [showReportDropdown, setShowReportDropdown] = useState(false)
  const [showInstallmentsInReport, setShowInstallmentsInReport] = useState(true)
  const reportRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [parcelasReal, osListData] = await Promise.all([dbListParcelas(year, empresa), dbListOs(null, null, empresa)])
      const osList = osListData
      const anoSelecionado = year ? parseInt(year) : null
      const sinteticas = []

      for (const os of osList) {
        for (const nf of os.notas_fiscais || []) {
          if ((nf.parcelas || []).length > 0) continue
          if (!nf.valor_total_nf) continue
          // Filtra NF pela empresa selecionada (evita NFs de outra empresa em OS mistas)
          if (selectedCompany?.id !== 'grupo' && nf.id_empresa != null && nf.id_empresa !== selectedCompany?.id) continue
          const dataRef = nf.data_emissao || os.data_execucao
          if (anoSelecionado) {
            if (!dataRef) continue
            if (parseInt(String(dataRef).slice(0, 4)) !== anoSelecionado) continue
          }
          const descricao = (os.itens || [])
            .map(it => it.servico || it.sistema).filter(Boolean).join('; ') || null

          sinteticas.push({
            id: `nf-${nf.id}`,
            _isSintetica: true,
            nf_id: nf.id,
            manutencao_id: null,
            nota: nf.numero_nf,
            fornecedor: nf.fornecedor || os.fornecedor,
            fornecedor_os: os.fornecedor,
            valor_parcela: nf.valor_total_nf,
            valor_item_total: nf.valor_total_nf,
            valor_atualizado: null,
            data_vencimento: null,
            data_vencimento_original: null,
            status_pagamento: 'Pendente',
            prorrogada: false,
            placa: os.placa,
            modelo: os.modelo,
            empresa: nf.id_empresa ?? os.empresa,
            empresa_nome: null,
            id_contrato: os.id_contrato,
            id_ord_serv: os.numero_os,
            data_execucao: os.data_execucao,
            descricao,
            nf_ordem: null,
            parcela_atual: null,
            parcela_total: null,
            forma_pgto: null,
            isento_encargos: null, tipo_pgto_prorrogacao: null, chave_pix: null,
            multa_pct: null, juros_diario_pct: null, data_prevista_pagamento: null,
            dias_cartorio: null, sera_reembolsado: false, valor_reembolso: null,
            qtd_itens_reembolso: null, motivo_reembolso: null,
            contrato_nome: null, contrato_cidade: null, contrato_inicio: null,
            contrato_fim: null, contrato_status: null,
          })
        }
      }
      setOsList(osList)
      setParcelas([...parcelasReal, ...sinteticas])
    } finally {
      setLoading(false)
    }
  }, [year, empresa])

  useEffect(() => { load() }, [load])

  const enriched = useMemo(() =>
    parcelas.map(p => ({ ...p, _status: statusFinanceiro(p) })),
    [parcelas]
  )

  const empresas = useMemo(() => {
    const seen = new Map()
    enriched.forEach(p => {
      const cod = String(parseInt(parseFloat(p.empresa)))
      if (!isNaN(parseInt(cod)) && !seen.has(cod))
        seen.set(cod, resolveNome(p.empresa))
    })
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [enriched])

  const CATS = [
    { key: 'pendente', label: 'Pendentes' },
    { key: 'vence_hoje', label: 'Vencendo hoje' },
    { key: 'prorrogada', label: 'Prorrogadas' },
    { key: 'vencida', label: 'Vencidas' },
    { key: 'pago', label: 'Pagas' },
    { key: 'todas', label: 'Total' },
  ]

  const baseFiltered = useMemo(() => {
    let r = enriched
    if (filterEmpresa) {
      r = r.filter(p => {
        const cod = String(parseInt(parseFloat(p.empresa)))
        const sigla = resolveNome(p.empresa)
        return cod === filterEmpresa || sigla === filterEmpresa
      })
    }
    if (filterDataDe || filterDataAte) r = r.filter(p => {
      const dateStr = p.data_vencimento
      if (!dateStr) return false
      if (filterDataDe && dateStr < filterDataDe) return false
      if (filterDataAte && dateStr > filterDataAte) return false
      return true
    })
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      r = r.filter(p =>
        [p.placa, p.fornecedor, p.id_ord_serv, p.nota, p.modelo, p.empresa_nome, p.contrato_nome]
          .some(f => (f || '').toLowerCase().includes(q))
      )
    }
    return r
  }, [enriched, filterText, filterEmpresa, filterDataDe, filterDataAte])

  const filtered = useMemo(() => {
    let r = baseFiltered
    if (categoria !== 'todas') {
      r = r.filter(p => {
        if (categoria === 'pendente') return ['pendente', 'prorrogada', 'vencida', 'vence_hoje'].includes(p._status)
        return p._status === categoria
      })
    }
    if (sort.col) {
      const isDateStr = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
      r = [...r].sort((a, b) => {
        const av = a[sort.col] ?? '', bv = b[sort.col] ?? ''
        if (!isDateStr(av) && !isDateStr(bv)) {
          const an = parseFloat(av), bn = parseFloat(bv)
          if (!isNaN(an) && !isNaN(bn)) return sort.dir === 'asc' ? an - bn : bn - an
        }
        return sort.dir === 'asc'
          ? av.toString().localeCompare(bv.toString())
          : bv.toString().localeCompare(av.toString())
      })
    }
    return r
  }, [baseFiltered, categoria, sort])

  const nfFiltered = useMemo(() => {
    let r = enriched
    if (filterEmpresa) {
      r = r.filter(p => {
        const cod = String(parseInt(parseFloat(p.empresa)))
        const sigla = resolveNome(p.empresa)
        return cod === filterEmpresa || sigla === filterEmpresa
      })
    }
    if (filterDataDe || filterDataAte) r = r.filter(p => {
      const dateStr = p.data_vencimento
      if (!dateStr) return false
      if (filterDataDe && dateStr < filterDataDe) return false
      if (filterDataAte && dateStr > filterDataAte) return false
      return true
    })
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      r = r.filter(p =>
        [p.placa, p.fornecedor, p.id_ord_serv, p.nota, p.modelo, p.empresa_nome, p.contrato_nome]
          .some(f => (f || '').toLowerCase().includes(q))
      )
    }
    if (categoria !== 'todas') {
      r = r.filter(p => {
        if (categoria === 'pendente') return ['pendente', 'prorrogada', 'vencida', 'vence_hoje'].includes(p._status)
        return p._status === categoria
      })
    }
    return r
  }, [enriched, filterText, filterEmpresa, filterDataDe, filterDataAte, categoria])

  const venceHojeList = useMemo(() => baseFiltered.filter(p => p._status === 'vence_hoje' || p._status === 'vencida'), [baseFiltered])

  useEffect(() => {
    if (loading || alertDismissed) return
    const alertas = enriched.filter(p => p._status === 'vencida' || p._status === 'vence_hoje')
    if (alertas.length > 0) setAlertVisible(true)
  }, [loading, enriched, alertDismissed])

  const nfGroupsByMonth = useMemo(() => {
    const monthsMap = new Map()
    for (const p of nfFiltered) {
      const date = p.data_prevista_pagamento || p.data_vencimento
      const month = date ? parseInt(date.slice(5, 7)) : 0
      if (!monthsMap.has(month)) monthsMap.set(month, new Map())
      const monthGroup = monthsMap.get(month)
      const nfKey = `${p.nota || 'S/N'}|${p.fornecedor || 'Desconhecido'}`.toLowerCase()
      if (!monthGroup.has(nfKey)) {
        monthGroup.set(nfKey, {
          nfKey, numero_nf: p.nota, fornecedor: p.fornecedor,
          placas: new Set(), osList: new Set(), parcelas: [], sistemas: new Set(), month,
        })
      }
      const g = monthGroup.get(nfKey)
      g.parcelas.push(p)
      if (p.placa) g.placas.add(p.placa)
      if (p.id_ord_serv) g.osList.add(p.id_ord_serv)
      if (p.sistema) g.sistemas.add(p.sistema)
    }

    const result = []
    const sortedMonths = Array.from(monthsMap.keys()).sort((a, b) => a - b)
    for (const mIdx of sortedMonths) {
      const invoicesMap = monthsMap.get(mIdx)
      const invoices = Array.from(invoicesMap.values()).map(g => {
        const pList = g.parcelas
        const empresaNome = pList[0]?.empresa_nome || pList[0]?.empresa || 'Empresa não identificada'
        const hasVencida = pList.some(p => p._status === 'vencida')
        const hasVenceHoje = pList.some(p => p._status === 'vence_hoje')
        const hasProrrogada = pList.some(p => p._status === 'prorrogada')
        const globalNfParcelas = enriched.filter(p =>
          `${p.nota || 'S/N'}|${p.fornecedor || 'Desconhecido'}`.toLowerCase() === g.nfKey
        )
        const globalPago = globalNfParcelas.filter(p => p._status === 'pago').length
        const globalTotal = globalNfParcelas.length
        const allPagoGlobal = globalTotal > 0 && globalPago === globalTotal
        const maxParcelaTotal = globalNfParcelas.reduce((m, p) => Math.max(m, p.parcela_total || 0), 0)
        const uniqueVehicles = new Set(globalNfParcelas.map(p => p.placa).filter(Boolean)).size
        const pendentes = pList.filter(p => p._status !== 'pago').sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''))
        const nextPending = pendentes[0]
        const nextVencimento = nextPending ? nextPending.data_vencimento : pList[0]?.data_vencimento
        const nextValor = nextVencimento
          ? pendentes.filter(p => p.data_vencimento === nextVencimento).reduce((s, p) => s + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0)
          : 0
        return {
          ...g, placasList: Array.from(g.placas).sort(), osList: Array.from(g.osList).sort(),
          sistemasList: Array.from(g.sistemas).sort(), nextVencimento, nextValor,
          totalGeral: pList.reduce((s, p) => s + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0),
          countPago: globalPago, countTotal: globalTotal, allPago: allPagoGlobal,
          maxParcelaTotal, uniqueVehicles,
          empresa: empresaNome, hasVencida, hasVenceHoje, hasProrrogada
        }
      }).sort((a, b) => (a.nextVencimento || '').localeCompare(b.nextVencimento || ''))

      result.push({
        month: mIdx,
        monthName: mIdx ? MONTHS_BR[mIdx - 1] : 'Sem data',
        invoices,
        subtotal: invoices.reduce((s, inv) => s + inv.totalGeral, 0)
      })
    }
    return result
  }, [nfFiltered, enriched])

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const totalPendente = baseFiltered.filter(p => p._status !== 'pago').reduce((s, p) => s + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0)
  const totalVencidas = baseFiltered.filter(p => p._status === 'vencida').length
  const totalVenceHoje = venceHojeList.length
  const totalPago = baseFiltered.filter(p => p._status === 'pago').reduce((s, p) => s + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0)

  const pendingByCompany = useMemo(() => {
    const map = new Map()
    baseFiltered.filter(p => p._status !== 'pago').forEach(p => {
      const company = p.empresa_nome || p.empresa || 'Outros'
      const val = (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0)
      map.set(company, (map.get(company) || 0) + val)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [baseFiltered])

  const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))
  const SortIcon = ({ col }) => sort.col === col
    ? (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />)
    : <ChevronDown className="w-3 h-3 inline ml-0.5 opacity-20" />

  // Cria parcela via NF (para NFs sintéticas, sem parcelas reais ainda)
  const _criarParcelaPaga = (p) => dbCriarParcelaNf(p.nf_id, {
    valor_parcela:    p.valor_parcela,
    status_pagamento: 'Pago',
    nota:             p.nota,
    fornecedor:       p.fornecedor,
    valor_item_total: p.valor_item_total,
    data_vencimento:  p.data_vencimento,
  })

  // Marca uma parcela real como paga (view de parcelas)
  const handleMarcarPago = async (p) => {
    setSaving(true)
    try {
      await dbAtualizarParcela(p.id, { status_pagamento: 'Pago' })
      toast.success('Parcela marcada como paga')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao marcar parcela como paga')
    } finally {
      setSaving(false)
      load()
    }
  }

  // Marca TODAS as parcelas pendentes de um grupo de NF como pagas.
  // Usa `nfKey` para buscar no `enriched` completo — ignora filtros ativos
  // de data ou categoria, garantindo que parcelas fora do período visível
  // também sejam marcadas corretamente.
  const handleMarcarNfPaga = async (nfKey) => {
    const todasParcelasNf = enriched.filter(p =>
      `${p.nota || 'S/N'}|${p.fornecedor || 'Desconhecido'}`.toLowerCase() === nfKey
    )
    const pendentes = todasParcelasNf.filter(p => p._status !== 'pago')
    if (pendentes.length === 0) return
    setSaving(true)
    try {
      await Promise.all(pendentes.map(p =>
        p._isSintetica ? _criarParcelaPaga(p) : dbAtualizarParcela(p.id, { status_pagamento: 'Pago' })
      ))
      toast.success(
        pendentes.length === 1
          ? 'Parcela marcada como paga'
          : `${pendentes.length} parcelas marcadas como pagas`
      )
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao marcar NF como paga')
    } finally {
      setSaving(false)
      load()
    }
  }

  // Marca uma parcela sintética (NF sem parcelas reais) como paga (view de parcelas)
  const handleMarcarPagoSintetica = async (p) => {
    setSaving(true)
    try {
      await _criarParcelaPaga(p)
      toast.success('Parcela marcada como paga')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao registrar pagamento')
    } finally {
      setSaving(false)
      load()
    }
  }

  // Marca uma parcela real individualmente (botão na linha expandida da nota)
  const handleMarcarParcela = async (p) => {
    setSaving(true)
    try {
      await dbAtualizarParcela(p.id, { status_pagamento: 'Pago' })
      toast.success('Parcela marcada como paga')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao marcar parcela como paga')
    } finally {
      setSaving(false)
      load()
    }
  }

  const handlePrint = (withInstallments = true) => {
    if (isGeneratingPdf) return
    setShowInstallmentsInReport(withInstallments)
    setIsGeneratingPdf(true)
    setShowReportDropdown(false)
    const opt = {
      margin: [10, 10],
      filename: `Relatorio_Financeiro_${year || 'Geral'}.pdf`,
      image: { type: 'png' },
      html2canvas: { scale: 4, useCORS: true, letterRendering: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }
    setTimeout(() => {
      html2pdf().set(opt).from(reportRef.current).save().then(() => {
        setIsGeneratingPdf(false)
      })
    }, 500)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Total Pendente</p>
            <p className="text-g-200 font-bold text-lg font-mono tabular-nums">{brl(totalPendente)}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Vencidas</p>
            <p className="text-g-200 font-bold text-xl">{totalVencidas}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-orange-50 border border-orange-200 rounded-lg">
            <Bell className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Vencendo hoje</p>
            <p className="text-g-200 font-bold text-xl">{totalVenceHoje}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <p className="text-g-600 text-xs uppercase tracking-wider">Total Pago</p>
            <p className="text-g-200 font-bold text-lg font-mono tabular-nums">{brl(totalPago)}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1 bg-g-850 border border-g-800 rounded-xl p-1 w-fit">
            {CATS.map(c => {
              const count = c.key === 'todas' ? baseFiltered.length
                : c.key === 'pendente' ? baseFiltered.filter(p => p._status === 'pendente' || p._status === 'prorrogada').length
                  : baseFiltered.filter(p => p._status === c.key).length
              return (
                <button
                  key={c.key}
                  onClick={() => setCategoria(c.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${categoria === c.key
                      ? 'bg-white shadow-sm text-g-200 border border-g-800'
                      : 'text-g-600 hover:text-g-400'
                    }`}
                >
                  {c.label} <span className="opacity-60">({count})</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-g-850 border border-g-800 rounded-xl p-1">
              {[{ k: 'notas', label: 'Por Nota' }, { k: 'parcelas', label: 'Parcelas' }].map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => setViewMode(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === k
                      ? 'bg-white shadow-sm text-g-200 border border-g-800'
                      : 'text-g-600 hover:text-g-400'
                    }`}
                >{label}</button>
              ))}
            </div>

            <div className="relative bg-g-850 border border-g-800 rounded-xl p-1">
              <button
                onClick={() => setShowReportDropdown(!showReportDropdown)}
                disabled={isGeneratingPdf}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all no-print ${isGeneratingPdf
                    ? 'bg-g-800 text-g-500 cursor-not-allowed'
                    : 'text-g-200 hover:text-white hover:bg-g-800 shadow-sm'
                  }`}
              >
                {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                {isGeneratingPdf ? 'Gerando...' : 'Relatório'}
                <ChevronDown className={`w-3 h-3 transition-transform ${showReportDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showReportDropdown && !isGeneratingPdf && (
                <>
                  <div className="fixed inset-0 z-[80] no-print" onClick={() => setShowReportDropdown(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-g-900 border border-g-800 rounded-xl shadow-2xl z-[90] overflow-hidden animate-fade-in no-print">
                    <div className="p-2 flex flex-col gap-1">
                      <button
                        onClick={() => handlePrint(true)}
                        className="flex items-center gap-3 w-full p-3 hover:bg-g-850 rounded-lg transition-colors group text-left"
                      >
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg group-hover:bg-emerald-500 transition-colors">
                          <FileText className="w-4 h-4 text-emerald-700 group-hover:text-white" />
                        </div>
                        <div>
                          <p className="text-g-100 text-[11px] font-bold uppercase tracking-wider">Com Detalhamento</p>
                          <p className="text-g-600 text-[9px] mt-0.5">Relatório completo com parcelas</p>
                        </div>
                      </button>
                      <button
                        onClick={() => handlePrint(false)}
                        className="flex items-center gap-3 w-full p-3 hover:bg-g-850 rounded-lg transition-colors group text-left"
                      >
                        <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg group-hover:bg-blue-500 transition-colors">
                          <Printer className="w-4 h-4 text-blue-500 group-hover:text-white" />
                        </div>
                        <div>
                          <p className="text-g-100 text-[11px] font-bold uppercase tracking-wider">Apenas Resumo</p>
                          <p className="text-g-600 text-[9px] mt-0.5">Listagem simplificada de notas</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
            <input
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Filtrar por placa, fornecedor, nº OS, empresa…"
              className="w-full pl-9 pr-9 py-2 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"
            />
            {filterText && (
              <button onClick={() => setFilterText('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-g-600 hover:text-g-400" />
              </button>
            )}
          </div>
          {empresas.length > 0 && (
            <select
              value={filterEmpresa}
              onChange={e => setFilterEmpresa(e.target.value)}
              className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors"
            >
              <option value="">Todas as empresas</option>
              {empresas.map(([cod, sigla]) => <option key={cod} value={cod}>{sigla}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-g-600 text-xs font-medium whitespace-nowrap">De</span>
            <input type="date" value={filterDataDe} onChange={e => setFilterDataDe(e.target.value)}
              className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-g-600 text-xs font-medium whitespace-nowrap">Até</span>
            <input type="date" value={filterDataAte} onChange={e => setFilterDataAte(e.target.value)}
              className="py-2 px-3 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm focus:outline-none focus:border-g-100 transition-colors" />
          </div>
          {(filterDataDe || filterDataAte) && (
            <button onClick={() => { setFilterDataDe(''); setFilterDataAte('') }}
              className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors" title="Limpar filtro de data">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* View: Por Nota Fiscal */}
      {!loading && viewMode === 'notas' && (
        <div className="flex flex-col gap-3">
          {nfGroupsByMonth.length === 0 ? (
            <EmptyState 
              icon={Search}
              title="Nenhuma nota encontrada"
              message="Não há notas fiscais nesta categoria com os filtros atuais."
            />
          ) : nfGroupsByMonth.map(mGroup => (
            <div key={mGroup.month} className="flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-g-500 text-[10px] uppercase font-bold tracking-[0.2em] whitespace-nowrap">{mGroup.monthName}</span>
                <div className="h-px w-full bg-g-800/60" />
              </div>

              {mGroup.invoices.map(g => {
                const expanded = expandedNfs.has(g.nfKey)
                const toggleExpand = () => setExpandedNfs(prev => {
                  const next = new Set(prev)
                  expanded ? next.delete(g.nfKey) : next.add(g.nfKey)
                  return next
                })
                const statusColor = g.hasVencida ? 'border-l-red-500'
                  : g.hasVenceHoje ? 'border-l-orange-400'
                    : g.hasProrrogada ? 'border-l-purple-500'
                      : g.allPago ? 'border-l-emerald-500'
                        : 'border-l-blue-500'

                return (
                  <div key={`${mGroup.month}-${g.nfKey}`} className={`card border-l-4 ${statusColor} overflow-hidden mb-1`}>
                    <button onClick={toggleExpand} className="w-full flex items-center gap-3 p-4 hover:bg-g-850 transition-colors text-left">
                      <div className="flex-1 grid grid-cols-[100px_140px_1.5fr_1.2fr_110px_110px_110px_auto] gap-x-4 items-center min-w-0">
                        <div>
                          <span className="text-g-600 text-[10px] uppercase font-bold tracking-widest block mb-0.5">Vencimento</span>
                          <div className="flex flex-col leading-none">
                            <span className="text-emerald-700 text-lg font-black font-mono tracking-tighter">
                              {g.nextVencimento ? dateBR(g.nextVencimento).slice(0, 5) : '—'}
                            </span>
                            <span className="text-emerald-700/60 text-xs font-mono mt-0.5">
                              {g.nextVencimento ? `/${dateBR(g.nextVencimento).slice(6)}` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {g.placasList.map(p => (
                            <span key={p} className="px-2 py-1 bg-g-800/40 border border-g-700/50 rounded-md font-mono text-sm font-black text-g-400 shadow-sm">{p}</span>
                          ))}
                        </div>
                        <div className="min-w-0">
                          <span className="text-g-200 text-sm font-bold truncate block">{g.fornecedor || '—'}</span>
                          <span className="text-g-500 text-xs uppercase tracking-wider block truncate font-medium">
                            {g.osList.length > 1 ? `${g.osList.length} Ordens de Serviço` : g.osList[0] || 'Sem OS'}
                          </span>
                          {g.sistemasList.length > 0 && (
                            <span className="text-g-700 text-[10px] block truncate mt-0.5">{g.sistemasList.join(' · ')}</span>
                          )}
                        </div>
                        <div>
                          <span className="text-g-500 text-sm truncate block font-medium">
                            NF <span className="text-g-200 font-black">{g.numero_nf || '—'}</span>
                          </span>
                          <span className="text-g-600 text-xs font-mono block">
                            {g.uniqueVehicles > 1 && g.maxParcelaTotal > 0
                              ? `${Math.round(g.countPago / g.uniqueVehicles)}/${g.maxParcelaTotal} pagas · ${g.uniqueVehicles} veíc.`
                              : `${g.countPago} / ${g.countTotal} pagas`}
                          </span>
                        </div>
                        <div>
                          <span className="text-g-600 text-[10px] uppercase font-bold tracking-tighter block mb-0.5">Parcela Atual</span>
                          <span className="text-g-400 text-base font-mono font-black block">{g.nextValor > 0 ? brl(g.nextValor) : '—'}</span>
                        </div>
                        <div>
                          <span className="text-g-600 text-[10px] uppercase font-bold tracking-tighter block mb-0.5">Total da NF</span>
                          <span className="text-g-400 text-base font-mono font-black block">{brl(g.totalGeral)}</span>
                        </div>
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`text-xs font-bold px-3 py-1 rounded-full border shadow-sm ${g.hasVencida ? 'bg-red-500/10 text-red-500 border-red-500/30'
                              : g.hasVenceHoje ? 'bg-orange-500/10 text-orange-500 border-orange-500/30'
                                : g.hasProrrogada ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                                  : g.allPago ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30'
                                    : 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                            }`}>
                            {g.hasVencida ? 'Vencida' : g.hasVenceHoje ? 'Vence hoje' : g.hasProrrogada ? 'Prorrogada' : g.allPago ? 'Pago' : 'Pendente'}
                          </span>
                          {!g.allPago && (
                            <button
                              onClick={e => { e.stopPropagation(); handleMarcarNfPaga(g.nfKey) }}
                              disabled={saving}
                              className="text-[10px] font-semibold px-2.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-40 transition-colors whitespace-nowrap"
                            >
                              {saving ? '...' : 'Marcar pago'}
                            </button>
                          )}
                        </div>
                        <div className="flex justify-end">
                          {expanded ? <ChevronUp className="w-4 h-4 text-g-600" /> : <ChevronDown className="w-4 h-4 text-g-600" />}
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-g-800">
                        <table className="w-full">
                          <thead className="bg-g-850">
                            <tr>
                              <th className="th th-left text-[10px]">Veículo</th>
                              <th className="th th-left text-[10px]">Parcela</th>
                              <th className="th th-left text-[10px]">Vencimento</th>
                              <th className="th text-[10px]">Valor</th>
                              <th className="th text-[10px]">Status</th>
                              <th className="th th-left text-[10px]">Forma</th>
                              <th className="th th-left text-[10px]">Previsão Pgto</th>
                              <th className="th text-[10px]">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.parcelas.map(p => {
                              const previsao = p.prorrogada ? (p.data_prevista_pagamento || p.data_vencimento) : p.data_prevista_pagamento
                              const prevAtrasada = previsao && p.status_pagamento !== 'Pago' && new Date(previsao) < hoje
                              return (
                                <tr key={p.id} onClick={() => setModalDetalhe(p)}
                                  className="border-b border-g-800 hover:bg-g-850 transition-colors cursor-pointer">
                                  <td className="td td-left text-xs font-mono font-bold text-g-500">{p.placa}</td>
                                  <td className="td td-left text-xs text-g-600 tabular-nums">
                                    {p.parcela_atual && p.parcela_total ? `${p.parcela_atual} / ${p.parcela_total}` : '—'}
                                  </td>
                                  <td className="td td-left text-xs text-g-500 tabular-nums">
                                    <span className="flex items-center gap-1">
                                      {p.prorrogada ? dateBR(p.data_vencimento_original) : dateBR(p.data_vencimento)}
                                      {p.prorrogada && <span className="text-purple-500 text-xs" title={`Nova data: ${dateBR(p.data_vencimento)}`}>↻</span>}
                                      {p._status === 'vencida' && <AlertTriangle className="w-3 h-3 text-red-500" />}
                                    </span>
                                  </td>
                                  <td className="td font-mono font-semibold text-g-300 tabular-nums text-sm">
                                    {brl(p.valor_atualizado ?? p.valor_parcela)}
                                    {p.valor_atualizado && p.valor_atualizado !== p.valor_parcela && (
                                      <span className="block text-g-700 text-xs font-normal">{brl(p.valor_parcela)} orig.</span>
                                    )}
                                  </td>
                                  <td className="td"><FinBadge status={p._status} /></td>
                                  <td className="td td-left text-xs text-g-500 uppercase font-medium">{p.forma_pgto || '—'}</td>
                                  <td className="td td-left text-xs tabular-nums">
                                    {previsao ? (
                                      <span className={`flex items-center gap-1 ${prevAtrasada ? 'text-red-500 font-medium' : 'text-g-500'}`}>
                                        {dateBR(previsao)}{prevAtrasada && <AlertTriangle className="w-3 h-3" />}
                                      </span>
                                    ) : '—'}
                                  </td>
                                  <td className="td td-right !pr-1.5" onClick={e => e.stopPropagation()}>
                                    {p._isSintetica ? (
                                      <div className="flex items-center justify-end gap-1">
                                        <button
                                          onClick={() => handleMarcarPagoSintetica(p)}
                                          disabled={saving}
                                          className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 rounded bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                                          title="Registrar como pago"
                                        >
                                          {saving ? '...' : 'Pago'}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-end gap-1">
                                        {p.status_pagamento !== 'Pago' && (
                                          <>
                                            <button onClick={() => setModalProrrogar(p)}
                                              className="p-1 rounded bg-g-850 border border-g-800 text-g-600 hover:text-purple-400 transition-colors" title="Prorrogar">
                                              <CalendarClock className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={() => handleMarcarParcela(p)}
                                              disabled={saving}
                                              className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 rounded bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                                              title="Marcar como pago"
                                            >
                                              {saving ? '...' : 'Pago'}
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="flex items-center justify-end p-4 bg-g-900/50 rounded-xl border border-g-800/50 mt-1 mb-8 gap-10">
                <div className="text-right">
                  <span className="text-g-600 text-[10px] block uppercase font-bold mb-0.5">Total {mGroup.monthName}</span>
                  <span className="font-mono font-bold text-g-200 text-xl tabular-nums">{brl(mGroup.subtotal)}</span>
                </div>
              </div>
            </div>
          ))}
          {nfGroupsByMonth.length > 0 && (
            <div className="card p-6 flex items-center justify-end gap-10 bg-g-900 border-t-4 border-t-emerald-600">
              <span className="text-g-500 text-sm font-bold uppercase tracking-[0.2em]">Total Geral do Ano</span>
              <div className="text-right">
                <span className="text-g-600 text-[10px] block uppercase font-bold mb-0.5">Soma de todos os meses</span>
                <span className="font-mono font-bold text-emerald-700 text-3xl tabular-nums">
                  {brl(nfGroupsByMonth.reduce((s, m) => s + m.subtotal, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabela de parcelas */}
      {!loading && viewMode === 'parcelas' && (
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState 
                icon={Search}
                title={filterText ? "Nenhum resultado" : "Nenhuma parcela"}
                message={filterText ? `Nenhum resultado para "${filterText}"` : "Nenhuma parcela nesta categoria."}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className="bg-g-850 border-b border-g-800">
                  <tr>
                    {[
                      { key: 'placa', label: 'Placa', cls: 'th-left w-[8%] !pl-1.5' },
                      { key: 'id_ord_serv', label: 'Nº OS', cls: 'th-left w-[12%]' },
                      { key: 'empresa_nome', label: 'Empresa', cls: 'th-left w-[8%]' },
                      { key: 'fornecedor', label: 'Fornecedor', cls: 'th-left w-[18%]' },
                      { key: 'nota', label: 'Nota Fiscal', cls: 'th-left w-[8%]' },
                      { key: 'parcela_atual', label: 'Parcela', cls: 'th-left w-[6%]' },
                      { key: 'data_vencimento', label: 'Vencimento', cls: 'th-left w-[8%]' },
                      { key: 'valor_parcela', label: 'Valor', cls: 'th-right w-[9%]' },
                      { key: 'status_pagamento', label: 'Status', cls: 'th-center w-[8%]' },
                      { key: 'data_prevista_pagamento', label: 'Previsão Pgto', cls: 'th-left w-[9%]' }
                    ].map(({ key, label, cls }) => (
                      <th key={key} onClick={() => toggleSort(key)} className={`th ${cls} cursor-pointer select-none hover:text-g-300 transition-colors truncate`}>
                        {label}<SortIcon col={key} />
                      </th>
                    ))}
                    <th className="th th-right w-[10%] !pr-1.5">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const previsao = p.prorrogada ? (p.data_prevista_pagamento || p.data_vencimento) : p.data_prevista_pagamento
                    const prevAtrasada = previsao && p.status_pagamento !== 'Pago' && new Date(previsao) < hoje
                    const rowBg = p._status === 'vencida' ? 'bg-red-50/20'
                      : p._status === 'vence_hoje' ? 'bg-orange-50/20'
                        : p._status === 'prorrogada' ? 'bg-purple-50/10' : ''
                    return (
                      <tr key={p.id} onClick={() => setModalDetalhe(p)}
                        className={`border-b border-g-800 hover:bg-g-850 transition-colors cursor-pointer ${rowBg}`}>
                        <td className="td td-left !pl-1.5 font-mono font-bold text-g-200">{p.placa}</td>
                        <td className="td td-left text-g-600 font-mono text-[11px] truncate">{p.id_ord_serv || '—'}</td>
                        <td className="td td-left text-xs text-g-500 tabular-nums" title={p.empresa_nome || ''}>{resolveNome(p.empresa)}</td>
                        <td className="td td-left text-g-500 truncate" title={p.fornecedor_os && p.fornecedor_os !== p.fornecedor ? `OS: ${p.fornecedor_os}` : ''}>
                          <span className="flex items-center gap-1 overflow-hidden">
                            <span className="truncate">{p.fornecedor || '—'}</span>
                            {p.fornecedor_os && p.fornecedor && p.fornecedor_os !== p.fornecedor && (
                              <span className="text-[9px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded px-1 flex-shrink-0">≠OS</span>
                            )}
                          </span>
                        </td>
                        <td className="td td-left text-g-500 font-mono text-xs">{p.nota || '—'}</td>
                        <td className="td td-left text-xs text-g-600 tabular-nums">
                          {p.parcela_atual && p.parcela_total ? `${p.parcela_atual} / ${p.parcela_total}` : '—'}
                        </td>
                        <td className="td td-left text-xs text-g-500 tabular-nums">
                          <span className="flex items-center gap-1">
                            {p.prorrogada ? dateBR(p.data_vencimento_original) : dateBR(p.data_vencimento)}
                            {p.prorrogada && <span className="text-purple-500 text-xs" title={`Nova data: ${dateBR(p.data_vencimento)}`}>↻</span>}
                            {p._status === 'vencida' && <AlertTriangle className="w-3 h-3 text-red-500" />}
                          </span>
                        </td>
                        <td className="td td-right font-mono font-semibold text-g-300 tabular-nums text-sm">
                          {brl(p.valor_atualizado ?? p.valor_parcela)}
                        </td>
                        <td className="td td-center"><FinBadge status={p._status} /></td>
                        <td className="td td-left text-xs tabular-nums">
                          {previsao ? (
                            <span className={`flex items-center gap-1 ${prevAtrasada ? 'text-red-500 font-medium' : 'text-g-500'}`}>
                              {dateBR(previsao)}{prevAtrasada && <AlertTriangle className="w-3 h-3" />}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="td td-right !pr-1.5" onClick={e => e.stopPropagation()}>
                          {p._isSintetica ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleMarcarPagoSintetica(p)}
                                disabled={saving}
                                title="Registrar como pago"
                                className="px-2 py-1 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                              >
                                {saving ? '...' : 'Pago'}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {p._status !== 'pago' && (
                                <button onClick={() => setModalProrrogar(p)} title="Prorrogar"
                                  className="px-2 py-1 text-xs text-g-400 border border-g-800 rounded-lg hover:bg-g-850 hover:text-g-200 transition-colors flex items-center gap-1">
                                  <CalendarClock className="w-3 h-3" /> Prorrogar
                                </button>
                              )}
                              {p._status !== 'pago' && (
                                <button
                                  onClick={() => handleMarcarPago(p)}
                                  disabled={saving}
                                  title="Marcar como pago"
                                  className="px-2 py-1 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                                >
                                  {saving ? '...' : 'Pago'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {filtered.length > 0 && (() => {
                  const somaValor = filtered.reduce((s, p) => s + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0)
                  const somaPago = filtered.filter(p => p._status === 'pago').reduce((s, p) => s + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0)
                  return (
                    <tfoot className="bg-g-850 border-t-2 border-g-700">
                      <tr>
                        <td colSpan={9} className="td td-left">
                          <span className="text-g-600 text-xs font-semibold uppercase tracking-wider">
                            {filtered.length} {filtered.length === 1 ? 'parcela' : 'parcelas'}
                          </span>
                        </td>
                        <td className="td font-mono font-bold text-g-200 tabular-nums text-sm" colSpan={2}>
                          <span className="block">{brl(somaValor)}</span>
                          {somaPago > 0 && somaPago < somaValor && (
                            <span className="block text-emerald-700 text-xs font-normal">{brl(somaPago)} pago</span>
                          )}
                        </td>
                        <td className="td" />
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      {alertVisible && !alertDismissed && (
        <AlertContasDiaModal
          parcelas={venceHojeList}
          onCiente={() => { onAlertDismiss(); setAlertVisible(false) }}
          onLembrarDepois={() => setAlertVisible(false)}
        />
      )}
      {modalProrrogar && (
        <ProrrogarParcelaModal
          parcela={modalProrrogar}
          onClose={() => setModalProrrogar(null)}
          onSaved={() => { setModalProrrogar(null); load() }}
        />
      )}
      {modalDetalhe && (
        <DetalheParcelaModal
          parcela={modalDetalhe}
          onClose={() => setModalDetalhe(null)}
          onSaved={() => { setModalDetalhe(null); load() }}
        />
      )}

      {/* Template PDF oculto */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={reportRef} className="p-6 bg-white text-black w-[190mm]">
          <div className="flex items-center justify-between mb-8 border-b-2 border-g-100 pb-4">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="Logo" className="h-16 w-auto object-contain" />
              <div>
                <h1 className="text-2xl font-bold text-g-100 uppercase tracking-tight">Relatório Financeiro</h1>
                <p className="text-sm text-g-600 font-medium">Manutenção · Exercício {year}</p>
                {(filterDataDe || filterDataAte) && (
                  <p className="text-xs text-g-600 font-medium mt-0.5">
                    {filterDataDe && filterDataAte
                      ? `Período: ${filterDataDe.split('-').reverse().join('/')} a ${filterDataAte.split('-').reverse().join('/')}`
                      : filterDataDe
                        ? `A partir de ${filterDataDe.split('-').reverse().join('/')}`
                        : `Até ${filterDataAte.split('-').reverse().join('/')}`}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-g-600 font-black uppercase tracking-widest mb-1">Data e Hora de Geração</p>
              <p className="text-sm font-bold text-g-100 font-mono">
                {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mb-8 items-start">
            <div className="col-span-2 border border-g-800 rounded-xl p-4 bg-amber-50/10 min-h-[100px]">
              <p className="text-g-600 text-[10px] uppercase font-black tracking-wider mb-1">Total Pendente Geral</p>
              <p className="text-2xl font-mono font-bold text-g-100">{brl(totalPendente)}</p>
            </div>
            <div className="col-span-2 border border-g-800 rounded-xl p-4 bg-emerald-50/5 min-h-[100px]">
              <p className="text-g-600 text-[10px] uppercase font-black tracking-wider mb-2">Pendente por Empresa</p>
              <div className="space-y-2">
                {pendingByCompany.length > 0 ? pendingByCompany.map(([name, val]) => (
                  <div key={name} className="flex justify-between items-start gap-2 text-[11px]">
                    <span className="text-emerald-700 font-black uppercase leading-tight flex-1">{name}</span>
                    <span className="font-mono font-black text-emerald-700 whitespace-nowrap leading-tight">{brl(val)}</span>
                  </div>
                )) : <p className="text-xs text-g-600 italic">Nenhuma pendência</p>}
              </div>
            </div>
          </div>

          {nfGroupsByMonth.map(mGroup => (
            <div key={mGroup.month} className="mb-6 break-inside-avoid">
              <div className="flex items-center gap-4 mb-3">
                <span className="text-g-100 text-lg uppercase font-black tracking-widest">{mGroup.monthName}</span>
                <div className="h-px flex-1 bg-g-100/20" />
                <div className="bg-g-950 px-4 py-1.5 rounded-lg border border-g-800">
                  <span className="text-g-200 text-xs font-mono font-bold">Subtotal: {brl(mGroup.subtotal)}</span>
                </div>
              </div>
              <div className="flex flex-col gap-5">
                {mGroup.invoices.map(g => (
                  <div key={g.nfKey} className="relative pt-2">
                    <div className="absolute -top-1 left-2 bg-white px-2 z-10">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{g.empresa}</span>
                    </div>
                    <div className="border border-g-800 rounded-xl overflow-hidden bg-white shadow-md">
                      <div className="bg-g-850/40 px-4 py-2 border-b border-g-800">
                        <div className="grid grid-cols-[85px_95px_1fr_85px_95px_80px] gap-2 items-center">
                          <div className="min-h-[40px] flex flex-col justify-center">
                            <span className="text-[10px] text-g-600 uppercase font-black block mb-0.5">Vencimento</span>
                            <span className="text-sm font-mono font-bold text-g-100">{g.nextVencimento ? dateBR(g.nextVencimento) : '—'}</span>
                          </div>
                          <div className="min-h-[40px] flex flex-col justify-center">
                            <span className="text-[10px] text-g-600 uppercase font-black block mb-1">Placas</span>
                            <div className="flex flex-wrap gap-1">
                              {g.placasList.map(p => (
                                <span key={p} className="text-[11px] font-mono font-black text-g-100 bg-g-100/5 px-1.5 py-0.5 inline-flex items-center justify-center rounded border border-g-100/10 leading-none">{p}</span>
                              ))}
                            </div>
                          </div>
                          <div className="min-h-[40px] flex flex-col justify-center overflow-hidden">
                            <span className="text-[10px] text-g-600 uppercase font-black block mb-0.5">Fornecedor</span>
                            <p className="text-[11px] font-black text-g-100 uppercase tracking-tight truncate pb-0.5">
                              {shortenProviderName(g.fornecedor, 14)}
                            </p>
                          </div>
                          <div className="min-h-[40px] flex flex-col justify-center">
                            <span className="text-[10px] text-g-600 uppercase font-black block mb-0.5">NF / Parcelas</span>
                            <span className="text-xs font-bold block text-g-100">NF {g.numero_nf || '—'}</span>
                            <span className="text-[9px] text-g-600 font-mono font-bold">{g.countPago}/{g.countTotal} pagas</span>
                          </div>
                          <div className="min-h-[40px] flex flex-col justify-center">
                            <span className="text-[10px] text-g-600 uppercase font-black block mb-0.5">Total NF</span>
                            <span className="text-sm font-mono font-black text-g-100">{brl(g.totalGeral)}</span>
                          </div>
                          <div className="min-h-[40px] flex items-center justify-end">
                            <div className={`text-[9px] font-black px-2 py-1 rounded border inline-flex items-center justify-center uppercase tracking-wider leading-none ${g.hasVencida ? 'bg-red-50 text-red-600 border-red-200'
                                : g.hasVenceHoje ? 'bg-orange-50 text-orange-600 border-orange-200'
                                  : g.hasProrrogada ? 'bg-purple-50 text-purple-600 border-purple-200'
                                    : g.allPago ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-blue-50 text-blue-600 border-blue-200'
                              }`}>
                              {g.hasVencida ? 'Vencida' : g.hasVenceHoje ? 'Vence hoje' : g.hasProrrogada ? 'Prorrogada' : g.allPago ? 'Pago' : 'Pendente'}
                            </div>
                          </div>
                        </div>
                      </div>
                      {showInstallmentsInReport && (
                        <table className="w-full text-[11px]">
                          <thead className="bg-g-950/10">
                            <tr>
                              {['Veículo', 'Sistema', 'Parcela', 'Vencimento', 'Valor', 'Forma', 'Status'].map(h => (
                                <th key={h} className="px-4 py-1.5 text-left text-g-600 font-black uppercase tracking-tighter border-b border-g-800">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {g.parcelas.map(p => (
                              <tr key={p.id} className="border-b border-g-100/5 last:border-0">
                                <td className="px-4 py-1.5 font-mono font-black text-g-100">{p.placa}</td>
                                <td className="px-4 py-1.5 text-g-600 font-bold uppercase text-[9px]">{p.sistema || '—'}</td>
                                <td className="px-4 py-1.5 text-g-200 font-medium">
                                  {p.parcela_atual && p.parcela_total ? `${p.parcela_atual}/${p.parcela_total}` : '—'}
                                </td>
                                <td className="px-4 py-1.5 text-g-200 font-medium">
                                  {p.prorrogada && <span className="block text-[8px] text-purple-600 font-bold leading-none mb-0.5">Venc. Orig: {dateBR(p.data_vencimento_original)}</span>}
                                  {dateBR(p.data_vencimento)}
                                </td>
                                <td className="px-4 py-1.5 text-right font-mono font-black text-sm text-g-100">
                                  {p.prorrogada && <span className="block text-[9px] text-purple-600 font-bold leading-none mb-0.5">Orig: {brl(p.valor_parcela)}</span>}
                                  {brl(p.valor_atualizado ?? p.valor_parcela)}
                                </td>
                                <td className="px-4 py-1.5 text-g-200 font-medium">{p.forma_pgto || '—'}</td>
                                <td className="px-4 py-1.5">
                                  <span className={`w-20 h-5 rounded text-[9px] font-black tracking-tighter flex items-center justify-center border leading-none ${p._status === 'pago' ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
                                      : p._status === 'vencida' ? 'text-red-700 bg-red-50 border-red-100'
                                        : p._status === 'prorrogada' ? 'text-purple-700 bg-purple-50 border-purple-100'
                                          : 'text-blue-700 bg-blue-50 border-blue-100'
                                    }`}>
                                    {p._status.toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-8 pt-4 border-t-2 border-g-100 flex justify-between items-end">
            <div className="text-left" />
            <div className="text-right">
              <p className="text-xs text-g-600 font-black uppercase tracking-widest mb-1">Total Geral do Exercício</p>
              <p className="text-3xl font-mono font-black text-emerald-700 tracking-tighter">
                {brl(nfGroupsByMonth.reduce((s, m) => s + m.subtotal, 0))}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-g-800 text-center">
            <p className="text-[9px] text-g-600 font-bold uppercase tracking-[0.3em]">Relatório Consultivo · {year}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
