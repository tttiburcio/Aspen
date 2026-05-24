import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getVehicle } from '../utils/api'
import { brl, pct, dias, brlShort, num, dateBR } from '../utils/format'
import { VehicleMonthlyChart, VehicleCostPie } from './charts/VehicleCharts'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  X, TrendingUp, TrendingDown, Wrench, Shield, FileText,
  MapPin, Calendar, DollarSign, Percent, Clock, AlertTriangle,
  ChevronRight, Loader2, Route, Flame, RefreshCw, CheckCircle2,
  XCircle, AlertCircle, Receipt, Car, CreditCard, BadgeCheck,
} from 'lucide-react'
import { useVehicleTrackerData } from '../hooks/useVehicleTrackerData'
import TrackerVehicleTab from './tracker/TrackerVehicleTab'

const TOOLTIP_STYLE = {
  background: '#1E293B', border: '1px solid rgb(30 51 80)',
  borderRadius: 8, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  color: '#f1f5f9',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusPill({ status, map }) {
  const s = (status || '').toLowerCase()
  const style = map?.[s] || 'bg-g-800 text-g-400 border-g-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${style}`}>
      {status || '—'}
    </span>
  )
}

const STATUS_RECEB = {
  recebido: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  pendente:  'bg-amber-500/10  text-amber-600  border-amber-500/20',
  vencido:   'bg-red-500/10    text-red-400    border-red-500/20',
  cancelado: 'bg-g-800         text-g-500      border-g-700',
}
const STATUS_IMPOSTO = {
  pago:     'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  pendente: 'bg-amber-500/10  text-amber-600   border-amber-500/20',
  isento:   'bg-blue-500/10   text-blue-400    border-blue-500/20',
}
const STATUS_DEBITO = {
  pago:     'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  pendente: 'bg-amber-500/10  text-amber-600   border-amber-500/20',
  vencido:  'bg-red-500/10    text-red-400     border-red-500/20',
}
const STATUS_APOLICE = {
  ativa:     'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  vencida:   'bg-red-500/10    text-red-400     border-red-500/20',
  cancelada: 'bg-g-800         text-g-500       border-g-700',
  renovada:  'bg-blue-500/10   text-blue-400    border-blue-500/20',
}
const STATUS_CONTRATO = {
  ativo:     'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  encerrado: 'bg-g-800         text-g-500       border-g-700',
  suspenso:  'bg-amber-500/10  text-amber-600   border-amber-500/20',
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="text-g-500 text-xs font-semibold uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {children}
    </h3>
  )
}

