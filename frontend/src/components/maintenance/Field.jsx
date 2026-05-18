export default function Field({ label, value, mono = false, full = false }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-g-700 text-xs mb-0.5">{label}</p>
      <p className={`text-g-300 text-sm ${mono ? 'font-mono' : ''} break-words`}>{value || '—'}</p>
    </div>
  )
}
