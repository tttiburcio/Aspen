import { parseLocalDate } from './maintenanceHelpers'

export function statusFinanceiro(p) {
  if (p.status_pagamento === 'Pago') return 'pago'
  if (p.prorrogada) return 'prorrogada'
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  if (!p.data_vencimento) return 'pendente'
  const venc = parseLocalDate(p.data_vencimento)
  if (venc < hoje) return 'vencida'
  if (venc.getTime() === hoje.getTime()) return 'vence_hoje'
  return 'pendente'
}

export function calcValorComEncargos(valorBase, multaPct, jurosDiarioPct, dataVenc, dataFim = null) {
  if (!valorBase) return valorBase
  const venc = parseLocalDate(dataVenc)
  if (!venc) return valorBase
  const fim = dataFim ? parseLocalDate(dataFim) : new Date()
  if (!dataFim) fim.setHours(0, 0, 0, 0)
  const diasAtraso = Math.max(0, Math.round((fim - venc) / 86400000))
  const multa = valorBase * ((parseFloat(multaPct) || 0) / 100)
  const juros = valorBase * ((parseFloat(jurosDiarioPct) || 0) / 100) * diasAtraso
  return valorBase + multa + juros
}

export function calcDataCartorio(dataVenc, diasCartorio) {
  if (!dataVenc || !diasCartorio) return null
  const d = parseLocalDate(dataVenc)
  if (!d) return null
  d.setDate(d.getDate() + parseInt(diasCartorio))
  return d.toISOString().slice(0, 10)
}

export const FIN_STATUS = {
  pago:        { label: 'Pago',        color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pendente:    { label: 'Pendente',    color: 'bg-blue-50 text-blue-700 border-blue-200' },
  vence_hoje:  { label: 'Vence hoje',  color: 'bg-orange-50 text-orange-700 border-orange-200' },
  vencida:     { label: 'Vencida',     color: 'bg-red-50 text-red-700 border-red-200' },
  prorrogada:  { label: 'Prorrogada',  color: 'bg-purple-50 text-purple-700 border-purple-200' },
}
