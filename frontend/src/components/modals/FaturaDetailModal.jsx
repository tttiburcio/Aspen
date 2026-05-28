import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, Receipt, Building2, Calendar, MapPin,
  CreditCard, Landmark, AlertCircle,
  Truck, Hash, RefreshCw,
} from 'lucide-react'
import { getFaturaDetail, syncFaturaFat } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'
import toast from 'react-hot-toast'

// ─── helpers ────────────────────────────────────────────────────────────────

const REC_CLS = {
  Recebido:  { bar: 'text-emerald-600 bg-emerald-500/10 border-emerald-600/30', dot: 'bg-emerald-500' },
  Pendente:  { bar: 'text-amber-500   bg-amber-400/10   border-amber-500/30',   dot: 'bg-amber-400'   },
  Vencido:   { bar: 'text-red-400     bg-red-400/10     border-red-500/30',      dot: 'bg-red-400'     },
  Cancelado: { bar: 'text-g-500       bg-g-800/50       border-g-700/30',        dot: 'bg-g-600'       },
}
const IMP_CLS = {
  Pago:    { bar: 'text-emerald-600 bg-emerald-500/10 border-emerald-600/30', dot: 'bg-emerald-500' },
  Pendente:{ bar: 'text-amber-500   bg-amber-400/10   border-amber-500/30',   dot: 'bg-amber-400'   },
  Isento:  { bar: 'text-g-500       bg-g-800/50       border-g-700/30',        dot: 'bg-g-600'       },
}

function Badge({ status, map }) {
  const c = map[status] || map['Pendente']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${c.bar}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  )
}

function KpiMini({ label, value, sub, accent = 'text-g-100' }) {
  return (
    <div className="flex flex-col gap-0.5 p-3 bg-g-900 border border-g-800 rounded-xl">
      <p className="text-g-600 text-[10px] uppercase tracking-wider font-semibold">{label}</p>
      <p className={`font-bold text-base font-mono tabular-nums leading-tight ${accent}`}>{value}</p>
      {sub && <p className="text-g-600 text-[10px] tabular-nums">{sub}</p>}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-g-600 shrink-0" />
      <span className="text-g-600 text-xs">{label}:</span>
      <span className="text-g-300 text-xs font-medium">{value}</span>
    </div>
  )
}

// ─── modal ──────────────────────────────────────────────────────────────────

