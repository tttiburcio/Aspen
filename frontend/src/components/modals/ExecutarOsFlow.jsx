import { Trash2 } from 'lucide-react'

const H = 'h-[38px]'
const FIELD = `w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors ${H}`
const LABEL = 'text-g-600 text-[10px] uppercase tracking-widest font-bold mb-1.5 block'

const STATUS_EXEC = ['Resolvido', 'Parcialmente resolvido', 'Pendente']
const CATEGORIAS  = ['Compra', 'Serviço', 'Outro']
const SISTEMAS    = ['Motor', 'Hidráulico', 'Elétrico', 'Pneu', 'Freio', 'Suspensão', 'Transmissão', 'Funilaria', 'Outro']

export default function ExecutarOsFlow({
  editMode,
  execForm, setExecForm, needsPendente,
  execFormEdit, setExecFormEdit,
  itensEdit, addItem, removeItem, setItemField,
}) {
  if (editMode) {
    return (
      <>
        <p className="text-g-500 text-sm">Edite os dados de execução e itens da Ordem de Serviço.</p>

        <div className="bg-g-850 border border-g-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-g-500 text-xs font-semibold uppercase tracking-wider">Dados de Execução</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Data de Execução</label>
              <input type="date" value={execFormEdit.data_execucao}
                onChange={e => setExecFormEdit(f => ({ ...f, data_execucao: e.target.value }))}
                className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>KM Atual</label>
              <input type="number" value={execFormEdit.km}
                onChange={e => setExecFormEdit(f => ({ ...f, km: e.target.value }))}
                placeholder="Ex: 45000" className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Próxima KM</label>
              <input type="number" value={execFormEdit.prox_km}
                onChange={e => setExecFormEdit(f => ({ ...f, prox_km: e.target.value }))}
                placeholder="Ex: 50000" className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Próxima Data</label>
              <input type="date" value={execFormEdit.prox_data}
                onChange={e => setExecFormEdit(f => ({ ...f, prox_data: e.target.value }))}
                className={FIELD} />
            </div>
          </div>
        </div>

        <div className="bg-g-850 border border-g-800 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-g-500 text-[10px] uppercase tracking-widest font-semibold">Itens / Serviços da OS</p>
            <button type="button" onClick={addItem}
              className="text-xs text-g-100 hover:text-g-50 font-medium transition-colors">+ Adicionar item</button>
          </div>
          <div className="flex flex-col gap-2">
            {itensEdit.map((it, i) => (
              <div key={i} className="grid grid-cols-[110px_130px_1fr_70px_28px] gap-2 items-center bg-g-900 border border-g-800 rounded-lg px-3 py-2">
                <select value={it.categoria} onChange={e => setItemField(i, 'categoria', e.target.value)}
                  className="bg-g-900 border border-g-800 rounded text-g-300 text-xs px-2 h-[30px] focus:outline-none focus:border-g-100 transition-colors">
                  <option value="">Categoria…</option>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={it.sistema} onChange={e => setItemField(i, 'sistema', e.target.value)}
                  className="bg-g-900 border border-g-800 rounded text-g-300 text-xs px-2 h-[30px] focus:outline-none focus:border-g-100 transition-colors">
                  <option value="">Sistema…</option>
                  {SISTEMAS.map(s => <option key={s}>{s}</option>)}
                </select>
                <input type="text" value={it.servico} onChange={e => setItemField(i, 'servico', e.target.value)}
                  placeholder="Serviço / descrição…"
                  className="bg-g-900 border border-g-800 rounded text-g-300 text-xs px-2 h-[30px] focus:outline-none focus:border-g-100 transition-colors w-full" />
                <input type="number" min="1" value={it.qtd_itens} onChange={e => setItemField(i, 'qtd_itens', e.target.value)}
                  className="bg-g-900 border border-g-800 rounded text-g-300 text-xs px-2 h-[30px] focus:outline-none text-center" />
                <button type="button" onClick={() => removeItem(i)}
                  className="text-g-700 hover:text-red-500 transition-colors flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {itensEdit.length === 0 && (
              <p className="text-g-700 text-xs text-center py-2">Nenhum item. Clique em + para adicionar.</p>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <p className="text-g-500 text-sm">Registre a data de execução e o resultado do serviço.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className={LABEL}>Data de Execução *</label>
          <input type="date" value={execForm.data_execucao}
            onChange={e => setExecForm(f => ({ ...f, data_execucao: e.target.value }))}
            className={FIELD} required />
        </div>
        <div>
          <label className={LABEL}>Status de Execução *</label>
          <select value={execForm.status_execucao}
            onChange={e => setExecForm(f => ({ ...f, status_execucao: e.target.value }))}
            className={FIELD}>
            {STATUS_EXEC.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>KM na Execução</label>
          <input type="number" value={execForm.km}
            onChange={e => setExecForm(f => ({ ...f, km: e.target.value }))}
            placeholder="Ex: 125000" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Próx. KM</label>
          <input type="number" value={execForm.prox_km}
            onChange={e => setExecForm(f => ({ ...f, prox_km: e.target.value }))}
            placeholder="Ex: 140000" className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Próx. Data</label>
          <input type="date" value={execForm.prox_data}
            onChange={e => setExecForm(f => ({ ...f, prox_data: e.target.value }))}
            className={FIELD} />
        </div>
      </div>
      {needsPendente && (
        <div>
          <label className={LABEL}>Descrição do Pendente *</label>
          <textarea rows={3} value={execForm.descricao_pendente}
            onChange={e => setExecForm(f => ({ ...f, descricao_pendente: e.target.value }))}
            placeholder="Descreva o que ficou pendente ou parcialmente resolvido…"
            className="w-full px-3 py-2 bg-g-900 border border-amber-500/50 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-amber-400 transition-colors resize-none" />
        </div>
      )}
    </>
  )
}
