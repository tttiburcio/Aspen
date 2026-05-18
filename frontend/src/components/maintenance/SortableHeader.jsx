import { ChevronUp, ChevronDown } from 'lucide-react'

export default function SortableHeader({ label, col, sortState, onSort, className = '' }) {
  const active = sortState.col === col
  return (
    <th
      className={`th th-left cursor-pointer select-none hover:text-g-300 transition-colors ${active ? 'text-g-200' : ''} ${className}`}
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active
          ? (sortState.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ChevronDown className="w-3 h-3 opacity-20" />}
      </span>
    </th>
  )
}
