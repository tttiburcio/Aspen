import { FIN_STATUS } from '../../utils/financialCalcs'

export default function FinBadge({ status }) {
  const s = FIN_STATUS[status] || FIN_STATUS.pendente
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>{s.label}</span>
}
