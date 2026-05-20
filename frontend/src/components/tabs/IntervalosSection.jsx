import { useState, useMemo, useCallback, useEffect, Fragment } from 'react'
import { Activity, Loader2, RotateCcw, ArrowRight, ChevronDown, ChevronUp, X } from 'lucide-react'
import { getIntervalosAnalysis, deletePneuRodizio } from '../../utils/api'
import { dateBR, num } from '../../utils/format'
import Section from '../maintenance/Section'
import RodizioModal from '../modals/RodizioModal'

const SISTEMAS_INTERVALO = [
  { key: 'Pneu',    label: 'Pneu',    sub: 'Troca de pneus' },
  { key: 'Freio',   label: 'Freio',   sub: 'Pastilha · disco · pinça' },
  { key: 'Revisão', label: 'Revisão', sub: 'Óleo · filtros' },
]

export default function IntervalosSection() {
  const [sistema,       setSistema]      = useState('Pneu')
  const [data,          setData]         = useState(null)
  const [loading,       setLoading]      = useState(false)
  const [expanded,      setExpanded]     = useState(new Set())
  const [rodizioModal,  setRodizioModal] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    getIntervalosAnalysis(sistema)
      .then(setData)
      .finally(() => setLoading(false))
  }, [sistema])

  useEffect(() => { load() }, [load])

  const toggleExpand = placa =>
    setExpanded(s => { const n = new Set(s); n.has(placa) ? n.delete(placa) : n.add(placa); return n })

  const fleet = data?.fleet
  const porPlaca = data?.por_placa || []

  const byMedida = useMemo(() => {
    if (sistema !== 'Pneu' || !porPlaca.length) return []
    const map = {}
    porPlaca.forEach(veh => {
      const medidas = veh.por_medida || []
      if (medidas.length) {
        medidas.forEach(m => {
          if (!map[m.espec]) map[m.espec] = { spec: m.espec, veiculos: new Set(), n_eventos: 0, total_pneus: 0, km_diffs: [] }
          map[m.espec].veiculos.add(veh.placa)
          map[m.espec].n_eventos += m.n_eventos
          map[m.espec].total_pneus += m.total_pneus || 0
          ;(m.conjuntos || []).forEach(c => { if (c.delta_km) map[m.espec].km_diffs.push(c.delta_km) })
        })
      }
    })
    return Object.values(map)
      .map(r => ({
        spec:        r.spec,
        n_veiculos:  r.veiculos.size,
        n_eventos:   r.n_eventos,
        total_pneus: r.total_pneus || null,
        avg_km:      r.km_diffs.length ? Math.round(r.km_diffs.reduce((a,b)=>a+b,0)/r.km_diffs.length) : null,
        min_km:      r.km_diffs.length ? Math.min(...r.km_diffs) : null,
        max_km:      r.km_diffs.length ? Math.max(...r.km_diffs) : null,
      }))
      .sort((a, b) => b.n_eventos - a.n_eventos)
  }, [sistema, porPlaca])

  const EventTable = ({ eventos, total, isPneu, avgKm, kms, dias, onDeleteRodizio }) => (
    <table className="w-full text-xs min-w-[640px]">
      <thead>
        <tr className="bg-g-900">
          <th className="text-left text-g-600 font-semibold py-2 px-4">#</th>
          <th className="text-left text-g-600 font-semibold py-2 px-3">Data</th>
          <th className="text-right text-g-600 font-semibold py-2 px-3">KM</th>
          <th className="text-right text-g-600 font-semibold py-2 px-3">∆ KM</th>
          <th className="text-right text-g-600 font-semibold py-2 px-3">∆ Dias</th>
          {isPneu && <th className="text-left text-g-600 font-semibold py-2 px-3">Tipo</th>}
          {isPneu && <th className="text-left text-g-600 font-semibold py-2 px-3">Posição</th>}
          {isPneu && <th className="text-left text-g-600 font-semibold py-2 px-3">Marca</th>}
          {isPneu && <th className="text-center text-g-600 font-semibold py-2 px-3">Qtd</th>}
          {!isPneu && <th className="text-left text-g-600 font-semibold py-2 px-3">Serviço</th>}
          <th className="text-left text-g-600 font-semibold py-2 px-3">OS / Ref</th>
        </tr>
      </thead>
      <tbody>
        {eventos.map((ev, i) => {
          const isRodizio = ev.tipo_evento === 'rodizio'
          const isAlert   = !isRodizio && ev.delta_km != null && avgKm && ev.delta_km < avgKm * 0.8
          const rowBg     = isRodizio ? 'bg-violet-50/70 border-violet-100'
                          : isAlert   ? 'bg-amber-50/60'
                          : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
          return (
            <tr key={i} className={`border-b ${rowBg}`}>
              <td className="py-2 px-4 text-g-600 font-mono">
                {isRodizio
                  ? <RotateCcw className="w-3 h-3 text-violet-400 inline" />
                  : `${i + 1}/${total}`}
              </td>
              <td className="py-2 px-3 text-g-400 font-mono whitespace-nowrap">{ev.data ? dateBR(ev.data) : '—'}</td>
              <td className="py-2 px-3 text-right font-mono text-g-300 whitespace-nowrap">{ev.km != null ? num(ev.km) + ' km' : '—'}</td>
              <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                {ev.delta_km != null
                  ? <span className={`font-bold ${isRodizio ? 'text-violet-500' : isAlert ? 'text-amber-600' : 'text-emerald-700'}`}>+{num(ev.delta_km)}</span>
                  : <span className="text-g-700">—</span>}
              </td>
              <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                {ev.delta_dias != null
                  ? <span className={`font-bold ${isRodizio ? 'text-violet-400' : 'text-blue-600'}`}>+{ev.delta_dias}d</span>
                  : <span className="text-g-700">—</span>}
              </td>
              {isPneu && (
                <td className="py-2 px-3 text-[11px]">
                  {isRodizio
                    ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">Rodízio</span>
                    : <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${ev.categoria === 'Compra' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-g-500'}`}>{ev.categoria || '—'}</span>
                  }
                </td>
              )}
              {isPneu && (
                <td className="py-2 px-3 text-[11px] whitespace-nowrap">
                  {isRodizio && ev.posicao_anterior
                    ? <span className="flex items-center gap-1 text-violet-600">
                        <span className="opacity-70">{ev.posicao_anterior}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-semibold">{ev.posicao_pneu}</span>
                      </span>
                    : <span className="text-g-400">{ev.posicao_pneu || '—'}</span>
                  }
                </td>
              )}
              {isPneu && <td className="py-2 px-3 text-g-500 text-[11px]">{ev.marca_pneu || '—'}</td>}
              {isPneu && <td className="py-2 px-3 text-center text-g-500">{ev.qtd_pneu ?? (ev.qtd_itens ?? '—')}</td>}
              {!isPneu && <td className="py-2 px-3 text-g-400 max-w-[180px] truncate" title={ev.servico}>{ev.servico || '—'}</td>}
              <td className="py-2 px-3 font-mono text-g-600 text-[10px]">
                <div className="flex items-center gap-1">
                  <span>{ev.numero_os || '—'}</span>
                  {isRodizio && onDeleteRodizio && (
                    <button onClick={() => onDeleteRodizio(ev.id_rodizio)} title="Remover rodízio"
                      className="ml-1 text-violet-300 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
      {kms?.length > 0 && (
        <tfoot>
          <tr className="bg-g-900/50 border-t border-g-800">
            <td colSpan={3} className="py-2 px-4 text-g-600 text-[10px] font-semibold uppercase tracking-wide">Resumo</td>
            <td className="py-2 px-3 text-right">
              <span className="text-[10px] text-g-600 block">min / médio / máx</span>
              <span className="font-mono text-g-300 text-[11px]">
                {num(Math.min(...kms))} / <strong className="text-emerald-700">{num(Math.round(kms.reduce((a,b)=>a+b,0)/kms.length))}</strong> / {num(Math.max(...kms))} km
              </span>
            </td>
            <td className="py-2 px-3 text-right">
              {dias?.length > 0 && (
                <>
                  <span className="text-[10px] text-g-600 block">min / médio / máx</span>
                  <span className="font-mono text-g-300 text-[11px]">
                    {Math.min(...dias)} / <strong className="text-blue-400">{Math.round(dias.reduce((a,b)=>a+b,0)/dias.length)}</strong> / {Math.max(...dias)} d
                  </span>
                </>
              )}
            </td>
            <td colSpan={isPneu ? 5 : 2} />
          </tr>
        </tfoot>
      )}
    </table>
  )

  const ConjuntoTable = ({ conjuntos, avgKm, onDeleteRodizio }) => (
    <table className="w-full text-xs min-w-[860px]">
      <thead>
        <tr className="bg-g-900">
          <th className="text-left text-g-600 font-semibold py-2 px-4 w-32">OS / Ref</th>
          <th className="text-left text-g-600 font-semibold py-2 px-3">Data</th>
          <th className="text-right text-g-600 font-semibold py-2 px-3">KM Entrada</th>
          <th className="text-right text-g-600 font-semibold py-2 px-3">KM Rodado</th>
          <th className="text-left text-g-600 font-semibold py-2 px-3">Pos. Inicial</th>
          <th className="text-left text-g-600 font-semibold py-2 px-3">Pos. Atual</th>
          <th className="text-left text-g-600 font-semibold py-2 px-3">Marca</th>
          <th className="text-left text-g-600 font-semibold py-2 px-3">Modelo</th>
          <th className="text-center text-g-600 font-semibold py-2 px-3">Qtd</th>
          <th className="text-right text-g-600 font-semibold py-2 px-3">∆ KM c/ ant.</th>
        </tr>
      </thead>
      <tbody>
        {conjuntos.map((conj, ci) => {
          const isAlert      = conj.delta_km != null && avgKm && conj.delta_km < avgKm * 0.8
          const isDescartado = !!conj.descartado
          const posInicial   = conj.fases[0]?.posicao || '—'
          const rotated      = posInicial !== conj.posicao_atual
          const totalDias    = conj.fases.reduce((s, f) => s + (f.dias || 0), 0)
          return (
            <Fragment key={ci}>
              <tr className={`border-b border-gray-200 font-medium ${isDescartado ? 'opacity-50' : ''} ${ci % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                <td className="py-2.5 px-4">
                  <span className="font-mono text-g-200 text-[11px] font-bold">{conj.os_ref || '—'}</span>
                  {conj.compra_composta && (
                    <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-600 uppercase tracking-wide">kit</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-g-400 font-mono whitespace-nowrap">{conj.data_compra ? dateBR(conj.data_compra) : '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono text-g-500 whitespace-nowrap">{conj.km_compra != null ? num(conj.km_compra) + ' km' : '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                  <span className={`font-bold ${isDescartado ? 'text-g-600' : 'text-emerald-700'}`}>{conj.km_total != null ? num(conj.km_total) + ' km' : '—'}</span>
                  {totalDias > 0 && <span className="text-blue-400 ml-1.5 font-normal text-[10px]">{totalDias}d</span>}
                </td>
                <td className="py-2.5 px-3">
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-g-500 uppercase tracking-wide">{posInicial}</span>
                </td>
                <td className="py-2.5 px-3">
                  {isDescartado ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 uppercase tracking-wide">{conj.posicao_atual || '—'}</span>
                      <span className="text-[9px] font-bold text-red-500 ml-0.5">substituído</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {rotated && <ArrowRight className="w-3 h-3 text-violet-400 shrink-0" />}
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${rotated ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                        {conj.posicao_atual || '—'}
                      </span>
                      {conj.fases.length === 1 && <span className="text-[9px] text-sky-400 ml-0.5">em uso</span>}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-[11px]">
                  <span className="text-g-400 font-medium">{conj.marca || '—'}</span>
                  {conj.recapado && (
                    <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-orange-100 text-orange-700 uppercase tracking-wide">recapado</span>
                  )}
                  {!conj.recapado && conj.condicao?.toLowerCase() === 'usado' && (
                    <span className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-600 uppercase tracking-wide">usado</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-g-500 text-[11px]">{conj.modelo || '—'}</td>
                <td className="py-2.5 px-3 text-center text-g-500">{conj.qtd ?? '—'}</td>
                <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                  {conj.delta_km != null
                    ? <span className={`font-bold ${isAlert ? 'text-amber-600' : 'text-g-500'}`}>+{num(conj.delta_km)} km</span>
                    : <span className="text-g-700 text-[10px]">1ª compra</span>}
                </td>
              </tr>
              {conj.fases.length > 1 && conj.fases.map((fase, fi) => {
                const isLast    = fi === conj.fases.length - 1
                const isRodizio = fi > 0
                const prevPos   = isRodizio ? conj.fases[fi - 1].posicao : null
                const faseDescartada = !!fase.descartado
                return (
                  <tr key={`f${fi}`} className={`border-b border-gray-100 ${isDescartado ? 'opacity-50' : ''} ${isRodizio ? 'bg-violet-50/30' : 'bg-gray-50/20'}`}>
                    <td className="py-1.5 px-4">
                      <div className="flex items-center gap-1.5 ml-3">
                        <span className="font-mono text-g-700 text-[10px] select-none">{isLast ? '└─' : '├─'}</span>
                        {isRodizio && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-100 text-violet-600 uppercase tracking-wide">Rodízio</span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 font-mono text-g-600 text-[10px]">{fase.data_inicio ? dateBR(fase.data_inicio) : '—'}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-[10px] text-g-600 whitespace-nowrap">
                      {num(fase.km_inicio)}{fase.km_fim != null
                        ? <> → {num(fase.km_fim)}</>
                        : <> → <span className="text-sky-500 italic">atual</span></>} km
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[10px] whitespace-nowrap">
                      {fase.km_rodado != null
                        ? <span className={isRodizio ? 'text-violet-600' : 'text-g-500'}>+{num(fase.km_rodado)} km</span>
                        : '—'}
                      {fase.dias != null && <span className="text-g-600 ml-1.5">{fase.dias}d</span>}
                    </td>
                    <td className="py-1.5 px-3">
                      {isRodizio && prevPos && (
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-g-500 uppercase tracking-wide">{prevPos}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      {isRodizio && (
                        <div className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3 text-violet-400 shrink-0" />
                          {faseDescartada ? (
                            <>
                              <span className="text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600">{fase.posicao}</span>
                              <span className="text-[9px] font-bold text-red-500 ml-0.5">substituído</span>
                            </>
                          ) : (
                            <>
                              <span className={`text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${fase.em_uso ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                                {fase.posicao}
                              </span>
                              {fase.em_uso && <span className="text-[9px] text-sky-400 ml-0.5">em uso</span>}
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    <td /><td /><td />
                    <td className="py-1.5 px-3 text-right">
                      {!fase.em_uso && !faseDescartada && fase.id_rodizio != null && onDeleteRodizio && (
                        <button onClick={() => onDeleteRodizio(fase.id_rodizio)} title="Remover rodízio"
                          className="text-g-700 hover:text-red-500 transition-colors">
                          <X className="w-3 h-3 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )

  const StatKpi = ({ label, value, unit, accent }) => (
    <div className={`rounded-xl p-4 flex flex-col gap-1 ${accent ? 'bg-g-850 border border-g-100/20' : 'bg-white border border-gray-100'}`}>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${accent ? 'text-g-500' : 'text-g-600'}`}>{label}</span>
      <span className={`font-mono font-bold text-xl tabular-nums ${accent ? 'text-white' : 'text-g-100'}`}>
        {value != null ? num(value) : '—'}
        {value != null && <span className={`text-sm font-normal ml-1 ${accent ? 'text-g-400' : 'text-g-500'}`}>{unit}</span>}
      </span>
    </div>
  )

  return (
    <>
    <Section title="Intervalos de Serviço por Veículo" icon={Activity}>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <div className="flex gap-1 bg-g-850 border border-g-800 rounded-xl p-1">
          {SISTEMAS_INTERVALO.map(s => (
            <button
              key={s.key}
              onClick={() => setSistema(s.key)}
              title={s.sub}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${sistema === s.key
                ? 'bg-white shadow-sm text-g-200 border border-g-800'
                : 'text-g-600 hover:text-g-400'
              }`}
            >{s.label}</button>
          ))}
        </div>

        {loading && <Loader2 className="w-4 h-4 animate-spin text-g-600 ml-auto" />}
        {!loading && fleet && (
          <span className="ml-auto text-g-700 text-xs">{fleet.total_veiculos} veículo{fleet.total_veiculos !== 1 ? 's' : ''} · {fleet.total_eventos} evento{fleet.total_eventos !== 1 ? 's' : ''}</span>
        )}
      </div>

      {!loading && fleet?.km?.n > 0 && (
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-1">
          <StatKpi label="KM mínimo"  value={fleet.km.min}  unit="km" />
          <StatKpi label="KM médio"   value={fleet.km.avg}  unit="km" accent />
          <StatKpi label="KM máximo"  value={fleet.km.max}  unit="km" />
          <StatKpi label="Dias mín."  value={fleet.dias.min}  unit="d" />
          <StatKpi label="Dias médio" value={fleet.dias.avg}  unit="d" accent />
          <StatKpi label="Dias máx."  value={fleet.dias.max}  unit="d" />
        </div>
      )}

      {!loading && sistema === 'Pneu' && byMedida.length > 0 && (
        <div className="mt-3 border border-g-800 rounded-xl overflow-hidden">
          <div className="bg-g-900 px-4 py-2 flex items-center gap-2">
            <span className="text-g-400 text-[11px] font-bold uppercase tracking-widest">Por Medida</span>
            <span className="text-g-700 text-[10px] ml-auto">{byMedida.length} especificação{byMedida.length !== 1 ? 'ões' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="bg-g-950/40">
                  <th className="text-left text-g-600 font-semibold py-2 px-4">Especificação</th>
                  <th className="text-center text-g-600 font-semibold py-2 px-3">Veículos</th>
                  <th className="text-center text-g-600 font-semibold py-2 px-3">Eventos</th>
                  <th className="text-center text-g-600 font-semibold py-2 px-3">Pneus adquiridos</th>
                  <th className="text-right text-g-600 font-semibold py-2 px-4">ΔKM mín.</th>
                  <th className="text-right text-g-600 font-semibold py-2 px-4">ΔKM médio</th>
                  <th className="text-right text-g-600 font-semibold py-2 px-4">ΔKM máx.</th>
                </tr>
              </thead>
              <tbody>
                {byMedida.map((row, i) => (
                  <tr key={row.spec} className={`border-t border-g-900 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="py-2 px-4 font-mono font-semibold text-g-200">{row.spec}</td>
                    <td className="py-2 px-3 text-center text-g-500">{row.n_veiculos}</td>
                    <td className="py-2 px-3 text-center text-g-500">{row.n_eventos}</td>
                    <td className="py-2 px-3 text-center text-g-400 font-mono">{row.total_pneus || '—'}</td>
                    <td className="py-2 px-4 text-right font-mono text-g-500">{row.min_km != null ? num(row.min_km) + ' km' : '—'}</td>
                    <td className="py-2 px-4 text-right font-mono font-bold text-emerald-700">{row.avg_km != null ? num(row.avg_km) + ' km' : '—'}</td>
                    <td className="py-2 px-4 text-right font-mono text-g-500">{row.max_km != null ? num(row.max_km) + ' km' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && porPlaca.length === 0 && (
        <p className="text-g-700 text-sm text-center py-8">Nenhum evento de <strong>{sistema}</strong> encontrado no histórico.</p>
      )}

      {!loading && porPlaca.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {porPlaca.map(veh => {
            const isOpen   = expanded.has(veh.placa)
            const allConjs = (veh.por_medida || []).flatMap(m => m.conjuntos || [])
            const isPneuSistema = sistema === 'Pneu'
            const allKms   = isPneuSistema
              ? allConjs.map(c => c.delta_km).filter(Boolean)
              : (veh.eventos || []).map(e => e.delta_km).filter(Boolean)
            const avgKm    = allKms.length  ? Math.round(allKms.reduce((a,b)=>a+b,0)/allKms.length)  : null
            const allDias  = isPneuSistema
              ? allConjs.map(c => c.delta_dias).filter(Boolean)
              : (veh.eventos || []).map(e => e.delta_dias).filter(Boolean)
            const avgDias  = allDias.length ? Math.round(allDias.reduce((a,b)=>a+b,0)/allDias.length) : null
            const hasPorMedida = sistema === 'Pneu' && veh.por_medida?.length > 0
            const specs    = sistema === 'Pneu'
              ? [...new Set((veh.por_medida || []).map(m => m.espec).filter(e => e && e !== '—'))]
              : []

            const kmRodado = veh.km_rodado_atual
            const avgFleet = fleet?.km?.avg
            const rodadoColor = kmRodado == null ? null
              : avgFleet && kmRodado > avgFleet * 0.85 ? 'text-amber-600'
              : 'text-sky-500'

            return (
              <div key={veh.placa} className="border border-g-800 rounded-xl overflow-hidden bg-white">
                <button
                  onClick={() => toggleExpand(veh.placa)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-g-950/5 transition-colors text-left"
                >
                  <span className="font-mono font-extrabold text-g-100 text-base w-24 shrink-0">{veh.placa}</span>
                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-g-500 text-[11px] font-semibold uppercase tracking-wider">{veh.modelo || '—'}</span>
                    {veh.implemento && <span className="text-g-700 text-[10px]">· {veh.implemento}</span>}
                    {specs.map(s => (
                      <span key={s} className="bg-g-900 border border-g-800 text-g-400 font-mono text-[10px] px-1.5 py-0.5 rounded">{s}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className="text-g-600 text-[10px] block uppercase tracking-wide">Eventos</span>
                      <span className="font-mono font-bold text-g-200 text-sm">{veh.n_eventos}</span>
                    </div>
                    {avgKm && (
                      <div className="text-right">
                        <span className="text-g-600 text-[10px] block uppercase tracking-wide">Média ΔKM</span>
                        <span className="font-mono font-bold text-emerald-700 text-sm">{num(avgKm)} km</span>
                      </div>
                    )}
                    {avgDias && (
                      <div className="text-right">
                        <span className="text-g-600 text-[10px] block uppercase tracking-wide">Média dias</span>
                        <span className="font-mono font-bold text-blue-600 text-sm">{avgDias}d</span>
                      </div>
                    )}
                    {veh.km_por_posicao?.length > 0 && (
                      <div className="flex items-center gap-2 border-l border-g-800 pl-4 shrink-0">
                        {veh.km_por_posicao.map(p => {
                          const pColor = avgFleet && p.km_rodado > avgFleet * 0.85 ? 'text-amber-600' : 'text-sky-500'
                          return (
                            <div key={p.posicao} className="text-right">
                              <span className="text-g-600 text-[10px] block uppercase tracking-wide">{p.posicao}</span>
                              <span className={`font-mono font-bold text-sm ${pColor}`}>{num(p.km_rodado)} km</span>
                              {p.dias_rodando != null && <span className="text-g-600 text-[10px] block">{p.dias_rodando}d</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-g-500 ml-2" />
                      : <ChevronDown className="w-4 h-4 text-g-500 ml-2" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-g-800">
                    {sistema === 'Pneu' && (
                      <div className="px-5 py-3.5 bg-sky-50/30 border-b border-sky-100 flex flex-col gap-3">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div className="flex items-center gap-3 flex-wrap text-xs">
                            {veh.km_atual ? (
                              <>
                                <span className="text-sky-700 font-semibold">KM atual do veículo:</span>
                                <span className="font-mono font-extrabold text-sky-900 bg-white border border-sky-200/80 px-2.5 py-0.5 rounded-md shadow-sm text-[13px]">{num(veh.km_atual)} km</span>
                                {veh.km_atual_data && <span className="text-sky-500 font-medium text-[11px]">em {dateBR(veh.km_atual_data)}</span>}
                              </>
                            ) : (
                              <span className="text-g-600 italic font-medium">Veículo sem KM registrado</span>
                            )}
                          </div>

                          <button
                            onClick={() => setRodizioModal({ placa: veh.placa, specs, conjuntos: allConjs })}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-violet-50 border border-violet-200 hover:border-violet-300 text-violet-700 hover:text-violet-800 rounded-lg text-xs font-extrabold shadow-sm hover:shadow transition-all duration-200 group cursor-pointer active:scale-95"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-violet-500 group-hover:rotate-[-45deg] transition-transform" />
                            Registrar Rodízio
                          </button>
                        </div>

                        {veh.km_por_posicao?.length > 0 && (
                          <div className="flex flex-wrap gap-2.5">
                            {veh.km_por_posicao.map(p => {
                              const pct  = avgFleet ? Math.round(p.km_rodado / avgFleet * 100) : null
                              const pCol = avgFleet && p.km_rodado > avgFleet * 0.85 ? 'border-amber-300 bg-amber-50/75 text-amber-600'
                                         : 'border-sky-200 bg-white text-sky-800'
                              return (
                                <div key={p.posicao} className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 ${pCol} shadow-sm text-xs`}>
                                  <span className="font-bold text-[10px] uppercase tracking-wider opacity-70">{p.posicao}</span>
                                  <span className="font-mono font-extrabold">{num(p.km_rodado)} km</span>
                                  {p.dias_rodando != null && <span className="opacity-60 font-medium">{p.dias_rodando}d</span>}
                                  {pct != null && <span className="opacity-50 font-medium text-[10px]">({pct}% da média)</span>}
                                  {(p.marca || p.espec) && (
                                    <span className="opacity-40 text-[10px] border-l border-current/20 pl-2 font-medium">
                                      {p.marca}{p.marca && p.espec ? ' · ' : ''}{p.espec}
                                    </span>
                                  )}
                                  {p.numero_os && <span className="opacity-30 text-[10px] font-mono tracking-tighter">{p.numero_os}</span>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {sistema !== 'Pneu' && veh.km_atual && (
                      <div className="px-5 py-2.5 bg-sky-50/60 border-b border-sky-100 text-xs">
                        <div className="flex items-center gap-4 flex-wrap">
                          <span className="text-sky-700 font-semibold">KM atual do veículo:</span>
                          <span className="font-mono font-bold text-sky-800">{num(veh.km_atual)} km</span>
                          {veh.km_atual_data && <span className="text-sky-500 font-medium">em {dateBR(veh.km_atual_data)}</span>}
                        </div>
                      </div>
                    )}

                    {hasPorMedida
                      ? veh.por_medida.map(med => (
                          <div key={med.espec} className="border-b border-g-900 last:border-b-0">
                            <div className="bg-g-950/30 px-5 py-1.5 flex items-center gap-3">
                              <span className="font-mono font-bold text-g-300 text-xs">{med.espec}</span>
                              <span className="text-g-600 text-[10px]">{med.n_eventos} conjunto{med.n_eventos !== 1 ? 's' : ''}</span>
                              {med.total_pneus > 0 && <span className="text-g-600 text-[10px]">· {med.total_pneus} pneus</span>}
                              {med.avg_km && <span className="text-emerald-700 font-mono text-[10px] ml-auto">ΔKM médio c/ ant.: <strong>{num(med.avg_km)}</strong> km</span>}
                            </div>
                            <div className="overflow-x-auto">
                              <ConjuntoTable conjuntos={med.conjuntos || []} avgKm={fleet?.km?.avg}
                                onDeleteRodizio={async id => { await deletePneuRodizio(id); load() }} />
                            </div>
                          </div>
                        ))
                      : (
                        <div className="overflow-x-auto">
                          <EventTable eventos={veh.eventos || []} total={veh.n_eventos} isPneu={false} avgKm={fleet?.km?.avg} kms={allKms} dias={allDias} />
                        </div>
                      )
                    }
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
    {rodizioModal && (
      <RodizioModal
        placa={rodizioModal.placa}
        specs={rodizioModal.specs || []}
        conjuntos={rodizioModal.conjuntos || []}
        onClose={() => setRodizioModal(null)}
        onSaved={() => load()}
      />
    )}
  </>
  )
}
