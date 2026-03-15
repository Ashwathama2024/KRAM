import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { rosterApi, type AuditReport } from '../services/api'
import { staffLabel } from '../utils/staff'

export default function AuditPage() {
  const [current, setCurrent] = useState(new Date())
  const year = current.getFullYear()
  const month = current.getMonth() + 1

  const { data: report, isLoading, error } = useQuery<AuditReport>({
    queryKey: ['audit', year, month],
    queryFn: () => rosterApi.audit(year, month),
    retry: false,
  })

  const chartData = report?.stats.map(s => ({
    name: staffLabel(s.staff),
    Working: s.working_duties,
    Holiday: s.holiday_duties,
    Total: s.total_duties,
  })) ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Monthly Audit Report</h1>
          <p className="text-sm text-slate-500">Fairness analysis and duty distribution</p>
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

      {isLoading && <div className="text-center py-16 text-slate-400">Loading audit data…</div>}

      {error && (
        <div className="card bg-red-50 border border-red-100 text-red-700 text-sm">
          Failed to load audit. Make sure the roster has been generated for this month.
        </div>
      )}

      {report && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card text-center">
              <div className="text-2xl font-bold text-brand-600">{report.stats.length}</div>
              <div className="text-xs text-slate-500 mt-1">Staff Members</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-emerald-600">{report.max_duties}</div>
              <div className="text-xs text-slate-500 mt-1">Max Duties</div>
            </div>
            <div className="card text-center">
              <div className="text-2xl font-bold text-orange-500">{report.min_duties}</div>
              <div className="text-xs text-slate-500 mt-1">Min Duties</div>
            </div>
            <div className={`card text-center ${report.imbalance_warning ? 'bg-red-50 border-red-100' : ''}`}>
              <div className={`text-2xl font-bold ${report.imbalance_warning ? 'text-red-600' : 'text-slate-600'}`}>
                {report.variance}
              </div>
              <div className="text-xs text-slate-500 mt-1">Variance</div>
            </div>
          </div>

          {/* Imbalance Warning */}
          {report.imbalance_warning ? (
            <div className="card bg-red-50 border-red-200 flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div>
                <div className="font-semibold">Imbalance Warning</div>
                <div className="text-sm">Duty variance is {report.variance} (threshold: 2). Review staff assignments.</div>
              </div>
            </div>
          ) : (
            <div className="card bg-emerald-50 border-emerald-200 flex items-center gap-3 text-emerald-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <div className="font-semibold">Fair Distribution</div>
                <div className="text-sm">Duty variance is within acceptable range (≤ 2).</div>
              </div>
            </div>
          )}

          {/* Bar Chart */}
          {chartData.length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Duty Distribution Chart
              </h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Working" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Holiday" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detailed Table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b">
              <h2 className="font-semibold text-slate-700 text-sm">Staff Duty Breakdown — {format(current, 'MMMM yyyy')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                    <th className="px-4 py-2 text-left">Staff</th>
                    <th className="px-4 py-2 text-center">Working Duties</th>
                    <th className="px-4 py-2 text-center">Holiday Duties</th>
                    <th className="px-4 py-2 text-center">Total</th>
                    <th className="px-4 py-2 text-center">Duty Debt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.stats
                    .sort((a, b) => b.total_duties - a.total_duties)
                    .map(s => (
                      <tr key={s.staff.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
                              {staffLabel(s.staff)[0]}
                            </div>
                            <span className="font-medium" title={s.staff.name}>{staffLabel(s.staff)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            {s.working_duties}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                            {s.holiday_duties}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center font-bold text-slate-700">{s.total_duties}</td>
                        <td className="px-4 py-2 text-center">
                          {s.staff.duty_debt > 0
                            ? <span className="text-orange-600 font-medium">{s.staff.duty_debt}</span>
                            : <span className="text-slate-300">—</span>}
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