export default function FaturaDetailModal({ faturaId, onClose, onSynced }) {
  const [data,   setData]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    getFaturaDetail(faturaId)
      .then(setData)
      .catch(() => toast.error('Erro ao carregar fatura'))
      .finally(() => setLoading(false))
  }, [faturaId])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await syncFaturaFat(faturaId)
      toast.success('Receitas sincronizadas com a tabela de frota')
      onSynced?.()
      // Reload detail to show updated fonte
      const updated = await getFaturaDetail(faturaId)
      setData(updated)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const hasEstimated = data?.por_veiculo?.some(v => v.fonte === 'contrato')
  const totalDiarias = data?.por_veiculo?.reduce((s, v) => s + (v.trabalhado || 0), 0) ?? 0
  const totalMedido  = data?.por_veiculo?.reduce((s, v) => s + (v.medicao   || 0), 0) ?? 0

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-g-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-g-850 border border-g-800 rounded-xl shrink-0">
              <Receipt className="w-4 h-4 text-g-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-g-100 font-bold text-sm">
                  Fatura {data ? `#${data.numero_fatura ?? data.id}` : '…'}
                </h2>
                {data && (
                  <>
                    <Badge status={data.status_recebimento || 'Pendente'} map={REC_CLS} />
                    <Badge status={data.status_imposto || 'Pendente'} map={IMP_CLS} />
                    {hasEstimated && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border text-amber-400 bg-amber-400/10 border-amber-500/30">
                        <AlertCircle className="w-2.5 h-2.5" /> Dados estimados
                      </span>
                    )}
                  </>
                )}
              </div>
              {data && (
                <p className="text-g-500 text-xs mt-0.5 truncate">
                  {data.empresa_sigla} · {data.contrato_cliente || data.empresa || '—'}
                  {data.contrato_cidade && ` · ${data.contrato_cidade}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-3">
            {data && (
              <button
                onClick={handleSync}
                disabled={syncing}
                title="Sincronizar receitas com a tabela de frota"
                className="p-1.5 rounded-lg text-g-600 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-g-600 animate-spin" />
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <p className="text-g-600 text-sm">Não foi possível carregar os dados.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* ── Resumo financeiro ── */}
            <div className="px-6 pt-5 pb-4 border-b border-g-800">
              <p className="text-g-600 text-[10px] uppercase tracking-widest font-semibold mb-3">Resumo Financeiro</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiMini
                  label="Faturado (bruto)"
                  value={brl(data.valor_locacoes)}
                  accent="text-g-100"
                />
                <KpiMini
                  label={`Imposto (${data.aliquota_imposto?.toFixed(2)}%)`}
                  value={brl(data.valor_imposto)}
                  sub={data.encargo_imposto > 0 ? `+${brl(data.encargo_imposto)} encargo` : undefined}
                  accent="text-amber-500"
                />
                <KpiMini
                  label="Líquido"
                  value={brl(data.valor_liquido)}
                  accent="text-g-200"
                />
                <KpiMini
                  label="Recebido"
                  value={data.valor_recebido > 0 ? brl(data.valor_recebido) : '—'}
                  sub={data.valor_recebido > 0 && data.valor_locacoes > 0
                    ? `${((data.valor_recebido / data.valor_locacoes) * 100).toFixed(0)}% do faturado`
                    : undefined}
                  accent={data.valor_recebido > 0 ? 'text-emerald-500' : 'text-g-600'}
                />
              </div>
            </div>

            {/* ── Detalhamento por veículo ── */}
            <div className="px-6 pt-5 pb-4 border-b border-g-800">
              <div className="flex items-center justify-between mb-3">
                <p className="text-g-600 text-[10px] uppercase tracking-widest font-semibold">
                  Detalhamento por Veículo
                </p>
                {hasEstimated && (
                  <p className="text-amber-500/70 text-[10px]">
                    * Valores estimados pelo contrato — sincronize para registrar
                  </p>
                )}
              </div>

              {data.por_veiculo.length === 0 ? (
                <p className="text-g-600 text-xs py-4 text-center">
                  Nenhum veículo vinculado. Use ↺ para sincronizar pelo contrato.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-g-800">
                  <table className="w-full text-xs">
                    <thead className="bg-g-850 border-b border-g-800">
                      <tr>
                        <th className="th text-left">Placa</th>
                        <th className="th text-left">Modelo</th>
                        <th className="th text-right">Diárias</th>
                        <th className="th text-right">R$/Dia</th>
                        <th className="th text-right">Total Medido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_veiculo.map((v, i) => (
                        <tr key={v.id_veiculo ?? i} className="border-b border-g-800/60 last:border-0">
                          <td className="td whitespace-nowrap">
                            <span className="font-bold text-g-100 tracking-wide">{v.placa}</span>
                          </td>
                          <td className="td whitespace-nowrap">
                            <span className="text-g-300">{v.modelo}</span>
                            {v.implemento && (
                              <span className="ml-1.5 text-g-600 text-[10px]">{v.implemento}</span>
                            )}
                          </td>
                          <td className="td text-right font-mono tabular-nums text-g-300">
                            {v.trabalhado} dias
                            {v.parado > 0 && (
                              <span className="block text-[10px] text-g-600">{v.parado}d parado</span>
                            )}
                          </td>
                          <td className="td text-right font-mono tabular-nums text-g-400">
                            {v.valor_diaria > 0 ? brl(v.valor_diaria) : '—'}
                          </td>
                          <td className="td text-right font-mono tabular-nums font-semibold text-g-100">
                            {brl(v.medicao)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-g-850 border-t-2 border-g-700">
                      <tr>
                        <td colSpan={2} className="td text-g-500 text-[10px] font-bold uppercase tracking-wider">
                          Totais ({data.por_veiculo.length} veículo{data.por_veiculo.length !== 1 ? 's' : ''})
                        </td>
                        <td className="td text-right font-mono tabular-nums text-g-400 font-semibold">
                          {totalDiarias} dias
                        </td>
                        <td className="td" />
                        <td className="td text-right font-mono tabular-nums font-bold text-g-100">
                          {brl(totalMedido)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* ── Informações adicionais ── */}
            <div className="px-6 pt-4 pb-6">
              <p className="text-g-600 text-[10px] uppercase tracking-widest font-semibold mb-3">Informações Adicionais</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <InfoRow icon={Building2} label="Emissora"      value={data.empresa_nome || data.empresa_sigla} />
                <InfoRow icon={Calendar}  label="Competência"   value={data.emissao_display} />
                <InfoRow icon={Hash}      label="Nº Fatura"     value={data.numero_fatura ? String(data.numero_fatura) : null} />
                <InfoRow icon={Calendar}  label="Vencimento"    value={data.vencimento ? dateBR(data.vencimento) : null} />
                <InfoRow icon={CreditCard} label="Forma Pgto."  value={data.forma_pagamento} />
                <InfoRow icon={Landmark}  label="Status Imposto" value={data.status_imposto} />
                {data.data_pgto_imposto && (
                  <InfoRow icon={Calendar} label="Pgto. Imposto" value={dateBR(data.data_pgto_imposto)} />
                )}
                {data.contrato_cidade && (
                  <InfoRow icon={MapPin} label="Cidade Op."   value={data.contrato_cidade} />
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>,
    document.body
  )
}
