import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Receipt, Landmark } from 'lucide-react'
import { patchFatura } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'
import toast from 'react-hot-toast'

const FIELD = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-g-600 text-[10px] uppercase tracking-wider font-semibold">{label}</label>
    {children}
  </div>
)

const inputCls = "w-full px-3 py-2 bg-g-850 border border-g-800 rounded-lg text-g-200 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors"

export default function PagarFaturaModal({ fatura, mode, onClose, onSaved }) {
  // mode: 'recebimento' | 'imposto'
  const isRec = mode === 'recebimento'

  const [valor,   setValor]   = useState(isRec ? String(fatura.valor_locacoes ?? '') : String(fatura.valor_imposto ?? ''))
  const [dataPgto, setDataPgto] = useState('')
  const [encargo, setEncargo] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      const payload = isRec
        ? {
            status_recebimento: 'Recebido',
            valor_recebido: parseFloat(valor) || 0,
          }
        : {
            status_imposto:    'Pago',
            data_pgto_imposto: dataPgto || null,
            encargo_imposto:   parseFloat(encargo) || 0,
          }
      await patchFatura(fatura.id, payload)
      toast.success(isRec ? 'Recebimento registrado' : 'Pagamento de imposto registrado')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-g-800">
          <div className="flex items-center gap-2">
            {isRec
              ? <Receipt className="w-4 h-4 text-emerald-700" />
              : <Landmark className="w-4 h-4 text-amber-600" />}
            <h3 className="text-g-100 font-semibold text-sm">
              {isRec ? 'Registrar Recebimento' : 'Registrar Pagamento de Imposto'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-g-600 hover:text-g-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info fatura */}
        <div className="px-5 pt-3 pb-2 bg-g-900/50 border-b border-g-800">
          <p className="text-g-300 text-xs font-semibold">{fatura.contrato_cliente || fatura.empresa || '—'}</p>
          <p className="text-g-600 text-[11px]">
            {fatura.emissao_display} · {fatura.empresa_sigla}
          </p>
          {isRec
            ? <p className="text-g-400 text-xs mt-1">
                Valor a receber: <span className="font-mono font-semibold text-g-200">{brl(fatura.valor_locacoes)}</span>
              </p>
            : <p className="text-g-400 text-xs mt-1">
                Imposto (11,33%): <span className="font-mono font-semibold text-amber-600">{brl(fatura.valor_imposto)}</span>
              </p>}
        </div>

        {/* Form */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {isRec && (
            <FIELD label="Valor recebido (R$)">
              <input
                type="number"
                step="0.01"
                value={valor}
                onChange={e => setValor(e.target.value)}
                className={inputCls}
              />
            </FIELD>
          )}

          {!isRec && (
            <>
              <FIELD label="Data do pagamento">
                <input
                  type="date"
                  value={dataPgto}
                  onChange={e => setDataPgto(e.target.value)}
                  className={inputCls}
                />
              </FIELD>
              <FIELD label="Encargo / Mora (R$) — opcional">
                <input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={encargo}
                  onChange={e => setEncargo(e.target.value)}
                  className={inputCls}
                />
              </FIELD>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-lg text-g-400 hover:text-g-200 hover:bg-g-800 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 ${
              isRec
                ? 'bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600'
                : 'bg-amber-700 hover:bg-amber-600 text-white border border-amber-600'
            }`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
