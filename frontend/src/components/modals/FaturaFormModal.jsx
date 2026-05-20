import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, Receipt, Building2, Calendar, Hash,
  ChevronRight, CheckSquare, Square, Sparkles, Truck,
  CreditCard, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getContratos,
  getContratoVeiculos,
  getFaturamentoPrefill,
  getProximoNumeroFatura,
  criarFatura,
} from '../../utils/api'
import { brl } from '../../utils/format'
import { useCompanies } from '../../contexts/CompanyContext'

// ─── Helpers ─────────────────────────────────────────────────────────
const MONTHS_BR = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const ANOS_DISPONIVEIS = [2023, 2024, 2025, 2026]
const FORMAS_PAGAMENTO = ['Boleto', 'Pix', 'TED', 'Depósito', 'Dinheiro', 'Débito Automático']
const STATUS_REC = ['Pendente', 'Recebido', 'Vencido', 'Cancelado']
const STATUS_IMP = ['Pendente', 'Pago', 'Isento']

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function mesParaDate(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}-01`
}

function roundTo(v, d = 2) {
  return Math.round(v * Math.pow(10, d)) / Math.pow(10, d)
}

// ─── Sub-componentes ──────────────────────────────────────────────────
function StepLabel({ n, label, active, done, onClick }) {
  return (
    <button
      type="button"
      onClick={done ? onClick : undefined}
      className={`flex items-center gap-2 ${active ? 'opacity-100' : done ? 'opacity-70 cursor-pointer hover:opacity-100' : 'opacity-25 cursor-default'} transition-opacity`}
    >
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
        done  ? 'bg-emerald-500 text-white' :
        active ? 'bg-g-100 text-g-900' : 'bg-g-800 text-g-500'
      }`}>{done ? '✓' : n}</div>
      <span className={`text-xs font-semibold ${active ? 'text-g-100' : done ? 'text-g-400' : 'text-g-600'}`}>{label}</span>
      {n < 3 && <ChevronRight className="w-3.5 h-3.5 text-g-700 ml-1" />}
    </button>
  )
}

function Field({ label, required, hint, children, col = 1 }) {
  return (
    <div className={`flex flex-col gap-1.5 ${col === 2 ? 'col-span-2' : ''}`}>
      <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-g-700 text-[10px] mt-0.5 leading-tight">{hint}</p>}
    </div>
  )
}

function SectionHeader({ icon: Icon, label, sub }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-g-800">
      <Icon className="w-4 h-4 text-g-500" />
      <div>
        <p className="text-g-400 text-xs font-bold uppercase tracking-widest">{label}</p>
        {sub && <p className="text-g-700 text-[10px]">{sub}</p>}
      </div>
    </div>
  )
}

const inputCls  = "w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
const selectCls = inputCls

