export default function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <p className="text-g-500 text-xs font-semibold uppercase tracking-widest mb-0.5">{title}</p>
      {subtitle && <p className="text-g-700 text-xs mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  )
}
