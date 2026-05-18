import { useState, useEffect } from 'react'
import { Loader2, X, Truck } from 'lucide-react'
import { getImplementoAnalysis } from '../../utils/api'
import { brl, brlShort, num } from '../../utils/format'
import { useCompanies } from '../../contexts/CompanyContext'
import Section from '../maintenance/Section'
import IntervalosSection from './IntervalosSection'

export default function AnaliseTab({ year }) {
  const { selectedCompany } = useCompanies()
  const empresa = selectedCompany?.id !== 'grupo' ? selectedCompany?.sigla : undefined

  const [implData,    setImplData]    = useState([])
  const [implLoading, setImplLoading] = useState(true)
  const [implSel,     setImplSel]     = useState(null)
  const [implPlaca,   setImplPlaca]   = useState('')

  useEffect(() => {
    setImplLoading(true)
    getImplementoAnalysis(year, empresa)
      .then(d => { setImplData(d); setImplSel(null); setImplPlaca('') })
      .finally(() => setImplLoading(false))
  }, [year, empresa])

  return (
    <div className="flex flex-col gap-8">

      <IntervalosSection />

      <Section title="Análise por Implemento Veicular" icon={Truck}>
        {implLoading ? (
          <div className="flex items-center justify-center h-32 gap-2 text-g-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando análise de implementos…
          </div>
        ) : implData.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-g-700 text-sm">Nenhum implemento registrado no período.</div>
        ) : (
          <div className="flex flex-col gap-5">

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {implData.map(imp => {
                const topSis = imp.por_sistema[0]
                const isSelected = implSel?.implemento === imp.implemento
                return (
                  <button
                    key={imp.implemento}
                    onClick={() => { setImplSel(isSelected ? null : imp); setImplPlaca('') }}
                    className={`text-left p-4 rounded-xl border transition-all ${isSelected
                      ? 'bg-g-850 border-g-100/40 shadow-lg ring-1 ring-g-100/20'
                      : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-g-100' : 'text-g-200'}`}>{imp.implemento}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-g-800 text-g-400' : 'bg-g-900 text-g-500'}`}>{imp.n_placas}v</span>
                    </div>
                    <p className={`font-bold font-mono text-base ${isSelected ? 'text-white' : 'text-g-100'}`}>{brl(imp.total_custo)}</p>
                    <p className={`text-xs mt-0.5 ${isSelected ? 'text-g-400' : 'text-g-600'}`}>{imp.total_os} OS{topSis ? ` · ${topSis.sistema}` : ''}</p>
                  </button>
                )
              })}
            </div>

            {implSel && (
              <div className="card border border-g-800 rounded-xl overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between px-5 py-3.5 bg-g-850 border-b border-g-800">
                  <div>
                    <span className="text-g-100 font-bold text-sm">{implSel.implemento}</span>
                    <span className="text-g-600 text-xs ml-3">{implSel.total_os} OS · {implSel.n_placas} veículo{implSel.n_placas !== 1 ? 's' : ''} · {brl(implSel.total_custo)}</span>
                  </div>
                  <button onClick={() => { setImplSel(null); setImplPlaca('') }} className="p-1.5 text-g-600 hover:text-g-300 rounded-lg hover:bg-g-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 flex flex-col gap-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    <div>
                      <p className="text-g-600 text-[10px] font-bold uppercase tracking-widest mb-3">Sistemas — Custo e Frequência</p>
                      <div className="flex flex-col gap-1.5">
                        {implSel.por_sistema.slice(0, 10).map((s, i) => {
                          const maxCusto = implSel.por_sistema[0]?.custo || 1
                          const pct = Math.round((s.custo / maxCusto) * 100)
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <div className="w-28 text-g-300 text-xs font-semibold truncate shrink-0">{s.sistema}</div>
                              <div className="flex-1 h-5 bg-g-900 rounded overflow-hidden relative">
                                <div
                                  className="h-full rounded transition-all"
                                  style={{ width: `${pct}%`, background: i === 0 ? '#22c55e' : i === 1 ? '#34d399' : '#6b7280' }}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-g-300">{brlShort(s.custo)}</span>
                              </div>
                              <span className="text-g-600 text-[10px] w-12 text-right shrink-0">{s.count} OS</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-g-600 text-[10px] font-bold uppercase tracking-widest mb-3">Intervalo Médio entre Manutenções (KM)</p>
                      {implSel.intervalos_km.length === 0 ? (
                        <p className="text-g-700 text-xs italic">KM não registrado para calcular intervalos.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-g-800">
                                <th className="text-left text-g-600 font-semibold py-1.5 pr-3">Sistema</th>
                                <th className="text-right text-g-600 font-semibold py-1.5 px-2">Médio</th>
                                <th className="text-right text-g-600 font-semibold py-1.5 px-2">Mín</th>
                                <th className="text-right text-g-600 font-semibold py-1.5 px-2">Máx</th>
                                <th className="text-right text-g-600 font-semibold py-1.5 pl-2">Amostras</th>
                              </tr>
                            </thead>
                            <tbody>
                              {implSel.intervalos_km.map((iv, i) => (
                                <tr key={i} className="border-b border-g-900 hover:bg-g-850">
                                  <td className="py-1.5 pr-3 text-g-200 font-semibold">{iv.sistema}</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-emerald-400 font-bold">{num(iv.intervalo_medio)} km</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-g-500">{num(iv.intervalo_min)}</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-g-500">{num(iv.intervalo_max)}</td>
                                  <td className="py-1.5 pl-2 text-right text-g-600">{iv.amostras}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-g-600 text-[10px] font-bold uppercase tracking-widest">Análise por Placa</p>
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => setImplPlaca('')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${!implPlaca ? 'bg-g-100 text-white' : 'bg-g-900 border border-g-800 text-g-500 hover:text-g-300'}`}
                        >Geral</button>
                        {implSel.placas.map(p => (
                          <button
                            key={p}
                            onClick={() => setImplPlaca(p)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${implPlaca === p ? 'bg-g-100 text-white' : 'bg-g-900 border border-g-800 text-g-500 hover:text-g-300'}`}
                          >{p}</button>
                        ))}
                      </div>
                    </div>

                    {!implPlaca ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-g-800">
                              <th className="text-left text-g-600 font-semibold py-1.5 pr-4">Sistema</th>
                              <th className="text-right text-g-600 font-semibold py-1.5 px-2">OS</th>
                              <th className="text-right text-g-600 font-semibold py-1.5 px-2">Custo Total</th>
                              <th className="text-right text-g-600 font-semibold py-1.5 px-2">Custo Médio/OS</th>
                              <th className="text-right text-g-600 font-semibold py-1.5 pl-2">Interv. KM médio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {implSel.por_sistema.map((s, i) => {
                              const iv = implSel.intervalos_km.find(x => x.sistema === s.sistema)
                              return (
                                <tr key={i} className="border-b border-g-900 hover:bg-g-850">
                                  <td className="py-1.5 pr-4 text-g-200 font-semibold">{s.sistema}</td>
                                  <td className="py-1.5 px-2 text-right text-g-400 font-mono">{s.count}</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-g-200 font-bold">{brl(s.custo)}</td>
                                  <td className="py-1.5 px-2 text-right font-mono text-g-400">{s.count > 0 ? brlShort(s.custo / s.count) : '—'}</td>
                                  <td className="py-1.5 pl-2 text-right font-mono text-emerald-400">{iv ? `${num(iv.intervalo_medio)} km` : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-g-500 text-xs">Intervalos de KM por sistema — Placa <span className="font-mono font-bold text-g-200">{implPlaca}</span></p>
                        {implSel.intervalos_km.filter(iv => iv.por_placa?.[implPlaca]).length === 0 ? (
                          <p className="text-g-700 text-xs italic">Sem dados de KM suficientes para esta placa.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-g-800">
                                  <th className="text-left text-g-600 font-semibold py-1.5 pr-4">Sistema</th>
                                  <th className="text-right text-g-600 font-semibold py-1.5 pl-2">Intervalo médio (km)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {implSel.intervalos_km
                                  .filter(iv => iv.por_placa?.[implPlaca])
                                  .map((iv, i) => (
                                    <tr key={i} className="border-b border-g-900 hover:bg-g-850">
                                      <td className="py-1.5 pr-4 text-g-200 font-semibold">{iv.sistema}</td>
                                      <td className="py-1.5 pl-2 text-right font-mono text-emerald-400 font-bold">{num(iv.por_placa[implPlaca])} km</td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}
