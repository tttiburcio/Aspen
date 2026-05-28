import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { pagarReembolso } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'

const FORMAS = ['Boleto', 'Pix', 'TED', 'Débito Automático', 'Cheque', 'Dinheiro']

const FIELD = ({ label, required, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-g-600 text-[10px] uppercase tracking-wider font-semibold">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
  </div>
)

const inputCls = "w-full px-3 py-2 bg-g-850 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"

function fmtBRL(num) {
  return (num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseBRL(str) {
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0
}

export default function PagarReembolsoModal({ reembolso, onClose, onSaved }) {
  const backdropRef = useRef(null)

  const [valorDisplay,     setValorDisplay]     = useState(fmtBRL(reembolso.valor_reembolso ?? 0))
  const [dataRecebimento,  setDataRecebimento]  = useState(new Date().toISOString().slice(0, 10))
  const [formaRecebimento, setFormaRecebimento] = useState('Pix')
  const [saving,           setSaving]           = useState(false)

  const handleValorBlur = () => setValorDisplay(fmtBRL(parseBRL(valorDisplay)))

  const valorNum = parseBRL(valorDisplay)
  const saldo    = (reembolso.valor_reembolso || 0) - valorNum

  const handleSubmit = async () => {
    if (!valorNum || valorNum <= 0) return toast.error('Informe o valor recebido')
    if (!dataRecebimento)           return toast.error('Informe a data de recebimento')

    setSaving(true)
    try {
      await pagarReembolso(reembolso.id, {
        valor_recebido:    valorNum,
        data_recebimento:  dataRecebimento,
        forma_recebimento: formaRecebimento || null,
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

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-g-800">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-700" />
            <h3 className="text-g-100 font-semibold text-sm">Registrar Recebimento de Reembolso</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-g-600 hover:text-g-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info reembolso */}
        <div className="px-5 pt-3 pb-3 bg-g-900/50 border-b border-g-800 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-g-300 text-sm font-semibold">{reembolso.empresa || '—'}</p>
              <p className="text-g-600 text-xs mt-0.5">
                {reembolso.placa && <span className="font-mono font-bold text-g-400">{reembolso.placa}</span>}
                {reembolso.placa && reembolso.tipo && ' · '}
                {reembolso.tipo}
              </p>
            </div>
            <div className="text-right shrink-0 text-xs flex flex-col gap-0.5">
              {reembolso.recibo && (
                <p className="text-g-500">Recibo <span className="text-g-300 font-bold font-mono">#{reembolso.recibo}</span></p>
              )}
              {reembolso.vencimento && (
                <p className="text-g-500">Venc. <span className="text-g-300 font-mono">{dateBR(reembolso.vencimento)}</span></p>
              )}
            </div>
          </div>

          <p className="text-g-400 text-xs mt-0.5">
            Valor do reembolso: <span className="font-mono font-semibold text-g-200">{brl(reembolso.valor_reembolso ?? 0)}</span>
          </p>
        </div>

        {/* Form */}
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <FIELD label="Data de Recebimento" required>
              <input
                type="date"
                value={dataRecebimento}
                onChange={e => setDataRecebimento(e.target.value)}
                className={inputCls}
              />
            </FIELD>
            <FIELD label="Forma de Recebimento">
              <select
                value={formaRecebimento}
                onChange={e => setFormaRecebimento(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </FIELD>
          </div>

          <FIELD label="Valor Recebido (R$)" required>
            <input
              type="text"
              inputMode="decimal"
              value={valorDisplay}
              onChange={e => setValorDisplay(e.target.value)}
              onBlur={handleValorBlur}
              className={`${inputCls} font-mono text-right`}
            />
          </FIELD>

          {/* Preview saldo */}
          {valorNum > 0 && (
            <div className="grid grid-cols-3 divide-x divide-g-800 rounded-xl border border-g-700 overflow-hidden text-xs">
              {[
                { label: 'A Receber', val: reembolso.valor_reembolso || 0, color: 'text-g-200' },
                { label: 'Recebido',  val: valorNum,                        color: 'text-emerald-600' },
                { label: 'Saldo',     val: saldo, color: saldo > 0.01 ? 'text-amber-500' : 'text-emerald-600' },
              ].map(({ label, val, color }, i) => (
                <div key={label} className={`px-4 py-2.5 text-center ${i === 2 ? 'bg-g-850' : 'bg-g-900'}`}>
                  <p className="text-g-600 text-[10px] uppercase tracking-wider mb-1">{label}</p>
                  <p className={`font-mono font-bold ${color}`}>{brl(val)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg text-g-400 hover:text-g-200 hover:bg-g-800 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
