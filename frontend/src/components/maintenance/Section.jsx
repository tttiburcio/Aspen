export default function Section({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={className}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-1.5 bg-g-850 border border-g-800 rounded-lg">
          <Icon className="w-4 h-4 text-g-600" />
        </div>
        <h2 className="text-g-500 font-semibold text-xs uppercase tracking-widest">{title}</h2>
        <div className="flex-1 h-px bg-g-800" />
      </div>
      {children}
    </section>
  )
}
