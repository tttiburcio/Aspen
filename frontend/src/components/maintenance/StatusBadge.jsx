import { STATUS_LABEL } from '../../constants/maintenanceStatus'

export default function StatusBadge({ status }) {
  const s = STATUS_LABEL[status] || { label: status, color: 'bg-g-850 text-g-500 border-g-800' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.label}
    </span>
  )
}
