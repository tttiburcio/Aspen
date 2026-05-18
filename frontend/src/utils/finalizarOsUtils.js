import { brl } from './format'

export function parseMoney(val) {
  if (!val) return 0
  const s = String(val).replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0
  return parseFloat(s) || 0
}

export function gerarParcelas(qtd, valorTotal, dataEmissao) {
  const n = Math.max(1, parseInt(qtd) || 1)
  const total = parseMoney(valorTotal)
  const base = dataEmissao ? new Date(dataEmissao + 'T12:00:00') : new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + 30 * (i + 1))
    return {
      data_vencimento:  d.toISOString().slice(0, 10),
      valor_parcela:    total > 0 ? (total / n).toFixed(2) : '',
      forma_pgto:       'Faturado',
      status_pagamento: 'Pendente',
      parcela_atual:    i + 1,
      parcela_total:    n,
    }
  })
}

export function itemMatchesTipo(it, tipo_nf) {
  if (tipo_nf === 'Produto') return it._categoria === 'Compra'
  if (tipo_nf === 'Servico') return it._categoria === 'Serviço' || it._categoria === 'Servico' || !it._categoria
  return true
}

export function nfLabel(nf, ni) {
  return `${nf.tipo_nf === 'Produto' ? 'NFP' : 'NFS'} ${ni + 1}`
}

export const NF_VAZIA = (osItens) => ({
  is_saved:   false,
  tipo_nf:    'Servico',
  numero_nf:  '',
  id_empresa: null,
  fornecedor:       '',
  valor_total_nf:   '',
  data_emissao:     new Date().toISOString().slice(0, 10),
  observacoes:      '',
  qtd_parcelas:     '1',
  itens: osItens.map(it => ({
    os_item_id:       it.id,
    _categoria:       it.categoria ?? '',
    _sistema:         it.sistema   ?? '',
    _servico:         it.servico   ?? '',
    quantidade:       '1',
    valor_unitario:   '',
    valor_total_item: '',
    incluir:          true,
  })),
  parcelas: gerarParcelas(1, '', new Date().toISOString().slice(0, 10)),
})

export function mapBackendNfToState(nfBackend, osItens) {
  return {
    id:               nfBackend.id,
    is_saved:         true,
    tipo_nf:          nfBackend.tipo_nf || 'Servico',
    numero_nf:        nfBackend.numero_nf || '',
    id_empresa: nfBackend.id_empresa || null,
    fornecedor:       nfBackend.fornecedor || '',
    valor_total_nf:   nfBackend.valor_total_nf ? String(nfBackend.valor_total_nf) : '',
    data_emissao:     nfBackend.data_emissao ? String(nfBackend.data_emissao).slice(0, 10) : '',
    observacoes:      nfBackend.observacoes || '',
    qtd_parcelas:     String(nfBackend.parcelas?.length || 1),
    itens: osItens.map(it => {
      const nfItem = (nfBackend.itens || []).find(ni => ni.os_item_id === it.id)
      return {
        os_item_id:       it.id,
        _categoria:       it.categoria ?? '',
        _sistema:         it.sistema   ?? '',
        _servico:         it.servico   ?? '',
        quantidade:       nfItem ? String(nfItem.quantidade) : '1',
        valor_unitario:   nfItem?.valor_unitario ? String(nfItem.valor_unitario) : '',
        valor_total_item: nfItem?.valor_total_item ? String(nfItem.valor_total_item) : '',
        incluir:          !!nfItem,
      }
    }),
    parcelas: (nfBackend.parcelas || []).map(p => ({
      data_vencimento:  p.data_vencimento ? String(p.data_vencimento).slice(0, 10) : '',
      valor_parcela:    p.valor_parcela ? String(p.valor_parcela) : '',
      forma_pgto:       p.forma_pgto || 'Faturado',
      status_pagamento: p.status_pagamento || 'Pendente',
      parcela_atual:    p.parcela_atual,
      parcela_total:    p.parcela_total,
    }))
  }
}

export function validarLocal(nfs, osItens) {
  const erros = []

  const osItemIdsVinculados = new Set(
    nfs.flatMap(nf =>
      nf.itens.filter(it => it.incluir && itemMatchesTipo(it, nf.tipo_nf)).map(it => it.os_item_id)
    )
  )
  osItens.forEach(it => {
    if (!osItemIdsVinculados.has(it.id)) {
      const label = it.servico || it.sistema || `Item ${it.id}`
      const cat   = it.categoria ? ` [${it.categoria}]` : ''
      erros.push(`Item "${label}"${cat} não está vinculado a nenhuma NF`)
    }
  })

  nfs.forEach((nf, ni) => {
    const label = nfLabel(nf, ni) + (nf.numero_nf ? ` (${nf.numero_nf})` : '')

    if (!nf.id_empresa)
      erros.push(`${label}: empresa faturada é obrigatória`)

    const valorNf = parseMoney(nf.valor_total_nf)
    if (valorNf <= 0)
      erros.push(`${label}: valor total é obrigatório`)

    const itensVinculados = nf.itens.filter(it => it.incluir && itemMatchesTipo(it, nf.tipo_nf))
    if (itensVinculados.length > 0) {
      const somaItens = itensVinculados.reduce((s, it) => s + parseMoney(it.valor_total_item), 0)
      if (valorNf > 0 && Math.abs(somaItens - valorNf) > 0.01)
        erros.push(`${label}: soma dos itens (${brl(somaItens)}) ≠ valor total NF (${brl(valorNf)})`)
    }

    if (nf.parcelas.length === 0)
      erros.push(`${label}: adicione ao menos uma parcela`)

    const somaParcelas = nf.parcelas.reduce((s, p) => s + parseMoney(p.valor_parcela), 0)
    if (valorNf > 0 && Math.abs(somaParcelas - valorNf) > 0.01)
      erros.push(`${label}: soma das parcelas (${brl(somaParcelas)}) ≠ valor total NF (${brl(valorNf)})`)
  })

  return erros
}
