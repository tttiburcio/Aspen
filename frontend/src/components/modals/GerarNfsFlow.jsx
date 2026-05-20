import { AlertTriangle, CheckCircle, Loader2, Trash2, Eraser } from 'lucide-react'
import { brl } from '../../utils/format'
import { parseMoney, itemMatchesTipo, nfLabel } from '../../utils/finalizarOsUtils'
import { useCompanies } from '../../contexts/CompanyContext'

const TIPOS_NF   = ['Produto', 'Servico']
const FORMAS     = ['Faturado', 'Boleto', 'PIX', 'Cartão', 'Dinheiro']
const STATUS_PAG = ['Pendente', 'Pago']

const H = 'h-[38px]'
const FIELD = `w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm placeholder-g-700 focus:outline-none focus:border-g-100 transition-colors ${H}`
const LABEL = 'text-g-600 text-[10px] uppercase tracking-widest font-bold mb-1.5 block'

function MoneyInput({ value, onChange, disabled, className }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-g-600 text-xs pointer-events-none select-none">R$</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder="0,00"
        className={`${className} pl-8`}
      />
    </div>
  )
}

export default function GerarNfsFlow({
  nfs, setNf, setNfItem, setNfAndRegen, setParc,
  addNf, removeNf, clearNf, saving, salvarNfEspecifica,
}) {
  const { companies } = useCompanies()
  return (
    <>
      <div className="flex items-center justify-between shrink-0">
        <p className="text-g-500 text-sm">Notas Fiscais vinculadas a esta OS.</p>
        <button type="button" onClick={addNf}
          className="flex items-center gap-1 text-xs text-g-100 hover:text-g-50 font-medium transition-colors">
          + Nova NF
        </button>
      </div>

      {nfs.map((nf, ni) => {
        const itemsUsedElsewhere = new Set(
          nfs.flatMap((n, nidx) => nidx === ni ? [] :
            n.itens
              .filter(it => it.incluir && itemMatchesTipo(it, n.tipo_nf))
              .map(it => it.os_item_id)
          )
        )

        const itensVisiveis  = nf.itens.filter(it => itemMatchesTipo(it, nf.tipo_nf))
        const somaItens      = itensVisiveis.filter(it => it.incluir).reduce((s, it) => s + parseMoney(it.valor_total_item), 0)
        const somaParcelas   = nf.parcelas.reduce((s, p) => s + parseMoney(p.valor_parcela), 0)
        const valorNf        = parseMoney(nf.valor_total_nf)
        const difereItens    = valorNf > 0 && itensVisiveis.some(it => it.incluir) && Math.abs(somaItens - valorNf) > 0.01
        const difereParcelas = valorNf > 0 && Math.abs(somaParcelas - valorNf) > 0.01

        return nf.is_saved ? (
          <div key={ni} className="border border-g-800 rounded-xl bg-g-850 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-emerald-700 bg-emerald-500/10 p-1.5 rounded-lg"><CheckCircle className="w-4 h-4" /></span>
              <div>
                <span className="text-g-200 font-medium text-sm block">{nfLabel(nf, ni)} {nf.numero_nf ? `· ${nf.numero_nf}` : ''}</span>
                <span className="text-g-500 text-xs">{nf.fornecedor || 'Sem fornecedor'} · {brl(nf.valor_total_nf)}</span>
              </div>
            </div>
            <button type="button" onClick={() => setNf(ni, 'is_saved', false)}
              className="text-g-400 hover:text-g-200 text-xs font-medium px-3 py-1.5 bg-g-800 rounded-lg transition-colors">
              Editar
            </button>
          </div>
        ) : (
          <div key={ni} className="border border-g-800 rounded-xl overflow-hidden shrink-0">
            <div className="bg-g-850 px-4 py-2.5 flex items-center justify-between">
              <span className="text-g-400 text-xs font-semibold uppercase tracking-wider">
                {nfLabel(nf, ni)} — {nf.tipo_nf === 'Produto' ? 'Compra' : 'Serviço'}
              </span>
              {nfs.length > 1 ? (
                <button type="button" onClick={() => removeNf(ni)} className="text-g-600 hover:text-red-500 transition-colors" title="Remover NF">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button type="button" onClick={() => clearNf(ni)} className="text-g-600 hover:text-amber-600 transition-colors flex items-center gap-1.5" title="Limpar NF">
                  <Eraser className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Limpar</span>
                </button>
              )}
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>Tipo NF *</label>
                  <select value={nf.tipo_nf} onChange={e => setNf(ni, 'tipo_nf', e.target.value)} className={FIELD}>
                    {TIPOS_NF.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Nº Nota Fiscal</label>
                  <input value={nf.numero_nf} onChange={e => setNf(ni, 'numero_nf', e.target.value)}
                    placeholder="Ex: 2036" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Empresa Faturada *</label>
                  <select value={nf.id_empresa || ''} onChange={e => setNf(ni, 'id_empresa', e.target.value ? Number(e.target.value) : null)}
                    className={`${FIELD} ${!nf.id_empresa ? 'border-amber-500/60' : ''}`}>
                    <option value="">Selecione…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.sigla || c.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>Fornecedor</label>
                  <input value={nf.fornecedor}
                    onChange={e => setNf(ni, 'fornecedor', e.target.value.toUpperCase().replace(/[^A-Z0-9\s/]/g, ''))}
                    placeholder="Nome do fornecedor…" className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Data de Emissão</label>
                  <input type="date" value={nf.data_emissao}
                    onChange={e => setNf(ni, 'data_emissao', e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Valor Total NF *</label>
                  <MoneyInput value={nf.valor_total_nf}
                    onChange={v => setNfAndRegen(ni, 'valor_total_nf', v)}
                    className={FIELD} />
                </div>
              </div>

              {itensVisiveis.length > 0 && (
                <div>
                  <p className={`${LABEL} mb-2`}>
                    Itens vinculados
                    <span className="text-g-700 ml-1.5">({nf.tipo_nf === 'Produto' ? 'categoria Compra' : 'categoria Serviço'})</span>
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {itensVisiveis.map((it) => {
                      const realIdx   = nf.itens.indexOf(it)
                      const usedElsew = itemsUsedElsewhere.has(it.os_item_id)
                      const disabled  = usedElsew || !it.incluir
                      return (
                        <div key={realIdx} className={`grid grid-cols-12 gap-3 items-center bg-g-850 rounded-lg px-4 py-2.5 ${usedElsew ? 'opacity-40' : ''}`}>
                          <label className="col-span-1 flex items-center justify-center cursor-pointer">
                            <input type="checkbox" checked={it.incluir && !usedElsew}
                              disabled={usedElsew}
                              onChange={e => !usedElsew && setNfItem(ni, realIdx, 'incluir', e.target.checked)}
                              className="w-3.5 h-3.5 accent-g-100 disabled:cursor-not-allowed" />
                          </label>
                          <span className="col-span-4 text-g-400 text-xs truncate">
                            {it._sistema && <span className="text-g-600 mr-1">{it._sistema} ·</span>}
                            {it._servico || '—'}
                            {usedElsew && <span className="ml-1.5 text-g-700 italic">(outra NF)</span>}
                          </span>
                          <div className="col-span-2">
                            <input type="number" step="0.01" value={it.quantidade}
                              onChange={e => setNfItem(ni, realIdx, 'quantidade', e.target.value)}
                              disabled={disabled} placeholder="Qtd"
                              className={`${FIELD} bg-g-900 text-xs ${disabled ? 'opacity-40' : ''}`} />
                          </div>
                          <div className="col-span-2">
                            <MoneyInput value={it.valor_unitario}
                              onChange={v => setNfItem(ni, realIdx, 'valor_unitario', v)}
                              disabled={disabled}
                              className={`${FIELD} bg-g-900 text-xs ${disabled ? 'opacity-40' : ''}`} />
                          </div>
                          <div className="col-span-3">
                            <MoneyInput value={it.valor_total_item}
                              onChange={() => {}}
                              disabled
                              className={`${FIELD} bg-g-900 text-xs opacity-60 cursor-default`} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {itensVisiveis.some(it => it.incluir) && (
                    <div className="flex justify-end mt-2 text-xs gap-4">
                      <span className="text-g-600">Soma itens: <span className="font-mono text-g-400">{brl(somaItens)}</span></span>
                      {difereItens && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Difere {brl(Math.abs(somaItens - valorNf))} do valor NF
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {itensVisiveis.length === 0 && (
                <p className="text-g-700 text-xs italic">
                  Nenhum item da OS com categoria compatível com este tipo de NF.
                </p>
              )}

              <div className="border-t border-g-800 pt-4">
                <div className="flex items-center gap-4 mb-3">
                  <p className="text-g-500 text-xs font-semibold uppercase tracking-wider">Parcelas</p>
                  <div className="flex items-center gap-2">
                    <label className="text-g-700 text-xs">Quantidade:</label>
                    <input type="number" min="1" max="60" value={nf.qtd_parcelas}
                      onChange={e => setNfAndRegen(ni, 'qtd_parcelas', e.target.value)}
                      className={`w-16 px-2 py-1 bg-g-900 border border-g-800 rounded-lg text-g-300 text-xs focus:outline-none focus:border-g-100 ${H}`} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {nf.parcelas.map((p, pi) => (
                    <div key={pi} className="grid grid-cols-12 gap-3 items-end bg-g-850 rounded-lg px-4 py-2.5">
                      <div className="col-span-1 flex items-end pb-1.5">
                        <span className="text-g-600 text-xs font-mono tabular-nums">{pi + 1}×</span>
                      </div>
                      <div className="col-span-3">
                        <label className={LABEL}>Vencimento</label>
                        <input type="date" value={p.data_vencimento}
                          onChange={e => setParc(ni, pi, 'data_vencimento', e.target.value)}
                          className={`${FIELD} bg-g-900`} />
                      </div>
                      <div className="col-span-3">
                        <label className={LABEL}>Valor</label>
                        <MoneyInput value={p.valor_parcela}
                          onChange={v => setParc(ni, pi, 'valor_parcela', v)}
                          className={`${FIELD} bg-g-900`} />
                      </div>
                      <div className="col-span-3">
                        <label className={LABEL}>Forma de Pagamento</label>
                        <select value={p.forma_pgto} onChange={e => setParc(ni, pi, 'forma_pgto', e.target.value)}
                          className={`${FIELD} bg-g-900`}>
                          {FORMAS.map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={LABEL}>Status</label>
                        <select value={p.status_pagamento} onChange={e => setParc(ni, pi, 'status_pagamento', e.target.value)}
                          className={`${FIELD} bg-g-900`}>
                          {STATUS_PAG.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                {valorNf > 0 && (
                  <div className="flex justify-end gap-4 mt-2 text-xs">
                    <span className="text-g-600">Total parcelas: <span className="font-mono text-g-400">{brl(somaParcelas)}</span></span>
                    {difereParcelas && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Difere {brl(Math.abs(somaParcelas - valorNf))} do valor NF
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-g-800 flex justify-end">
                <button type="button" onClick={() => salvarNfEspecifica(ni)} disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600/20 text-emerald-700 text-sm hover:bg-emerald-600/30 font-medium transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar NF
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}
