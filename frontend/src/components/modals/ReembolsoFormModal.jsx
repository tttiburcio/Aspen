import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, Banknote, ChevronRight, Building2, FileText,
  Truck, Hash, CreditCard, Calendar, CheckSquare, Square,
  Search, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  criarReembolso,
  atualizarReembolso,
  getContratos,
  getContratoVeiculos,
  getContratoFaturas,
  getProximoRecibo,
  dbListOs,
  getMultas,
} from '../../utils/api'

// ─── Constantes ───────────────────────────────────────────────────────
const TIPOS = [
  { key: 'Encargo de Faturamento', label: 'Encargo de Faturamento',
    desc: 'Pagamento de encargos de fatura de locação realizado fora do boleto após vencimento' },
  { key: 'Manutenção', label: 'Manutenção',
    desc: 'Reembolso de custo de manutenção realizado pelo cliente' },
  { key: 'Franquia de Seguro', label: 'Franquia de Seguro',
    desc: 'Franquia de seguro paga pelo cliente após sinistro' },
  { key: 'Multa de Trânsito', label: 'Multa de Trânsito',
    desc: 'Multas emitidas em nome do veículo mas de responsabilidade do cliente' },
  { key: 'Transporte', label: 'Transporte',
    desc: 'Reembolso de custo de transporte vinculado ao contrato' },
  { key: 'Outro', label: 'Outro', desc: 'Outro tipo de reembolso' },
]

const FORMAS       = ['Boleto', 'Pix', 'TED', 'Débito Automático', 'Cheque', 'Dinheiro']
const STATUS_LIST  = ['Pendente', 'Recebido', 'Vencido', 'Cancelado']

const STATUS_COLOR = {
  Pendente: 'text-amber-400',
  Recebido: 'text-emerald-400',
  Vencido:  'text-red-400',
  Cancelado:'text-g-500',
}

// Tipos que requerem seleção de veículos do contrato
const PRECISA_VEICULO = ['Manutenção', 'Franquia de Seguro', 'Multa de Trânsito', 'Transporte']
// Tipos que requerem seleção de OS
const PRECISA_OS      = ['Manutenção', 'Franquia de Seguro']

function formatOsOption(o) {
  const num = o.numero_os || `OS ${o.id}`
  // Extrai ano e 4 últimos dígitos do número: "OS-2025-0146" → ano=2025, digitos=0146
  const match = num.match(/(\d{4})-(\d{4})$/)
  const ano     = match ? match[1] : (o.data_execucao ? o.data_execucao.slice(0, 4) : '')
  const digitos = match ? match[2] : num
  const parts = [
    ano,
    digitos,
    o.sistema    || null,
    o.fornecedor || null,
    o.data_execucao || null,
  ].filter(Boolean)
  return parts.join(' · ')
}

