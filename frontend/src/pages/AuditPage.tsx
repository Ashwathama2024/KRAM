import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { rosterApi, type AuditReport } from '../services/api'
import { currentMonthDate } from '../utils/date'
import { staffLabel } from '../utils/staff'
import clsx from 'clsx'

export default function AuditPage() {
  const [current, setCurrent] = useState(() => currentMonthDate())
  const year = current.getFullYear()
  const month = current.getMonth() + 1
  const isCurrentMonth = year === currentMonthDate().getFullYear() && month === currentMonthDate().getMonth() + 1

  const { data: report, isLoading, error } = useQuery<AuditReport>({
    queryKey: ['audit', year, month],
    queryFn: () => rosterApi.audit(year, month),
    retry: false,
  })

  const chartData = report?.stats.map(s => ({
    name: s.staff.abbreviation || s.staff.name,   // short label for X-axis
    fullName: s.staff.name,                        // full name shown in tooltip
    Working: s.working_duties,
    Holiday: s.holiday_duties,
    Total: s.total_duties,
  })) ?? []

  // Custom tooltip: shows abbreviation header + full name subtitle
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const full = chartData.find(d => d.name === label)?.fullName ?? label
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-xs">
        <p className="font-black text-slate-800 text-sm">{label}</p>
        {full !== label && <p className="text-slate-400 mb-2 text-[10px]">{full}</p>}
        {payload.map((entry: any) => (
          <div key={entry.dataKey} className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.fill }} />
            <span className="text-slate-500">{entry.dataKey}:</span>
            <span className="font-bold text-slate-800">{entry.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-brand-600" />
            Audit & Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">Fairness analysis and distribution statistics for duty assignments.</p>
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

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
             <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
             <span className="font-medium text-sm">Aggregating audit metrics...</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-rose-700 flex items-center gap-4">
          <AlertTriangle className="w-6 h-6" />
          <div className="text-sm font-medium">Failed to load audit metrics. Ensure the roster for this month has been initialized.</div>
        </div>
      )}

      {report && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { label: "Active Staff", value: report.stats.length, color: "text-brand-600", bg: "bg-brand-50" },
              { label: "Max Duties", value: report.max_duties, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Min Duties", value: report.min_duties, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "Variance", value: report.variance, color: report.imbalance_warning ? "text-rose-600" : "text-slate-600", bg: report.imbalance_warning ? "bg-rose-50" : "bg-slate-50" }
            ].map((stat, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className={clsx("text-3xl font-black tracking-tight mb-1", stat.color)}>{stat.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Imbalance Warning */}
          {report.imbalance_warning ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-4 text-rose-800 shadow-sm animate-in zoom-in-95 duration-300">
              <div className="bg-rose-100 p-2 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <div className="font-black uppercase tracking-tight text-lg mb-0.5">Imbalance Detected</div>
                <div className="text-sm font-medium opacity-80">The current duty variance ({report.variance}) exceeds the fairness threshold of 2. Consider manual swaps or healing.</div>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex items-start gap-4 text-emerald-800 shadow-sm animate-in zoom-in-95 duration-300">
              <div className="bg-emerald-100 p-2 rounded-xl">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="font-black uppercase tracking-tight text-lg mb-0.5">Fair Distribution</div>
                <div className="text-sm font-medium opacity-80">Assignments are mathematically balanced across the pool. Variance is within limits.</div>
              </div>
            </div>
          )}

          {/* Bar Chart */}
          {chartData.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="font-bold text-slate-800 text-sm mb-6 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand-500" /> Distribution visualizer
              </h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="Working" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                  <Bar dataKey="Holiday" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detailed Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 text-sm">Individual Metrics — {format(current, 'MMMM yyyy')}</h2>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{report.stats.length} Staff members</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    <th className="px-6 py-4 text-left">Staff Name</th>
                    <th className="px-6 py-4 text-center">Working</th>
                    <th className="px-6 py-4 text-center">Holiday</th>
                    <th className="px-6 py-4 text-center">Total Duties</th>
                    <th className="px-6 py-4 text-center">Duty Debt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.stats
                    .sort((a, b) => b.total_duties - a.total_duties)
                    .map(s => (
                      <tr key={s.staff.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-black tracking-tight">
                              {(s.staff.abbreviation || s.staff.name).slice(0, 3)}
                            </div>
                            <span className="font-bold text-slate-800">{s.staff.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
                            {s.working_duties}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-100">
                            {s.holiday_duties}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-black text-slate-900 text-base">{s.total_duties}</td>
                        <td className="px-6 py-4 text-center">
                          {s.staff.duty_debt > 0
                            ? <span className="text-rose-600 font-black px-2 py-0.5 bg-rose-50 rounded-md border border-rose-100">{s.staff.duty_debt}</span>
                            : <span className="text-slate-200">—</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
