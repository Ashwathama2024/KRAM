import { useState } from 'react'
import {
  BookOpen, Zap, Users, CalendarDays, BarChart3, Settings,
  GitBranch, Repeat, Search, UserCheck, Calendar, Clock,
  Shield, RotateCcw, RefreshCw, ListChecks, ChevronDown,
  ChevronUp, ShieldAlert, ArrowRight, Info, Printer,
  FileDown, Share2, SwatchBook, Lock,
} from 'lucide-react'

// ── Collapsible section ───────────────────────────────────────────────────────
function Section({
  icon: Icon,
  color,
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  icon: React.ElementType
  color: string
  title: string
  subtitle?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-800">{title}</div>
            {subtitle && <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-6 pt-2 border-t border-slate-100">{children}</div>}
    </div>
  )
}

// ── Numbered list ─────────────────────────────────────────────────────────────
function NumList({ items, color = 'bg-brand-50 text-brand-700 border-brand-100' }: { items: string[]; color?: string }) {
  return (
    <ol className="space-y-3 mt-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border ${color}`}>
            {i + 1}
          </span>
          <p className="text-sm text-slate-600 leading-relaxed">{item}</p>
        </li>
      ))}
    </ol>
  )
}

// ── Bullet list ───────────────────────────────────────────────────────────────
function BulletList({ items, dot = 'bg-brand-400' }: { items: (string | React.ReactNode)[]; dot?: string }) {
  return (
    <ul className="space-y-2 mt-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
          <div className={`w-1.5 h-1.5 rounded-full ${dot} mt-1.5 flex-shrink-0`} />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Callout box ───────────────────────────────────────────────────────────────
function Callout({ children, color = 'bg-amber-50 border-amber-200 text-amber-800' }: { children: React.ReactNode; color?: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-medium mt-4 ${color}`}>
      {children}
    </div>
  )
}

// ── Engine logic cards ────────────────────────────────────────────────────────
const engineLogics = [
  {
    icon: GitBranch, color: 'text-blue-600 bg-blue-50',
    title: 'Dual-Chain Architecture',
    detail: 'Two fully independent rotating queues run in parallel.',
    points: [
      'Working Chain handles every weekday (Mon–Fri) that is not a public holiday.',
      'Holiday Chain handles all weekends (Sat/Sun) and every public holiday regardless of day of week.',
      'A person\'s queue position in the Working Chain has zero effect on their position in the Holiday Chain.',
      'When the roster spans multiple months, the chain pointers carry over so the rotation is never reset.',
    ],
  },
  {
    icon: Repeat, color: 'text-indigo-600 bg-indigo-50',
    title: 'The Chain Rule (Standby → Duty)',
    detail: "Today's Standby automatically becomes Tomorrow's Duty.",
    points: [
      'On Day D, the person assigned as Standby is the designated Duty person for Day D+1 in the same queue.',
      'This ensures a predictable, auditable sequence — no random picks.',
      'The chain pointer advances to the Standby\'s index after each day is processed.',
      'If no valid Standby can be found, the chain logs a warning and uses the safest fallback.',
    ],
  },
  {
    icon: Search, color: 'text-purple-600 bg-purple-50',
    title: 'Look-Ahead Standby Selection',
    detail: 'Standby candidates must be available on their expected next-duty day.',
    points: [
      'Before accepting someone as Standby for Day D, the engine checks they are also available on Day D+1.',
      'A staff member starting leave tomorrow fails the look-ahead and is skipped for Standby today.',
      'If every candidate fails look-ahead, the engine falls back to any available person and logs the chain-break warning.',
      'The look-ahead window spans up to 14 calendar days forward to find the next same-queue date.',
    ],
  },
  {
    icon: UserCheck, color: 'text-emerald-600 bg-emerald-50',
    title: 'No-Vacant Guarantee (Triple-Pass)',
    detail: 'A duty day is never left empty — three progressive fallbacks ensure this.',
    points: [
      'Pass 1 — Strict: Walk the chain with full availability and rejoin-buffer checks.',
      'Pass 2 — Relaxed: Walk again ignoring the post-leave buffer (prevents vacancy when everyone is in cooldown).',
      'Pass 3 — Force-assign: Pick the active person with the fewest total duties and log it as a forced assignment.',
      'All three passes are logged as remarks so operators can review and decide whether a swap is needed.',
    ],
  },
  {
    icon: Shield, color: 'text-rose-600 bg-rose-50',
    title: 'Duty Debt & Fairness Correction',
    detail: 'Accumulated skips are tracked and automatically corrected.',
    points: [
      'Every time a staff member is skipped as duty-candidate due to unavailability, their duty_debt increments by +1.',
      'When the engine picks a new duty candidate, it checks if any available person has a debt ≥ 2 higher than the chain-natural pick.',
      'If so, the high-debt person is selected instead, paying back the owed duty without disturbing minor rounding variance.',
      'Normal single-duty variance (mathematically expected in any round-robin) is left untouched; only a gap of 2+ triggers correction.',
    ],
  },
  {
    icon: Clock, color: 'text-orange-600 bg-orange-50',
    title: 'Rejoin Buffer After Leave',
    detail: 'Staff cannot be assigned immediately after returning from leave or official duty.',
    points: [
      'Leave: configurable buffer days (default 2) block assignment after the leave end date.',
      'Official Duty: a separate configurable buffer (default 2 days minimum, 4 days comfort) applies.',
      'Buffer is ignored only in Pass 2 of the No-Vacant Guarantee when no one else is available.',
      'All buffer values are adjustable in the Settings page without touching the code.',
    ],
  },
  {
    icon: RotateCcw, color: 'text-cyan-600 bg-cyan-50',
    title: 'Swap & Manual Adjustments',
    detail: 'Duty assignments can be interchanged between two dates with full validation.',
    points: [
      'Both staff members are checked for availability on their new (swapped) dates before the swap executes.',
      'After the swap, the engine re-assigns standbys for both dates using look-ahead logic.',
      'Every swap is permanently recorded in the Swap Log with date, staff before/after, and reason.',
      'Swaps are restricted to dates within the same month to keep chain continuity manageable.',
    ],
  },
  {
    icon: RefreshCw, color: 'text-teal-600 bg-teal-50',
    title: 'Auto-Healing (Regeneration)',
    detail: 'The roster can be re-synthesised from any point without losing prior-month context.',
    points: [
      'Healing clears all assignments from the target month onward and regenerates using the same chain-rule logic.',
      'The chain start position is derived from the last standby of the prior month, so continuity is preserved across months.',
      'Editing an earlier month automatically triggers regeneration of all later already-generated months.',
      'Later months are never allowed to back-propagate changes to earlier months.',
    ],
  },
]

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OperationsHandbookPage() {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-5xl pb-12">

      {/* ── Hero ── */}
      <div className="bg-brand-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none select-none flex items-center justify-end pr-8">
          <BookOpen className="w-64 h-64" />
        </div>
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-700 rounded-xl">
              <BookOpen className="w-6 h-6 text-brand-200" />
            </div>
            <h1 className="text-2xl font-black tracking-tight">KRAM — Complete Guide</h1>
          </div>
          <p className="text-brand-200 text-sm leading-relaxed max-w-2xl">
            <strong className="text-white">Kartavya Roster &amp; App Management</strong> is a logic-driven duty-roster
            system built for operational units. It automates fair rotation of duty and standby assignments across
            working days and weekends/holidays, tracks leave, enforces configurable rules, and provides a full audit
            trail — all from a single browser tab.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            {['Fair Rotation', 'No-Vacant Guarantee', 'Dual Chain', 'Full Audit Trail', 'Manual Override'].map(tag => (
              <span key={tag} className="text-[10px] font-bold uppercase tracking-widest bg-brand-800 text-brand-300 px-2.5 py-1 rounded-full border border-brand-700">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick Start ── */}
      <Section icon={ArrowRight} color="text-emerald-600 bg-emerald-50" title="Quick Start — First Time Setup" subtitle="Follow these steps in order to go from zero to a generated roster" defaultOpen>
        <NumList color="bg-emerald-50 text-emerald-700 border-emerald-200" items={[
          'Go to Staff → Add every team member using the three-field form (Rank · Name · Service Number). Name is the only required field. The abbreviation is auto-generated from the name — no manual entry needed.',
          'Go to Calendar → Navigate to the target month. Click any date to open its detail panel and set its type: Working Day, Sunday Routine (non-working), or Public Holiday. Do this before generating.',
          'If any staff member is on leave or official duty this month, open the date they return to, scroll to Staff Unavailability, and add a date-range record with the type and reason.',
          'Go to Roster → Click "Sync & Generate Roster". The engine builds duty and standby assignments for every day of the month.',
          'Review the duty table. Use "Auto-Heal Roster" after adding new leave, or "Force Regenerate" to rebuild from scratch.',
          'Check the Audit page → Individual Metrics table to confirm duties are balanced. The imbalance warning fires if any staff member has 2+ more duties than another.',
          'Export or print from Calendar (Print / PDF / Share buttons in the header) or from Roster (CSV / PDF icons).',
        ]} />
      </Section>

      {/* ── Calendar Page ── */}
      <Section icon={CalendarDays} color="text-brand-600 bg-brand-50" title="Calendar Page" subtitle="Configure day types, manage unavailability, view duty assignments">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">The Calendar is your month view. Every cell shows the date number, day type colour, any duty/standby abbreviation, and status badges. Click a cell to open its full detail panel.</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-4">Colour Legend</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {[
              { bg: 'bg-emerald-50 border-emerald-200', label: 'Working Day', text: 'text-emerald-800' },
              { bg: 'bg-amber-50 border-amber-200', label: 'Sunday Routine', text: 'text-amber-800' },
              { bg: 'bg-rose-100 border-rose-400', label: 'Public Holiday', text: 'text-rose-800' },
              { bg: 'bg-violet-50 border-violet-300', label: 'Modified Routine', text: 'text-violet-800' },
            ].map(c => (
              <div key={c.label} className={`rounded-lg border p-2.5 text-center text-xs font-semibold ${c.bg} ${c.text}`}>{c.label}</div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1"><strong>Modified Routine</strong> = a Saturday or Sunday that has been manually converted to a Working Day (shown in violet so operators immediately notice the exception).</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Cell Detail Panel (Click any date)</h4>
          <BulletList items={[
            <><strong>Calendar Settings</strong> — Switch a date between Working Day, Non-working Day, or Closed Holiday. Add a holiday name if needed. The change is saved immediately and affects the duty type the engine will use for that date.</>,
            <><strong>Staff Unavailability</strong> — Add a leave or official-duty record for any staff member. Set the date range, type, and optional reason. You can edit or delete existing records. The roster must be healed after any change here.</>,
            <><strong>Force Manual Assignment</strong> — Emergency override: choose a new duty person (and optionally standby), set the override type (Emergency / Routine / Other), and hit one of two buttons:<br />• <em>Apply &amp; Keep Roster</em> — only this date changes, rest of the month is untouched.<br />• <em>Apply &amp; Heal Roster</em> — this date is pinned, then the rest of the month regenerates around it. Every override is logged permanently for audit.</>,
          ]} />

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Export &amp; Print</h4>
          <BulletList items={[
            <><Printer className="w-3.5 h-3.5 inline mb-0.5" /> <strong>Print</strong> — Opens the browser print dialog. Header, navigation, and buttons are hidden automatically. Choose "Save as PDF" in the dialog for a PDF of exactly what you see.</>,
            <><FileDown className="w-3.5 h-3.5 inline mb-0.5" /> <strong>PDF</strong> — Downloads a formatted PDF of the month's duty list from the server.</>,
            <><Share2 className="w-3.5 h-3.5 inline mb-0.5" /> <strong>Share</strong> — Uses the device's native share sheet (mobile) or copies the page URL to clipboard (desktop).</>,
          ]} />

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Stats Placard &amp; Staff Legend</h4>
          <BulletList items={[
            'Below the calendar grid three placard cards show the count of Working Days, Weekend (Sunday Routine) days, and Public Holidays for the displayed month — colour-matched to the cell colours.',
            'The Staff Reference panel lists every active staff member\'s abbreviation → full name. Abbreviations are auto-generated from the name field. This panel is fetched live from the database and updates the moment a staff member is added or renamed.',
          ]} />
        </div>
      </Section>

      {/* ── Roster Page ── */}
      <Section icon={Zap} color="text-brand-600 bg-brand-50" title="Roster Page" subtitle="Generate, heal, swap, and export duty assignments">
        <div className="space-y-4 text-sm text-slate-600">
          <p>The Roster page is the operational hub. It shows every day of the month in a table with duty, standby, day type, and status; exposes generation controls; and lets you perform manual swaps.</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-4">Generation Buttons</h4>
          <BulletList items={[
            <><strong>Sync &amp; Generate Roster</strong> — Standard generation. Uses the chain pointers from the previous month. If the month already has some assignments, only unassigned days are filled in.</>,
            <><strong>Force Regenerate</strong> — Clears all assignments for the month and rebuilds from scratch using the prior-month chain start. Use when you need a completely clean run.</>,
            <><strong>Auto-Heal Roster</strong> — Regenerates the month respecting new leave or availability changes that were added after the initial generation. Preserves as much of the existing roster as the rules allow.</>,
          ]} />

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Status Column</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {[
              { label: 'Assigned', color: 'bg-emerald-100 text-emerald-700' },
              { label: 'Modified', color: 'bg-yellow-100 text-yellow-700' },
              { label: 'Vacant', color: 'bg-red-100 text-red-700' },
              { label: 'Pending', color: 'bg-slate-100 text-slate-600' },
            ].map(s => (
              <span key={s.label} className={`text-xs font-bold px-3 py-1.5 rounded-full text-center ${s.color}`}>{s.label}</span>
            ))}
          </div>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Manual Duty Swap</h4>
          <p>Select two dates from the dropdowns and optionally add a reason. The engine validates both staff members are available on their new dates before executing. Both dates are marked <em>Modified</em> and standbys are reassigned. The swap is recorded in the Swap Log.</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Monthly Unavailability Panel</h4>
          <p>Shows all leave and official-duty records that overlap the displayed month — sorted by start date. Quick reference before reviewing duty counts.</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Number of Duties Panel</h4>
          <p>Per-staff breakdown of Working Duties, Holiday Duties, and Total for the month. Used alongside the Audit page to spot any imbalance quickly.</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Exports</h4>
          <BulletList items={[
            'CSV download — full month table with dates, day types, duty staff, standby staff, and status.',
            'PDF download — formatted duty-list document suitable for official record.',
          ]} />
        </div>
      </Section>

      {/* ── Staff Page ── */}
      <Section icon={Users} color="text-violet-600 bg-violet-50" title="Staff Page" subtitle="Add personnel, manage service windows, track availability history">
        <div className="space-y-4 text-sm text-slate-600">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Adding a Staff Member</h4>
          <p>The add form has three separate fields:</p>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {[
              { label: 'Rank', note: 'Optional. e.g. Capt, Maj, Col. Stripped from abbreviation generation.' },
              { label: 'Name', note: 'Required. The core identifier. Abbreviation is derived from this field only.' },
              { label: 'Service Number', note: 'Optional. e.g. IC-12345. Not used in abbreviation.' },
            ].map(f => (
              <div key={f.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-xs font-black text-slate-700 uppercase tracking-widest">{f.label}</div>
                <div className="text-xs text-slate-500 mt-1">{f.note}</div>
              </div>
            ))}
          </div>
          <p>A live preview below the fields shows the full composed record and confirms the abbreviation will be auto-derived from the name. The full record stored is <em>"Rank Name ServiceNumber"</em> as a single name string.</p>

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Abbreviation Generation</h4>
          <p>Abbreviations are automatically generated and kept unique across all staff. The algorithm:</p>
          <BulletList dot="bg-violet-400" items={[
            'Strips rank tokens (CAPT, MAJ, COL, LT, CMDT, etc.) and pure-numeric tokens from consideration.',
            'Uses the last two meaningful name words to form initials.',
            'Extends to 3 characters using the trailing consonant of the last name token if needed.',
            'If a collision exists, appends a numeric suffix (e.g. SMT2) to guarantee uniqueness.',
            'Abbreviations are re-synced silently every time the database is accessed — no manual entry required.',
          ]} />

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Per-Staff Controls</h4>
          <BulletList items={[
            <><strong>Toggle (Active / Inactive)</strong> — Inactive staff are excluded from all duty and standby selection. Their historical records remain intact.</>,
            <><strong>Service Window</strong> — Set a Reporting Date (join) and Relieve Date. The engine ignores the staff member outside this window entirely.</>,
            <><strong>Unavailability History</strong> — Lists all leave and official-duty records attached to this person. Each record can be deleted directly from this panel.</>,
            <><strong>Duty Debt Badge</strong> — Appears in red if the staff member has accumulated skipped-duty debt. Clears automatically as they are assigned duties.</>,
          ]} />

          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-5">Duty Counters Summary Table</h4>
          <p>The table at the bottom of the page shows every staff member's all-time Working Duties, Holiday Duties, Total, Duty Debt, and Pool Status in one view — useful for long-term fairness review.</p>
        </div>
      </Section>

      {/* ── Audit Page ── */}
      <Section icon={BarChart3} color="text-amber-600 bg-amber-50" title="Audit Page" subtitle="Monthly duty-distribution analytics and imbalance detection">
        <div className="space-y-3 text-sm text-slate-600">
          <BulletList dot="bg-amber-400" items={[
            'Bar chart shows working vs holiday duties side-by-side for every active staff member for the selected month.',
            'Individual Metrics table lists each person\'s full name, working duties, holiday duties, total, and duty debt.',
            'Variance stat shows the gap between the highest and lowest duty counts. An imbalance warning fires if variance > 2.',
            'Use the month navigator at the top to review any past or future generated month.',
            'If variance is high, use Auto-Heal or Force Regenerate on the Roster page — the debt-correction logic will redistribute duties on the next run.',
          ]} />
        </div>
      </Section>

      {/* ── Settings Page ── */}
      <Section icon={Settings} color="text-slate-600 bg-slate-100" title="Settings Page" subtitle="Tune roster-engine behaviour without touching the code">
        <div className="space-y-3 text-sm text-slate-600">
          <BulletList items={[
            <><strong>Leave Rejoin Buffer Days</strong> — How many days after leave ends before a person becomes eligible again. Default: 2.</>,
            <><strong>Official Duty Min Buffer Days</strong> — Minimum rest days after official duty. Default: 2.</>,
            <><strong>Official Duty Comfort Buffer Days</strong> — Extended comfort margin for official duty when the month has enough coverage. Default: 4.</>,
            <><strong>Auto-Assign Standby</strong> — When enabled, the engine always assigns a standby. Disable only if you want duty-only assignments.</>,
            <><strong>Separate Weekend Pool</strong> — Keeps the working and holiday chains independent (recommended on). Disable only for very small teams.</>,
          ]} />
          <Callout color="bg-slate-50 border-slate-200 text-slate-600">
            After changing any setting, run <strong>Force Regenerate</strong> on the Roster page to see the effect on the current month.
          </Callout>
        </div>
      </Section>

      {/* ── Engine Logic ── */}
      <Section icon={GitBranch} color="text-blue-600 bg-blue-50" title="Engine Logic — How Duties Are Assigned" subtitle="Every rule the roster engine follows, explained in plain language">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          {engineLogics.map((logic, idx) => (
            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${logic.color}`}>
                  <logic.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-700 uppercase tracking-wide">{logic.title}</div>
                  <div className="text-[10px] text-slate-400 italic">{logic.detail}</div>
                </div>
              </div>
              <ul className="space-y-1.5 mt-2">
                {logic.points.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="text-slate-300 font-mono mt-0.5">›</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Rule Hierarchy ── */}
      <Section icon={Shield} color="text-emerald-600 bg-emerald-50" title="Rule Hierarchy" subtitle="When rules conflict, priority is determined in this exact order">
        <NumList color="bg-emerald-50 text-emerald-700 border-emerald-200" items={[
          'Core safety rules — no vacant date, no availability violation, no same-person duty and standby on the same day.',
          'Fairness rules — balance working-day and non-working-day duty counts across staff when a legal move exists.',
          'Buffer and comfort rules — rejoin buffers and comfort margins apply after safety is guaranteed.',
          'Cosmetic, reporting, and audit behaviour — remarks, logs, and counter updates come last and never override roster safety.',
        ]} />
      </Section>

      {/* ── Scheduling Rules ── */}
      <Section icon={ListChecks} color="text-slate-500 bg-slate-100" title="All Scheduling Rules" subtitle="The complete list of operational constraints the engine enforces">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0 mt-2">
          {[
            'Working days and non-working days rotate through separate queues — the two chains never interfere.',
            'Saturday and Sunday are both treated as non-working (Sunday Routine) unless manually converted.',
            'Standby is assigned after main-duty selection and must satisfy the same availability and gap rules.',
            'Previous-month roster outcomes carry forward as the chain start for the next month.',
            'Editing an earlier month reshapes all later generated months; the reverse never happens.',
            'Unavailable staff are skipped in queue order; the sequence continues from the resulting position.',
            'Leave and official-duty return buffers are applied before a person becomes eligible again.',
            'Closed holidays can be defined for any date; any date can be manually reclassified as working or non-working.',
            'A day converted from non-working to working uses the working chain, displayed with a violet "Modified Normal Routine" badge.',
            'Manual overrides are logged separately and survive a subsequent Heal Roster (the overridden date is pinned and regenerated around).',
          ].map((rule, idx) => (
            <div key={idx} className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
              <span className="text-[10px] font-black text-slate-300 mt-0.5">{(idx + 1).toString().padStart(2, '0')}</span>
              <p className="text-sm text-slate-600 leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Advanced Features ── */}
      <Section icon={ShieldAlert} color="text-red-600 bg-red-50" title="Advanced Features" subtitle="Force override, swap, heal, debt correction — when and how to use them">
        <div className="space-y-5 text-sm text-slate-600 mt-2">

          <div>
            <div className="font-bold text-slate-700 flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-red-500" /> Force Manual Assignment (Emergency Override)
            </div>
            <p>Available in the Calendar → date detail panel. Replaces the assigned duty (and optionally standby) for one date regardless of chain logic.</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <div className="text-xs font-black text-amber-800 mb-1"><Lock className="w-3 h-3 inline mb-0.5" /> Apply &amp; Keep Roster</div>
                <p className="text-xs text-amber-700">Only the selected date changes. The chain and all other days are completely untouched. Use when the rest of the month is already confirmed and you just need to fix one day.</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="text-xs font-black text-red-800 mb-1"><RefreshCw className="w-3 h-3 inline mb-0.5" /> Apply &amp; Heal Roster</div>
                <p className="text-xs text-red-700">The selected date is pinned with your override, then the rest of the month is regenerated around it. The chain re-flows from the next available person. Use when the change affects future duty fairness.</p>
              </div>
            </div>
            <Callout color="bg-slate-50 border-slate-200 text-slate-600">Every manual override saves: date, override type, reason, previous duty/standby, new duty/standby, whether heal was applied, and timestamp. Retrieve via <code className="bg-slate-100 px-1 rounded font-mono text-xs">GET /api/roster/manual-override/history</code>.</Callout>
          </div>

          <div>
            <div className="font-bold text-slate-700 flex items-center gap-2 mb-1">
              <RotateCcw className="w-4 h-4 text-cyan-500" /> Duty Swap
            </div>
            <p>On the Roster page, select two dates from the dropdowns. The engine swaps the duty persons between them, validates availability on the new dates, re-assigns standbys, and records the swap with reason. Restricted to same-month dates.</p>
          </div>

          <div>
            <div className="font-bold text-slate-700 flex items-center gap-2 mb-1">
              <SwatchBook className="w-4 h-4 text-violet-500" /> Debt Correction
            </div>
            <p>No manual action is required. When someone accumulates 2+ more skipped duties than the chain-natural next pick, the engine automatically selects them for the next available duty slot. The debt decrements with each assignment. View current debt per person in the Staff page's counter table and the Audit metrics table.</p>
          </div>

          <div>
            <div className="font-bold text-slate-700 flex items-center gap-2 mb-1">
              <Info className="w-4 h-4 text-brand-500" /> Generation Notes (Remarks)
            </div>
            <p>After each generation or heal, the engine appends timestamped remarks explaining every non-standard decision: chain adjustments, look-ahead failures, rejoin-buffer relaxations, forced assignments, and manual overrides. View them in the Roster page → Generation Notes panel. Clear them after review with the delete button.</p>
          </div>
        </div>
      </Section>

      {/* ── Technical footer ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-500 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <code className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-mono text-slate-600">roster_engine.py</code>
        <p>Core engine implemented as a state-machine chain-walker. Pointers persist in the database across months. All logic is deterministic and fully reproducible given the same inputs.</p>
      </div>

    </div>
  )
}
