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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Operations Handbook</h1>
        <p className="text-sm text-slate-500">Rules, features, and professional usage guidance for KRAM.</p>
      </div>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Rule Priority</h2>
        <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
          {rulePriority.map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scheduling Rules</h2>
        <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
          {schedulingRules.map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Features</h2>
        <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
          {features.map(feature => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">How To Use The App</h2>
        <ol className="space-y-2 text-sm text-slate-600 list-decimal list-inside">
          {usageGuide.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p className="text-xs text-slate-400">
          Source of truth: <code>docs/CORE_LOGIC.md</code>
        </p>
      </section>
    </div>
  )
}
