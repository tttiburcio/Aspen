import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CreditCard, X, Wrench, CalendarClock, RotateCcw, Loader2 } from 'lucide-react'
import { dbAtualizarParcela } from '../../utils/api'
import { brl, dateBR, titleCase } from '../../utils/format'
import { useCompanies } from '../../contexts/CompanyContext'
import { statusFinanceiro, FIN_STATUS } from '../../utils/financialCalcs'

export default function DetalheParcelaModal({ parcela: p, onClose, onSaved }) {
  const LABEL = 'text-g-700 text-xs mb-0.5'
  const VAL = 'text-g-300 text-sm break-words'
  const { resolveNome } = useCompanies()

  const [reemb, setReemb] = useState({
    sera_reembolsado: p.sera_reembolsado || false,
    valor_reembolso: p.valor_reembolso ?? '',
    qtd_itens_reembolso: p.qtd_itens_reembolso ?? '',
    motivo_reembolso: p.motivo_reembolso || '',
  })
  const [reembDirty, setReembDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const setR = (k, v) => { setReemb(r => ({ ...r, [k]: v })); setReembDirty(true) }

  const handleSaveReemb = async () => {
    setSaving(true); setError(null)
    try {
      await dbAtualizarParcela(p.id, {
        sera_reembolsado: reemb.sera_reembolsado,
        valor_reembolso: reemb.valor_reembolso !== '' ? parseFloat(reemb.valor_reembolso) : null,
        qtd_itens_reembolso: reemb.qtd_itens_reembolso !== '' ? parseInt(reemb.qtd_itens_reembolso) : null,
        motivo_reembolso: reemb.motivo_reembolso || null,
      })
      onSaved()
    } catch {
      setError('Erro ao salvar reembolso')
      setSaving(false)
    }
  }

  const Field = ({ label, value, mono = false, full = false }) => (
    <div className={full ? 'col-span-2' : ''}>
      <p className={LABEL}>{label}</p>
      <p className={`${VAL}${mono ? ' font-mono' : ''}`}>{value || '—'}</p>
    </div>
  )

  const tipoProrr = p.isento_encargos === true ? 'Isenta de encargos'
    : p.isento_encargos === false ? 'Com encargos'
      : p.dias_cartorio ? 'Envio ao cartório'
        : '—'

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-g-900 border border-g-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-up">

        <div className="flex items-center justify-between px-5 py-4 border-b border-g-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-g-850 border border-g-800 rounded-lg">
              <CreditCard className="w-4 h-4 text-g-400" />
            </div>
            <div>
              <h2 className="text-g-100 font-semibold text-base">Detalhe da Parcela</h2>
              <p className="text-g-600 text-xs font-mono">{p.placa} · {p.id_ord_serv || 'sem OS'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-g-600 hover:text-g-300 hover:bg-g-850 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 flex flex-col gap-5">

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-3.5 h-3.5 text-g-600" />
              <span className="text-g-500 text-xs font-semibold uppercase tracking-wider">Ordem de Serviço</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Placa" value={p.placa} mono />
              <Field label="Fornecedor" value={p.fornecedor} />
              <Field label="Nº OS" value={p.id_ord_serv} mono />
              <Field label="Data Execução" value={dateBR(p.data_execucao)} />
              <Field label="Empresa" value={resolveNome(p.empresa)} />
              <Field label="Modelo" value={p.modelo} />
              {p.fornecedor_os && p.fornecedor && p.fornecedor_os !== p.fornecedor && (
                <Field label="Fornecedor da OS" value={p.fornecedor_os} />
              )}
              {p.tipo_custo && <Field label="Tipo de custo" value={p.tipo_custo} />}
              <Field label="Sistema" value={titleCase(p.sistema)} full />
              {p.descricao && <Field label="Descrição" value={titleCase(p.descricao)} full />}
              {p.contrato_nome && (
                <>
                  <Field label="Contratante" value={p.contrato_nome} full />
                  <Field label="Cidade/Região" value={p.contrato_cidade} />
                  <Field label="Período contratual"
                    value={p.contrato_inicio && p.contrato_fim
                      ? `${dateBR(p.contrato_inicio)} → ${dateBR(p.contrato_fim)}`
                      : p.contrato_inicio ? `Desde ${dateBR(p.contrato_inicio)}` : null} />
                  <Field label="Status do contrato" value={p.contrato_status} />
                </>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-3.5 h-3.5 text-g-600" />
              <span className="text-g-500 text-xs font-semibold uppercase tracking-wider">Parcela</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Nota Fiscal" value={p.nota} />
              <Field label="Parcela" value={p.parcela_atual && p.parcela_total ? `${p.parcela_atual} de ${p.parcela_total}` : null} />
              <Field label={p.prorrogada ? 'Vencimento original' : 'Vencimento'}
                value={dateBR(p.prorrogada ? p.data_vencimento_original : p.data_vencimento)} />
              <Field label="Valor original" value={brl(p.valor_parcela)} mono />
              <Field label="Forma Pgto" value={p.forma_pgto} />
              <Field label="Status" value={FIN_STATUS[statusFinanceiro(p)]?.label} />
            </div>
          </div>

          {p.prorrogada && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CalendarClock className="w-3.5 h-3.5 text-purple-500" />
                <span className="text-purple-400 text-xs font-semibold uppercase tracking-wider">Prorrogação</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Tipo" value={tipoProrr} />
                <Field label="Nova data" value={dateBR(p.data_vencimento)} />
                {p.tipo_pgto_prorrogacao && <Field label="Forma Pgto" value={p.tipo_pgto_prorrogacao === 'pix' ? 'PIX' : 'Boleto'} />}
                {p.chave_pix && <Field label="Chave PIX" value={p.chave_pix} mono />}
                {p.multa_pct != null && <Field label="Multa" value={`${p.multa_pct}%`} />}
                {p.juros_diario_pct != null && <Field label="Juros/dia" value={`${p.juros_diario_pct}%`} />}
                {p.valor_atualizado != null && <Field label="Valor atualizado" value={brl(p.valor_atualizado)} mono />}
                {p.data_prevista_pagamento && <Field label="Previsão Pgto" value={dateBR(p.data_prevista_pagamento)} />}
                {p.dias_cartorio && <Field label="Dias p/ cartório" value={`${p.dias_cartorio} dias`} />}
              </div>
            </div>
          )}

          {p._isSintetica && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-xs">
              Esta entrada representa o total da NF. Crie parcelas explícitas na OS para registrar pagamentos e prorrogações.
            </div>
          )}

          {!p._isSintetica && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="w-3.5 h-3.5 text-g-600" />
                <span className="text-g-500 text-xs font-semibold uppercase tracking-wider">Reembolso</span>
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reemb.sera_reembolsado}
                    onChange={e => setR('sera_reembolsado', e.target.checked)}
                    className="w-4 h-4 rounded border-g-700 bg-g-900 text-g-100 focus:ring-g-400"
                  />
                  <span className="text-g-400 text-sm">Será reembolsado pelo cliente</span>
                </label>
                {reemb.sera_reembolsado && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="text-g-600 text-xs font-medium mb-1 block">Valor a reembolsar (R$)</label>
                      <input
                        type="number" step="0.01"
                        value={reemb.valor_reembolso}
                        onChange={e => setR('valor_reembolso', e.target.value)}
                        placeholder="0,00"
                        className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-100 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-g-600 text-xs font-medium mb-1 block">Qtd de itens reembolsados</label>
                      <input
                        type="number"
                        value={reemb.qtd_itens_reembolso}
                        onChange={e => setR('qtd_itens_reembolso', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-100 transition-colors"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-g-600 text-xs font-medium mb-1 block">Motivo do reembolso</label>
                      <textarea
                        value={reemb.motivo_reembolso}
                        onChange={e => setR('motivo_reembolso', e.target.value)}
                        placeholder="Descreva o motivo…"
                        rows={3}
                        className="w-full px-3 py-2 bg-g-900 border border-g-800 rounded-lg text-g-300 text-sm focus:outline-none focus:border-g-100 transition-colors resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-xs bg-red-50/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-g-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-g-800 text-g-500 text-sm hover:bg-g-850 transition-colors">
            Fechar
          </button>
          {reembDirty && !p._isSintetica && (
            <button
              onClick={handleSaveReemb}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar Reembolso
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
