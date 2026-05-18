import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, X, CheckCircle, AlertTriangle, Ban, Loader2 } from 'lucide-react'
import { dbAtualizarParcela } from '../../utils/api'
import { brl, dateBR } from '../../utils/format'
import { parseLocalDate } from '../../utils/maintenanceHelpers'
import { calcValorComEncargos, calcDataCartorio } from '../../utils/financialCalcs'

export default function ProrrogarParcelaModal({ parcela: p, onClose, onSaved }) {
  const FIELD = 'w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors'
  const LABEL = 'text-g-600 text-xs font-medium mb-1 block'

  const modoInicial = p.prorrogada
    ? (p.dias_cartorio ? 'cartorio' : p.isento_encargos ? 'prorrogada_isenta' : 'prorrogada_encargos')
    : null

  const [modo, setModo] = useState(modoInicial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    nova_data: p.prorrogada ? (p.data_vencimento || '') : '',
    tipo_pgto: p.tipo_pgto_prorrogacao || 'boleto',
    chave_pix: p.chave_pix || '',
    multa_pct: p.multa_pct != null ? String(p.multa_pct) : '',
    juros_diario_pct: p.juros_diario_pct != null ? String(p.juros_diario_pct) : '',
    data_prevista_pagamento: p.data_prevista_pagamento || '',
    dias_cartorio: p.dias_cartorio != null ? String(p.dias_cartorio) : '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const valorBase = parseFloat(p.valor_parcela) || 0
  const dataVencRef = p.data_vencimento_original || p.data_vencimento

  const dataCartorio = useMemo(() =>
    calcDataCartorio(dataVencRef, form.dias_cartorio),
    [dataVencRef, form.dias_cartorio]
  )

  const dataAlvoEncargos = form.data_prevista_pagamento || form.nova_data || null

  const valorEncargos = useMemo(() => {
    if (modo === 'prorrogada_encargos' || modo === 'cartorio') {
      const alvo = modo === 'cartorio' ? dataCartorio : dataAlvoEncargos
      return calcValorComEncargos(valorBase, form.multa_pct, form.juros_diario_pct, dataVencRef, alvo)
    }
    return null
  }, [modo, form.multa_pct, form.juros_diario_pct, valorBase, dataVencRef, dataAlvoEncargos, dataCartorio])

  const handleSave = async () => {
    setError(null)
    let payload = {}
    if (modo === 'prorrogada_isenta') {
      if (!form.nova_data) { setError('Informe a nova data de vencimento'); return }
      payload = {
        data_vencimento_original: p.data_vencimento_original || p.data_vencimento,
        data_vencimento: form.nova_data,
        prorrogada: true,
        isento_encargos: true,
        tipo_pgto_prorrogacao: form.tipo_pgto,
        chave_pix: form.tipo_pgto === 'pix' ? form.chave_pix : null,
      }
    } else if (modo === 'prorrogada_encargos') {
      if (!form.nova_data) { setError('Informe a nova data de vencimento'); return }
      payload = {
        data_vencimento_original: p.data_vencimento_original || p.data_vencimento,
        data_vencimento: form.nova_data,
        prorrogada: true,
        isento_encargos: false,
        multa_pct: parseFloat(form.multa_pct) || null,
        juros_diario_pct: parseFloat(form.juros_diario_pct) || null,
        data_prevista_pagamento: form.data_prevista_pagamento || null,
        valor_atualizado: valorEncargos,
      }
    } else if (modo === 'cartorio') {
      if (!form.dias_cartorio) { setError('Informe a quantidade de dias'); return }
      payload = {
        dias_cartorio: parseInt(form.dias_cartorio),
        data_prevista_pagamento: dataCartorio,
        multa_pct: parseFloat(form.multa_pct) || null,
        juros_diario_pct: parseFloat(form.juros_diario_pct) || null,
        valor_atualizado: valorEncargos,
      }
    }
    setSaving(true)
    try {
      await dbAtualizarParcela(p.id, payload)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao salvar')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-up">

        <div className="flex items-center justify-between px-5 py-4 border-b border-g-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-g-850 border border-g-800 rounded-lg">
              <CalendarClock className="w-4 h-4 text-g-400" />
            </div>
            <div>
              <h2 className="text-g-200 font-semibold text-sm">{p.prorrogada ? 'Editar Prorrogação' : 'Prorrogar Parcela'}</h2>
              <p className="text-g-600 text-xs font-mono">{p.placa} · {p.id_ord_serv || '—'} · {brl(p.valor_parcela)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-5">

          {!modo && (
            <div className="flex flex-col gap-3">
              <p className="text-g-500 text-sm font-medium">A parcela será prorrogada?</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setModo('prorrogada_isenta')}
                  className="flex items-center gap-3 px-4 py-3 bg-g-850 border border-g-800 rounded-xl hover:border-emerald-500/40 hover:bg-emerald-50/5 transition-colors text-left"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-g-300 text-sm font-medium">Sim, isenta de encargos</p>
                    <p className="text-g-600 text-xs">Nova data, sem multa ou juros</p>
                  </div>
                </button>
                <button
                  onClick={() => setModo('prorrogada_encargos')}
                  className="flex items-center gap-3 px-4 py-3 bg-g-850 border border-g-800 rounded-xl hover:border-amber-500/40 hover:bg-amber-50/5 transition-colors text-left"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-g-300 text-sm font-medium">Sim, com encargos</p>
                    <p className="text-g-600 text-xs">Multa e/ou juros serão aplicados</p>
                  </div>
                </button>
                <button
                  onClick={() => setModo('cartorio')}
                  className="flex items-center gap-3 px-4 py-3 bg-g-850 border border-g-800 rounded-xl hover:border-red-500/40 hover:bg-red-50/5 transition-colors text-left"
                >
                  <Ban className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-g-300 text-sm font-medium">Não — envio ao cartório</p>
                    <p className="text-g-600 text-xs">Calcular data de protesto</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {modo === 'prorrogada_isenta' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nova data de vencimento *</label>
                  <input type="date" value={form.nova_data} onChange={e => set('nova_data', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Forma de pagamento</label>
                  <select value={form.tipo_pgto} onChange={e => set('tipo_pgto', e.target.value)} className={FIELD}>
                    <option value="boleto">Boleto atualizado</option>
                    <option value="pix">PIX</option>
                  </select>
                </div>
              </div>
              {form.tipo_pgto === 'pix' && (
                <div>
                  <label className={LABEL}>Chave PIX</label>
                  <input value={form.chave_pix} onChange={e => set('chave_pix', e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória…" className={FIELD} />
                </div>
              )}
            </div>
          )}

          {modo === 'prorrogada_encargos' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nova data de vencimento *</label>
                  <input type="date" value={form.nova_data} onChange={e => set('nova_data', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Data prevista de pagamento</label>
                  <input type="date" value={form.data_prevista_pagamento} onChange={e => set('data_prevista_pagamento', e.target.value)} className={FIELD} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Multa (%)</label>
                  <input type="number" step="0.01" placeholder="Ex: 2,00" value={form.multa_pct} onChange={e => set('multa_pct', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Juros diário (%)</label>
                  <input type="number" step="0.001" placeholder="Ex: 0,033" value={form.juros_diario_pct} onChange={e => set('juros_diario_pct', e.target.value)} className={FIELD} />
                </div>
              </div>
              {valorEncargos !== null && (
                <div className="bg-g-850 border border-g-800 rounded-xl px-4 py-3 text-xs flex flex-col gap-1">
                  <div className="flex justify-between text-g-600"><span>Valor base</span><span className="font-mono">{brl(valorBase)}</span></div>
                  <div className="flex justify-between text-g-600"><span>Multa ({form.multa_pct || 0}%)</span><span className="font-mono">{brl(valorBase * ((parseFloat(form.multa_pct) || 0) / 100))}</span></div>
                  {(() => {
                    const alvo = dataAlvoEncargos
                    if (!alvo || !dataVencRef) return null
                    const v = parseLocalDate(dataVencRef)
                    const f = parseLocalDate(alvo)
                    if (!v || !f) return null
                    const dias = Math.max(0, Math.round((f - v) / 86400000))
                    const juros = valorBase * ((parseFloat(form.juros_diario_pct) || 0) / 100) * dias
                    return (
                      <div className="flex justify-between text-g-600">
                        <span>Juros ({form.juros_diario_pct || 0}% x {dias} dias)</span>
                        <span className="font-mono">{brl(juros)}</span>
                      </div>
                    )
                  })()}
                  <div className="flex justify-between text-g-600 border-t border-g-800 pt-1 mt-1"><span>Valor atualizado</span><span className="font-mono font-semibold text-amber-400">{brl(valorEncargos)}</span></div>
                </div>
              )}
            </div>
          )}

          {modo === 'cartorio' && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Dias corridos para envio *</label>
                  <input type="number" placeholder="Ex: 15" value={form.dias_cartorio} onChange={e => set('dias_cartorio', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Data de envio ao cartório</label>
                  <input
                    value={dataCartorio ? dateBR(dataCartorio) : '—'}
                    disabled
                    className={`${FIELD} bg-g-850 text-g-500 cursor-default opacity-70`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Multa (%)</label>
                  <input type="number" step="0.01" placeholder="Ex: 2,00" value={form.multa_pct} onChange={e => set('multa_pct', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Juros diário (%)</label>
                  <input type="number" step="0.001" placeholder="Ex: 0,033" value={form.juros_diario_pct} onChange={e => set('juros_diario_pct', e.target.value)} className={FIELD} />
                </div>
              </div>
              {valorEncargos !== null && (
                <div className="bg-g-850 border border-g-800 rounded-xl px-4 py-3 text-xs flex flex-col gap-1">
                  <div className="flex justify-between text-g-600"><span>Valor base</span><span className="font-mono">{brl(valorBase)}</span></div>
                  <div className="flex justify-between text-g-600"><span>Encargos acumulados</span><span className="font-mono">{brl(valorEncargos - valorBase)}</span></div>
                  <div className="flex justify-between text-g-600 border-t border-g-800 pt-1 mt-1"><span>Valor com encargos</span><span className="font-mono font-semibold text-red-400">{brl(valorEncargos)}</span></div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-g-800 flex justify-between items-center">
          <div>
            {modo && (
              <button onClick={() => { setModo(null); setError(null) }} className="text-g-600 text-xs hover:text-g-400 transition-colors">
                ← Voltar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">
              Cancelar
            </button>
            {modo && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-g-100 text-white text-sm font-medium hover:bg-g-50 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