// ─── Modal principal ──────────────────────────────────────────────────
export default function FaturaFormModal({ onClose, onSaved }) {
  const backdropRef = useRef(null)
  const { selectedCompany } = useCompanies()
  const empresaFiltro = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  // ── Step ──
  const [step, setStep] = useState(1)

  // ── Step 1: Contrato ──
  const [contratos,       setContratos]       = useState([])
  const [contrato,        setContrato]        = useState(null)
  const [veiculos,        setVeiculos]        = useState([])
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [loadingCt,       setLoadingCt]       = useState(false)

  // ── Step 2: Período + Dados Gerais ──
  const today = new Date()
  const [anoSel,        setAnoSel]        = useState(today.getFullYear())
  const [mesSel,        setMesSel]        = useState(today.getMonth() + 1)
  const [dataEmissao,   setDataEmissao]   = useState(mesParaDate(today.getFullYear(), today.getMonth() + 1))
  const [vencimento,    setVencimento]    = useState('')
  const [formaPgto,     setFormaPgto]     = useState('Boleto')
  const [numeroFatura,  setNumeroFatura]  = useState('')

  // ── Step 3: Detalhamento por veículo ──
  const [veiculoRows,     setVeiculoRows]     = useState([])   // [{id_veiculo, placa, modelo, valor_diaria, qtd_dias, subtotal}]
  const [prefillLoading,  setPrefillLoading]  = useState(false)
  const [prefillDone,     setPrefillDone]     = useState(false)
  const [aliquota,        setAliquota]        = useState('11.33')
  const [valorRec,        setValorRec]        = useState('')
  const [statusRec,       setStatusRec]       = useState('Pendente')
  const [statusImp,       setStatusImp]       = useState('Pendente')
  const [observacoes,     setObservacoes]     = useState('')

  const [saving, setSaving] = useState(false)

  // ── Computed totals ──
  const totalLoc  = useMemo(() => roundTo(veiculoRows.reduce((s, r) => s + (r.subtotal || 0), 0)), [veiculoRows])
  const aliqNum   = parseFloat(aliquota) || 0
  const imposto   = roundTo(totalLoc * aliqNum / 100)
  const liquido   = roundTo(totalLoc - imposto)
  const recNum    = parseFloat(valorRec) || 0

  // ── Load contratos ──
  useEffect(() => {
    setLoadingCt(true)
    const params = {
      ...(incluirInativos ? { incluir_inativos: true } : {}),
      ...(empresaFiltro   ? { empresa: empresaFiltro }  : {}),
    }
    getContratos(params)
      .then(d => setContratos(d || []))
      .finally(() => setLoadingCt(false))
  }, [incluirInativos, empresaFiltro])

  // ── Load veículos quando contrato muda ──
  useEffect(() => {
    if (!contrato) { setVeiculos([]); return }
    getContratoVeiculos(contrato.id).then(d => setVeiculos(d || []))
  }, [contrato])

  // ── Auto-fill número de fatura quando contrato muda ──
  useEffect(() => {
    if (!contrato?.empresa_id) { setNumeroFatura(''); return }
    getProximoNumeroFatura(contrato.empresa_id).then(d => setNumeroFatura(String(d.proximo)))
  }, [contrato])

  // ── Atualiza data emissão quando mês/ano muda ──
  useEffect(() => {
    setDataEmissao(mesParaDate(anoSel, mesSel))
  }, [anoSel, mesSel])

  // ── Atualiza vencimento quando emissão muda ──
  useEffect(() => {
    if (dataEmissao) setVencimento(addDays(dataEmissao, 30))
  }, [dataEmissao])

  // ── Load prefill ao entrar no passo 3 ──
  useEffect(() => {
    if (step !== 3 || !contrato) return
    const mes = `${anoSel}-${String(mesSel).padStart(2, '0')}`
    setPrefillLoading(true)
    setPrefillDone(false)
    getFaturamentoPrefill(contrato.id, mes)
      .then(d => {
        const rows = (d?.por_veiculo || []).map(v => ({
          id_veiculo:  v.id_veiculo,
          placa:       v.placa  || '—',
          modelo:      v.modelo || '—',
          valor_diaria: v.valor_diaria || 0,
          qtd_dias:    30,
          subtotal:    roundTo((v.valor_diaria || 0) * 30),
        }))
        // Se não há dados de fat_unitario, cria linhas zeradas para os veículos do contrato
        if (rows.length === 0 && veiculos.length > 0) {
          veiculos.forEach(v => rows.push({
            id_veiculo:   v.id_veiculo,
            placa:        v.placa  || '—',
            modelo:       v.modelo || '—',
            valor_diaria: 0,
            qtd_dias:     30,
            subtotal:     0,
          }))
        }
        setVeiculoRows(rows)
        if (d?.valor_locacoes > 0) setPrefillDone(true)
      })
      .catch(() => {})
      .finally(() => setPrefillLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, contrato, anoSel, mesSel])

  // ── Handlers de veículo ──
  const updateRow = (idx, field, raw) => {
    setVeiculoRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: raw === '' ? '' : parseFloat(raw) || 0 }
      updated.subtotal = roundTo((parseFloat(updated.valor_diaria) || 0) * (parseFloat(updated.qtd_dias) || 0))
      return updated
    }))
  }

  const handleContrato = cid => {
    const c = contratos.find(c => String(c.id) === String(cid))
    setContrato(c || null)
    setVeiculoRows([])
    setPrefillDone(false)
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!contrato)             return toast.error('Selecione o contrato')
    if (!totalLoc || totalLoc <= 0) return toast.error('O valor total deve ser maior que zero')
    if (!vencimento)           return toast.error('Informe a data de vencimento')
    if (!dataEmissao)          return toast.error('Informe a data de emissão')

    setSaving(true)
    try {
      await criarFatura({
        numero_fatura:      numeroFatura ? parseInt(numeroFatura) : null,
        id_empresa:         contrato.empresa_id || null,
        id_contrato:        contrato.id,
        id_cliente:         contrato.cliente_id || null,
        emissao:            dataEmissao,
        vencimento,
        valor_locacoes:     totalLoc,
        valor_recebido:     recNum > 0 ? recNum : null,
        status_recebimento: statusRec,
        empresa:            contrato.nome_cliente || null,
        aliquota_imposto:   aliqNum,
        valor_imposto:      imposto,
        valor_liquido:      liquido,
        status_imposto:     statusImp,
        forma_pagamento:    formaPgto || null,
        observacoes:        observacoes || null,
      })
      toast.success('Fatura cadastrada com sucesso')
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao salvar fatura')
    } finally {
      setSaving(false)
    }
  }

  const canAdvance = () => {
    if (step === 1) return !!contrato
    if (step === 2) return !!dataEmissao && !!vencimento
    return true
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col"
           style={{ maxHeight: '94vh' }}>

        {/* ── Cabeçalho ── */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Receipt className="w-6 h-6 text-emerald-700" />
              </div>
              <div>
                <h2 className="text-g-50 font-bold text-lg tracking-tight">Nova Fatura de Locação</h2>
                <p className="text-g-500 text-xs mt-0.5">Registro de fatura mensal com detalhamento por veículo</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Stepper */}
          <div className="flex items-center gap-2">
            <StepLabel n={1} label="Contrato"      active={step === 1} done={step > 1} onClick={() => setStep(1)} />
            <StepLabel n={2} label="Período"       active={step === 2} done={step > 2} onClick={() => setStep(2)} />
            <StepLabel n={3} label="Detalhamento"  active={step === 3} done={false}    />
          </div>
        </div>

        {/* ── Corpo scrollável ── */}
        <div className="overflow-y-auto flex-1 px-8 py-6 flex flex-col gap-6">

          {/* ══════════════════════════════════════════
              PASSO 1 — Contrato
          ══════════════════════════════════════════ */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <SectionHeader icon={Building2} label="Seleção de Contrato"
                sub="Selecione o contrato ao qual esta fatura será vinculada" />

              {loadingCt ? (
                <div className="flex items-center gap-2 text-g-600 text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando contratos…
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <Field label="Contrato" required>
                    <select
                      value={contrato?.id || ''}
                      onChange={e => handleContrato(e.target.value)}
                      className={`${selectCls} text-sm`}
                    >
                      <option value="">Selecione o contrato…</option>
                      {contratos.map(c => (
                        <option key={c.id} value={c.id}>
                          #{c.id} · {c.empresa_sigla} · {c.nome_cliente}
                          {c.placas?.length ? ` · ${c.placas.slice(0, 4).join(', ')}${c.placas.length > 4 ? ` +${c.placas.length - 4}` : ''}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <button
                    type="button"
                    onClick={() => { setIncluirInativos(v => !v); setContrato(null) }}
                    className={`flex items-center gap-2 text-xs self-start px-3 py-2 rounded-lg border transition-all ${
                      incluirInativos
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                        : 'border-g-800 text-g-600 hover:border-g-700 hover:text-g-400'
                    }`}
                  >
                    {incluirInativos ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    Mostrar contratos encerrados
                  </button>

                  {/* Card detalhado do contrato */}
                  {contrato && (
                    <div className="p-5 bg-g-900 border border-g-800 rounded-xl flex flex-col gap-4">
                      {/* Linha superior: badges + nome */}
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-g-850 border border-g-800 rounded-lg shrink-0">
                          <Building2 className="w-5 h-5 text-g-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="text-g-600 text-[10px] font-mono">#{contrato.id}</span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-g-800 text-g-300">
                              {contrato.empresa_sigla}
                            </span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              contrato.status === 'Ativo'
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-700/40'
                                : 'bg-g-850 text-g-600 border-g-800'
                            }`}>{contrato.status}</span>
                          </div>
                          <p className="text-g-100 text-base font-bold">{contrato.nome_cliente}</p>
                        </div>
                        {(contrato.data_inicio || contrato.data_fim) && (
                          <div className="text-right shrink-0">
                            <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold mb-0.5">Vigência</p>
                            <p className="text-g-400 text-xs font-mono">
                              {contrato.data_inicio || '—'} → {contrato.data_fim || '—'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Grade de veículos */}
                      {veiculos.length > 0 && (
                        <div>
                          <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold mb-2">
                            Veículos vinculados ({veiculos.length})
                          </p>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                            {veiculos.map(v => (
                              <div key={v.id_veiculo}
                                className="flex flex-col items-center px-2 py-1.5 rounded-lg bg-g-850 border border-g-800">
                                <span className="font-mono text-[11px] font-bold text-g-300">{v.placa}</span>
                                <span className="text-g-700 text-[9px] truncate w-full text-center">{v.modelo}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════
              PASSO 2 — Período & Dados Gerais
          ══════════════════════════════════════════ */}
          {step === 2 && (
            <div className="flex flex-col gap-6">
              <SectionHeader icon={Calendar} label="Período de Referência"
                sub="Defina o mês/ano de referência, as datas e a forma de pagamento" />

              {/* Período */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Mês de Referência" required>
                  <select value={mesSel} onChange={e => setMesSel(Number(e.target.value))} className={selectCls}>
                    {MONTHS_BR.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ano" required>
                  <select value={anoSel} onChange={e => setAnoSel(Number(e.target.value))} className={selectCls}>
                    {ANOS_DISPONIVEIS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data de Emissão" required
                  hint="Data exata de emissão da fatura. Pré-preenchida com o 1º do mês selecionado.">
                  <input
                    type="date"
                    value={dataEmissao}
                    onChange={e => setDataEmissao(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Data de Vencimento" required
                  hint="Padrão: emissão + 30 dias.">
                  <input
                    type="date"
                    value={vencimento}
                    onChange={e => setVencimento(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              {/* Forma de pagamento + Status + Nº Fatura */}
              <div className="grid grid-cols-3 gap-4">
                <Field label="Forma de Pagamento" required>
                  <select value={formaPgto} onChange={e => setFormaPgto(e.target.value)} className={selectCls}>
                    <option value="">Selecione…</option>
                    {FORMAS_PAGAMENTO.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status de Recebimento">
                  <select value={statusRec} onChange={e => setStatusRec(e.target.value)} className={selectCls}>
                    {STATUS_REC.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Nº Fatura" hint="Sequencial por empresa. Preenchido automaticamente.">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={numeroFatura}
                    onChange={e => setNumeroFatura(e.target.value)}
                    placeholder="Ex: 42"
                    className={`${inputCls} font-mono`}
                  />
                </Field>
              </div>

              {/* Card resumo do contexto */}
              <div className="p-4 bg-g-900 border border-g-800 rounded-xl flex items-center gap-4">
                <Calendar className="w-4 h-4 text-g-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-g-300 text-sm font-semibold">{MONTHS_BR[mesSel - 1]} {anoSel}</p>
                  <p className="text-g-600 text-xs">
                    {contrato?.nome_cliente} · <span className="font-bold text-g-400">{contrato?.empresa_sigla}</span>
                    {formaPgto && <span className="ml-2 text-g-500">· {formaPgto}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-g-600 text-[10px] uppercase tracking-wider">Emissão → Vencimento</p>
                  <p className="text-g-400 text-xs font-mono">
                    {dataEmissao || '—'} → {vencimento || '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              PASSO 3 — Detalhamento por Veículo
          ══════════════════════════════════════════ */}
          {step === 3 && (
            <div className="flex flex-col gap-6">

              {/* Contexto da fatura */}
              <div className="p-4 bg-g-900 border border-g-800 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <p className="text-g-200 text-sm font-bold">{contrato?.nome_cliente}</p>
                  <p className="text-g-600 text-xs">
                    {MONTHS_BR[mesSel - 1]}/{anoSel} · {contrato?.empresa_sigla} · {formaPgto}
                    <span className="ml-2 font-mono">Emissão: {dataEmissao} · Venc: {vencimento}</span>
                  </p>
                </div>
                {prefillLoading ? (
                  <span className="flex items-center gap-1.5 text-g-600 text-xs shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando valores…
                  </span>
                ) : prefillDone ? (
                  <span className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold shrink-0">
                    <Sparkles className="w-3.5 h-3.5" /> Valores pré-preenchidos
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-600 text-xs shrink-0">
                    <AlertCircle className="w-3.5 h-3.5" /> Sem dados históricos — preencha manualmente
                  </span>
                )}
              </div>

              {/* ── Tabela de veículos ── */}
              <div>
                <SectionHeader icon={Truck} label="Detalhamento por Veículo"
                  sub="Informe a quantidade de dias e o valor de diária de cada veículo. Padrão: 30 dias." />

                <div className="rounded-xl border border-g-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-g-850 border-b border-g-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-g-500 text-[11px] uppercase tracking-wider font-semibold">Placa</th>
                        <th className="px-4 py-3 text-left text-g-500 text-[11px] uppercase tracking-wider font-semibold">Modelo</th>
                        <th className="px-4 py-3 text-center text-g-500 text-[11px] uppercase tracking-wider font-semibold w-28">
                          Qtd Dias
                        </th>
                        <th className="px-4 py-3 text-right text-g-500 text-[11px] uppercase tracking-wider font-semibold w-40">
                          Valor / Dia (R$)
                        </th>
                        <th className="px-4 py-3 text-right text-g-500 text-[11px] uppercase tracking-wider font-semibold w-40">
                          Subtotal (R$)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {veiculoRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-g-700 text-xs">
                            {prefillLoading ? 'Carregando…' : 'Nenhum veículo encontrado para este contrato.'}
                          </td>
                        </tr>
                      )}
                      {veiculoRows.map((row, idx) => (
                        <tr key={row.id_veiculo} className="border-b border-g-800/60 hover:bg-g-900/60 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-g-200 text-sm">{row.placa}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-g-500 text-xs truncate block max-w-[180px]">{row.modelo}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              max="31"
                              step="1"
                              value={row.qtd_dias === '' ? '' : row.qtd_dias}
                              onChange={e => updateRow(idx, 'qtd_dias', e.target.value)}
                              className="w-20 text-center px-2 py-1.5 bg-g-850 border border-g-700 rounded-lg text-g-200 text-sm font-mono focus:outline-none focus:border-g-500 transition-colors tabular-nums"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.valor_diaria === '' ? '' : row.valor_diaria}
                              onChange={e => updateRow(idx, 'valor_diaria', e.target.value)}
                              className="w-36 text-right px-2 py-1.5 bg-g-850 border border-g-700 rounded-lg text-g-200 text-sm font-mono focus:outline-none focus:border-g-500 transition-colors tabular-nums"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono font-bold text-sm tabular-nums ${row.subtotal > 0 ? 'text-g-100' : 'text-g-700'}`}>
                              {brl(row.subtotal || 0)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-g-850 border-t-2 border-g-700">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-g-500 text-xs font-semibold uppercase tracking-wider">
                          Total de Locações ({veiculoRows.length} veículo{veiculoRows.length !== 1 ? 's' : ''})
                        </td>
                        <td colSpan={2} className="px-4 py-3 text-right font-mono font-bold text-xl text-g-100 tabular-nums">
                          {brl(totalLoc)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── Impostos e resumo ── */}
              <div>
                <SectionHeader icon={Hash} label="Impostos & Resumo" />
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <Field label="Alíquota Imposto (%)"
                    hint="Imposto sobre faturamento. Padrão: 11,33%.">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={aliquota}
                      onChange={e => setAliquota(e.target.value)}
                      className={`${inputCls} font-mono`}
                    />
                  </Field>
                  <Field label="Status do Imposto">
                    <select value={statusImp} onChange={e => setStatusImp(e.target.value)} className={selectCls}>
                      {STATUS_IMP.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Valor Já Recebido (R$)">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorRec}
                      onChange={e => setValorRec(e.target.value)}
                      placeholder="0,00"
                      className={`${inputCls} font-mono`}
                    />
                  </Field>
                </div>

                {/* Painel de resumo financeiro */}
                {totalLoc > 0 && (
                  <div className="grid grid-cols-4 gap-3 p-5 bg-g-900 border border-g-800 rounded-xl">
                    {[
                      { label: 'Faturamento Bruto', val: totalLoc, color: 'text-g-100',      sub: `${veiculoRows.length} veíc.` },
                      { label: 'Imposto',           val: imposto,  color: 'text-amber-600',  sub: `${aliqNum.toFixed(2)}%` },
                      { label: 'Valor Líquido',     val: liquido,  color: 'text-indigo-400', sub: 'Bruto − Imposto' },
                      { label: 'Já Recebido',       val: recNum,   color: recNum > 0 ? 'text-emerald-700' : 'text-g-700', sub: statusRec },
                    ].map(({ label, val, color, sub }) => (
                      <div key={label} className="text-center">
                        <p className="text-g-600 text-[10px] uppercase tracking-wider mb-1">{label}</p>
                        <p className={`font-mono font-bold text-base ${color} tabular-nums`}>{brl(val)}</p>
                        <p className="text-g-700 text-[10px] mt-0.5">{sub}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Observações ── */}
              <div>
                <Field label="Observações">
                  <textarea
                    value={observacoes}
                    onChange={e => setObservacoes(e.target.value)}
                    rows={2}
                    placeholder="Notas adicionais, referências, divergências…"
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* ── Rodapé ── */}
        <div className="px-8 py-4 border-t border-g-800 shrink-0 flex items-center justify-between gap-4 bg-g-950/80">
          {/* Info contextual */}
          <div className="text-xs text-g-700 hidden sm:block">
            {step === 3 && totalLoc > 0 && (
              <span className="font-mono">
                Total: <span className="text-g-400 font-bold">{brl(totalLoc)}</span>
                {' · '}Imposto: <span className="text-amber-600 font-bold">{brl(imposto)}</span>
                {' · '}Líquido: <span className="text-indigo-500 font-bold">{brl(liquido)}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
              className="px-5 py-2.5 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 hover:text-g-200 transition-colors"
            >
              {step > 1 ? '← Voltar' : 'Cancelar'}
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (!canAdvance()) return toast.error(step === 1 ? 'Selecione o contrato' : 'Preencha os campos obrigatórios')
                  setStep(s => s + 1)
                }}
                disabled={!canAdvance()}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-g-700 hover:bg-g-600 border border-g-600"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving || !totalLoc || totalLoc <= 0}
                className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-600"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <Receipt className="w-4 h-4" />
                Cadastrar Fatura
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
