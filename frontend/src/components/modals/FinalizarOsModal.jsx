import { useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { X, Loader2, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { dbExecutarOs, dbSyncNfs, dbFinalizarOs, dbEditarOsFinalizada } from '../../utils/api'
import { brl } from '../../utils/format'
import {
  parseMoney, gerarParcelas, validarLocal,
  NF_VAZIA, mapBackendNfToState,
} from '../../utils/finalizarOsUtils'
import ExecutarOsFlow from './ExecutarOsFlow'
import GerarNfsFlow from './GerarNfsFlow'

export default function FinalizarOsModal({ os, onClose, onSaved, editMode = false }) {
  const [step,   setStep]   = useState('executar')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)
  const [errosValidacao, setErrosValidacao] = useState(null)
  const [currentOs, setCurrentOs] = useState(os)

  const [execForm, setExecForm] = useState({
    data_execucao:      new Date().toISOString().slice(0, 10),
    km:                 os.km       ?? '',
    prox_km:            os.prox_km  ?? '',
    prox_data:          os.prox_data ?? '',
    status_execucao:    'Resolvido',
    descricao_pendente: '',
  })

  const [execFormEdit, setExecFormEdit] = useState({
    data_execucao: os.data_execucao ? String(os.data_execucao).slice(0, 10) : new Date().toISOString().slice(0, 10),
    km:            os.km       ?? '',
    prox_km:       os.prox_km  ?? '',
    prox_data:     os.prox_data ? String(os.prox_data).slice(0, 10) : '',
  })

  const [itensEdit, setItensEdit] = useState(
    (os.itens || []).map(it => ({
      id:        it.id,
      categoria: it.categoria || '',
      sistema:   it.sistema   || '',
      servico:   it.servico   || '',
      descricao: it.descricao || '',
      qtd_itens: it.qtd_itens ?? 1,
    }))
  )
  const addItem    = () => setItensEdit(arr => [...arr, { categoria: '', sistema: '', servico: '', descricao: '', qtd_itens: 1 }])
  const removeItem = i => setItensEdit(arr => arr.filter((_, idx) => idx !== i))
  const setItemField = (i, k, v) => setItensEdit(arr => arr.map((it, idx) => idx !== i ? it : { ...it, [k]: v }))

  const [nfs, setNfs] = useState(
    os.notas_fiscais?.length > 0
      ? os.notas_fiscais.map(nf => mapBackendNfToState(nf, os.itens || []))
      : [NF_VAZIA(os.itens || [])]
  )

  // ── NF state helpers ──────────────────────────────────────────────
  const setNf = (i, k, v) => setNfs(ns => ns.map((n, idx) => idx !== i ? n : { ...n, [k]: v }))

  const setNfAndRegen = (i, k, v) => setNfs(ns => ns.map((n, idx) => {
    if (idx !== i) return n
    const updated = { ...n, [k]: v }
    if (k === 'valor_total_nf' || k === 'qtd_parcelas') {
      updated.parcelas = gerarParcelas(
        k === 'qtd_parcelas' ? v : n.qtd_parcelas,
        k === 'valor_total_nf' ? v : n.valor_total_nf,
        n.data_emissao,
      )
    }
    return updated
  }))

  const addNf    = () => setNfs(ns => [...ns, NF_VAZIA(os.itens || [])])
  const removeNf = i => setNfs(ns => ns.filter((_, idx) => idx !== i))
  const clearNf  = i => setNfs(ns => ns.map((n, idx) => idx !== i ? n : NF_VAZIA(os.itens || [])))

  const setNfItem = (ni, realIdx, k, v) => setNfs(ns => ns.map((n, nidx) => nidx !== ni ? n : {
    ...n, itens: n.itens.map((it, iidx) => {
      if (iidx !== realIdx) return it
      const updated = { ...it, [k]: v }
      if (k === 'quantidade' || k === 'valor_unitario') {
        const qtd  = parseMoney(k === 'quantidade'     ? v : it.quantidade)
        const unit = parseMoney(k === 'valor_unitario' ? v : it.valor_unitario)
        updated.valor_total_item = (qtd * unit).toFixed(2)
      }
      return updated
    }),
  }))

  const setParc = (ni, pi, k, v) => setNfs(ns => ns.map((n, nidx) => nidx !== ni ? n : {
    ...n, parcelas: n.parcelas.map((p, pidx) => pidx !== pi ? p : { ...p, [k]: v }),
  }))

  // ── Build NF payload ──────────────────────────────────────────────
  const buildNfPayload = (nf) => {
    const itensVinculados = nf.itens.filter(it => {
      if (nf.tipo_nf === 'Produto') return it._categoria === 'Compra'
      if (nf.tipo_nf === 'Servico') return it._categoria === 'Serviço' || it._categoria === 'Servico' || !it._categoria
      return true
    }).filter(it => it.incluir && (parseMoney(it.valor_total_item) > 0 || parseMoney(it.valor_unitario) > 0))

    return {
      numero_nf:        nf.numero_nf        || null,
      tipo_nf:          nf.tipo_nf,
      id_empresa: nf.id_empresa || null,
      fornecedor:       nf.fornecedor       || null,
      valor_total_nf:   parseMoney(nf.valor_total_nf),
      data_emissao:     nf.data_emissao     || null,
      observacoes:      nf.observacoes      || null,
      itens: itensVinculados.map(it => ({
        os_item_id:       it.os_item_id,
        quantidade:       parseMoney(it.quantidade) || 1,
        valor_unitario:   parseMoney(it.valor_unitario),
        valor_total_item: parseMoney(it.valor_total_item),
      })),
      parcelas: nf.parcelas
        .filter(p => parseMoney(p.valor_parcela) > 0)
        .sort((a, b) => (a.data_vencimento || '9999-99-99').localeCompare(b.data_vencimento || '9999-99-99'))
        .map((p, i, arr) => ({
          data_vencimento:  p.data_vencimento || null,
          valor_parcela:    parseMoney(p.valor_parcela),
          forma_pgto:       p.forma_pgto,
          status_pagamento: p.status_pagamento,
          parcela_atual:    i + 1,
          parcela_total:    arr.length,
        })),
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────
  const handleExecutar = async () => {
    if (editMode) {
      setSaving(true); setError(null)
      try {
        const updated = await dbEditarOsFinalizada(currentOs.id, {
          data_execucao: execFormEdit.data_execucao || null,
          km:            execFormEdit.km !== '' && execFormEdit.km !== null ? parseFloat(execFormEdit.km) : null,
          prox_km:       execFormEdit.prox_km !== '' && execFormEdit.prox_km !== null ? parseFloat(execFormEdit.prox_km) : null,
          prox_data:     execFormEdit.prox_data || null,
          itens: itensEdit.map(it => ({
            id:        it.id,
            categoria: it.categoria || null,
            sistema:   it.sistema   || null,
            servico:   it.servico   || null,
            descricao: it.descricao || null,
            qtd_itens: parseInt(it.qtd_itens) || 1,
          })),
        })
        setCurrentOs(updated)
        setNfs(updated.notas_fiscais?.length > 0
          ? updated.notas_fiscais.map(nf => mapBackendNfToState(nf, updated.itens || []))
          : [NF_VAZIA(updated.itens || [])]
        )
        setStep('nfs')
      } catch (err) {
        const detail = err.response?.data?.detail
        if (typeof detail === 'string') setError(detail)
        else if (Array.isArray(detail)) setError(`Erro de validação: ${detail.map(d => `${d.loc.at(-1)}: ${d.msg}`).join('; ')}`)
        else setError('Erro ao salvar alterações da OS (verifique os campos)')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!execForm.data_execucao) { setError('Informe a data de execução'); return }
    const needsPendente = execForm.status_execucao === 'Parcialmente resolvido' || execForm.status_execucao === 'Pendente'
    if (needsPendente && !execForm.descricao_pendente.trim()) { setError('Descreva o que ficou pendente'); return }
    setSaving(true); setError(null)
    try {
      await dbExecutarOs(currentOs.id, {
        data_execucao:      execForm.data_execucao,
        km:                 execForm.km      ? parseFloat(execForm.km)      : null,
        prox_km:            execForm.prox_km ? parseFloat(execForm.prox_km) : null,
        prox_data:          execForm.prox_data || null,
        status_execucao:    execForm.status_execucao || null,
        descricao_pendente: needsPendente ? execForm.descricao_pendente : null,
      })
      setStep('nfs')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao executar OS')
    } finally {
      setSaving(false)
    }
  }

  const salvarNfEspecifica = async (ni) => {
    const nf = nfs[ni]
    const numValor = parseMoney(nf.valor_total_nf)
    if (!nf.id_empresa || numValor <= 0 || nf.parcelas.length === 0) {
      setError(`Preencha a Empresa e um Valor Total válido antes de salvar.`)
      return
    }
    setSaving(true); setError(null)
    try {
      await dbSyncNfs(currentOs.id, nfs.filter(n => n.tipo_nf).map(buildNfPayload))
      setNf(ni, 'is_saved', true)
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Erro ao salvar NF')
    } finally {
      setSaving(false)
    }
  }

  const salvarNfsParcial = async () => {
    setSaving(true); setError(null)
    try {
      const payload = nfs.filter(nf => nf.tipo_nf).map(buildNfPayload)
      if (payload.length > 0) await dbSyncNfs(currentOs.id, payload)
      onSaved()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Erro ao salvar NFs')
    } finally {
      setSaving(false)
    }
  }

  const salvarNfsERevisar = async () => {
    const erros = validarLocal(nfs, currentOs.itens || [])
    if (erros.length > 0) { setErrosValidacao(erros); setStep('finalizar'); return }
    setSaving(true); setError(null)
    try {
      const payload = nfs.filter(nf => nf.tipo_nf).map(buildNfPayload)
      if (payload.length > 0) await dbSyncNfs(currentOs.id, payload)
      setErrosValidacao([])
      setStep('finalizar')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Erro ao salvar NFs')
    } finally {
      setSaving(false)
    }
  }

  const salvarEdicaoFinalizada = async () => {
    setSaving(true); setError(null)
    try {
      const payload = nfs.filter(nf => nf.tipo_nf).map(buildNfPayload)
      if (payload.length > 0) await dbSyncNfs(currentOs.id, payload)
      toast.success('Edições financeiras salvas com sucesso!')
      onSaved()
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Erro ao salvar edições financeiras')
      toast.error('Erro ao salvar edições')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalizar = async () => {
    setSaving(true); setError(null)
    try {
      await dbFinalizarOs(currentOs.id)
      toast.success('OS finalizada com sucesso!')
      onSaved()
    } catch (err) {
      const detail = err.response?.data?.detail
      const errosBackend = detail?.erros ?? (Array.isArray(detail) ? detail : null)
      if (errosBackend) setErrosValidacao(errosBackend)
      else setError(typeof detail === 'string' ? detail : 'Erro ao finalizar OS')
      if (!errosBackend) toast.error('Erro ao finalizar OS')
    } finally {
      setSaving(false)
    }
  }

  const steps = editMode
    ? [{ key: 'executar', label: '1. Execução & Itens' }, { key: 'nfs', label: '2. Notas Fiscais' }, { key: 'finalizar', label: '3. Revisão' }]
    : [{ key: 'executar', label: '1. Execução' },         { key: 'nfs', label: '2. Notas Fiscais' }, { key: 'finalizar', label: '3. Finalizar' }]

  const needsPendente = execForm.status_execucao === 'Parcialmente resolvido' || execForm.status_execucao === 'Pendente'

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col animate-fade-up">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-g-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-50/20 border border-emerald-500/30 rounded-lg">
              <CheckCircle className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-g-200 font-semibold text-sm">{editMode ? 'Editar OS' : 'Finalizar OS'} · {os.placa}</h2>
              <p className="text-g-600 text-xs font-mono">{os.numero_os || 'sem nº'} · {os.placa}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-0 px-6 pt-4 shrink-0">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <span className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                step === s.key ? 'bg-g-100 text-white' :
                steps.findIndex(x => x.key === step) > i ? 'text-emerald-700' : 'text-g-700'
              }`}>{s.label}</span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-g-800 mx-1" />}
            </div>
          ))}
        </div>

        {/* OS items context */}
        {os.itens?.length > 0 && (
          <div className="px-6 pt-3 pb-1 shrink-0">
            <p className="text-g-600 text-xs font-semibold uppercase tracking-wider mb-1.5">Itens da OS</p>
            <div className="flex flex-wrap gap-2">
              {os.itens.map(it => (
                <span key={it.id} className="bg-g-850 border border-g-800 rounded-lg px-2.5 py-1 text-xs text-g-400">
                  {it.categoria && <span className="text-g-700 mr-1.5 font-medium">[{it.categoria}]</span>}
                  {it.sistema && <span className="text-g-600">{it.sistema} · </span>}
                  {it.servico || it.descricao || '—'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5 flex-1">

          {step === 'executar' && (
            <ExecutarOsFlow
              editMode={editMode}
              execForm={execForm} setExecForm={setExecForm} needsPendente={needsPendente}
              execFormEdit={execFormEdit} setExecFormEdit={setExecFormEdit}
              itensEdit={itensEdit} addItem={addItem} removeItem={removeItem} setItemField={setItemField}
            />
          )}

          {step === 'nfs' && (
            <GerarNfsFlow
              nfs={nfs}
              setNf={setNf} setNfItem={setNfItem} setNfAndRegen={setNfAndRegen} setParc={setParc}
              addNf={addNf} removeNf={removeNf} clearNf={clearNf}
              saving={saving} salvarNfEspecifica={salvarNfEspecifica}
            />
          )}

          {step === 'finalizar' && (
            errosValidacao === null ? (
              <div className="bg-g-850 border border-g-800 rounded-xl p-6 flex flex-col items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-g-600" />
                <p className="text-g-600 text-sm">Verificando consistência…</p>
              </div>
            ) : errosValidacao.length === 0 ? (
              <div className="bg-emerald-50/10 border border-emerald-500/30 rounded-xl p-5 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-700 shrink-0" />
                <div>
                  <p className="text-emerald-700 font-semibold text-sm">OS válida — sem inconsistências</p>
                  <p className="text-g-600 text-xs mt-0.5">Todos os itens vinculados, valores e parcelas consistentes.</p>
                </div>
              </div>
            ) : (
              <div className="bg-red-50/10 border border-red-500/30 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-red-400 font-semibold text-sm">
                    {errosValidacao.length} inconsistência{errosValidacao.length !== 1 ? 's' : ''} — corrija antes de finalizar
                  </p>
                </div>
                <ul className="pl-4 flex flex-col gap-1.5 mt-1">
                  {errosValidacao.map((v, i) => (
                    <li key={i} className="text-red-300 text-xs list-disc">{v}</li>
                  ))}
                </ul>
                <button onClick={() => setStep('nfs')}
                  className="mt-2 self-start text-xs text-g-500 underline hover:text-g-300 transition-colors">
                  ← Voltar para NFs e corrigir
                </button>
              </div>
            )
          )}

          {error && (
            <p className="text-red-500 text-xs bg-red-50/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-g-800 flex items-center justify-between shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">
            {editMode ? 'Cancelar' : 'Fechar'}
          </button>
          <div className="flex items-center gap-2">
            {step === 'nfs' && (
              <button type="button" onClick={() => setStep('executar')}
                className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">
                Voltar
              </button>
            )}
            {step === 'finalizar' && (
              <button type="button" onClick={() => setStep('nfs')}
                className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">
                Voltar para NFs
              </button>
            )}

            {step === 'executar' && (
              <button onClick={handleExecutar} disabled={saving}
                className="px-5 py-2 rounded-lg bg-g-100 text-white text-sm font-medium hover:bg-g-50 disabled:opacity-50 transition-colors flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editMode ? 'Salvar Alterações OS → NFs' : 'Executar → NFs'}
              </button>
            )}
            {step === 'nfs' && (
              <>
                <button onClick={salvarNfsParcial} disabled={saving}
                  className="px-4 py-2 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 hover:text-g-100 transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Aguardar novas NFs
                </button>
                <button onClick={salvarNfsERevisar} disabled={saving}
                  className="px-5 py-2 rounded-lg bg-g-100 text-white text-sm font-medium hover:bg-g-50 disabled:opacity-50 transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar Financeiro →
                </button>
              </>
            )}
            {step === 'finalizar' && (
              <button onClick={editMode ? salvarEdicaoFinalizada : handleFinalizar}
                disabled={saving || errosValidacao === null || errosValidacao.length > 0}
                className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-2">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editMode ? 'Confirmar Edições' : 'Finalizar OS'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
