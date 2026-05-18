import { useState } from 'react'
import { Wrench, DollarSign } from 'lucide-react'
import GestaoTab from '../components/tabs/GestaoTab'
import FinanceiroTab from '../components/tabs/FinanceiroTab'

export default function MaintenancePage({
  year,
  vehicles = [],
  finAlertDismissed,
  setFinAlertDismissed
}) {
  const [tab, setTab] = useState('gestao')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-g-850 border border-g-800 rounded-xl p-1">
          {[
            { key: 'gestao',     label: 'Gestão de OS', icon: Wrench },
            { key: 'financeiro', label: 'Financeiro',   icon: DollarSign },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key
                ? 'bg-white shadow-sm text-g-200 border border-g-800'
                : 'text-g-600 hover:text-g-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'gestao'     && <GestaoTab year={year} />}
      {tab === 'financeiro' && <FinanceiroTab year={year} alertDismissed={finAlertDismissed} onAlertDismiss={() => setFinAlertDismissed(true)} />}
    </div>
  )
}
