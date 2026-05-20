import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, FileText, Truck, Receipt, Edit2, Calendar, TrendingUp,
} from 'lucide-react'
import { getContratoVeiculos, getContratoFaturas, getContratoMetricas } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'

const STATUS_CLS = {
  Ativo:     'bg-emerald-500/10 text-emerald-400 border-emerald-700/30',
  Encerrado: 'bg-g-800/50       text-g-500       border-g-700/30',
  Renovado:  'bg-amber-500/10   text-amber-400   border-amber-700/30',
}
const REC_CLS = {
  Recebido:  'text-emerald-500',
  Pendente:  'text-amber-400',
  Vencido:   'text-red-400',
  Cancelado: 'text-g-600',
}

const TABS = ['Veículos', 'Faturas']

function DaysChip({ days }) {
  if (days == null) return null
  const color = days > 90 ? 'text-emerald-400' : days > 30 ? 'text-amber-400' : 'text-red-400'
  return (
    <span className={`text-[10px] font-semibold ${color}`}>
      {days === 0 ? 'Vencido' : `${days} dias restantes`}
    </span>
  )
}

export default function ContratoDetailModal({ contrato, onClose, onEdit }) {
  const backdropRef = useRef(null)
  const [tab,      setTab]      = useState('Veículos')
  const [veiculos, setVeiculos] = useState([])
  const [metricas, setMetricas] = useState(null)
  const [faturas,  setFaturas]  = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    if (tab === 'Veículos') {
      Promise.all([
        getContratoVeiculos(contrato.id),
        getContratoMetricas(contrato.id),
      ]).then(([v, m]) => {
        setVeiculos(v || [])
        setMetricas(m || null)
      }).finally(() => setLoading(false))
    } else {
      getContratoFaturas(contrato.id)
        .then(d => setFaturas(d || []))
        .finally(() => setLoading(false))
    }
  }, [tab, contrato.id])

  const pgto = contrato.forma_pagamento

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div
        className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* Cabeçalho */}
        <div className="px-8 py-5 border-b border-g-800 shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-g-850 border border-g-800 shrink-0">
                <FileText className="w-5 h-5 text-g-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-g-600 text-xs font-mono font-semibold">NºCT {contrato.id}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-g-800 text-g-300">
                    {contrato.empresa_sigla}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_CLS[contrato.status] || STATUS_CLS.Encerrado}`}>
                    {contrato.status}
                  </span>
                  {pgto && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      pgto === 'PIX'
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-700/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-700/30'
                    }`}>{pgto}</span>
                  )}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    contrato.assinado
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-700/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-700/30'
                  }`}>
                    {contrato.assinado ? '✓ Assinado' : '⚠ Não assinado'}
                  </span>
                </div>
                <h2 className="text-g-50 font-bold text-lg leading-tight">{contrato.nome_cliente}</h2>
                {contrato.cidade_operacao && (
                  <p className="text-g-600 text-xs mt-0.5">
                    {contrato.cidade_operacao}{contrato.estado_operacao ? ` · ${contrato.estado_operacao}` : ''}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onEdit(contrato)} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors" title="Editar">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Info rápida */}
          <div className="flex items-center gap-5 text-xs text-g-500 mb-3 flex-wrap">
            {(contrato.data_inicio || contrato.data_fim) && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-g-600" />
                <span className="font-mono">
                  {dateBR(contrato.data_inicio) || '—'} → {dateBR(contrato.data_fim) || 'Aberto'}
                </span>
              </div>
            )}
            {contrato.dias_restantes != null && (
              <DaysChip days={contrato.dias_restantes} />
            )}
            {contrato.data_encerramento && contrato.status !== 'Ativo' && (
              <span className="text-g-600 text-xs font-mono">
                Encerrado em: {dateBR(contrato.data_encerramento)}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-g-600" />
              <span>{contrato.qtd_veiculos} veículo{contrato.qtd_veiculos !== 1 ? 's' : ''}</span>
            </div>
            {pgto === 'Boleto' && contrato.multa_pct != null && (
              <span className="text-g-700 text-[10px]">
                Multa {contrato.multa_pct}% · Juros {contrato.juros_pct}%a.m · Protesto {contrato.dias_protesto}d
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t ? 'bg-g-800 text-g-100 border border-g-700' : 'text-g-600 hover:text-g-400 hover:bg-g-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Corpo */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-g-600 py-12">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : tab === 'Veículos' ? (
            <div className="flex flex-col gap-4">
              {/* Totalizador */}
              {metricas && metricas.veiculos?.length > 0 && (
                <div className="grid grid-cols-3 gap-3 p-4 bg-g-900 border border-g-800 rounded-xl">
                  {[
                    { label: 'Total Mensal Contratado', val: metricas.valor_mensal_total, color: 'text-g-100' },
                    { label: 'Total Medido (período)', val: metricas.total_medido,        color: 'text-emerald-400' },
                    { label: 'Total Pendente',          val: metricas.total_pendente,     color: 'text-amber-400' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center">
                      <p className="text-g-600 text-[10px] uppercase tracking-wider mb-1">{label}</p>
                      <p className={`font-mono font-bold text-base ${color} tabular-nums`}>{brl(val)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Tabela por veículo */}
              {veiculos.length === 0 ? (
                <p className="text-center text-g-700 py-8 text-sm">Nenhum veículo vinculado.</p>
              ) : (
                <div className="rounded-xl border border-g-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-g-850 border-b border-g-800">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Placa</th>
                        <th className="px-4 py-2.5 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Modelo</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Valor Mensal</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Diária</th>
                        <th className="px-4 py-2.5 text-center text-g-500 text-[10px] uppercase tracking-wider font-semibold">Medições (consumidas/total)</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Total Medido</th>
                        <th className="px-4 py-2.5 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Pendente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(metricas?.veiculos || veiculos).map(v => (
                        <tr key={v.id_veiculo} className="border-b border-g-800/60 hover:bg-g-900/40 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-g-200">{v.placa}</span>
                          </td>
                          <td className="px-4 py-3 text-g-500">{v.modelo || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-g-300 tabular-nums">
                            {v.valor_mensal ? brl(v.valor_mensal) : <span className="text-g-700">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-g-500 tabular-nums text-[10px]">
                            {v.valor_diaria ? brl(v.valor_diaria) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {v.medicoes_consumidas != null ? (
                              <span className="inline-flex items-center gap-1 text-[10px]">
                                <span className="text-emerald-500 font-bold font-mono">{v.medicoes_consumidas}</span>
                                <span className="text-g-700">/</span>
                                <span className="text-g-400 font-mono font-semibold">{v.medicoes_total ?? (v.medicoes_consumidas + v.medicoes_restantes)}</span>
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 tabular-nums">
                            {v.total_medido != null ? brl(v.total_medido) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-amber-400 tabular-nums">
                            {v.total_pendente != null ? brl(v.total_pendente) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Progresso de medições */}
              {metricas?.medicoes_total > 0 && (
                <div className="px-4 py-3 bg-g-900 border border-g-800 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-g-500 text-xs">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Progresso de medições do contrato</span>
                    </div>
                    <div className="text-right">
                      {(() => {
                        const consumidas = metricas.veiculos?.length
                          ? Math.max(...metricas.veiculos.map(v => v.medicoes_consumidas ?? 0))
                          : 0
                        const total = metricas.medicoes_total
                        const pct   = total > 0 ? Math.round((consumidas / total) * 100) : 0
                        const color = pct >= 80 ? 'text-red-400' : pct >= 50 ? 'text-amber-400' : 'text-emerald-400'
                        return (
                          <>
                            <span className={`font-mono font-bold text-sm ${color}`}>{consumidas}/{total}</span>
                            <span className="text-g-600 text-[10px] ml-2">({pct}%)</span>
                          </>
                        )
                      })()}
                    </div>
                  </div>
                  {(() => {
                    const consumidas = metricas.veiculos?.length
                      ? Math.max(...metricas.veiculos.map(v => v.medicoes_consumidas ?? 0))
                      : 0
                    const total = metricas.medicoes_total
                    const pct   = total > 0 ? Math.min(100, Math.round((consumidas / total) * 100)) : 0
                    const barColor = pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                    return (
                      <div className="h-1.5 rounded-full bg-g-800 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    )
                  })()}
                  {metricas.dias_restantes > 0 && (
                    <p className="text-g-700 text-[10px] mt-1.5">{metricas.dias_restantes} dias restantes no contrato</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Tab Faturas ── */
            faturas.length === 0 ? (
              <p className="text-center text-g-700 py-12 text-sm">Nenhuma fatura registrada para este contrato.</p>
            ) : (
              <div className="rounded-xl border border-g-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-g-850 border-b border-g-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-g-500 text-[10px] uppercase tracking-wider font-semibold">Mês</th>
                      <th className="px-4 py-3 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Locações</th>
                      <th className="px-4 py-3 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Imposto</th>
                      <th className="px-4 py-3 text-right text-g-500 text-[10px] uppercase tracking-wider font-semibold">Líquido</th>
                      <th className="px-4 py-3 text-center text-g-500 text-[10px] uppercase tracking-wider font-semibold">Recebimento</th>
                      <th className="px-4 py-3 text-center text-g-500 text-[10px] uppercase tracking-wider font-semibold">Imposto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faturas.map(f => (
                      <tr key={f.id} className="border-b border-g-800/60 hover:bg-g-900/60 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-g-300 font-semibold">{f.emissao_display}</p>
                          <p className="text-g-700 text-[10px] font-mono">{dateBR(f.vencimento)}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-g-200 font-semibold tabular-nums">
                          {brl(f.valor_locacoes)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400 tabular-nums">{brl(f.valor_imposto)}</td>
                        <td className="px-4 py-3 text-right font-mono text-indigo-400 tabular-nums">{brl(f.valor_liquido)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${REC_CLS[f.status_recebimento] || 'text-g-500'}`}>
                            {f.status_recebimento}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold ${f.status_imposto === 'Pago' ? 'text-emerald-500' : 'text-amber-400'}`}>
                            {f.status_imposto}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-g-850 border-t-2 border-g-700">
                    <tr>
                      <td className="px-4 py-3 text-g-500 font-semibold">{faturas.length} fatura{faturas.length !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-g-100 tabular-nums">{brl(faturas.reduce((s, f) => s + f.valor_locacoes, 0))}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-400 tabular-nums">{brl(faturas.reduce((s, f) => s + f.valor_imposto, 0))}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-indigo-400 tabular-nums">{brl(faturas.reduce((s, f) => s + f.valor_liquido, 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
