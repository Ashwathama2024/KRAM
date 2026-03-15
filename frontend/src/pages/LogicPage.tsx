import { Shield, GitBranch, Repeat, Search, UserCheck, Calendar, Clock, RotateCcw, RefreshCw, FileText, Zap } from 'lucide-react'

const logics = [
  {
    icon: GitBranch,
    title: "Dual-Chain Architecture (Two Queues)",
    description: "The engine maintains two independent rotating chains: Working Chain (Mon–Fri, excluding holidays) and Holiday Chain (weekends + public holidays). A person's position in one queue does not affect their position in the other.",
    color: "text-blue-600 bg-blue-50"
  },
  {
    icon: Repeat,
    title: "The Chain Rule (Standby → Duty)",
    description: "Today's Standby is automatically scheduled to be Tomorrow's Duty (within the same queue). This ensures a predictable, sequential rotation.",
    color: "text-indigo-600 bg-indigo-50"
  },
  {
    icon: Search,
    title: "Look-Ahead Standby Logic",
    description: "Before assigning someone as Standby for Day D, the engine verifies they are available for Day D+1 (their expected Duty day). If they have leave starting tomorrow, they are skipped for Standby.",
    color: "text-purple-600 bg-purple-50"
  },
  {
    icon: UserCheck,
    title: "No-Vacant Guarantee (Triple-Pass)",
    description: "Selection happens in three levels: 1) Strict availability + buffer rules, 2) Relaxed buffer (ignoring post-leave cooldown), 3) Force-assignment of the active person with the fewest total duties. This ensures a day is never left vacant.",
    color: "text-emerald-600 bg-emerald-50"
  },
  {
    icon: Calendar,
    title: "Availability & Leave Logic",
    description: "Staff are only eligible during their join/relieve window. Direct leave or official-duty records block assignment for the specified dates.",
    color: "text-amber-600 bg-amber-50"
  },
  {
    icon: Clock,
    title: "Rejoin Buffer Logic",
    description: "After leave or official duty, staff are blocked from duties for a configurable rest period (e.g., 1 day after leave, 2 days after official duty) to allow for travel and rest.",
    color: "text-orange-600 bg-orange-50"
  },
  {
    icon: Shield,
    title: "Duty Debt & Fairness",
    description: "If someone is skipped due to leave, they gain +1 Duty Debt. The engine naturally aims for a variance of ≤ 1 duty across all staff. Debt is tracked for audit purposes.",
    color: "text-rose-600 bg-rose-50"
  },
  {
    icon: RotateCcw,
    title: "Swap & Manual Adjustments",
    description: "Manual swaps trigger availability checks for both staff on their new dates. After a swap, the engine attempts to 'heal' the standbys to maintain chain integrity.",
    color: "text-cyan-600 bg-cyan-50"
  },
  {
    icon: RefreshCw,
    title: "Auto-Healing (Regeneration)",
    description: "The engine can regenerate the roster from any point in time. If new leave is added for a generated date, healing shifts the chain forward to account for the unavailability.",
    color: "text-teal-600 bg-teal-50"
  }
]

export default function LogicPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Zap className="w-6 h-6 text-brand-600" />
          Core Roster Engine Logic
        </h1>
        <p className="text-slate-500">The foundational rules and algorithms that power the Kartavya Roster Management (KRAM) system.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
        {logics.map((logic, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
            <div className="p-5 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2 rounded-lg ${logic.color}`}>
                  <logic.icon className="w-6 h-6" />
                </div>
                <span className="text-slate-300 font-mono text-xl group-hover:text-brand-200 transition-colors">0{idx + 1}</span>
              </div>
              <h3 className="font-bold text-slate-800 text-lg mb-2">{logic.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed flex-grow">{logic.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-6 flex flex-col sm:flex-row items-center gap-6 no-print">
        <div className="bg-brand-100 p-3 rounded-full">
          <FileText className="w-8 h-8 text-brand-700" />
        </div>
        <div>
          <h4 className="font-bold text-brand-900 mb-1">Looking for technical details?</h4>
          <p className="text-brand-700 text-sm">These rules are implemented in the <code className="bg-brand-100 px-1 rounded font-mono text-xs">roster_engine.py</code> backend service using a state-machine approach to maintain chain pointers across months.</p>
        </div>
      </div>
    </div>
  )
}
