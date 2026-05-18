import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { brl } from '../../utils/format'

export default function AlertContasDiaModal({ parcelas, onCiente, onLembrarDepois }) {
  const total = parcelas.reduce((sum, p) => sum + (parseFloat(p.valor_atualizado ?? p.valor_parcela) || 0), 0)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-900 border border-orange-500/30 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-g-800">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-orange-50 border border-orange-200 rounded-lg">
              <Bell className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h2 className="text-g-200 font-semibold text-sm">Contas vencidas ou com vencimento hoje</h2>
              <p className="text-g-600 text-xs">{parcelas.length} parcela{parcelas.length !== 1 ? 's' : ''} pendente{parcelas.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="block text-[10px] text-g-600 uppercase font-bold tracking-wider">Total a Pagar</span>
            <span className="text-lg font-mono font-bold text-orange-400">{brl(total)}</span>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2 max-h-72 overflow-y-auto">
          {parcelas.map(p => {
            const isVencida = p._status === 'vencida'
            const isHoje = p._status === 'vence_hoje'
            return (
              <div key={p.id} className={`bg-g-850 border rounded-xl px-4 py-2.5 flex items-center justify-between text-xs ${isVencida ? 'border-red-500/30' : isHoje ? 'border-orange-500/30' : 'border-g-800'}`}>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-g-200">{p.placa}</span>
                  {isVencida && <span className="text-[10px] bg-red-500/10 text-red-500 border border-red-500/20 px-1 rounded uppercase font-bold">Vencida</span>}
                  {isHoje && <span className="text-[10px] bg-orange-500/10 text-orange-500 border border-orange-500/20 px-1 rounded uppercase font-bold">Vence Hoje</span>}
                  {p.fornecedor && <span className="text-g-500 truncate max-w-[140px]">{p.fornecedor}</span>}
                </div>
                <span className={`font-mono font-semibold ${isVencida ? 'text-red-400' : 'text-orange-400'}`}>{brl(p.valor_parcela)}</span>
              </div>
            )
          })}
        </div>
        <div className="px-5 py-4 border-t border-g-800 flex justify-end gap-2">
          <button
            onClick={onLembrarDepois}
            className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors"
          >
            Lembrar mais tarde
          </button>
          <button
            onClick={onCiente}
            className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors"
          >
            Ciente
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
