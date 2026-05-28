import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Receipt, Landmark, AlertCircle } from 'lucide-react'
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

function calcEncargo(fatura) {
  if (!fatura.vencimento) return null
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const venc = new Date(fatura.vencimento + 'T00:00:00')
  const diasAtraso = Math.floor((hoje - venc) / 86400000)
  if (diasAtraso <= 0) return null
  const base = fatura.valor_locacoes || 0
  const valMulta = fatura.multa_pct  ? base * fatura.multa_pct / 100 : 0
  const jurosDia = fatura.juros_pct  ? fatura.juros_pct / 30 / 100 : 0
  const valJuros = base * jurosDia * diasAtraso
  return { diasAtraso, valMulta, valJuros, total: base + valMulta + valJuros }
}

function fmtBRL(num) {
  return (num || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseBRL(str) {
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0
}

export default function PagarFaturaModal({ fatura, mode, onClose, onSaved }) {
  // mode: 'recebimento' | 'imposto'
  const isRec = mode === 'recebimento'

  const encargo = useMemo(() =>
    isRec && fatura.forma_pagamento === 'Boleto' ? calcEncargo(fatura) : null,
  [fatura, isRec])

  const valorNum = isRec
    ? (encargo ? encargo.total : (fatura.valor_locacoes ?? 0))
    : (fatura.valor_imposto ?? 0)

  const [valorDisplay, setValorDisplay] = useState(fmtBRL(valorNum))
  const [dataPgto,     setDataPgto]     = useState('')
  const [encargoImp,   setEncargoImp]   = useState('')
  const [loading,      setLoading]      = useState(false)

  const handleValorBlur = () => {
    setValorDisplay(fmtBRL(parseBRL(valorDisplay)))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const payload = isRec
        ? {
            status_recebimento: 'Recebido',
            valor_recebido: parseBRL(valorDisplay),
          }
        : {
            status_imposto:    'Pago',
            data_pgto_imposto: dataPgto || null,
            encargo_imposto:   parseFloat(encargoImp) || 0,
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
      <div className="bg-g-950 border border-g-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col">

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
        <div className="px-5 pt-3 pb-3 bg-g-900/50 border-b border-g-800 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-g-300 text-sm font-semibold">{fatura.contrato_cliente || fatura.empresa || '—'}</p>
              <p className="text-g-600 text-xs mt-0.5">{fatura.emissao_display} · {fatura.empresa_sigla}</p>
            </div>
            <div className="text-right shrink-0 text-xs flex flex-col gap-0.5">
              {fatura.numero_fatura && (
                <p className="text-g-500">Fatura <span className="text-g-300 font-bold">#{fatura.numero_fatura}</span></p>
              )}
              {fatura.numero_medicao && (
                <p className="text-g-500">{fatura.numero_medicao}ª <span className="text-g-400">medição</span></p>
              )}
              {fatura.vencimento && (
                <p className="text-g-500">Venc. <span className="text-g-300">{dateBR(fatura.vencimento)}</span></p>
              )}
            </div>
          </div>

          {isRec && !encargo && (
            <p className="text-g-400 text-xs mt-0.5">
              Valor original: <span className="font-semibold text-g-200">{brl(fatura.valor_locacoes)}</span>
            </p>
          )}

          {/* Breakdown de encargos quando vencida com boleto */}
          {isRec && encargo && (
            <div className="mt-1.5 rounded-lg border border-g-700 overflow-hidden text-xs">
              <div className="grid grid-cols-4 divide-x divide-g-800 bg-g-900">
                <div className="px-3 py-2.5">
                  <p className="text-g-600 text-[10px] font-semibold uppercase mb-1">Original</p>
                  <p className="text-g-300 font-bold">{brl(fatura.valor_locacoes)}</p>
                  <p className="text-g-600 text-[10px] mt-0.5">{encargo.diasAtraso}d em atraso</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-g-600 text-[10px] font-semibold uppercase mb-1">
                    Multa{fatura.multa_pct ? ` (${fatura.multa_pct}%)` : ''}
                  </p>
                  <p className="text-g-300 font-bold">+ {brl(encargo.valMulta)}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-g-600 text-[10px] font-semibold uppercase mb-1">
                    Juros{fatura.juros_pct ? ` (${fatura.juros_pct}% a.m.)` : ''}
                  </p>
                  <p className="text-g-300 font-bold">+ {brl(encargo.valJuros)}</p>
                </div>
                <div className="px-3 py-2.5 bg-g-850">
                  <p className="text-g-500 text-[10px] font-semibold uppercase mb-1">Total</p>
                  <p className="text-g-50 font-bold">{brl(encargo.total)}</p>
                </div>
              </div>
              {fatura.dias_protesto != null && (() => {
                const diasParaProtesto = fatura.dias_protesto - encargo.diasAtraso
                return (
                  <div className={`px-3 py-1.5 border-t border-g-800 flex items-center gap-1.5 text-[11px] font-semibold ${
                    diasParaProtesto <= 0 ? 'text-red-400' : 'text-g-500'
                  }`}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {diasParaProtesto <= 0
                      ? `Protesto vencido há ${Math.abs(diasParaProtesto)}d — enviar a cartório`
                      : `Protesto em ${diasParaProtesto}d`}
                  </div>
                )
              })()}
            </div>
          )}

          {!isRec && (
            <p className="text-g-400 text-xs mt-0.5">
              Imposto: <span className="font-mono font-semibold text-amber-600">{brl(fatura.valor_imposto)}</span>
            </p>
          )}
        </div>

        {/* Form */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {isRec && (
            <FIELD label="Valor recebido (R$)">
              <input
                type="text"
                inputMode="decimal"
                value={valorDisplay}
                onChange={e => setValorDisplay(e.target.value)}
                onBlur={handleValorBlur}
                className={`${inputCls} font-mono text-right`}
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
                  value={encargoImp}
                  onChange={e => setEncargoImp(e.target.value)}
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