// ─── Sub-componentes ──────────────────────────────────────────────────
function StepLabel({ n, label, active, done }) {
  return (
    <div className={`flex items-center gap-2 ${active ? 'opacity-100' : done ? 'opacity-60' : 'opacity-30'}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        done  ? 'bg-emerald-500 text-white' :
        active ? 'bg-g-200 text-g-900' : 'bg-g-800 text-g-500'
      }`}>{done ? '✓' : n}</div>
      <span className={`text-xs font-semibold ${active ? 'text-g-200' : 'text-g-500'}`}>{label}</span>
      {n < 4 && <ChevronRight className="w-3 h-3 text-g-700 ml-0.5" />}
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-g-700 text-[10px]">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
const selectCls = inputCls

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-g-850">
      <Icon className="w-3.5 h-3.5 text-g-600" />
      <p className="text-g-600 text-[11px] font-semibold uppercase tracking-widest">{label}</p>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────
export default function ReembolsoFormModal({ onClose, onSaved, reembolso }) {
  const isEdit = !!reembolso
  const backdropRef = useRef(null)

  // ── Estado do formulário ──
  const [tipo, setTipo]           = useState(reembolso?.tipo || '')
  const [contrato, setContrato]   = useState(null)   // objeto completo
  const [veiculos, setVeiculos]   = useState([])     // lista do contrato
  const [faturas, setFaturas]     = useState([])     // meses de faturamento
  const [osList, setOsList]       = useState([])     // OS disponíveis para placas selecionadas
  const [contratos, setContratos] = useState([])

  const [placasSelecionadas, setPlacasSelecionadas] = useState([])
  const [todasPlacas, setTodasPlacas]               = useState(false)
  const [faturaSel, setFaturaSel]                   = useState(null) // objeto fatura completo
  const [numeroOs, setNumeroOs]                     = useState(reembolso?.numero_os || '')
  const [incluirInativos, setIncluirInativos]        = useState(false)

  const [form, setForm] = useState({
    emissao:            reembolso?.emissao    || new Date().toISOString().slice(0, 10),
    vencimento:         reembolso?.vencimento || '',
    valor_reembolso:    reembolso?.valor_reembolso != null ? String(reembolso.valor_reembolso) : '',
    valor_recebido:     reembolso?.valor_recebido  != null ? String(reembolso.valor_recebido)  : '',
    recibo:             reembolso?.recibo     || '',
    forma_recebimento:  reembolso?.forma_recebimento  || 'Pix',
    status_recebimento: reembolso?.status_recebimento || 'Pendente',
    descricao:          reembolso?.descricao  || '',
    empresa:            reembolso?.empresa    || '',
  })

  // ── Multa de Trânsito: seleção de multa(s) existente(s) ──
  const [multasSel,     setMultasSel]     = useState([])
  const [multasList,    setMultasList]    = useState([])
  const [loadingMultas, setLoadingMultas] = useState(false)
  const [multaSearch,   setMultaSearch]   = useState('')
  const [showComReemb,  setShowComReemb]  = useState(false)

  // ── Loadings ──
  const [loadingContratos, setLoadingContratos] = useState(false)
  const [loadingVeiculos,  setLoadingVeiculos]  = useState(false)
  const [loadingFaturas,   setLoadingFaturas]   = useState(false)
  const [loadingOs,        setLoadingOs]        = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [reciboSugerido,   setReciboSugerido]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Passo atual do stepper ──
  const isMulTipo = tipo === 'Multa de Trânsito'
  const step = !tipo ? 1
    : isMulTipo && !isEdit && !multasSel.length ? 2
    : !contrato ? (isMulTipo ? 3 : 2)
    : (isMulTipo ? 4 : 3)

  // ── Carrega contratos quando tipo ou toggle de inativos muda ──
  useEffect(() => {
    if (!tipo) return
    setLoadingContratos(true)
    getContratos(incluirInativos ? { incluir_inativos: true } : {})
      .then(d => setContratos(d || []))
      .finally(() => setLoadingContratos(false))
  }, [tipo, incluirInativos])

  // ── Carrega veículos/faturas quando contrato muda ──
  // Veículos são sempre carregados para qualquer tipo (Encargo precisa para placas_json)
  useEffect(() => {
    if (!contrato) { setVeiculos([]); setFaturas([]); return }

    setLoadingVeiculos(true)
    getContratoVeiculos(contrato.id)
      .then(d => setVeiculos(d || []))
      .finally(() => setLoadingVeiculos(false))

    if (tipo === 'Encargo de Faturamento') {
      setLoadingFaturas(true)
      getContratoFaturas(contrato.id)
        .then(d => setFaturas(d || []))
        .finally(() => setLoadingFaturas(false))
    }
  }, [contrato, tipo])

  // ── Sugere próximo recibo quando contrato muda ──
  useEffect(() => {
    if (!contrato?.empresa_id) { setReciboSugerido(''); return }
    getProximoRecibo(contrato.empresa_id)
      .then(d => {
        if (d?.proximo) {
          setReciboSugerido(d.proximo)
          set('recibo', d.proximo)
        }
      })
      .catch(() => {})
  }, [contrato])

  // ── Carrega OS quando placas mudam (modo criação) ──
  useEffect(() => {
    if (isEdit || !PRECISA_OS.includes(tipo)) return
    const placas = todasPlacas
      ? veiculos.map(v => v.placa).filter(Boolean)
      : placasSelecionadas

    if (!placas.length) { setOsList([]); return }

    setLoadingOs(true)
    dbListOs(null, placas[0])
      .then(d => setOsList((d || []).slice(0, 50)))
      .finally(() => setLoadingOs(false))
  }, [placasSelecionadas, todasPlacas, veiculos, tipo, isEdit])

  // ── Carrega OS no modo edição quando tipo requer ──
  useEffect(() => {
    if (!isEdit || !PRECISA_OS.includes(tipo)) { if (isEdit) setOsList([]); return }
    const placa = reembolso?.placa
    if (!placa) return
    setLoadingOs(true)
    dbListOs(null, placa)
      .then(d => setOsList((d || []).slice(0, 50)))
      .finally(() => setLoadingOs(false))
  }, [tipo, isEdit, reembolso?.placa])

  // ── Carrega multas quando tipo = Multa de Trânsito (criação) ──
  useEffect(() => {
    if (tipo !== 'Multa de Trânsito' || isEdit) { setMultasList([]); return }
    setLoadingMultas(true)
    getMultas()
      .then(d => setMultasList((d || []).filter(m => m.status_multa !== 'Cancelado')))
      .finally(() => setLoadingMultas(false))
  }, [tipo, isEdit])

  // ── Pré-preenche form quando multas selecionadas mudam ──
  useEffect(() => {
    if (!multasSel.length) return
    const total = multasSel.reduce((sum, m) =>
      sum + (m.valor_com_desconto > 0 ? m.valor_com_desconto : m.valor_multa), 0)
    set('valor_reembolso', String(total))
    const descParts = multasSel.map(m =>
      [m.ait && `AIT ${m.ait}`, m.motivo_infracao].filter(Boolean).join(' — ')
    ).filter(Boolean)
    if (descParts.length) set('descricao', descParts.join(' | '))
    const first = multasSel[0]
    if (first?.cliente_nome && first.cliente_nome !== '—') set('empresa', first.cliente_nome)
  }, [multasSel])

  // ── Auto-seleciona contrato quando todas as multas compartilham mesmo contrato ──
  useEffect(() => {
    if (!multasSel.length || !contratos.length || contrato) return
    const ids = [...new Set(multasSel.map(m => m.id_contrato).filter(Boolean))]
    if (ids.length === 1) {
      const c = contratos.find(c => c.id === ids[0])
      if (c) handleContrato(String(c.id))
    }
  }, [multasSel, contratos])

  // ── Toggle placa ──
  const togglePlaca = placa => {
    setPlacasSelecionadas(prev =>
      prev.includes(placa) ? prev.filter(p => p !== placa) : [...prev, placa]
    )
  }

  const handleTodasPlacas = checked => {
    setTodasPlacas(checked)
    if (checked) setPlacasSelecionadas([])
  }

  const handleContrato = cid => {
    const c = contratos.find(c => String(c.id) === String(cid))
    setContrato(c || null)
    setPlacasSelecionadas([])
    setTodasPlacas(false)
    setFaturaSel(null)
    setNumeroOs('')
  }

  const handleMultaSel = (m) => {
    setMultasSel(prev =>
      prev.some(s => s.id === m.id) ? prev.filter(s => s.id !== m.id) : [...prev, m]
    )
    setContrato(null)
    setPlacasSelecionadas([])
    setTodasPlacas(false)
  }

  const filteredMultas = useMemo(() => {
    let r = multasList
    if (!showComReemb) r = r.filter(m => m.reembolso_qtd === 0)
    if (multaSearch.trim()) {
      const q = multaSearch.toLowerCase()
      r = r.filter(m => [m.placa, m.ait, m.motivo_infracao, m.empresa_sigla, m.cliente_nome]
        .some(f => (f || '').toLowerCase().includes(q)))
    }
    return r
  }, [multasList, showComReemb, multaSearch])

  // ── Validação e envio ──
  const handleSubmit = async e => {
    e?.preventDefault()

    if (isEdit) {
      if (!form.valor_reembolso || parseFloat(form.valor_reembolso) <= 0)
        return toast.error('Informe o valor do reembolso')
      if (!form.vencimento)
        return toast.error('Informe a data de vencimento')
      setSaving(true)
      try {
        await atualizarReembolso(reembolso.id, {
          tipo:               tipo || undefined,
          recibo:             form.recibo             || null,
          emissao:            form.emissao             || null,
          vencimento:         form.vencimento          || null,
          valor_reembolso:    parseFloat(form.valor_reembolso),
          valor_recebido:     form.valor_recebido ? parseFloat(form.valor_recebido) : null,
          empresa:            form.empresa             || null,
          forma_recebimento:  form.forma_recebimento   || null,
          status_recebimento: form.status_recebimento,
          descricao:          form.descricao           || null,
          numero_os:          PRECISA_OS.includes(tipo) ? (numeroOs || null) : undefined,
        })
        toast.success('Reembolso atualizado')
        onSaved?.()
        onClose()
      } catch (err) {
        toast.error(err.response?.data?.detail || 'Erro ao atualizar')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!tipo)    return toast.error('Selecione o tipo de reembolso')
    if (!contrato) return toast.error('Selecione o contrato')
    if (tipo === 'Encargo de Faturamento' && !faturaSel) return toast.error('Selecione a fatura de referência')
    if (PRECISA_VEICULO.includes(tipo) && tipo !== 'Multa de Trânsito' && !todasPlacas && !placasSelecionadas.length)
      return toast.error('Selecione pelo menos um veículo')
    if (tipo === 'Multa de Trânsito' && !multasSel.length && !todasPlacas && !placasSelecionadas.length)
      return toast.error('Selecione pelo menos uma multa ou um veículo do contrato')
    if (!form.valor_reembolso || parseFloat(form.valor_reembolso) <= 0)
      return toast.error('Informe o valor do reembolso')
    if (!form.vencimento)
      return toast.error('Informe a data de vencimento')

    // Placas: multas selecionadas → placas únicas das multas; outros tipos → lógica existente
    const placasFinais = tipo === 'Encargo de Faturamento'
      ? veiculos.map(v => v.placa).filter(Boolean)
      : tipo === 'Multa de Trânsito' && multasSel.length
        ? [...new Set(multasSel.map(m => m.placa).filter(Boolean))]
        : todasPlacas
          ? veiculos.map(v => v.placa).filter(Boolean)
          : placasSelecionadas

    // id_veiculo: primeiro veículo das multas ou das placas selecionadas
    const idVeiculo = tipo === 'Multa de Trânsito' && multasSel.length
      ? multasSel[0].id_veiculo
      : veiculos.find(v => placasFinais.includes(v.placa))?.id_veiculo || null

    setSaving(true)
    try {
      await criarReembolso({
        tipo,
        id_multa:           multasSel[0]?.id || null,
        ids_multa_json:     multasSel.length ? JSON.stringify(multasSel.map(m => m.id)) : null,
        id_empresa:         contrato.empresa_id || null,
        id_contrato:        contrato.id,
        id_veiculo:         idVeiculo,
        placas_json:        placasFinais.length ? JSON.stringify(placasFinais) : null,
        fatura_mes:         faturaSel ? faturaSel.emissao?.slice(0, 7) : null,
        numero_os:          numeroOs  || null,
        emissao:            form.emissao,
        vencimento:         form.vencimento || null,
        valor_reembolso:    parseFloat(form.valor_reembolso),
        valor_recebido:     form.valor_recebido ? parseFloat(form.valor_recebido) : null,
        empresa:            form.empresa || contrato.nome_cliente,
        recibo:             form.recibo   || null,
        forma_recebimento:  form.forma_recebimento  || null,
        status_recebimento: form.status_recebimento,
        descricao:          form.descricao || null,
      })
      toast.success('Reembolso registrado')
      onSaved?.()
      onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const valorNum    = parseFloat(form.valor_reembolso) || 0
  const recebidoNum = parseFloat(form.valor_recebido)  || 0
  const saldo       = valorNum - recebidoNum

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[92vh]">

        {/* ── Cabeçalho ── */}
        <div className="px-6 py-5 border-b border-g-800 shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Banknote className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-g-100 font-bold text-base">
                  {isEdit ? `Editar Reembolso #${reembolso.recibo || reembolso.id}` : 'Novo Reembolso a Receber'}
                </h2>
                <p className="text-g-600 text-xs mt-0.5">
                  {isEdit ? 'Altere os campos desejados e salve' : 'Registro de valor a recuperar de cliente'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Stepper — apenas no modo criação */}
          {!isEdit && (
            <div className="flex items-center gap-1 flex-wrap">
              {isMulTipo ? <>
                <StepLabel n={1} label="Tipo"     active={step === 1} done={step > 1} />
                <StepLabel n={2} label="Multa"    active={step === 2} done={step > 2} />
                <StepLabel n={3} label="Contrato" active={step === 3} done={step > 3} />
                <StepLabel n={4} label="Detalhes" active={step === 4} done={false}    />
              </> : <>
                <StepLabel n={1} label="Tipo"     active={step === 1} done={step > 1} />
                <StepLabel n={2} label="Contrato" active={step === 2} done={step > 2} />
                <StepLabel n={3} label="Detalhes" active={step === 3} done={false}    />
                <StepLabel n={4} label="Valores"  active={false}      done={false}    />
              </>}
            </div>
          )}
        </div>

        {/* ── Corpo ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-6">

          {/* MODO EDIÇÃO — formulário direto */}
          {isEdit && (
            <>
              <div>
                <SectionHeader icon={FileText} label="Tipo" />
                <select value={tipo} onChange={e => setTipo(e.target.value)} className={selectCls}>
                  {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <SectionHeader icon={Calendar} label="Datas" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Emissão" required>
                    <input type="date" value={form.emissao} onChange={e => set('emissao', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Vencimento">
                    <input type="date" value={form.vencimento} onChange={e => set('vencimento', e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </div>
              <div>
                <SectionHeader icon={Building2} label="Cliente" />
                <Field label="Nome do Cliente / Empresa">
                  <input type="text" value={form.empresa} onChange={e => set('empresa', e.target.value)}
                    placeholder="Nome do cliente…" className={inputCls} />
                </Field>
              </div>

              {/* OS — só para tipos que requerem (Manutenção, Franquia de Seguro) */}
              {PRECISA_OS.includes(tipo) && (
                <div>
                  <SectionHeader icon={Hash} label="Ordem de Serviço" />
                  {loadingOs ? (
                    <div className="flex items-center gap-2 text-g-600 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Buscando OS…
                    </div>
                  ) : (
                    <Field
                      label="Nº da OS de referência"
                      hint={osList.length
                        ? `${osList.length} OS encontradas para ${reembolso?.placa || 'esta placa'}.`
                        : 'Nenhuma OS encontrada — informe manualmente.'}
                    >
                      {osList.length > 0 ? (
                        <select value={numeroOs} onChange={e => setNumeroOs(e.target.value)} className={selectCls}>
                          <option value="">Sem vínculo de OS</option>
                          {osList.map(o => (
                            <option key={o.id} value={o.numero_os || String(o.id)}>
                              {formatOsOption(o)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={numeroOs}
                          onChange={e => setNumeroOs(e.target.value)}
                          placeholder="Digite o nº da OS…"
                          className={inputCls}
                        />
                      )}
                    </Field>
                  )}
                </div>
              )}

              <div>
                <SectionHeader icon={Hash} label="Valores" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Valor do Reembolso (R$)" required>
                    <input type="number" step="0.01" min="0" value={form.valor_reembolso}
                      onChange={e => set('valor_reembolso', e.target.value)}
                      placeholder="0,00" className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Valor Recebido (R$)">
                    <input type="number" step="0.01" min="0" value={form.valor_recebido}
                      onChange={e => set('valor_recebido', e.target.value)}
                      placeholder="0,00" className={`${inputCls} font-mono`} />
                  </Field>
                </div>
              </div>
              <div>
                <SectionHeader icon={CreditCard} label="Recebimento" />
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Nº do Recibo">
                    <input type="text" value={form.recibo} onChange={e => set('recibo', e.target.value)}
                      placeholder="Ex: 12001" className={inputCls} />
                  </Field>
                  <Field label="Forma">
                    <select value={form.forma_recebimento} onChange={e => set('forma_recebimento', e.target.value)} className={selectCls}>
                      <option value="">—</option>
                      {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.status_recebimento} onChange={e => set('status_recebimento', e.target.value)} className={selectCls}>
                      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
              <div>
                <Field label="Descrição / Observações">
                  <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
                    rows={2} placeholder="Detalhes adicionais…" className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </>
          )}

          {/* MODO CRIAÇÃO — stepper */}
          {!isEdit && (<>

          {/* PASSO 1 — Tipo */}
          <div>
            <SectionHeader icon={FileText} label="Tipo de Reembolso" />
            <div className="grid grid-cols-1 gap-2">
              {TIPOS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTipo(t.key); setContrato(null) }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    tipo === t.key
                      ? 'border-emerald-500/50 bg-emerald-500/8'
                      : 'border-g-800 bg-g-900 hover:border-g-700 hover:bg-g-850'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all ${
                      tipo === t.key ? 'border-emerald-400 bg-emerald-400' : 'border-g-700'
                    }`} />
                    <div>
                      <p className={`text-sm font-semibold ${tipo === t.key ? 'text-emerald-300' : 'text-g-300'}`}>
                        {t.label}
                      </p>
                      <p className="text-g-600 text-[11px] mt-0.5 leading-tight">{t.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* PASSO 2 (Multa de Trânsito) — Seleção de multa */}
          {isMulTipo && (
            <div>
              <SectionHeader icon={FileText} label="Multa de Referência" />
              {loadingMultas ? (
                <div className="flex items-center gap-2 text-g-600 text-sm py-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando multas…
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Busca + toggle */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600" />
                      <input
                        value={multaSearch}
                        onChange={e => setMultaSearch(e.target.value)}
                        placeholder="Buscar por placa, AIT, motivo…"
                        className="w-full pl-8 pr-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-400 text-sm placeholder-g-700 focus:outline-none focus:border-g-600"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowComReemb(v => !v)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all shrink-0 ${
                        showComReemb
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                          : 'border-g-800 text-g-600 hover:border-g-700 hover:text-g-400'
                      }`}
                    >
                      {showComReemb ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      Mostrar com reembolso
                    </button>
                  </div>

                  {filteredMultas.length === 0 ? (
                    <p className="text-g-600 text-sm py-2">Nenhuma multa encontrada sem reembolso vinculado.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {filteredMultas.map(m => {
                        const sel = multasSel.some(s => s.id === m.id)
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleMultaSel(m)}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                              sel
                                ? 'border-emerald-500/50 bg-emerald-500/8'
                                : 'border-g-800 bg-g-900 hover:border-g-700 hover:bg-g-850'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className={`w-3.5 h-3.5 rounded border-2 shrink-0 mt-0.5 transition-all flex items-center justify-center ${
                                  sel ? 'border-emerald-400 bg-emerald-400' : 'border-g-700'
                                }`}>{sel && <span className="text-white text-[8px] font-bold leading-none">✓</span>}</div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`font-mono font-bold text-xs ${sel ? 'text-emerald-300' : 'text-g-200'}`}>
                                      {m.placa}
                                    </span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                                      {m.empresa_sigla}
                                    </span>
                                    {m.ait && <span className="text-g-500 text-[10px] font-mono">{m.ait}</span>}
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
                                      m.status_multa === 'Pago'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    }`}>{m.status_multa}</span>
                                    {m.reembolso_qtd > 0 && (
                                      <span className="flex items-center gap-0.5 text-[9px] text-amber-500">
                                        <AlertTriangle className="w-2.5 h-2.5" />Já reembolsado
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-g-500 text-[11px] mt-0.5 truncate max-w-[320px]">
                                    {m.motivo_infracao || 'Sem descrição'}{m.orgao_emissor ? ` · ${m.orgao_emissor}` : ''}
                                  </p>
                                  {m.cliente_nome && m.cliente_nome !== '—' && (
                                    <p className="text-g-600 text-[10px] mt-0.5">Cliente: {m.cliente_nome}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`font-mono font-bold text-xs tabular-nums ${sel ? 'text-emerald-300' : 'text-g-200'}`}>
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    m.valor_com_desconto > 0 ? m.valor_com_desconto : m.valor_multa
                                  )}
                                </p>
                                {m.valor_com_desconto > 0 && (
                                  <p className="text-g-700 text-[9px] font-mono tabular-nums">
                                    orig. {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.valor_multa)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Chips das multas selecionadas */}
                  {multasSel.length > 0 && (
                    <div className="flex flex-col gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-emerald-400 text-[11px] font-semibold flex-1">
                          {multasSel.length} multa{multasSel.length > 1 ? 's' : ''} selecionada{multasSel.length > 1 ? 's' : ''}
                          {multasSel.length > 1 && (
                            <span className="ml-1 text-emerald-600 font-mono">
                              · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                  multasSel.reduce((s, m) => s + (m.valor_com_desconto > 0 ? m.valor_com_desconto : m.valor_multa), 0)
                                )}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {multasSel.map(m => (
                          <div key={m.id}
                            className="flex items-center gap-1.5 px-2 py-1 bg-g-900 border border-emerald-500/40 rounded-lg">
                            <span className="font-mono font-bold text-emerald-300 text-xs">{m.placa}</span>
                            {m.ait && <span className="text-g-500 text-[10px]">{m.ait}</span>}
                            <button type="button" onClick={() => handleMultaSel(m)}
                              className="text-g-600 hover:text-g-400 ml-0.5">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASSO 3 — Contrato (aparece após tipo; para Multa de Trânsito, após selecionar multa(s)) */}
          {tipo && (!isMulTipo || multasSel.length > 0) && (
            <div>
              <SectionHeader icon={Building2} label="Contrato" />
              {loadingContratos ? (
                <div className="flex items-center gap-2 text-g-600 text-sm py-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando contratos…
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Field label="Selecione o Contrato" required>
                    <select
                      value={contrato?.id || ''}
                      onChange={e => handleContrato(e.target.value)}
                      className={selectCls}
                    >
                      <option value="">Selecione…</option>
                      {contratos.map(c => (
                        <option key={c.id} value={c.id}>
                          #{c.id} · {c.empresa_sigla} · {c.nome_cliente}{c.placas?.length ? ` · ${c.placas.join(', ')}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {/* Toggle inativos */}
                  <button
                    type="button"
                    onClick={() => { setIncluirInativos(v => !v); setContrato(null) }}
                    className={`flex items-center gap-2 text-xs self-start px-3 py-1.5 rounded-lg border transition-all ${
                      incluirInativos
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                        : 'border-g-800 text-g-600 hover:border-g-700 hover:text-g-400'
                    }`}
                  >
                    {incluirInativos ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    Incluir contratos encerrados e renovados
                  </button>

                  {/* Card info do contrato selecionado */}
                  {contrato && (
                    <div className="px-4 py-3 bg-g-900 border border-g-800 rounded-xl">
                      <div className="flex items-start gap-3">
                        <Building2 className="w-3.5 h-3.5 text-g-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-g-500 text-[10px] font-mono">#{contrato.id}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-g-800 text-g-400">
                              {contrato.empresa_sigla}
                            </span>
                            <span className="text-g-300 text-xs font-semibold truncate">{contrato.nome_cliente}</span>
                          </div>
                          {contrato.placas?.length > 0 && (
                            <p className="text-g-600 text-[10px] font-mono">
                              {contrato.placas.join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASSO 3 — Detalhes condicionais ao tipo */}
          {tipo && contrato && (
            <>
              {/* ── ENCARGO: seleciona fatura ── */}
              {tipo === 'Encargo de Faturamento' && (
                <div>
                  <SectionHeader icon={FileText} label="Fatura de Referência" />
                  {loadingFaturas ? (
                    <div className="flex items-center gap-2 text-g-600 text-sm py-3">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando faturas…
                    </div>
                  ) : faturas.length === 0 ? (
                    <p className="text-g-600 text-sm py-3">Nenhuma fatura de locação encontrada para este contrato.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-g-600 text-[11px] uppercase tracking-wider font-semibold">
                        Selecione a fatura à qual o encargo se refere *
                      </p>
                      <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                        {faturas.map(f => {
                          const sel = faturaSel?.id === f.id
                          const statusColor = {
                            Recebido: 'text-emerald-500',
                            Vencido:  'text-red-400',
                            Pendente: 'text-amber-400',
                          }[f.status_recebimento] || 'text-g-500'
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setFaturaSel(sel ? null : f)}
                              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                                sel
                                  ? 'border-emerald-500/50 bg-emerald-500/8'
                                  : 'border-g-800 bg-g-900 hover:border-g-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-3 h-3 rounded-full border-2 shrink-0 transition-all ${
                                    sel ? 'border-emerald-400 bg-emerald-400' : 'border-g-700'
                                  }`} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-g-400 text-[10px] font-mono font-bold">
                                        Fatura #{f.id_fatura_excel || f.id}
                                      </span>
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-g-800 text-g-400">
                                        {f.empresa_emissora}
                                      </span>
                                      <span className={`text-[10px] font-semibold ${statusColor}`}>
                                        {f.status_recebimento}
                                      </span>
                                    </div>
                                    <p className="text-g-600 text-[10px] mt-0.5">
                                      Emissão {f.emissao_display}{f.vencimento ? ` · Venc. ${f.vencimento}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-g-200 font-mono font-bold text-xs">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(f.valor_locacoes)}
                                  </p>
                                  {f.valor_recebido > 0 && f.valor_recebido < f.valor_locacoes && (
                                    <p className="text-g-600 text-[10px] font-mono">
                                      Rec. {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(f.valor_recebido)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── MANUTENÇÃO / FRANQUIA / MULTA / TRANSPORTE: seleciona veículos ── */}
              {/* Para Multa de Trânsito com multas selecionadas, o veículo vem das multas */}
              {PRECISA_VEICULO.includes(tipo) && !(isMulTipo && multasSel.length) && (
                <div>
                  <SectionHeader icon={Truck} label="Veículos do Contrato" />
                  {loadingVeiculos ? (
                    <div className="flex items-center gap-2 text-g-600 text-sm py-3">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando veículos…
                    </div>
                  ) : veiculos.length === 0 ? (
                    <p className="text-g-600 text-sm py-3">Nenhum veículo vinculado a este contrato.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {/* Opção: todas as placas */}
                      <button
                        type="button"
                        onClick={() => handleTodasPlacas(!todasPlacas)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                          todasPlacas
                            ? 'border-emerald-500/50 bg-emerald-500/8'
                            : 'border-g-800 bg-g-900 hover:border-g-700'
                        }`}
                      >
                        {todasPlacas
                          ? <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                          : <Square className="w-4 h-4 text-g-600 shrink-0" />}
                        <div>
                          <p className={`text-sm font-semibold ${todasPlacas ? 'text-emerald-300' : 'text-g-300'}`}>
                            Todas as placas do contrato ({veiculos.length})
                          </p>
                          <p className="text-g-600 text-[11px]">
                            {veiculos.map(v => v.placa).filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </button>

                      {/* Ou: placas individuais */}
                      {!todasPlacas && (
                        <div>
                          <p className="text-g-600 text-[11px] uppercase tracking-wider mb-2 font-semibold">
                            Ou selecione individualmente:
                          </p>
                          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {veiculos.map(v => {
                              const sel = placasSelecionadas.includes(v.placa)
                              return (
                                <button
                                  key={v.id_veiculo}
                                  type="button"
                                  onClick={() => togglePlaca(v.placa)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                                    sel
                                      ? 'border-emerald-500/40 bg-emerald-500/10'
                                      : 'border-g-800 bg-g-900 hover:border-g-700'
                                  }`}
                                >
                                  {sel
                                    ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    : <Square className="w-3.5 h-3.5 text-g-700 shrink-0" />}
                                  <div className="min-w-0">
                                    <p className={`font-mono font-bold text-xs ${sel ? 'text-emerald-300' : 'text-g-300'}`}>
                                      {v.placa || '—'}
                                    </p>
                                    <p className="text-g-600 text-[10px] truncate">{v.modelo || ''}</p>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                          {placasSelecionadas.length > 0 && (
                            <p className="text-g-500 text-[11px] mt-2">
                              {placasSelecionadas.length} placa{placasSelecionadas.length !== 1 ? 's' : ''} selecionada{placasSelecionadas.length !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Card veículo(s) das multas selecionadas ── */}
              {isMulTipo && multasSel.length > 0 && (
                <div className="flex items-start gap-3 px-4 py-3 bg-g-900 border border-g-800 rounded-xl">
                  <Truck className="w-4 h-4 text-g-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-g-500 text-[10px] uppercase tracking-wider font-semibold mb-1.5">
                      Veículo{multasSel.length > 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[...new Map(multasSel.map(m => [m.placa, m])).values()].map(m => (
                        <div key={m.placa} className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-g-200 text-sm">{m.placa}</span>
                          {m.modelo && <span className="text-g-600 text-[10px]">· {m.modelo}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── MANUTENÇÃO / FRANQUIA: seleciona OS ── */}
              {PRECISA_OS.includes(tipo) && (todasPlacas || placasSelecionadas.length > 0) && (
                <div>
                  <SectionHeader icon={Hash} label="Ordem de Serviço" />
                  {loadingOs ? (
                    <div className="flex items-center gap-2 text-g-600 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Buscando OS…
                    </div>
                  ) : (
                    <Field
                      label="Nº da OS de referência"
                      hint={osList.length ? `${osList.length} OS finalizadas encontradas para as placas selecionadas.` : 'Nenhuma OS finalizada encontrada — informe manualmente.'}
                    >
                      {osList.length > 0 ? (
                        <select
                          value={numeroOs}
                          onChange={e => setNumeroOs(e.target.value)}
                          className={selectCls}
                        >
                          <option value="">Sem vínculo de OS</option>
                          {osList.map(o => (
                            <option key={o.id} value={o.numero_os || String(o.id)}>
                              {formatOsOption(o)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={numeroOs}
                          onChange={e => setNumeroOs(e.target.value)}
                          placeholder="Digite o nº da OS…"
                          className={inputCls}
                        />
                      )}
                    </Field>
                  )}
                </div>
              )}

              {/* PASSO 4 — Dados financeiros */}
              <div>
                <SectionHeader icon={Calendar} label="Datas" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Data de Emissão" required>
                    <input type="date" value={form.emissao} onChange={e => set('emissao', e.target.value)}
                      required className={inputCls} />
                  </Field>
                  <Field label="Data de Vencimento">
                    <input type="date" value={form.vencimento} onChange={e => set('vencimento', e.target.value)}
                      className={inputCls} />
                  </Field>
                </div>
              </div>

              <div>
                <SectionHeader icon={Hash} label="Valores" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Valor do Reembolso (R$)" required>
                    <input type="number" step="0.01" min="0" value={form.valor_reembolso}
                      onChange={e => set('valor_reembolso', e.target.value)}
                      placeholder="0,00" required className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Valor Já Recebido (R$)">
                    <input type="number" step="0.01" min="0" value={form.valor_recebido}
                      onChange={e => set('valor_recebido', e.target.value)}
                      placeholder="0,00" className={`${inputCls} font-mono`} />
                  </Field>
                </div>
                {valorNum > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-3 px-4 py-3 bg-g-900 border border-g-800 rounded-xl text-center">
                    {[
                      { label: 'A Receber', val: valorNum,    color: 'text-g-200' },
                      { label: 'Recebido',  val: recebidoNum, color: 'text-emerald-400' },
                      { label: 'Saldo',     val: saldo, color: saldo > 0 ? 'text-amber-400' : 'text-emerald-400' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <p className="text-g-600 text-[10px] uppercase tracking-wider mb-0.5">{label}</p>
                        <p className={`font-mono font-bold text-sm ${color}`}>
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionHeader icon={CreditCard} label="Recebimento" />
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Nº do Recibo">
                    <input type="text" value={form.recibo} onChange={e => set('recibo', e.target.value)}
                      placeholder="Ex: 12001" className={inputCls} />
                  </Field>
                  <Field label="Forma">
                    <select value={form.forma_recebimento} onChange={e => set('forma_recebimento', e.target.value)}
                      className={selectCls}>
                      <option value="">—</option>
                      {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                  <Field label="Status" required>
                    <select value={form.status_recebimento} onChange={e => set('status_recebimento', e.target.value)}
                      className={selectCls}>
                      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              </div>

              <div>
                <Field label="Descrição / Observações">
                  <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)}
                    rows={2} placeholder="Detalhes adicionais…"
                    className={`${inputCls} resize-none`} />
                </Field>
              </div>
            </>
          )}

          </> )}
          {/* fim modo criação */}
        </div>

        {/* ── Rodapé ── */}
        <div className="px-6 py-4 border-t border-g-800 shrink-0 flex items-center justify-between gap-3">
          <span className={`text-xs font-semibold ${STATUS_COLOR[form.status_recebimento] || 'text-g-500'}`}>
            {form.status_recebimento && `Status: ${form.status_recebimento}`}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || (!isEdit && (!tipo || !contrato))}
              className="px-5 py-2 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <Banknote className="w-3.5 h-3.5" />
              {isEdit ? 'Salvar Alterações' : 'Registrar Reembolso'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
