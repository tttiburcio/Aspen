import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CheckCircle, Banknote } from 'lucide-react'
import toast from 'react-hot-toast'
import { pagarReembolso } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'

const FORMAS = ['Boleto', 'Pix', 'TED', 'Débito Automático', 'Cheque', 'Dinheiro']

const inputCls = "w-full px-3 py-2.5 bg-g-900 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-600 transition-colors"

export default function PagarReembolsoModal({ reembolso, onClose, onSaved }) {
  const backdropRef = useRef(null)
  const [form, setForm] = useState({
    data_recebimento:  new Date().toISOString().slice(0, 10),
    valor_recebido:    String(reembolso.valor_reembolso ?? ''),
    forma_recebimento: 'Pix',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.valor_recebido || parseFloat(form.valor_recebido) <= 0)
      return toast.error('Informe o valor recebido')
    if (!form.data_recebimento)
      return toast.error('Informe a data de recebimento')

    setSaving(true)
    try {
      await pagarReembolso(reembolso.id, {
        valor_recebido:   parseFloat(form.valor_recebido),
        data_recebimento: form.data_recebimento,
        forma_recebimento: form.forma_recebimento || null,
      })
      toast.success('Reembolso marcado como recebido')
      onSaved?.()
      onClose()
    } catch {
      toast.error('Erro ao registrar recebimento')
    } finally {
      setSaving(false)
    }
  }

  const saldo = (reembolso.valor_reembolso || 0) - parseFloat(form.valor_recebido || 0)

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-md mx-4">

        {/* Header */}
        <div className="px-6 py-5 border-b border-g-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-g-100 font-bold text-base">Registrar Recebimento</h2>
              <p className="text-g-600 text-xs mt-0.5">Recibo #{reembolso.recibo || reembolso.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumo do reembolso */}
        <div className="px-6 py-4 border-b border-g-800 bg-g-900/50">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-g-600 uppercase tracking-wider text-[10px] mb-0.5">Empresa</p>
              <p className="text-g-300 font-semibold truncate">{reembolso.empresa || '—'}</p>
            </div>
            <div>
              <p className="text-g-600 uppercase tracking-wider text-[10px] mb-0.5">Placa</p>
              <p className="text-g-300 font-mono font-bold">{reembolso.placa || '—'}</p>
            </div>
            <div>
              <p className="text-g-600 uppercase tracking-wider text-[10px] mb-0.5">Valor do Reembolso</p>
              <p className="text-g-200 font-mono font-bold">{brl(reembolso.valor_reembolso ?? 0)}</p>
            </div>
            <div>
              <p className="text-g-600 uppercase tracking-wider text-[10px] mb-0.5">Vencimento</p>
              <p className="text-g-400">{reembolso.vencimento ? dateBR(reembolso.vencimento) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider">
              Data de Recebimento <span className="text-red-500">*</span>
            </label>
            <input type="date" value={form.data_recebimento}
              onChange={e => set('data_recebimento', e.target.value)}
              className={inputCls} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider">
              Valor Recebido (R$) <span className="text-red-500">*</span>
            </label>
            <input type="number" step="0.01" min="0"
              value={form.valor_recebido}
              onChange={e => set('valor_recebido', e.target.value)}
              placeholder="0,00"
              className={`${inputCls} font-mono`} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-g-500 text-[11px] font-semibold uppercase tracking-wider">
              Forma de Recebimento
            </label>
            <select value={form.forma_recebimento}
              onChange={e => set('forma_recebimento', e.target.value)}
              className={inputCls}>
              <option value="">—</option>
              {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Preview saldo */}
          {parseFloat(form.valor_recebido) > 0 && (
            <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-g-900 border border-g-800 rounded-xl text-center">
              {[
                { label: 'A Receber', val: reembolso.valor_reembolso || 0, color: 'text-g-200' },
                { label: 'Recebido',  val: parseFloat(form.valor_recebido) || 0, color: 'text-emerald-400' },
                { label: 'Saldo',     val: saldo, color: saldo > 0.01 ? 'text-amber-400' : 'text-emerald-400' },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <p className="text-g-600 text-[10px] uppercase tracking-wider mb-0.5">{label}</p>
                  <p className={`font-mono font-bold text-sm ${color}`}>{brl(val)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-g-800 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-g-800 text-g-400 text-sm hover:bg-g-850 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-40 transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Confirmar Recebimento
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
