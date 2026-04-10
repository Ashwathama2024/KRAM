import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addMonths, subMonths, endOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, RefreshCw, Download, FileText, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { rosterApi, calendarApi, availabilityApi, apiError, type CalendarEntry, type Remark } from '../services/api'
import { staffLabel } from '../utils/staff'
import { currentMonthDate } from '../utils/date'

async function triggerDownload(url: string, filename: string) {
  const tid = toast.loading('Preparing download…')
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Server error ${res.status}: ${body.slice(0, 120)}`)
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
    toast.success('Downloaded', { id: tid })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Download failed'
    toast.error(msg, { id: tid })
  }
}

export default function RosterPage() {
  const [current, setCurrent] = useState(() => currentMonthDate())
  const [firstSwapDate, setFirstSwapDate] = useState('')
  const [secondSwapDate, setSecondSwapDate] = useState('')
  const [swapReason, setSwapReason] = useState('')
  const qc = useQueryClient()
  const year = current.getFullYear()
  const month = current.getMonth() + 1
  const isCurrentMonth = year === currentMonthDate().getFullYear() && month === currentMonthDate().getMonth() + 1

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => calendarApi.list(year, month),
  })

  const { data: audit } = useQuery({
    queryKey: ['audit', year, month],
    queryFn: () => rosterApi.audit(year, month),
  })

  const { data: availability = [] } = useQuery({
    queryKey: ['availability'],
    queryFn: availabilityApi.list,
  })

  const { data: notes = [] } = useQuery({
    queryKey: ['remarks'],
    queryFn: rosterApi.remarks,
  })

  const generateMut = useMutation({
    mutationFn: (force: boolean) => rosterApi.generate(year, month, force),
    onSuccess: () => {
      toast.success('Roster generated successfully')
      qc.invalidateQueries({ queryKey: ['calendar', year, month] })
      qc.invalidateQueries({ queryKey: ['audit', year, month] })
      qc.invalidateQueries({ queryKey: ['remarks'] })
    },
    onError: () => toast.error('Failed to generate roster'),
  })

  const healMut = useMutation({
    mutationFn: () => rosterApi.heal(year, month),
    onSuccess: () => {
      toast.success('Roster healed')
      qc.invalidateQueries({ queryKey: ['calendar', year, month] })
      qc.invalidateQueries({ queryKey: ['audit', year, month] })
      qc.invalidateQueries({ queryKey: ['remarks'] })
    },
    onError: () => toast.error('Failed to heal roster'),
  })

  const swapMut = useMutation({
    mutationFn: () => rosterApi.swap(firstSwapDate, secondSwapDate, swapReason || undefined),
    onSuccess: () => {
      toast.success('Roster swapped')
      setFirstSwapDate('')
      setSecondSwapDate('')
      setSwapReason('')
      qc.invalidateQueries({ queryKey: ['calendar', year, month] })
      qc.invalidateQueries({ queryKey: ['audit', year, month] })
      qc.invalidateQueries({ queryKey: ['remarks'] })
    },
    onError: (e: unknown) => toast.error(apiError(e, 'Failed to swap duties')),
  })

  const statusBadge = (e: CalendarEntry) => {
    if (e.status === 'assigned') return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Assigned</span>
    if (e.status === 'vacant') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Vacant</span>
    if (e.status === 'modified') return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Modified</span>
    return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Pending</span>
  }

  const dayTypeBadge = (e: CalendarEntry) => {
    if (e.day_type === 'working') return <span className="badge-working">Working</span>
    if (e.day_type === 'holiday') return <span className="badge-holiday">{e.holiday_name || 'Holiday'}</span>
    return <span className="badge-weekend">Weekend</span>
  }

  const assigned = entries.filter(e => e.assigned_duty_id !== null).length
  const vacant = entries.filter(e => e.assigned_duty_id === null).length
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = format(endOfMonth(current), 'yyyy-MM-dd')
  const monthlyAvailability = availability
    .filter(a => a.start_date <= monthEnd && a.end_date >= monthStart)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const monthNotes = notes.filter(note => !note.date_ref || (note.date_ref >= monthStart && note.date_ref <= monthEnd))
  const summaryBuckets = [
    {
      key: 'rebalance',
      label: 'Duty Rebalanced',
      tone: 'bg-blue-50 text-blue-700 border-blue-100',
      count: monthNotes.filter(note => note.message.startsWith('Variance rebalance on')).length,
    },
    {
      key: 'standby',
      label: 'Standby Shifted',
      tone: 'bg-amber-50 text-amber-700 border-amber-100',
      count: monthNotes.filter(note => note.message.startsWith('Nearest queue standby')).length,
    },
    {
      key: 'consecutive',
      label: 'Consecutive Rule Hits',
      tone: 'bg-slate-50 text-slate-700 border-slate-100',
      count: monthNotes.filter(note => note.message.includes('blocked by consecutive-duty rule')).length,
    },
    {
      key: 'exceptions',
      label: 'Fallback Events',
      tone: 'bg-rose-50 text-rose-700 border-rose-100',
      count: monthNotes.filter(note =>
        note.message.includes('force-assigned')
        || note.message.includes('rejoin buffer relaxed')
        || note.message.includes('Look-ahead skipped')
        || note.message.includes('limited in')
      ).length,
    },
  ].filter(bucket => bucket.count > 0)
  const detailNotes = monthNotes
    .filter(note =>
      note.message.startsWith('Variance rebalance on')
      || note.message.startsWith('Nearest queue standby')
      || note.message.includes('force-assigned')
      || note.message.includes('rejoin buffer relaxed')
      || note.message.includes('Look-ahead skipped')
      || note.message.includes('limited in')
    )
    .slice(0, 10)

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Zap className="w-6 h-6 text-brand-600" />
            Roster Generator
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage duty assignments and synchronize rotation chains.</p>
        </div>
        <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1.5 self-start">
          <button onClick={() => setCurrent(subMonths(current, 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-slate-800 min-w-[140px] text-center uppercase tracking-wider">
            {format(current, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrent(addMonths(current, 1))} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrent(currentMonthDate())}
            disabled={isCurrentMonth}
            className={clsx(
              'ml-1 px-3 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition-colors border',
              isCurrentMonth
                ? 'text-slate-400 bg-slate-50 border-slate-100 cursor-not-allowed'
                : 'text-brand-700 bg-brand-50 hover:bg-brand-100 border-brand-100'
            )}
          >
            Current Month
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Logic Controls</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => generateMut.mutate(false)} disabled={generateMut.isPending} className="btn-primary px-6 py-2.5 rounded-xl shadow-md shadow-brand-200">
            <Zap className="w-4 h-4" />
            {generateMut.isPending ? 'Generating...' : 'Sync & Generate Roster'}
          </button>
          <button onClick={() => generateMut.mutate(true)} disabled={generateMut.isPending} className="btn-secondary px-5 py-2.5 rounded-xl">
            <RefreshCw className="w-4 h-4" />
            Force Regenerate
          </button>
          <button onClick={() => healMut.mutate()} disabled={healMut.isPending} className="btn-success px-5 py-2.5 rounded-xl text-white">
            <RefreshCw className="w-4 h-4" />
            {healMut.isPending ? 'Healing...' : 'Auto-Heal Roster'}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => triggerDownload(rosterApi.exportCsv(year, month), `KRAM-Roster-${year}-${String(month).padStart(2,'0')}.csv`)} className="p-2.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors border border-slate-100" title="Export CSV">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={() => triggerDownload(rosterApi.exportPdf(year, month), `KRAM-Roster-${year}-${String(month).padStart(2,'0')}.pdf`)} className="p-2.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors border border-slate-100" title="Export PDF">
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: "Total Days", value: entries.length, color: "text-brand-600", bg: "bg-brand-50" },
          { label: "Assigned", value: assigned, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Vacant", value: vacant, color: "text-rose-600", bg: "bg-rose-50" }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className={clsx("text-3xl font-black tracking-tight mb-1", stat.color)}>{stat.value}</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{stat.label}</div>
            </div>
            <div className={clsx("w-1.5 h-10 rounded-full", stat.bg)} />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm">Duty Roster - {format(current, 'MMMM yyyy')}</h2>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{entries.length} Entries</span>
        </div>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
             <RefreshCw className="w-8 h-8 animate-spin text-brand-400" />
             <span className="text-sm font-medium">Loading roster data...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-sm font-medium mb-1">No roster data found for this month.</p>
            <p className="text-xs">Click "Sync & Generate Roster" above to initialize assignments.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                  <th className="px-6 py-4 text-left">Date</th>
                  <th className="px-6 py-4 text-left">Day</th>
                  <th className="px-6 py-4 text-left">Type</th>
                  <th className="px-6 py-4 text-left">Primary Duty</th>
                  <th className="px-6 py-4 text-left">Standby</th>
                  <th className="px-6 py-4 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{format(new Date(`${e.date}T00:00:00`), 'dd MMM')}</td>
                    <td className="px-6 py-3.5 text-slate-500 font-medium">{format(new Date(`${e.date}T00:00:00`), 'EEEE')}</td>
                    <td className="px-6 py-3.5">{dayTypeBadge(e)}</td>
                    <td className="px-6 py-3.5 font-bold text-slate-800" title={e.duty_staff?.name}>
                        {e.duty_staff ? (
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-black">
                                    {staffLabel(e.duty_staff).slice(0, 1)}
                                </div>
                                {staffLabel(e.duty_staff)}
                            </div>
                        ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500 font-semibold" title={e.standby_staff?.name}>
                        {e.standby_staff ? (
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded bg-slate-100 text-slate-500 flex items-center justify-center text-[9px] font-black">
                                    {staffLabel(e.standby_staff).slice(0, 1)}
                                </div>
                                {staffLabel(e.standby_staff)}
                            </div>
                        ) : <span className="text-slate-200">—</span>}
                    </td>
                    <td className="px-6 py-3.5">{statusBadge(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-slate-800 text-sm">Manual Duty Swap</h2>
          <p className="text-xs text-slate-500 mt-1">Interchange assignments between two dates. This triggers a validation of availability rules.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select className="input rounded-xl border-slate-200" value={firstSwapDate} onChange={e => setFirstSwapDate(e.target.value)}>
            <option value="">Select First date</option>
            {entries.filter(e => e.assigned_duty_id).map(e => (
              <option key={`first-${e.date}`} value={e.date}>{format(new Date(`${e.date}T00:00:00`), 'dd MMM')} - {e.duty_staff ? staffLabel(e.duty_staff) : ''}</option>
            ))}
          </select>
          <select className="input rounded-xl border-slate-200" value={secondSwapDate} onChange={e => setSecondSwapDate(e.target.value)}>
            <option value="">Select Second date</option>
            {entries.filter(e => e.assigned_duty_id && e.date !== firstSwapDate).map(e => (
              <option key={`second-${e.date}`} value={e.date}>{format(new Date(`${e.date}T00:00:00`), 'dd MMM')} - {e.duty_staff ? staffLabel(e.duty_staff) : ''}</option>
            ))}
          </select>
          <input className="input rounded-xl border-slate-200" placeholder="Reason for swap (optional)" value={swapReason} onChange={e => setSwapReason(e.target.value)} />
        </div>
        <button onClick={() => swapMut.mutate()} disabled={!firstSwapDate || !secondSwapDate || swapMut.isPending} className="btn-secondary px-6 rounded-xl font-bold">
          {swapMut.isPending ? 'Processing Swap...' : 'Execute Swap'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-700 text-sm">Monthly Unavailability</h2>
          </div>
          {monthlyAvailability.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400 text-center">No unavailability overlaps this month.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {monthlyAvailability.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-slate-700" title={item.staff?.name}>{item.staff ? staffLabel(item.staff) : `Staff #${item.staff_id}`}</div>
                    <div className="text-xs text-slate-500">
                      {format(new Date(`${item.start_date}T00:00:00`), 'dd MMM yyyy')} {' - '}
                      {format(new Date(`${item.end_date}T00:00:00`), 'dd MMM yyyy')}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    <span className="mr-2 font-medium uppercase tracking-wide text-slate-400">{(item.availability_type || 'leave').replace('_', ' ')}</span>
                    {item.reason?.trim() || 'No reason provided'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="font-semibold text-slate-700 text-sm">Number of Duties</h2>
          </div>
          {!audit || audit.stats.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-400 text-center">No monthly duty data yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 text-left font-semibold">Staff</th>
                    <th className="px-3 py-2 text-center font-semibold">Working</th>
                    <th className="px-3 py-2 text-center font-semibold">Holiday</th>
                    <th className="px-3 py-2 text-center font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audit.stats.map(row => (
                    <tr key={row.staff.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-700">{row.staff.name}</td>
                      <td className="px-3 py-2 text-center text-emerald-600">{row.working_duties}</td>
                      <td className="px-3 py-2 text-center text-orange-500">{row.holiday_duties}</td>
                      <td className="px-3 py-2 text-center font-semibold">{row.total_duties}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Generation Notes</h2>
        </div>
        {monthNotes.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-400 text-center">No notes for this month.</div>
        ) : (
          <div>
            <div className="px-4 py-4 border-b border-slate-100 bg-white">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Compact Summary</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {summaryBuckets.length === 0 ? (
                  <div className="text-sm text-slate-500">No exceptional generation events in this month.</div>
                ) : (
                  summaryBuckets.map(bucket => (
                    <div key={bucket.key} className={clsx('rounded-xl border px-3 py-3', bucket.tone)}>
                      <div className="text-2xl font-black leading-none">{bucket.count}</div>
                      <div className="text-[11px] font-bold uppercase tracking-wider mt-1">{bucket.label}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {detailNotes.length === 0 ? (
                <div className="px-4 py-8 text-sm text-slate-400 text-center">No detailed exception notes for this month.</div>
              ) : (
                detailNotes.map((note: Remark) => (
                  <div key={note.id} className="px-4 py-3">
                    <div className="text-sm text-slate-700">{note.message}</div>
                    {note.date_ref && (
                      <div className="text-xs text-slate-400 mt-1">{format(new Date(`${note.date_ref}T00:00:00`), 'dd MMM yyyy')}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
