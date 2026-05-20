import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, FileText, Building2, Truck, Search, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  criarContrato, atualizarContrato,
  getContratoVeiculos, syncVeiculosContrato,
  getFrotaDisponivel, getClientes,
} from '../../utils/api'
import { useCompanies } from '../../contexts/CompanyContext'
import { brl } from '../../utils/format'

const STATUS_OPTIONS = ['Ativo', 'Encerrado', 'Renovado']

const inputCls  = "w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
const selectCls = inputCls
const numInputCls = "w-full px-2.5 py-1.5 bg-g-850 border border-g-700 rounded-lg text-g-200 text-sm font-mono text-right placeholder-g-700 focus:outline-none focus:border-g-500 transition-colors tabular-nums"

function Field({ label, required, hint, children, col = 1 }) {
  return (
    <div className={`flex flex-col gap-1.5 ${col === 2 ? 'col-span-2' : ''}`}>
      <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-g-700 text-[10px] mt-0.5">{hint}</p>}
    </div>
  )
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-g-800">
      <Icon className="w-4 h-4 text-g-500" />
      <p className="text-g-400 text-xs font-bold uppercase tracking-widest">{label}</p>
    </div>
  )
}

export default function ContratoFormModal({ contrato = null, onClose, onSaved }) {
  const { companies } = useCompanies()
  const isEdit = !!contrato
  const backdropRef = useRef(null)

  // ── Dados do contrato ──
  const [empresaId,     setEmpresaId]     = useState(String(contrato?.empresa_id  ?? ''))
  const [clienteId,     setClienteId]     = useState(String(contrato?.cliente_id  ?? ''))
  const [nomeCliente,   setNomeCliente]   = useState(contrato?.nome_cliente ?? '')
  const [cidade,        setCidade]        = useState(contrato?.cidade_operacao ?? '')
  const [estado,        setEstado]        = useState(contrato?.estado_operacao ?? '')
  const [dataInicio,    setDataInicio]    = useState(contrato?.data_inicio  ?? '')
  const [dataFim,       setDataFim]       = useState(contrato?.data_fim     ?? '')
  const [dataEnc,       setDataEnc]       = useState(contrato?.data_encerramento ?? '')
  const [status,        setStatus]        = useState(contrato?.status ?? 'Ativo')
  // ── Pagamento ──
  const [formaPgto,     setFormaPgto]     = useState(contrato?.forma_pagamento ?? '')
  const [multaPct,      setMultaPct]      = useState(contrato?.multa_pct   != null ? String(contrato.multa_pct)  : '')
  const [jurosPct,      setJurosPct]      = useState(contrato?.juros_pct   != null ? String(contrato.juros_pct)  : '')
  const [diasProtesto,  setDiasProtesto]  = useState(contrato?.dias_protesto != null ? String(contrato.dias_protesto) : '')
  // ── Controle ──
  const [assinado,      setAssinado]      = useState(contrato?.assinado ?? false)

  // ── Veículos ──
  // [{ id_veiculo, placa, modelo, empresa, valor_mensal: '' }]
  const [selectedVeics, setSelectedVeics] = useState([])
  const [frotaDisp,     setFrotaDisp]     = useState([])   // disponíveis para adicionar
  const [clientes,      setClientes]      = useState([])
  const [search,        setSearch]        = useState('')
  const [loadingVeics,  setLoadingVeics]  = useState(false)

  const [saving, setSaving] = useState(false)

  // IDs já selecionados (para filtrar a lista disponível)
  const selectedIds = useMemo(() => new Set(selectedVeics.map(v => v.id_veiculo)), [selectedVeics])

  // Lista disponível filtrada por busca e excluindo já selecionados
  const frotaToShow = useMemo(() => {
    return frotaDisp
      .filter(v => !selectedIds.has(v.id))
      .filter(v => {
        if (!search) return true
        const q = search.toLowerCase()
        return v.placa?.toLowerCase().includes(q) || v.modelo?.toLowerCase().includes(q) || v.empresa?.toLowerCase().includes(q)
      })
  }, [frotaDisp, selectedIds, search])

  // ── Carregar dados de referência ──
  useEffect(() => {
    getClientes().then(d => setClientes(d || []))
    getFrotaDisponivel(isEdit ? contrato.id : undefined)
      .then(d => setFrotaDisp(d || []))

    if (isEdit) {
      setLoadingVeics(true)
      getContratoVeiculos(contrato.id)
        .then(d => setSelectedVeics(
          (d || []).map(v => ({
            id_veiculo:   v.id_veiculo,
            placa:        v.placa    || '—',
            modelo:       v.modelo   || '—',
            empresa:      '',
            valor_mensal: v.valor_mensal != null ? String(v.valor_mensal) : '',
          }))
        ))
        .finally(() => setLoadingVeics(false))
    }
  }, []) // eslint-disable-line

  // Auto-fill nome_cliente a partir do select de clientes
  useEffect(() => {
    if (clienteId && !nomeCliente) {
      const c = clientes.find(c => String(c.id) === clienteId)
      if (c) setNomeCliente(c.nome)
    }
  }, [clienteId, clientes]) // eslint-disable-line

  // ── Handlers de veículos ──
  const addVeiculo = (v) => {
    setSelectedVeics(prev => [...prev, {
      id_veiculo:   v.id,
      placa:        v.placa    || '—',
      modelo:       v.modelo   || '—',
      empresa:      v.empresa  || '',
      valor_mensal: '',
    }])
    setSearch('')
  }

  const removeVeiculo = (id_veiculo) => {
    setSelectedVeics(prev => prev.filter(v => v.id_veiculo !== id_veiculo))
  }

  const updateValor = (id_veiculo, raw) => {
    setSelectedVeics(prev => prev.map(v =>
      v.id_veiculo === id_veiculo ? { ...v, valor_mensal: raw } : v
    ))
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!nomeCliente.trim()) return toast.error('Informe o nome do cliente')
    if (selectedVeics.length === 0) return toast.error('Adicione ao menos um veículo ao contrato')

    const missingValor = selectedVeics.filter(v => !v.valor_mensal || parseFloat(v.valor_mensal) <= 0)
    if (missingValor.length > 0) {
      return toast.error(`Informe o valor mensal de: ${missingValor.map(v => v.placa).join(', ')}`)
    }

    setSaving(true)
    try {
      const payload = {
        empresa_id:        empresaId ? parseInt(empresaId) : null,
        cliente_id:        clienteId ? parseInt(clienteId) : null,
        nome_cliente:      nomeCliente.trim(),
        cidade_operacao:   cidade   || null,
        estado_operacao:   estado   || null,
        data_inicio:       dataInicio || null,
        data_fim:          dataFim    || null,
        data_encerramento: status !== 'Ativo' ? (dataEnc || null) : null,
        status_contrato:   status,
        forma_pagamento:   formaPgto  || null,
        multa_pct:         multaPct   ? parseFloat(multaPct)  : null,
        juros_pct:         jurosPct   ? parseFloat(jurosPct)  : null,
        dias_protesto:     diasProtesto ? parseInt(diasProtesto) : null,
        assinado:          assinado,
      }

      let saved
      if (isEdit) {
        saved = await atualizarContrato(contrato.id, payload)
      } else {
        saved = await criarContrato(payload)
      }

      // Sync veículos (PUT atômico)
      await syncVeiculosContrato(saved.id, selectedVeics.map((v, i) => ({
        id_veiculo:   v.id_veiculo,
        sequencia:    i + 1,
        valor_mensal: parseFloat(v.valor_mensal) || null,
      })))

      toast.success(isEdit ? 'Contrato atualizado' : 'Contrato criado com sucesso')
      onSaved?.(saved)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao salvar contrato')
    } finally {
      setSaving(false)
    }
  }

  const totalMensal = selectedVeics.reduce((s, v) => s + (parseFloat(v.valor_mensal) || 0), 0)

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div
        className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col"
        style={{ maxHeight: '94vh' }}
      >
        {/* Cabeçalho */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-g-850 border border-g-800">
              <FileText className="w-5 h-5 text-g-400" />
            </div>
            <div>
              <h2 className="text-g-50 font-bold text-base">
                {isEdit ? `Editar Contrato #${contrato.id}` : 'Novo Contrato'}
              </h2>
              <p className="text-g-600 text-xs mt-0.5">
                {isEdit ? contrato.nome_cliente : 'Preencha os dados e defina os veículos e valores mensais'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="overflow-y-auto flex-1 px-8 py-6 flex flex-col gap-6">

          {/* ── Identificação ── */}
          <div>
            <SectionHeader icon={Building2} label="Identificação" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Empresa Emissora">
                <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className={selectCls}>
                  <option value="">Selecione a empresa…</option>
                  {(companies || []).filter(c => c.id !== 'grupo').map(c => (
                    <option key={c.id} value={c.id}>{c.sigla || c.nome}</option>
                  ))}
                </select>
              </Field>

              <Field label="Vínculo com Cliente" hint="Opcional">
                <select value={clienteId} onChange={e => setClienteId(e.target.value)} className={selectCls}>
                  <option value="">Sem vínculo cadastral…</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </Field>

              <Field label="Nome do Tomador / Cliente" required col={2}>
                <input
                  type="text"
                  value={nomeCliente}
                  onChange={e => setNomeCliente(e.target.value)}
                  placeholder="Razão social ou nome do tomador do serviço"
                  className={inputCls}
                />
              </Field>

              <Field label="Cidade de Operação">
                <input type="text" value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Ex: São Paulo" className={inputCls} />
              </Field>

              <Field label="Estado (UF)">
                <input type="text" value={estado} onChange={e => setEstado(e.target.value.toUpperCase())} placeholder="SP" maxLength={2} className={inputCls} />
              </Field>
            </div>
          </div>

          {/* ── Vigência ── */}
          <div>
            <SectionHeader icon={FileText} label="Vigência & Status" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Início da Vigência">
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Previsão de Encerramento">
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Status">
                <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {status !== 'Ativo' && (
                <Field label="Data de Encerramento Efetivo">
                  <input type="date" value={dataEnc} onChange={e => setDataEnc(e.target.value)} className={inputCls} />
                </Field>
              )}
              <Field label="Assinatura">
                <label className="flex items-center gap-3 cursor-pointer group h-[42px]">
                  <div
                    onClick={() => setAssinado(v => !v)}
                    className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${assinado ? 'bg-emerald-600' : 'bg-g-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${assinado ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className={`text-sm font-medium transition-colors ${assinado ? 'text-emerald-700' : 'text-g-600'}`}>
                    {assinado ? 'Contrato assinado' : 'Aguardando assinatura'}
                  </span>
                </label>
              </Field>
            </div>
          </div>

          {/* ── Pagamento ── */}
          <div>
            <SectionHeader icon={FileText} label="Forma de Pagamento" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Forma de Pagamento do Cliente">
                <select value={formaPgto} onChange={e => setFormaPgto(e.target.value)} className={selectCls}>
                  <option value="">Não informado</option>
                  <option value="PIX">PIX</option>
                  <option value="Boleto">Boleto</option>
                </select>
              </Field>

              {formaPgto === 'Boleto' && (
                <>
                  <Field label="Multa por Atraso (%)" hint="Ex: 2 para 2%">
                    <input type="number" step="0.01" min="0" max="100" value={multaPct} onChange={e => setMultaPct(e.target.value)} placeholder="2,00" className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Juros ao Mês (%)" hint="Ex: 1 para 1% a.m.">
                    <input type="number" step="0.0001" min="0" max="100" value={jurosPct} onChange={e => setJurosPct(e.target.value)} placeholder="1,0000" className={`${inputCls} font-mono`} />
                  </Field>
                  <Field label="Dias para Protesto" hint="Dias corridos após vencimento">
                    <input type="number" step="1" min="1" value={diasProtesto} onChange={e => setDiasProtesto(e.target.value)} placeholder="30" className={`${inputCls} font-mono`} />
                  </Field>
                </>
              )}
            </div>
          </div>

          {/* ── Veículos vinculados ── */}
          <div>
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-g-800">
              <Truck className="w-4 h-4 text-g-500" />
              <p className="text-g-400 text-xs font-bold uppercase tracking-widest">
                Veículos & Valores Mensais
              </p>
              {selectedVeics.length === 0 && (
                <span className="ml-auto flex items-center gap-1 text-amber-600 text-[10px] font-semibold">
                  <AlertCircle className="w-3 h-3" /> Obrigatório
                </span>
              )}
              {selectedVeics.length > 0 && (
                <span className="ml-auto text-g-600 text-[10px]">
                  {selectedVeics.length} veículo{selectedVeics.length !== 1 ? 's' : ''} · Total: <span className="text-g-300 font-mono font-semibold">{brl(totalMensal)}/mês</span>
                </span>
              )}
            </div>

            {/* Tabela dos veículos já selecionados */}
            {loadingVeics ? (
              <div className="flex items-center gap-2 text-g-600 text-xs py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
              </div>
            ) : selectedVeics.length > 0 ? (
              <div className="rounded-xl border border-g-800 overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-g-850 border-b border-g-800">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Placa</th>
                      <th className="px-4 py-2.5 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Modelo</th>
                      <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold w-44">
                        Valor Mensal (R$) <span className="text-red-500">*</span>
                      </th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedVeics.map(v => (
                      <tr key={v.id_veiculo} className="border-b border-g-800/60 hover:bg-g-900/40 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-sm text-g-200">{v.placa}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-g-500 text-xs">{v.modelo}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.valor_mensal}
                            onChange={e => updateValor(v.id_veiculo, e.target.value)}
                            placeholder="0,00"
                            className={numInputCls}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeVeiculo(v.id_veiculo)}
                            className="text-g-700 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {selectedVeics.length > 1 && (
                    <tfoot className="bg-g-850 border-t border-g-700">
                      <tr>
                        <td colSpan={2} className="px-4 py-2.5 text-g-600 text-[10px] uppercase tracking-wider font-semibold">Total mensal</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-g-200 tabular-nums">{brl(totalMensal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600/80 text-sm py-3 mb-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Nenhum veículo adicionado. Busque abaixo para incluir ao menos um.</span>
              </div>
            )}

            {/* Busca para adicionar veículos disponíveis */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-g-600 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Buscar veículo disponível por placa ou modelo…`}
                className="w-full pl-9 pr-4 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"
              />
            </div>

            {/* Resultados da busca */}
            {search && (
              <div className="mt-1.5 border border-g-800 rounded-xl overflow-hidden">
                {frotaToShow.length === 0 ? (
                  <p className="px-4 py-3 text-g-700 text-sm text-center">
                    {frotaDisp.filter(v => !selectedIds.has(v.id)).length === 0
                      ? 'Todos os veículos disponíveis já foram adicionados.'
                      : 'Nenhum veículo encontrado com essa busca.'}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-g-850 border-b border-g-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Placa</th>
                        <th className="px-4 py-2 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Modelo</th>
                        <th className="px-4 py-2 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Empresa</th>
                        <th className="w-24" />
                      </tr>
                    </thead>
                    <tbody>
                      {frotaToShow.map(v => (
                        <tr key={v.id} className="border-b border-g-800/60 hover:bg-g-850 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="font-mono font-bold text-g-300">{v.placa}</span>
                          </td>
                          <td className="px-4 py-2.5 text-g-500 text-xs">{v.modelo}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-g-800 text-g-500">{v.empresa}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => addVeiculo(v)}
                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors"
                            >
                              + Adicionar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Hint quando não há busca */}
            {!search && frotaDisp.filter(v => !selectedIds.has(v.id)).length > 0 && (
              <p className="text-g-700 text-[10px] mt-2">
                {frotaDisp.filter(v => !selectedIds.has(v.id)).length} veículo{frotaDisp.filter(v => !selectedIds.has(v.id)).length !== 1 ? 's' : ''} disponível{frotaDisp.filter(v => !selectedIds.has(v.id)).length !== 1 ? 'is' : ''} para locação. Digite para buscar.
              </p>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-8 py-4 border-t border-g-800 shrink-0 flex items-center justify-between gap-4 bg-g-950/80">
          <div className="text-xs text-g-700 hidden sm:block">
            {selectedVeics.length > 0 && (
              <span className="font-mono">
                {selectedVeics.length} veíc. · <span className="text-g-400">{brl(totalMensal)}/mês</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 hover:text-g-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !nomeCliente.trim()}
              className="px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 bg-g-700 hover:bg-g-600 border border-g-600"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <FileText className="w-4 h-4" />
              {isEdit ? 'Salvar Alterações' : 'Criar Contrato'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
