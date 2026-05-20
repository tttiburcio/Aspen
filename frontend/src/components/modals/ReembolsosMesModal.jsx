import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { getReembolsos } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'
import { MONTHS_BR } from '../../constants/maintenanceStatus'

const STATUS_CLS = {
  Recebido:  'text-emerald-700',
  Vencido:   'text-red-400',
  Cancelado: 'text-g-600',
  Pendente:  'text-amber-600',
}

export default function ReembolsosMesModal({ year, mes, emissora, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const backdropRef = useRef(null)

  useEffect(() => {
    const params = { year, mes_recebimento: mes, ...(emissora ? { emissora_sigla: emissora } : {}) }
    getReembolsos(params)
      .then(d => setRows(d || []))
      .finally(() => setLoading(false))
  }, [year, mes, emissora])

  const total = rows.reduce((s, r) => s + (r.valor_reembolso || 0), 0)
  const recebido = rows.reduce((s, r) => s + (r.valor_recebido || 0), 0)

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-g-800 shrink-0">
          <div>
            <h2 className="text-g-100 font-bold text-base">
              Reembolsos — {MONTHS_BR[mes - 1]} {year}
            </h2>
            <p className="text-g-600 text-xs mt-0.5">
              {rows.length} registro{rows.length !== 1 ? 's' : ''} · Emitido {brl(total)} · Recebido {brl(recebido)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabela */}
        <div className="overflow-y-auto overflow-x-auto flex-1 rounded-b-2xl">
          {loading ? (
            <div className="flex items-center justify-center h-48 gap-3 text-g-600">
              <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-g-600 text-sm">
              Nenhum reembolso neste mês.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-g-850 border-b border-g-800 sticky top-0">
                <tr>
                  {['Recibo', 'Tipo', 'Placa', 'Empresa', 'Emissão', 'Vencimento', 'Valor', 'Recebido', 'Status'].map(h => (
                    <th key={h} className="th whitespace-nowrap text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-g-800 hover:bg-g-850 transition-colors">
                    <td className="td whitespace-nowrap font-mono text-g-400 text-xs">{r.recibo || '—'}</td>
                    <td className="td whitespace-nowrap text-g-400 text-xs">{r.tipo || '—'}</td>
                    <td className="td whitespace-nowrap font-mono font-bold text-g-200 text-xs">{r.placa || '—'}</td>
                    <td className="td text-g-500 text-xs max-w-[160px] truncate">{r.empresa || '—'}</td>
                    <td className="td whitespace-nowrap text-g-500 tabular-nums text-xs">{r.emissao ? dateBR(r.emissao) : '—'}</td>
                    <td className="td whitespace-nowrap text-g-500 tabular-nums text-xs">{r.vencimento ? dateBR(r.vencimento) : '—'}</td>
                    <td className="td whitespace-nowrap text-right font-mono font-semibold text-g-200 tabular-nums text-xs">{brl(r.valor_reembolso ?? 0)}</td>
                    <td className="td whitespace-nowrap text-right font-mono text-emerald-700 font-semibold tabular-nums text-xs">
                      {r.valor_recebido != null ? brl(r.valor_recebido) : '—'}
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className={`text-[10px] font-semibold ${STATUS_CLS[r.status_recebimento] || STATUS_CLS.Pendente}`}>
                        {r.status_recebimento || 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-g-850 border-t-2 border-g-700">
                <tr>
                  <td colSpan={6} className="td text-g-600 uppercase text-xs font-semibold tracking-wider">Total</td>
                  <td className="td text-right font-mono font-bold text-g-200 tabular-nums">{brl(total)}</td>
                  <td className="td text-right font-mono font-bold text-emerald-700 tabular-nums">{brl(recebido)}</td>
                  <td className="td" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
