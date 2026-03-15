import { BookOpen, Shield, Zap, ListChecks, HelpCircle } from 'lucide-react'

export default function OperationsHandbookPage() {
  const rulePriority = [
    'Core safety rules come first: no vacant date, no adjacent-day repeat across main or standby, no same-person main and standby, and no availability violation.',
    'Fairness rules come second: balance working days, non-working days, and the weekend Sunday routine only when the move is legal under the core rules.',
    'Buffer and comfort rules come third: leave and official-duty return buffers shape eligibility after core safety is protected.',
    'Cosmetic, reporting, and audit behavior come last and must never override roster safety.',
  ]

  const schedulingRules = [
    'Working days and non-working days rotate through separate queues.',
    'Saturday and Sunday are both non-working days and are reviewed together as the Sunday routine fairness bucket.',
    'Standby is assigned after main-duty generation and must remain legal under the same gap and availability rules.',
    'A person who had duty or standby on the previous day cannot take duty or standby on the next day.',
    'Previous-month roster outcomes carry forward into the next month.',
    'Editing an earlier month automatically reshapes later generated months, but later months do not reshape earlier ones.',
    'Unavailable staff are skipped only when required, and the sequence continues fairly from the resulting queue position.',
    'Leave and official-duty return buffers are applied before a person becomes eligible again.',
    'Working-day and non-working-day rebalancing may adjust the generated month only when the reassignment stays legal.',
    'Closed holidays can be defined manually, and any date can be treated as working or non-working when required.',
  ]

  const features = [
    'Calendar control for marking any date as working day, non-working day, or closed holiday.',
    'Unavailability recording with type, reason, and date range across months.',
    'Unavailability editing and deletion with automatic roster reshaping from the affected month onward.',
    'Month-wise roster generation with carryforward continuity.',
    'Monthly unavailability and number-of-duties summaries on the Roster page.',
    'Editable return-buffer settings for leave and official duty.',
    'Audit view for balance checking across staff members.',
  ]

  const usageGuide = [
    'Start in Calendar to define any special working or non-working dates before generating a roster.',
    'Enter staff unavailability with exact date ranges, type, and reason so the generator can respect the rules correctly.',
    'Use Roster to generate or regenerate the month after date and availability inputs are updated.',
    'Review Monthly Unavailability first, then Number of Duties, before confirming the month is balanced.',
    'Use Staff to review each person\'s counters and availability history.',
    'Use Settings to tune return-buffer rules and other generator behavior instead of hardcoding exceptions manually.',
    'When a genuine operational exception is needed, edit the source date or availability input first so the roster remains traceable and consistent.',
  ]

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-5xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <BookOpen className="w-6 h-6 text-brand-600" />
          Operations Handbook
        </h1>
        <p className="text-sm text-slate-500 mt-1">Foundational rules, features, and professional usage guidance for KRAM.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Rule Hierarchy</h2>
            </div>
            <div className="p-6">
                <div className="space-y-4">
                  {rulePriority.map((rule, idx) => (
                    <div key={idx} className="flex gap-4">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-black border border-emerald-100">{idx + 1}</span>
                        <p className="text-sm text-slate-600 leading-relaxed font-medium">{rule}</p>
                    </div>
                  ))}
                </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-600" />
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Core Features</h2>
            </div>
            <div className="p-6">
                <ul className="space-y-3">
                  {features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 flex-shrink-0" />
                        {feature}
                    </li>
                  ))}
                </ul>
            </div>
          </section>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Procedural Scheduling Rules</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          {schedulingRules.map((rule, idx) => (
            <div key={idx} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="text-[10px] font-black text-slate-300 mt-0.5">{(idx + 1).toString().padStart(2, '0')}</span>
                <p className="text-sm text-slate-600 font-medium leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-brand-900 rounded-3xl p-8 text-white shadow-xl shadow-brand-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
            <HelpCircle className="w-32 h-32" />
        </div>
        <div className="relative z-10">
            <h2 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-3">
                <div className="w-8 h-1 bg-brand-400 rounded-full" />
                Operational Workflow
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {usageGuide.slice(0, 4).map((item, idx) => (
                    <div key={idx} className="space-y-2">
                        <div className="text-[10px] font-black text-brand-300 uppercase tracking-widest">Step {idx + 1}</div>
                        <p className="text-xs font-bold leading-relaxed text-brand-50">{item}</p>
                    </div>
                ))}
            </div>
            <div className="mt-8 pt-8 border-t border-brand-800 flex flex-wrap gap-6 items-center justify-between">
                <div className="flex gap-4">
                    {usageGuide.slice(4).map((item, idx) => (
                        <div key={idx} className="bg-brand-800/50 p-3 rounded-xl max-w-[200px]">
                            <p className="text-[10px] font-medium text-brand-100">{item}</p>
                        </div>
                    ))}
                </div>
                <div className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em]">
                    Source: docs/CORE_LOGIC.md
                </div>
            </div>
        </div>
      </section>
    </div>
  )
}