function MiniKPI({ label, value, sub, color = 'text-g-100', icon: Icon, iconColor }) {
  return (
    <div className="bg-g-950 rounded-lg p-3 border border-g-800">
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon className={`w-3.5 h-3.5 ${iconColor || color}`} />}
        <span className="text-g-600 text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-g-700 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

function EmptyTab({ message = 'Sem dados para este veículo.' }) {
  return (
    <p className="text-g-600 text-base text-center py-12 bg-g-900/20 rounded-2xl border border-dashed border-g-800">
      {message}
    </p>
  )
}

function formatTitle(text) {
  if (!text || text === '—') return text
  const exc = ['de', 'da', 'do', 'dos', 'das', 'e', 'o', 'a', 'com', 'em', 'p/']
  return text.toLowerCase().split(' ').map((w, i) =>
    i > 0 && exc.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ')
}

// ─── Tab: Contratos ───────────────────────────────────────────────────────────
function ContratosTab({ contratos = [], byContract = [] }) {
  if (!contratos.length && !byContract.length)
    return <EmptyTab message="Sem contratos vinculados a este veículo." />

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {contratos.length > 0 && (
        <div>
          <SectionTitle icon={FileText}>Contratos vinculados</SectionTitle>
          <div className="flex flex-col gap-3">
            {contratos.map(c => (
              <div key={c.id} className="bg-g-950 border border-g-800 rounded-xl p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-g-100 font-semibold text-sm">{c.cliente}</p>
                    <p className="text-g-500 text-xs mt-0.5">{c.cidade}{c.estado ? ` — ${c.estado}` : ''}</p>
                  </div>
                  <StatusPill status={c.status} map={STATUS_CONTRATO} />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-g-800/60">
                  <div>
                    <p className="text-g-600 text-[10px] uppercase tracking-wide">Início</p>
                    <p className="text-g-300 text-xs font-medium">{c.data_inicio ? dateBR(c.data_inicio) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-g-600 text-[10px] uppercase tracking-wide">Fim previsto</p>
                    <p className="text-g-300 text-xs font-medium">{c.data_fim ? dateBR(c.data_fim) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-g-600 text-[10px] uppercase tracking-wide">Valor/mês</p>
                    <p className="text-emerald-700 text-xs font-bold font-mono">{brl(c.valor_mensal)}</p>
                  </div>
                  <div>
                    <p className="text-g-600 text-[10px] uppercase tracking-wide">Pagamento</p>
                    <p className="text-g-300 text-xs font-medium">{c.forma_pagamento}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {byContract.length > 0 && (
        <div>
          <SectionTitle icon={DollarSign}>Receita por contrato no período</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.min(byContract.length * 42 + 40, 260)}>
            <BarChart data={byContract} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" horizontal={false} />
              <XAxis type="number" tickFormatter={brlShort} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="contrato" width={78} tick={{ fill: '#94a3b8', fontSize: 10.5 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [brl(v), 'Receita']} />
              <Bar dataKey="receita" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {byContract.map((_, i) => <Cell key={i} fill={`hsl(${230 + i * 28}, 70%, ${55 + i * 4}%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-g-800">
                <th className="th th-left text-xs py-2">Contrato</th>
                <th className="th text-xs py-2">Receita</th>
                <th className="th text-xs py-2">Dias Trab.</th>
                <th className="th text-xs py-2">Diária Média</th>
              </tr></thead>
              <tbody>
                {byContract.map((c, i) => (
                  <tr key={i} className="border-b border-g-900 hover:bg-g-900/60">
                    <td className="td td-left py-2 font-semibold text-g-200">{c.contrato}</td>
                    <td className="td py-2 font-mono tabular-nums text-g-50">{brl(c.receita)}</td>
                    <td className="td py-2 tabular-nums text-g-400">{dias(c.dias_trabalhado)}</td>
                    <td className="td py-2 font-mono tabular-nums text-g-300">{brl(c.diaria_media)}/dia</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Faturamento ─────────────────────────────────────────────────────────
function FaturamentoTab({ faturamento = [] }) {
  if (!faturamento.length) return <EmptyTab message="Sem faturas encontradas para este veículo." />

  const totalFaturado = faturamento.reduce((s, f) => s + f.valor_locacoes, 0)
  const totalRecebido = faturamento.reduce((s, f) => s + f.valor_recebido, 0)
  const totalImposto  = faturamento.reduce((s, f) => s + f.valor_imposto,  0)
  const totalLiquido  = faturamento.reduce((s, f) => s + f.valor_liquido,  0)
  const totalPendente = faturamento.filter(f => f.status_recebimento !== 'Recebido').reduce((s, f) => s + f.valor_locacoes, 0)

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniKPI label="Total Faturado" value={brl(totalFaturado)} color="text-g-200"       icon={Receipt}       iconColor="text-g-500" />
        <MiniKPI label="Total Recebido" value={brl(totalRecebido)} color="text-emerald-700" icon={CheckCircle2}  iconColor="text-emerald-700" />
        <MiniKPI label="A Receber"      value={brl(totalPendente)} color={totalPendente > 0 ? 'text-amber-600' : 'text-g-600'} icon={AlertCircle} iconColor="text-amber-600" />
        <MiniKPI label="Total Impostos" value={brl(totalImposto)}  color="text-purple-400"  icon={FileText}      iconColor="text-purple-400"
          sub={`Líquido: ${brl(totalLiquido)}`} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead className="bg-g-900/50 border-b border-g-800">
              <tr>
                {['Nº Fatura','Contrato / Cliente','Emissão','Vencimento','Valor','Recebido','Status','Imposto','St. Imp.'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-g-500 uppercase tracking-widest text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-g-900">
              {faturamento.map(f => (
                <tr key={f.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 font-mono text-g-300 font-semibold whitespace-nowrap">#{f.numero_fatura ?? '—'}</td>
                  <td className="px-3 py-2 text-g-300 font-medium max-w-[140px] truncate">{f.cliente}</td>
                  <td className="px-3 py-2 text-g-500 tabular-nums whitespace-nowrap">{dateBR(f.emissao)}</td>
                  <td className="px-3 py-2 text-g-500 tabular-nums whitespace-nowrap">{dateBR(f.vencimento)}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-g-100 tabular-nums whitespace-nowrap">{brl(f.valor_locacoes)}</td>
                  <td className="px-3 py-2 font-mono text-emerald-700 tabular-nums whitespace-nowrap">
                    {f.valor_recebido > 0 ? brl(f.valor_recebido) : <span className="text-g-700">—</span>}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={f.status_recebimento} map={STATUS_RECEB} /></td>
                  <td className="px-3 py-2 font-mono text-purple-400 tabular-nums whitespace-nowrap">{brl(f.valor_imposto)}</td>
                  <td className="px-3 py-2"><StatusPill status={f.status_imposto} map={STATUS_IMPOSTO} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Reembolsos ──────────────────────────────────────────────────────────
function ReembolsosTab({ reembolsos = [] }) {
  if (!reembolsos.length) return <EmptyTab message="Sem reembolsos para este veículo." />

  const totalCobrado  = reembolsos.reduce((s, r) => s + r.valor, 0)
  const totalRecebido = reembolsos.reduce((s, r) => s + r.valor_recebido, 0)
  const totalPendente = reembolsos.filter(r => r.status !== 'Recebido').reduce((s, r) => s + r.valor, 0)

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-3 gap-2">
        <MiniKPI label="Total Cobrado" value={brl(totalCobrado)}  color="text-g-200"       icon={Receipt}      iconColor="text-g-500" />
        <MiniKPI label="Recebido"      value={brl(totalRecebido)} color="text-emerald-700" icon={CheckCircle2} iconColor="text-emerald-700" />
        <MiniKPI label="A Receber"     value={brl(totalPendente)} color={totalPendente > 0 ? 'text-amber-600' : 'text-g-600'} icon={AlertCircle} iconColor="text-amber-600" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead className="bg-g-900/50 border-b border-g-800">
              <tr>
                {['Recibo','Tipo','Emissão','Valor Cobrado','Recebido','Status','Descrição / OS'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-bold text-g-500 uppercase tracking-widest text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-g-900">
              {reembolsos.map(r => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2 font-mono text-g-300 whitespace-nowrap">{r.recibo}</td>
                  <td className="px-3 py-2 text-g-400 whitespace-nowrap">{r.tipo}</td>
                  <td className="px-3 py-2 text-g-500 tabular-nums whitespace-nowrap">{dateBR(r.emissao)}</td>
                  <td className="px-3 py-2 font-mono font-semibold text-g-100 tabular-nums whitespace-nowrap">{brl(r.valor)}</td>
                  <td className="px-3 py-2 font-mono text-emerald-700 tabular-nums whitespace-nowrap">
                    {r.valor_recebido > 0 ? brl(r.valor_recebido) : <span className="text-g-700">—</span>}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={r.status} map={STATUS_RECEB} /></td>
                  <td className="px-3 py-2 text-g-500 text-[11px] max-w-[140px] truncate">{r.descricao || r.numero_os || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Débitos ─────────────────────────────────────────────────────────────
function DebitosTab({ debitos = [] }) {
  if (!debitos.length) return <EmptyTab message="Sem débitos documentais para este veículo." />

  const totalIpvaPend = debitos.filter(d => d.ipva.status !== 'Pago').reduce((s, d) => s + d.ipva.valor + d.ipva.encargo, 0)
  const totalLicPend  = debitos.filter(d => d.licenciamento.status !== 'Pago').reduce((s, d) => s + d.licenciamento.valor + d.licenciamento.encargo, 0)
  const totalMultas   = debitos.reduce((s, d) => s + d.multas.valor + d.multas.encargo, 0)
  const totalGeral    = totalIpvaPend + totalLicPend + totalMultas

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MiniKPI label="IPVA Pendente"    value={brl(totalIpvaPend)} color={totalIpvaPend > 0 ? 'text-amber-600' : 'text-g-600'} icon={Car} />
        <MiniKPI label="Licenc. Pendente" value={brl(totalLicPend)}  color={totalLicPend  > 0 ? 'text-amber-600' : 'text-g-600'} icon={BadgeCheck} />
        <MiniKPI label="Multas Pendentes" value={brl(totalMultas)}   color={totalMultas   > 0 ? 'text-red-400'   : 'text-g-600'} icon={AlertTriangle} />
        <MiniKPI label="Total em Aberto"  value={brl(totalGeral)}    color={totalGeral    > 0 ? 'text-red-400'   : 'text-emerald-700'} icon={XCircle}
          sub={totalGeral === 0 ? 'Tudo regularizado ✓' : undefined} />
      </div>

      <div className="flex flex-col gap-3">
        {debitos.map(d => {
          const ipvaPago = d.ipva.status === 'Pago'
          const licPago  = d.licenciamento.status === 'Pago'
          const temMulta = d.multas.valor > 0
          return (
            <div key={d.id} className="bg-g-950 border border-g-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-g-900/50 border-b border-g-800">
                <span className="text-g-100 font-bold text-sm">Exercício {d.exercicio}</span>
                {ipvaPago && licPago && !temMulta
                  ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Regularizado</span>
                  : <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-bold"><AlertCircle className="w-3.5 h-3.5" /> Pendências</span>
                }
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-g-800">
                {/* IPVA */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-g-500 text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                      <Car className="w-3.5 h-3.5" /> IPVA
                    </span>
                    <StatusPill status={d.ipva.status} map={STATUS_DEBITO} />
                  </div>
                  <p className="text-g-100 font-bold font-mono text-base">{brl(d.ipva.valor)}</p>
                  <p className="text-g-600 text-xs mt-0.5">Venc: {dateBR(d.ipva.vencimento)}</p>
                  {d.ipva.encargo > 0 && <p className="text-red-400 text-xs mt-1">+ {brl(d.ipva.encargo)} encargos</p>}
                  {ipvaPago && d.ipva.data_pgto && <p className="text-emerald-700 text-xs mt-1">Pago em {dateBR(d.ipva.data_pgto)}</p>}
                </div>
                {/* Licenciamento */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-g-500 text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                      <BadgeCheck className="w-3.5 h-3.5" /> Licenciamento
                    </span>
                    <StatusPill status={d.licenciamento.status} map={STATUS_DEBITO} />
                  </div>
                  <p className="text-g-100 font-bold font-mono text-base">{brl(d.licenciamento.valor)}</p>
                  <p className="text-g-600 text-xs mt-0.5">Venc: {dateBR(d.licenciamento.vencimento)}</p>
                  {d.licenciamento.encargo > 0 && <p className="text-red-400 text-xs mt-1">+ {brl(d.licenciamento.encargo)} encargos</p>}
                  {licPago && d.licenciamento.data_pgto && <p className="text-emerald-700 text-xs mt-1">Pago em {dateBR(d.licenciamento.data_pgto)}</p>}
                </div>
                {/* Multas */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-g-500 text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Multas
                    </span>
                    {temMulta
                      ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-red-500/10 text-red-400 border-red-500/20">Pendente</span>
                      : <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">OK</span>
                    }
                  </div>
                  <p className={`font-bold font-mono text-base ${temMulta ? 'text-red-400' : 'text-g-600'}`}>{brl(d.multas.valor)}</p>
                  {d.multas.encargo > 0 && <p className="text-red-400 text-xs mt-1">+ {brl(d.multas.encargo)} encargos</p>}
                  {!temMulta && <p className="text-g-700 text-xs mt-0.5">Sem multas pendentes</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab: Seguro ──────────────────────────────────────────────────────────────
function SeguroTab({ seguro = [] }) {
  if (!seguro.length) return <EmptyTab message="Nenhuma apólice de seguro encontrada para este veículo." />

  const totalPremio = seguro.reduce((s, a) => s + a.premio_anual, 0)
  const ativas      = seguro.filter(a => (a.status || '').toLowerCase() === 'ativa').length

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-3 gap-2">
        <MiniKPI label="Apólices"     value={seguro.length} color="text-g-200"       icon={Shield}       iconColor="text-g-500" />
        <MiniKPI label="Ativas"       value={ativas}        color={ativas > 0 ? 'text-emerald-700' : 'text-g-600'} icon={CheckCircle2} iconColor="text-emerald-700" />
        <MiniKPI label="Prêmio Total" value={brl(totalPremio)} color="text-red-400"  icon={DollarSign}   iconColor="text-red-400" sub="soma das apólices" />
      </div>

      <div className="flex flex-col gap-3">
        {seguro.map(a => (
          <div key={a.id} className="bg-g-950 border border-g-800 rounded-xl overflow-hidden">
            <div className="flex items-start justify-between px-4 py-3 bg-g-900/50 border-b border-g-800">
              <div>
                <p className="text-g-100 font-bold text-sm">{a.seguradora}</p>
                <p className="text-g-500 text-xs mt-0.5 font-mono">Apólice {a.numero_apolice}</p>
              </div>
              <StatusPill status={a.status} map={STATUS_APOLICE} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wide">Cobertura</p>
                <p className="text-g-300 text-xs font-medium mt-0.5">{a.cobertura}</p>
              </div>
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wide">Vigência</p>
                <p className="text-g-300 text-xs font-medium mt-0.5">
                  {dateBR(a.data_inicio)} → {dateBR(a.data_fim)}
                </p>
              </div>
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wide">Prêmio anual</p>
                <p className="text-red-400 text-xs font-bold font-mono mt-0.5">{brl(a.premio_anual)}</p>
                <p className="text-g-700 text-[10px]">{a.num_parcelas}× {brl(a.premio_anual / a.num_parcelas)}/mês</p>
              </div>
              <div>
                <p className="text-g-600 text-[10px] uppercase tracking-wide">Corretor</p>
                <p className="text-g-300 text-xs font-medium mt-0.5">{a.corretor}</p>
                {a.cobre_implemento && (
                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                    Cobre implemento
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Manutenção ──────────────────────────────────────────────────────────
function ManutencaoTab({ maintenance = [], ultimaRevisao }) {
  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

      {/* Card destaque: última revisão */}
      {ultimaRevisao ? (
        <div className="bg-gradient-to-r from-emerald-950/60 to-g-950 border border-emerald-600/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <RefreshCw className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-emerald-600 text-xs font-bold uppercase tracking-widest">Última Revisão Preventiva</p>
              <p className="text-g-500 text-[10px]">{ultimaRevisao.ordem} · {dateBR(ultimaRevisao.data)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-g-600 text-[10px] uppercase tracking-wide">Serviço</p>
              <p className="text-g-200 text-xs font-semibold mt-0.5">{formatTitle(ultimaRevisao.servico) || '—'}</p>
            </div>
            <div>
              <p className="text-g-600 text-[10px] uppercase tracking-wide">KM na revisão</p>
              <p className="text-g-100 text-sm font-bold font-mono tabular-nums mt-0.5">
                {ultimaRevisao.km ? num(ultimaRevisao.km) + ' km' : '—'}
              </p>
            </div>
            <div>
              <p className="text-g-600 text-[10px] uppercase tracking-wide">Próxima revisão</p>
              <p className="text-emerald-600 text-xs font-bold font-mono mt-0.5">
                {ultimaRevisao.prox_km ? num(ultimaRevisao.prox_km) + ' km' : '—'}
                {ultimaRevisao.prox_data ? ` · ${dateBR(ultimaRevisao.prox_data)}` : ''}
              </p>
            </div>
            <div>
              <p className="text-g-600 text-[10px] uppercase tracking-wide">Valor</p>
              <p className="text-orange-400 text-sm font-bold font-mono tabular-nums mt-0.5">{brl(ultimaRevisao.valor)}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/15 rounded-xl p-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-amber-600/80 text-sm">Nenhuma revisão preventiva registrada para este veículo.</p>
        </div>
      )}

      {/* Tabela de OS */}
      {maintenance.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-g-900/50 border-b border-g-800">
              <tr>
                {['OS','Data','Sistema','Serviço','Tipo','NFs','KM','Valor'].map(h => (
                  <th key={h} className="px-2 py-2.5 text-left font-bold text-g-500 uppercase tracking-widest text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-g-900">
              {maintenance.map((m, i) => {
                const isRevisao = m.evento === 'Revisão'
                return (
                  <tr key={i} className={`hover:bg-white/[0.02] transition-colors ${isRevisao ? 'bg-emerald-950/10' : ''}`}>
                    <td className="px-2 py-2.5 font-mono text-g-500 font-medium whitespace-nowrap">{m.ordem}</td>
                    <td className="px-2 py-2.5 text-g-500 tabular-nums whitespace-nowrap">{dateBR(m.data)}</td>
                    <td className="px-2 py-2.5 text-g-400 font-medium">
                      <div className="flex flex-col min-w-[90px]">
                        <span>{m.sistema || '—'}</span>
                        {isRevisao && (
                          <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter flex items-center gap-0.5">
                            <RefreshCw className="w-2.5 h-2.5" /> Revisão
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="text-g-400 font-medium">{formatTitle(m.servico)}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        m.tipo === 'Preventiva' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        m.tipo === 'Corretiva'  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        'bg-g-800 text-g-500 border-g-700'
                      }`}>{m.tipo}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-g-700" />
                        <span className="text-g-500 font-mono">{m.qtd_notas || 0}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-g-500 tabular-nums whitespace-nowrap">
                      {m.km ? num(m.km) + ' km' : '—'}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <span className="text-orange-400/90 font-mono font-bold tabular-nums text-sm">{brl(m.valor)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyTab message="Sem ordens de serviço para este veículo no período." />
      )}
    </div>
  )
}

// ─── Tab: KPIs ────────────────────────────────────────────────────────────────
function KpisTab({ k, data }) {
  const isLucr = k?.margem >= 0
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Margem */}
      <div className={`rounded-xl p-5 border ${isLucr ? 'bg-g-950 border-g-800 shadow-sm' : 'bg-red-500/5 border-red-500/10'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-g-600 text-xs uppercase tracking-widest mb-1.5">Margem Líquida</p>
            <h3 className={`text-3xl font-extrabold font-mono tabular-nums ${isLucr ? 'text-emerald-700' : 'text-red-500'}`}>
              {brl(k.margem)}
            </h3>
            <p className={`text-sm mt-1.5 ${isLucr ? 'text-g-400' : 'text-red-400'}`}>
              {pct(k.margem_pct)} sobre receita total
            </p>
          </div>
          <div className="p-3 rounded-xl bg-g-850 border border-g-800">
            {isLucr ? <TrendingUp className="w-8 h-8 text-g-400" /> : <TrendingDown className="w-8 h-8 text-red-400" />}
          </div>
        </div>
      </div>

      {/* Receita */}
      <div>
        <SectionTitle icon={DollarSign}>Receita</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <MiniKPI label="Total"     value={brl(k.receita_total)}     color="text-emerald-700" icon={DollarSign} />
          <MiniKPI label="Locação"   value={brl(k.receita_locacao)}   color="text-g-200"       icon={FileText}    iconColor="text-g-500" />
          <MiniKPI label="Reembolso" value={brl(k.receita_reembolso)} color="text-g-200"       icon={ChevronRight} iconColor="text-g-500" />
        </div>
      </div>

      {/* Custos */}
      <div>
        <SectionTitle icon={Wrench}>Custos</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <MiniKPI label="Manutenção"   value={brl(k.custo_manutencao)}   color="text-orange-400" icon={Wrench} />
          <MiniKPI label="Seguro"       value={brl(k.custo_seguro)}       color="text-red-400"    icon={Shield} />
          <MiniKPI label="Impostos"     value={brl(k.custo_impostos)}     color="text-purple-400" icon={FileText} />
          <MiniKPI label="Rastreamento" value={brl(k.custo_rastreamento)} color="text-amber-600"  icon={MapPin} />
        </div>
        <div className="mt-2 bg-g-950 rounded-lg p-3 border border-g-800 flex justify-between items-center">
          <span className="text-g-600 text-xs uppercase tracking-wide font-medium">Custo Total</span>
          <span className="text-red-400 font-bold font-mono">{brl(k.custo_total)}</span>
        </div>
      </div>

      {/* Operação */}
      <div>
        <SectionTitle icon={Clock}>Operação</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <MiniKPI label="Dias Trabalhados" value={dias(k.dias_trabalhado)} icon={Calendar} iconColor="text-g-500" />
          <MiniKPI label="Dias Parado"      value={dias(k.dias_parado)}     icon={AlertTriangle} iconColor="text-g-500" color="text-emerald-700" />
          <MiniKPI label="Utilização"
            value={pct(k.dias_trabalhado / Math.max(k.dias_trabalhado + k.dias_parado, 1) * 100)}
            icon={Percent} iconColor="text-g-500" color="text-emerald-700" />
          <MiniKPI label="Receita / Dia" value={brlShort(k.receita_por_dia)} color="text-g-200" />
          <MiniKPI label="Custo / Dia"   value={brlShort(k.custo_por_dia)}   color="text-red-400" />
          <MiniKPI label="Margem / Dia"  value={brlShort(k.margem_por_dia)}  color="text-emerald-700" />
        </div>
      </div>

      {/* Evolução mensal */}
      <div>
        <SectionTitle icon={Calendar}>Evolução Mensal</SectionTitle>
        <div className="card p-4"><div className="h-64"><VehicleMonthlyChart monthly={data.monthly} /></div></div>
      </div>

      {/* Gráficos inferiores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <SectionTitle icon={Percent}>Composição de Custos</SectionTitle>
          <div className="card p-4 h-64"><VehicleCostPie kpis={k} /></div>
        </div>
        <div>
          <SectionTitle icon={Calendar}>Dias Trabalhados / Mês</SectionTitle>
          <div className="card p-4 h-64 overflow-y-auto space-y-3">
            {data.monthly.filter(m => m.dias_trabalhado > 0).map(m => (
              <div key={m.month} className="flex items-center gap-2">
                <span className="text-g-600 text-[10px] w-6 uppercase">{m.monthName.slice(0, 3)}</span>
                <div className="flex-1 bg-g-850 rounded-full h-2 overflow-hidden border border-g-800">
                  <div className="h-full bg-g-200 rounded-full" style={{ width: `${Math.min((m.dias_trabalhado / 31) * 100, 100)}%` }} />
                </div>
                <span className="text-g-500 text-[10px] font-mono w-8 text-right">{Math.round(m.dias_trabalhado)}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function VehicleModal({ placa, year, onClose, trackerOnline = null, isHighUsage = false }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('kpis')

  const { loading: trackerLoading, kmData, alerts } = useVehicleTrackerData({ placa, year, activeTab: tab })

  useEffect(() => {
    setLoading(true)
    setData(null)
    getVehicle(placa, year)
      .then(res => setData(res?.info ? res : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [placa, year])

  if (!placa) return null

  const info  = data?.info
  const k     = data?.kpis
  const isLucr = k?.margem >= 0

  const TABS = [
    { key: 'kpis',        label: 'KPIs',       short: 'KPIs' },
    { key: 'faturamento', label: 'Faturamento', short: 'Fat.' },
    { key: 'contratos',   label: 'Contratos',   short: 'Contr.' },
    { key: 'reembolsos',  label: 'Reembolsos',  short: 'Reimb.' },
    { key: 'debitos',     label: 'Débitos',     short: 'Déb.' },
    { key: 'seguro',      label: 'Seguro',      short: 'Seg.' },
    { key: 'manut',       label: 'Manutenção',  short: 'Manut.' },
    ...(trackerOnline === true ? [{ key: 'tracker', label: 'Rastreamento', short: 'GPS', icon: Route }] : []),
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[999] flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-g-950 border-l border-g-800 w-full max-w-5xl h-full shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-g-900/50 border-b border-g-800 flex-shrink-0">
          <div className="flex flex-col min-w-0">
            {loading || !info ? (
              <div className="h-9 w-40 bg-g-800 animate-pulse rounded" />
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-3xl font-black text-g-50 tracking-tighter">{placa}</h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest border ${
                    (info?.status || '').toLowerCase() === 'frota'
                      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                      : 'bg-g-800 text-g-400 border-g-700'
                  }`}>{info?.status}</span>
                  {isHighUsage && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20">
                      <Flame className="w-3 h-3" /> Uso Excessivo
                    </span>
                  )}
                </div>
                <p className="text-g-400 text-sm mt-1">
                  {info?.marca} · {info?.modelo}
                  {info?.ano_modelo && info.ano_modelo !== '—' && ` · ${info.ano_modelo}`}
                  {info?.implemento && info.implemento !== '0' && info.implemento !== '—' && ` · ${info.implemento}`}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-g-400 font-medium">
                  {info?.valor_tabela > 0 && <span>FIPE: <strong className="text-g-100">{brl(info.valor_tabela)}</strong></span>}
                  {info?.valor_implemento > 0 && <span>Implemento: <strong className="text-g-100">{brl(info.valor_implemento)}</strong></span>}
                  {info?.valor_total > 0 && <span>Total Ativo: <strong className="text-emerald-700">{brl(info.valor_total)}</strong></span>}
                  {k && (
                    <span className={`font-bold ${isLucr ? 'text-emerald-700' : 'text-red-400'}`}>
                      Margem: {brl(k.margem)} ({pct(k.margem_pct)})
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-g-800 rounded-xl transition-colors text-g-500 hover:text-g-200 flex-shrink-0 ml-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {!loading && data && info && (
          <div className="flex border-b border-g-900 px-4 overflow-x-auto flex-shrink-0 custom-scrollbar">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors -mb-px ${
                  tab === t.key
                    ? 'border-g-400 text-g-50'
                    : 'border-transparent text-g-600 hover:text-g-300'
                }`}
              >
                {t.icon && <t.icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-g-600" />
            <p className="text-g-500 text-base">Carregando dados de {placa}…</p>
          </div>
        )}

        {/* Content */}
        {!loading && data && k && (
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {tab === 'kpis'        && <KpisTab k={k} data={data} />}
            {tab === 'faturamento' && <FaturamentoTab faturamento={data.faturamento || []} />}
            {tab === 'contratos'   && <ContratosTab contratos={data.contratos || []} byContract={data.by_contract || []} />}
            {tab === 'reembolsos'  && <ReembolsosTab reembolsos={data.reembolsos || []} />}
            {tab === 'debitos'     && <DebitosTab debitos={data.debitos || []} />}
            {tab === 'seguro'      && <SeguroTab seguro={data.seguro || []} />}
            {tab === 'manut'       && <ManutencaoTab maintenance={data.maintenance || []} ultimaRevisao={data.ultima_revisao} />}
            {tab === 'tracker'     && <TrackerVehicleTab loading={trackerLoading} kmData={kmData} alerts={alerts} placa={placa} />}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
