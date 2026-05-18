import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { dbMergeSugestoes, dbConfirmarMerge, dbListOs } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'
import EmptyState from '../EmptyState'
import { X, GitMerge, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'

function MotivoBadge({ motivo }) {
  const labels = {
    mesmo_id_ord_serv:    { label: 'Mesmo Nº OS',    color: 'bg-amber-50 text-amber-700 border-amber-200' },
    mesma_placa_fornec_d: { label: 'Placa+Forn+Dia', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    mesma_placa_valor:    { label: 'Placa+Valor',    color: 'bg-purple-50 text-purple-700 border-purple-200' },
  }
  const cfg = labels[motivo] || { label: motivo, color: 'bg-g-850 text-g-500 border-g-800' }
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function SugestaoCard({ sug, onMerged }) {
  const [open, setOpen] = useState(false)
  const [destino, setDestino] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const handleConfirmar = async () => {
    if (!destino) { toast.error('Selecione qual OS manter como destino'); return }
    setConfirming(true)
    try {
      await dbConfirmarMerge({ os_ids: sug.os_ids, os_destino_id: destino })
      toast.success(`Merge realizado — ${sug.os_ids.length} OS unificadas`)
      onMerged()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erro ao fazer merge')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="card border border-g-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-g-850 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono font-bold text-g-200 text-sm shrink-0">{sug.placa}</span>
          <span className="text-g-500 text-xs truncate max-w-[180px]">{sug.fornecedor || '—'}</span>
          <div className="flex gap-1 flex-wrap">
            {sug.motivos?.map(m => <MotivoBadge key={m} motivo={m} />)}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <span className="text-g-600 text-xs">{sug.os_ids.length} OS · {sug.total_itens} itens · {sug.total_nfs} NFs</span>
          {open ? <ChevronDown className="w-4 h-4 text-g-600" /> : <ChevronRight className="w-4 h-4 text-g-600" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-g-800 px-4 py-4 bg-g-850/40 flex flex-col gap-4">
          <p className="text-g-600 text-xs">Selecione qual OS deve ser mantida como destino. As demais serão removidas e seus itens / NFs migrados.</p>

          <div className="flex flex-col gap-2">
            {sug.candidatos?.map(os => (
              <label
                key={os.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  destino === os.id ? 'border-g-100 bg-g-900' : 'border-g-800 bg-g-900 hover:border-g-750'
                }`}
              >
                <input
                  type="radio"
                  name={`destino-${sug.os_ids.join('-')}`}
                  value={os.id}
                  checked={destino === os.id}
                  onChange={() => setDestino(os.id)}
                  className="mt-0.5 accent-emerald-600 shrink-0"
                />
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-g-200 text-xs font-bold">OS #{os.numero_os || os.id}</span>
                    {os.id_ord_serv && <span className="text-g-600 text-xs">· ID {os.id_ord_serv}</span>}
                    <span className="text-g-500 text-xs">{dateBR(os.data_execucao || os.data_entrada)}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-g-600">
                    <span>{os.itens_count ?? 0} itens</span>
                    <span>{os.nfs_count ?? 0} NFs</span>
                    {os.valor_total != null && <span>{brl(os.valor_total)}</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm text-g-500 hover:text-g-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!destino || confirming}
              className="flex items-center gap-2 px-4 py-2 bg-g-100 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {confirming
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mesclando…</>
                : <><CheckCircle className="w-3.5 h-3.5" /> Confirmar Merge</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MergeOsModal({ onClose, onMerged }) {
  const [loading, setLoading] = useState(true)
  const [sugestoes, setSugestoes] = useState([])
  const [error, setError] = useState(null)

  const fetch = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sugs, allOs] = await Promise.all([dbMergeSugestoes(), dbListOs()])
      const osMap = Object.fromEntries(allOs.map(o => [o.id, o]))
      const enriched = sugs.map(sug => ({
        ...sug,
        candidatos: sug.os_ids.map(id => {
          const o = osMap[id]
          if (!o) return { id }
          return {
            id: o.id,
            numero_os: o.numero_os,
            id_ord_serv: o.id_ord_serv,
            data_execucao: o.data_execucao,
            data_entrada: o.data_entrada,
            itens_count: (o.itens || []).length,
            nfs_count: (o.notas_fiscais || []).length,
            valor_total: (o.notas_fiscais || []).reduce((s, nf) => s + (nf.valor_total_nf || 0), 0),
          }
        }),
      }))
      setSugestoes(enriched)
    } catch (err) {
      console.error('MergeOsModal fetch error:', err?.response?.data || err?.message || err)
      setError(`Erro ao buscar sugestões de merge. ${err?.response?.data?.detail || err?.message || ''}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [])

  const handleMerged = () => {
    onMerged()
    fetch()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-12 px-4 pb-8 overflow-y-auto">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-2xl animate-fade-in flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-g-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <GitMerge className="w-5 h-5 text-g-100" />
            <div>
              <h2 className="text-g-100 font-bold text-base">Merge de OS Duplicadas</h2>
              <p className="text-g-600 text-xs mt-0.5">
                {loading ? 'Analisando…' : `${sugestoes.length} grupo${sugestoes.length !== 1 ? 's' : ''} identificado${sugestoes.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-3 px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-g-600 animate-spin" />
              <p className="text-g-500 text-sm">Analisando ordens de serviço…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 text-red-400 text-sm py-8 justify-center">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {!loading && !error && sugestoes.length === 0 && (
            <EmptyState
              icon={CheckCircle}
              title="Nenhuma duplicata encontrada"
              message="Todas as OS estão únicas. Nada a mesclar."
            />
          )}

          {!loading && !error && sugestoes.length > 0 && (
            <>
              <p className="text-g-600 text-xs">
                Expanda um grupo para selecionar qual OS manter. As demais serão removidas e seus itens e NFs migrados para o destino.
              </p>
              {sugestoes.map((sug, i) => (
                <SugestaoCard key={i} sug={sug} onMerged={handleMerged} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-g-800 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-g-500 hover:text-g-300 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
