import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, Sun, Briefcase, Calendar as CalendarIcon, Info, RefreshCw } from 'lucide-react'
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
  const startPad = getDay(firstDay)

  const dayType = (e?: CalendarEntry) => {
    if (!e) return 'empty'
    if (e.day_type === 'working') return 'working'
    if (e.day_type === 'holiday') return 'holiday'
    return 'weekend'
  }

  const cellClass = (e?: CalendarEntry) => {
    const dt = dayType(e)
    if (dt === 'working') return 'bg-emerald-50/40 hover:bg-emerald-100/60 border-emerald-100/50'
    if (dt === 'holiday') return 'bg-rose-50/40 hover:bg-rose-100/60 border-rose-100/50'
    if (dt === 'weekend') return 'bg-amber-50/40 hover:bg-amber-100/60 border-amber-100/50'
    return 'bg-slate-50'
  }

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
        <div className="flex items-center bg-white rounded-xl shadow-sm border border-slate-200 p-1.5 self-start">
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
        </div>
      </div>

      {/* Legend & Quick Stats */}
      <div className="flex flex-wrap items-center gap-6 py-3 px-5 bg-white rounded-xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-600">
        <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 ring-4 ring-emerald-50" />
            <span>Working Day</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400 ring-4 ring-amber-50" />
            <span>Weekend</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-400 ring-4 ring-rose-50" />
            <span>Public Holiday</span>
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
          <div className="grid grid-cols-7 bg-slate-50/80 border-b border-slate-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-[10px] font-bold text-slate-400 text-center py-3 uppercase tracking-widest">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} className="border-b border-r border-slate-100 min-h-[110px] bg-slate-50/40" />
            ))}
            {days.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const entry = entryMap.get(ds)
              const isToday = ds === format(new Date(), 'yyyy-MM-dd')
              return (
                <div
                  key={ds}
                  className={clsx(
                    'border-b border-r border-slate-100 min-h-[110px] p-3 cursor-pointer transition-all relative group',
                    cellClass(entry),
                    isToday && 'bg-brand-50/50 shadow-[inset_0_0_0_2px_rgba(37,99,235,0.2)]',
                  )}
                  onClick={() => entry && setSelected(entry)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={clsx(
                        'text-sm font-bold w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
                        isToday ? 'bg-brand-600 text-white shadow-md shadow-brand-200' : 'text-slate-700 group-hover:bg-slate-200/50'
                    )}>
                        {format(day, 'd')}
                    </span>
                    {entry?.is_holiday && (
                        <div className="bg-rose-100 text-[10px] text-rose-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter animate-pulse">
                            Holiday
                        </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {entry?.is_holiday && (
                        <div className="text-[11px] text-rose-600 font-bold truncate leading-tight mb-1">
                            {entry.holiday_name || 'Public Holiday'}
                        </div>
                    )}
                    
                    {entry?.duty_staff && (
                        <div className="flex items-center gap-1.5 bg-white/60 p-1 rounded border border-slate-200/40 shadow-sm backdrop-blur-[1px]">
                            <Briefcase className="w-3 h-3 text-brand-500" />
                            <span className="text-[11px] text-slate-800 font-bold truncate" title={entry.duty_staff.name}>
                                {staffLabel(entry.duty_staff)}
                            </span>
                        </div>
                    )}
                    
                    {entry?.standby_staff && (
                        <div className="flex items-center gap-1.5 bg-white/30 p-1 rounded border border-slate-200/30">
                            <Sun className="w-3 h-3 text-amber-500" />
                            <span className="text-[10px] text-slate-500 font-semibold truncate" title={entry.standby_staff.name}>
                                {staffLabel(entry.standby_staff)}
                            </span>
                        </div>
                    )}

                    {entry && !entry.duty_staff && entry.status === 'pending' && (
                        <div className="text-[10px] text-slate-400 font-medium italic mt-1">Pending Sync</div>
                    )}
                    
                    {entry?.status === 'vacant' && (
                        <div className="flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 mt-1">
                            <span className="w-1 h-1 rounded-full bg-rose-500" />
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

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pb-8">
        {[
          { label: "Working Days", value: entries.filter(e => e.day_type === 'working').length, color: "text-emerald-600", icon: Briefcase, bg: "bg-emerald-50" },
          { label: "Weekends", value: entries.filter(e => e.day_type === 'weekend').length, color: "text-amber-600", icon: CalendarIcon, bg: "bg-amber-50" },
          { label: "Public Holidays", value: entries.filter(e => e.is_holiday).length, color: "text-rose-600", icon: Info, bg: "bg-rose-50" }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-brand-200 transition-all hover:shadow-md">
            <div>
              <div className="text-3xl font-black tracking-tight text-slate-900 mb-1">{stat.value}</div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500">{stat.label}</div>
            </div>
            <div className={clsx("p-3 rounded-xl transition-colors", stat.bg)}>
               <stat.icon className={clsx("w-6 h-6", stat.color)} />
            </div>
          </div>
        ))}
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
