import { PackageOpen } from 'lucide-react'

export default function EmptyState({ 
  icon: Icon = PackageOpen, 
  title = "Nenhum registro encontrado", 
  message = "Ainda não há dados para exibir aqui.",
  action = null 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-g-900/50 border border-g-800 rounded-2xl border-dashed">
      <div className="w-16 h-16 bg-g-850 rounded-full flex items-center justify-center mb-4 text-g-600">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-g-200 text-lg font-semibold mb-2">{title}</h3>
      <p className="text-g-500 text-sm text-center max-w-sm mb-6">{message}</p>
      {action && (
        <div>{action}</div>
      )}
    </div>
  )
}
