import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Sun, Briefcase, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { calendarApi, availabilityApi, staffApi, type CalendarEntry } from '../services/api'
import DateModal from '../components/calendar/DateModal'
import { staffLabel } from '../utils/staff'

export default function CalendarPage() {
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState<CalendarEntry | null>(null)
  const qc = useQueryClient()

  const year = current.getFullYear()
  const month = current.getMonth() + 1

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => calendarApi.list(year, month),
  })

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: staffApi.list })
  const { data: availability = [] } = useQuery({ queryKey: ['availability'], queryFn: availabilityApi.list })

  const entryMap = new Map(entries.map(e => [e.date, e]))

  // Build calendar grid
  const firstDay = startOfMonth(current)
  const lastDay = endOfMonth(current)
  const days = eachDayOfInterval({ start: firstDay, end: lastDay })
  const startPad = getDay(firstDay) // 0=Sun

  const dayType = (e?: CalendarEntry) => {
    if (!e) return 'empty'
    if (e.day_type === 'working') return 'working'
    if (e.day_type === 'holiday') return 'holiday'
    return 'weekend'
  }

  const cellClass = (e?: CalendarEntry) => {
    const dt = dayType(e)
    if (dt === 'working') return 'cal-working border-emerald-200'
    if (dt === 'holiday') return 'cal-holiday border-red-200'
    if (dt === 'weekend') return 'cal-weekend border-orange-200'
    return 'bg-slate-50'
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Monthly Calendar</h1>
          <p className="text-sm text-slate-500">Click any date to define working or non-working status and manage staff unavailability</p>
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

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" /> Working Day</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Weekend</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Holiday</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-slate-300 inline-block" /> No data</span>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">Loading calendar…</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          {/* Day names */}
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-xs font-semibold text-slate-500 text-center py-2">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {/* Padding cells */}
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="border-b border-r border-slate-100 min-h-[90px] bg-slate-50/40" />
            ))}
            {days.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const entry = entryMap.get(ds)
              const isToday = ds === format(new Date(), 'yyyy-MM-dd')
              return (
                <div
                  key={ds}
                  className={clsx(
                    'border-b border-r border-slate-100 min-h-[90px] p-1.5 cursor-pointer transition-all',
                    cellClass(entry),
                    isToday && 'ring-2 ring-inset ring-brand-400',
                  )}
                  onClick={() => entry && setSelected(entry)}
                >
                  <div className={clsx('text-sm font-semibold mb-1', isToday ? 'text-brand-700' : 'text-slate-700')}>
                    {format(day, 'd')}
                  </div>
                  {entry?.is_holiday && (
                    <div className="text-xs text-red-600 font-medium truncate">{entry.holiday_name || 'Holiday'}</div>
                  )}
                  {entry?.duty_staff && (
                    <div className="flex items-center gap-0.5 mt-1">
                      <Briefcase className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <span className="text-xs text-slate-600 truncate" title={entry.duty_staff.name}>{staffLabel(entry.duty_staff)}</span>
                    </div>
                  )}
                  {entry?.standby_staff && (
                    <div className="flex items-center gap-0.5">
                      <Sun className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className="text-xs text-slate-400 truncate" title={entry.standby_staff.name}>{staffLabel(entry.standby_staff)}</span>
                    </div>
                  )}
                  {entry && !entry.duty_staff && entry.status === 'pending' && (
                    <div className="text-xs text-slate-400 italic">Not assigned</div>
                  )}
                  {entry?.status === 'vacant' && (
                    <div className="text-xs text-rose-500 font-medium">Vacant</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <div className="text-2xl font-bold text-emerald-600">
            {entries.filter(e => e.day_type === 'working').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Working Days</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-orange-500">
            {entries.filter(e => e.day_type === 'weekend').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Weekends</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-500">
            {entries.filter(e => e.is_holiday).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Holidays</div>
        </div>
      </div>

      {/* Date Modal */}
      {selected && (
        <DateModal
          entry={selected}
          staff={staff}
          availability={availability}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: ['calendar', year, month] })
            qc.invalidateQueries({ queryKey: ['availability'] })
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
