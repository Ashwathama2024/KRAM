import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addMonths, subMonths, endOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, RefreshCw, Download, FileText, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { rosterApi, calendarApi, availabilityApi, type CalendarEntry, type Remark } from '../services/api'
import { staffLabel } from '../utils/staff'

export default function RosterPage() {
  const [current, setCurrent] = useState(new Date())
  const [firstSwapDate, setFirstSwapDate] = useState('')
  const [secondSwapDate, setSecondSwapDate] = useState('')
  const [swapReason, setSwapReason] = useState('')
  const qc = useQueryClient()
  const year = current.getFullYear()
  const month = current.getMonth() + 1

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
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to swap duties'),
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Roster Generator</h1>
          <p className="text-sm text-slate-500">Generate and manage duty assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrent(subMonths(current, 1))} className="btn-secondary p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold text-slate-700 min-w-[140px] text-center">
            {format(current, 'MMMM yyyy')}
          </span>
          <button onClick={() => setCurrent(addMonths(current, 1))} className="btn-secondary p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Logic Controls</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => generateMut.mutate(false)} disabled={generateMut.isPending} className="btn-primary">
            <Zap className="w-4 h-4" />
            {generateMut.isPending ? 'Generating...' : 'Sync & Generate Roster'}
          </button>
          <button onClick={() => generateMut.mutate(true)} disabled={generateMut.isPending} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Force Regenerate
          </button>
          <button onClick={() => healMut.mutate()} disabled={healMut.isPending} className="btn-success">
            <RefreshCw className="w-4 h-4" />
            {healMut.isPending ? 'Healing...' : 'Auto-Heal Roster'}
          </button>
          <a href={rosterApi.exportCsv(year, month)} className="btn-secondary" download>
            <Download className="w-4 h-4" /> Export CSV
          </a>
          <a href={rosterApi.exportPdf(year, month)} className="btn-secondary" download>
            <FileText className="w-4 h-4" /> Export PDF
          </a>
          <button onClick={() => window.print()} className="btn-secondary">
            <FileText className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-brand-600">{entries.length}</div>
          <div className="text-xs text-slate-500 mt-1">Total Days</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-emerald-600">{assigned}</div>
          <div className="text-xs text-slate-500 mt-1">Assigned</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-500">{vacant}</div>
          <div className="text-xs text-slate-500 mt-1">Vacant</div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Duty Roster - {format(current, 'MMMM yyyy')}</h2>
        </div>
        {isLoading ? (
          <div className="text-center py-10 text-slate-400">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 text-slate-400">No roster data. Click "Sync & Generate Roster" to start.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Day</th>
                  <th className="px-3 py-2 text-left font-semibold">Type</th>
                  <th className="px-3 py-2 text-left font-semibold">Duty</th>
                  <th className="px-3 py-2 text-left font-semibold">Standby</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(e => (
                  <tr
                    key={e.id}
                    className={clsx(
                      'transition-colors',
                      e.day_type === 'working' ? 'hover:bg-emerald-50' :
                      e.day_type === 'holiday' ? 'hover:bg-red-50' : 'hover:bg-orange-50',
                    )}
                  >
                    <td className="px-3 py-2 font-medium text-slate-700">{format(new Date(`${e.date}T00:00:00`), 'dd MMM')}</td>
                    <td className="px-3 py-2 text-slate-500">{format(new Date(`${e.date}T00:00:00`), 'EEE')}</td>
                    <td className="px-3 py-2">{dayTypeBadge(e)}</td>
                    <td className="px-3 py-2 font-medium" title={e.duty_staff?.name}>{e.duty_staff ? staffLabel(e.duty_staff) : <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2 text-slate-500" title={e.standby_staff?.name}>{e.standby_staff ? staffLabel(e.standby_staff) : <span className="text-slate-300">-</span>}</td>
                    <td className="px-3 py-2">{statusBadge(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Manual Swap</h2>
          <p className="text-xs text-slate-500 mt-1">Swap two already assigned dates mid-month and record the reason for transparency.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="input" value={firstSwapDate} onChange={e => setFirstSwapDate(e.target.value)}>
            <option value="">First date</option>
            {entries.filter(e => e.assigned_duty_id).map(e => (
              <option key={`first-${e.date}`} value={e.date}>{format(new Date(`${e.date}T00:00:00`), 'dd MMM yyyy')} - {e.duty_staff ? staffLabel(e.duty_staff) : ''}</option>
            ))}
          </select>
          <select className="input" value={secondSwapDate} onChange={e => setSecondSwapDate(e.target.value)}>
            <option value="">Second date</option>
            {entries.filter(e => e.assigned_duty_id && e.date !== firstSwapDate).map(e => (
              <option key={`second-${e.date}`} value={e.date}>{format(new Date(`${e.date}T00:00:00`), 'dd MMM yyyy')} - {e.duty_staff ? staffLabel(e.duty_staff) : ''}</option>
            ))}
          </select>
          <input className="input" placeholder="Reason for swap" value={swapReason} onChange={e => setSwapReason(e.target.value)} />
        </div>
        <button onClick={() => swapMut.mutate()} disabled={!firstSwapDate || !secondSwapDate || swapMut.isPending} className="btn-secondary">
          {swapMut.isPending ? 'Swapping...' : 'Swap Duties'}
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
                      <td className="px-3 py-2 font-medium text-slate-700" title={row.staff.name}>{staffLabel(row.staff)}</td>
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
          <div className="divide-y divide-slate-100">
            {monthNotes.map((note: Remark) => (
              <div key={note.id} className="px-4 py-3">
                <div className="text-sm text-slate-700">{note.message}</div>
                {note.date_ref && (
                  <div className="text-xs text-slate-400 mt-1">{format(new Date(`${note.date_ref}T00:00:00`), 'dd MMM yyyy')}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
