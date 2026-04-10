import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Sun, Briefcase, Calendar as CalendarIcon, Info, RefreshCw, Users, Printer } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { calendarApi, availabilityApi, staffApi, type CalendarEntry } from '../services/api'
import DateModal from '../components/calendar/DateModal'
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

export default function CalendarPage() {
  const [current, setCurrent] = useState(() => currentMonthDate())
  const [selected, setSelected] = useState<CalendarEntry | null>(null)
  const qc = useQueryClient()

  const year = current.getFullYear()
  const month = current.getMonth() + 1
  const isCurrentMonth = year === currentMonthDate().getFullYear() && month === currentMonthDate().getMonth() + 1

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => calendarApi.list(year, month),
  })

  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: staffApi.list })
  const { data: availability = [] } = useQuery({ queryKey: ['availability'], queryFn: availabilityApi.list })

  const activeStaff = staff.filter(s => s.active)

  const entryMap = new Map(entries.map(e => [e.date, e]))

  // Build calendar grid
  const firstDay = startOfMonth(current)
  const lastDay = endOfMonth(current)
  const days = eachDayOfInterval({ start: firstDay, end: lastDay })
  const startPad = getDay(firstDay)

  // A weekend-day (Sat/Sun) that was manually converted to working = "modified"
  const isModifiedDay = (day: Date, e?: CalendarEntry) => {
    const dow = getDay(day)
    return (dow === 0 || dow === 6) && e?.day_type === 'working' && !e?.is_holiday
  }

  const dayKind = (day: Date, e?: CalendarEntry) => {
    if (!e) return 'empty'
    if (e.is_holiday) return 'holiday'
    if (isModifiedDay(day, e)) return 'modified'
    if (e.day_type === 'working') return 'working'
    return 'weekend'
  }

  // Strong, clearly distinct cell colours
  const cellClass = (day: Date, e?: CalendarEntry) => {
    const dk = dayKind(day, e)
    if (dk === 'working')  return 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
    if (dk === 'holiday')  return 'bg-rose-100   hover:bg-rose-200   border-rose-400'
    if (dk === 'weekend')  return 'bg-amber-50   hover:bg-amber-100  border-amber-200'
    if (dk === 'modified') return 'bg-violet-50  hover:bg-violet-100 border-violet-300'
    return 'bg-slate-50 border-slate-100'
  }

  const workingCount  = entries.filter(e => e.day_type === 'working' && !e.is_holiday).length
  const weekendCount  = entries.filter(e => e.day_type === 'weekend').length
  const holidayCount  = entries.filter(e => e.is_holiday).length

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <CalendarIcon className="w-6 h-6 text-brand-600" />
            Duty Calendar
          </h1>
          <p className="text-sm text-slate-500 mt-1">Configure daily types and manage individual availability windows.</p>
        </div>
        <div className="flex items-center gap-2 self-start flex-wrap">
          {/* Month navigator */}
          <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1.5">
            <button
              onClick={() => setCurrent(subMonths(current, 1))}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-slate-800 min-w-[140px] text-center uppercase tracking-wider">
              {format(current, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => setCurrent(addMonths(current, 1))}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
            >
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
          {/* Export / Print */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => triggerDownload(`/api/calendar/export/pdf?year=${year}&month=${month}`, `KRAM-Calendar-${year}-${String(month).padStart(2,'0')}.pdf`)}
              title="Print / Save as PDF"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all no-print"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Legend bar */}
      <div className="flex flex-wrap items-center gap-5 py-3 px-5 bg-white rounded-xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-700">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-emerald-200 border border-emerald-400 inline-block" />
          <span className="text-emerald-800">Working Day</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-amber-200 border border-amber-400 inline-block" />
          <span className="text-amber-800">Sunday Routine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-rose-300 border border-rose-500 inline-block" />
          <span className="text-rose-800">Public Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-violet-200 border border-violet-400 inline-block" />
          <span className="text-violet-800">Modified Normal Routine</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded bg-brand-100 border-2 border-brand-500 inline-block" />
          <span className="text-brand-700">Today</span>
        </div>
        <div className="ml-auto hidden lg:flex items-center gap-2 text-slate-400 font-normal italic">
          <Info className="w-3.5 h-3.5" />
          <span>Click any cell to edit details</span>
        </div>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-400" />
          <span className="font-medium">Synchronizing calendar data...</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Day names */}
          <div className="grid grid-cols-7 bg-slate-100 border-b border-slate-300">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-[10px] font-bold text-slate-500 text-center py-3 uppercase tracking-widest">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="border-b border-r border-slate-100 min-h-[110px] bg-slate-50/60" />
            ))}
            {days.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const entry = entryMap.get(ds)
              const isToday = ds === format(new Date(), 'yyyy-MM-dd')
              const dk = dayKind(day, entry)
              return (
                <div
                  key={ds}
                  className={clsx(
                    'border-b border-r min-h-[110px] p-3 cursor-pointer transition-all relative group calendar-print-cell',
                    cellClass(day, entry),
                    isToday && 'ring-2 ring-inset ring-brand-500 bg-brand-50',
                  )}
                  onClick={() => entry && setSelected(entry)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={clsx(
                      'text-sm font-bold w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
                      isToday
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-200'
                        : dk === 'working'  ? 'text-emerald-800'
                        : dk === 'holiday'  ? 'text-rose-900'
                        : dk === 'weekend'  ? 'text-amber-800'
                        : dk === 'modified' ? 'text-violet-800'
                        : 'text-slate-600'
                    )}>
                      {format(day, 'd')}
                    </span>
                    {dk === 'holiday' && (
                      <div className="bg-rose-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter leading-tight text-center">
                        Public<br/>Holiday
                      </div>
                    )}
                    {dk === 'weekend' && (
                      <div className="bg-amber-400 text-amber-900 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter leading-tight text-center">
                        Sunday<br/>Routine
                      </div>
                    )}
                    {dk === 'modified' && (
                      <div className="bg-violet-500 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter leading-tight text-center">
                        Modified<br/>Normal Routine
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {entry?.is_holiday && (
                      <div className="text-[11px] text-rose-700 font-bold truncate leading-tight mb-1">
                        {entry.holiday_name || 'Public Holiday'}
                      </div>
                    )}

                    {entry?.duty_staff && (
                      <div className="flex items-center gap-1.5 bg-white/80 p-1 rounded border border-slate-200/60 shadow-sm backdrop-blur-[1px]">
                        <Briefcase className="w-3 h-3 text-brand-500 shrink-0" />
                        <span className="text-[11px] text-slate-800 font-bold truncate" title={entry.duty_staff.name}>
                          {staffLabel(entry.duty_staff)}
                        </span>
                      </div>
                    )}

                    {entry?.standby_staff && (
                      <div className="flex items-center gap-1.5 bg-white/60 p-1 rounded border border-slate-200/40">
                        <Sun className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="text-[10px] text-slate-600 font-semibold truncate" title={entry.standby_staff.name}>
                          {staffLabel(entry.standby_staff)}
                        </span>
                      </div>
                    )}

                    {entry && !entry.duty_staff && entry.status === 'pending' && (
                      <div className="text-[10px] text-slate-400 font-medium italic mt-1">Pending Sync</div>
                    )}

                    {entry?.status === 'vacant' && (
                      <div className="flex items-center gap-1 text-[10px] text-rose-700 font-bold bg-rose-100 px-1.5 py-0.5 rounded border border-rose-300 mt-1">
                        <span className="w-1 h-1 rounded-full bg-rose-600" />
                        Vacant
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats / Working Days Placard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Working Days */}
        <div className="flex items-center gap-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 shadow-sm">
          <div className="p-3 rounded-xl bg-emerald-200 border border-emerald-400">
            <Briefcase className="w-6 h-6 text-emerald-800" />
          </div>
          <div>
            <div className="text-3xl font-black tracking-tight text-emerald-900">{workingCount}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-700 mt-0.5">Working Days</div>
          </div>
        </div>

        {/* Weekends */}
        <div className="flex items-center gap-4 bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm">
          <div className="p-3 rounded-xl bg-amber-200 border border-amber-400">
            <CalendarIcon className="w-6 h-6 text-amber-800" />
          </div>
          <div>
            <div className="text-3xl font-black tracking-tight text-amber-900">{weekendCount}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-amber-700 mt-0.5">Weekends (Closed)</div>
          </div>
        </div>

        {/* Holidays */}
        <div className="flex items-center gap-4 bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 shadow-sm">
          <div className="p-3 rounded-xl bg-rose-200 border border-rose-400">
            <Info className="w-6 h-6 text-rose-800" />
          </div>
          <div>
            <div className="text-3xl font-black tracking-tight text-rose-900">{holidayCount}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-rose-700 mt-0.5">Public Holidays</div>
          </div>
        </div>
      </div>

      {/* Staff Abbreviation Legend — fetched dynamically from DB */}
      {activeStaff.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 pb-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-brand-500" />
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Staff Reference</h2>
            <span className="ml-auto text-xs text-slate-400 italic">{activeStaff.length} active</span>
          </div>
          {/* Table layout — abbreviation pinned left, full name wraps freely */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeStaff.map(s => (
              <div
                key={s.id}
                className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 hover:border-brand-300 hover:bg-brand-50 transition-colors group"
              >
                <span className="shrink-0 w-12 text-center text-sm font-black text-brand-700 bg-brand-100 border border-brand-200 rounded-lg px-1 py-0.5 group-hover:bg-brand-200 transition-colors font-mono tracking-wider mt-0.5">
                  {s.abbreviation || s.name.slice(0, 3).toUpperCase()}
                </span>
                <span className="text-xs text-slate-700 font-semibold leading-snug break-words min-w-0">
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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
