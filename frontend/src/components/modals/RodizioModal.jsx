import { useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw, ArrowRight, Loader2, X } from 'lucide-react'
import { createPneuRodizio } from '../../utils/api'

const POSICOES_PNEU = ['DIANTEIRO', 'TRASEIRO', 'DIANTEIRO + TRASEIRO']

export default function RodizioModal({ placa, specs, conjuntos = [], onClose, onSaved }) {
  const first = conjuntos[0]
  const [form, setForm] = useState({
    placa,
    data: '',
    km: '',
    posicao_anterior: first?.posicao_atual || 'TRASEIRO',
    posicao_nova: 'DIANTEIRO',
    espec_pneu: first?.espec || specs[0] || '',
    marca_pneu: first?.marca || '',
    qtd: first?.qtd || 2,
    os_ref: first?.os_ref || '',
    observacao: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleConjuntoSelect = os_ref => {
    const c = conjuntos.find(c => c.os_ref === os_ref)
    if (c) setForm(f => ({ ...f, os_ref, posicao_anterior: c.posicao_atual || f.posicao_anterior, espec_pneu: c.espec || f.espec_pneu, marca_pneu: c.marca || f.marca_pneu, qtd: c.qtd || f.qtd }))
    else set('os_ref', os_ref)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await createPneuRodizio({
        ...form,
        km:  form.km  ? Number(form.km)  : null,
        qtd: form.qtd ? Number(form.qtd) : 2,
      })
      onSaved()
      onClose()
    } catch (err) {
      console.error('Erro ao criar rodízio:', err)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-g-900 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-violet-400" />
            <span className="text-g-100 font-semibold text-sm">Registrar Rodízio / Movimentação</span>
          </div>
          <span className="font-mono font-bold text-violet-400 text-sm">{placa}</span>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Data *</label>
              <input type="date" required value={form.data} onChange={e => set('data', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">KM no momento</label>
              <input type="number" value={form.km} onChange={e => set('km', e.target.value)} placeholder="ex: 47489"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Posição anterior *</label>
              <select value={form.posicao_anterior} onChange={e => set('posicao_anterior', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                {POSICOES_PNEU.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <ArrowRight className="w-5 h-5 text-violet-400 mt-5 shrink-0" />
            <div className="flex-1">
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Nova posição *</label>
              <select value={form.posicao_nova} onChange={e => set('posicao_nova', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                {POSICOES_PNEU.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Especificação</label>
              {specs.length > 0
                ? <select value={form.espec_pneu} onChange={e => set('espec_pneu', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    {specs.map(s => <option key={s}>{s}</option>)}
                    <option value="">Outra</option>
                  </select>
                : <input value={form.espec_pneu} onChange={e => set('espec_pneu', e.target.value)} placeholder="ex: 225/75R16C"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              }
            </div>
            <div>
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Qtd</label>
              <input type="number" min="1" value={form.qtd} onChange={e => set('qtd', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Marca</label>
              <input value={form.marca_pneu} onChange={e => set('marca_pneu', e.target.value)} placeholder="ex: APOLLO"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Conjunto (OS origem) *</label>
              {conjuntos.length > 0
                ? <select required value={form.os_ref} onChange={e => handleConjuntoSelect(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    <option value="">— Selecionar —</option>
                    {conjuntos.map(c => (
                      <option key={c.os_ref} value={c.os_ref}>
                        {c.os_ref} · {c.posicao_atual} · {c.espec || ''} {c.marca ? `· ${c.marca}` : ''}
                      </option>
                    ))}
                  </select>
                : <input value={form.os_ref} onChange={e => set('os_ref', e.target.value)} placeholder="ex: OS-2025-0008"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              }
            </div>
          </div>
          <div>
            <label className="text-g-600 text-[10px] font-bold uppercase tracking-wider block mb-1">Observação</label>
            <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-g-500 hover:text-g-300 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
