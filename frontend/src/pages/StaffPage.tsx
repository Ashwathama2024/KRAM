import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Trash2, ToggleLeft, ToggleRight, Users, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { staffApi, availabilityApi, type Staff } from '../services/api'
import { staffLabel } from '../utils/staff'

export default function StaffPage() {
  const [newName, setNewName] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [relieveDate, setRelieveDate] = useState('')
  const [showAvail, setShowAvail] = useState<number | null>(null)
  const [serviceWindow, setServiceWindow] = useState<Record<number, { join_date: string; relieve_date: string }>>({})
  const qc = useQueryClient()

  const { data: staff = [], isLoading } = useQuery({ queryKey: ['staff'], queryFn: staffApi.list })
  const { data: availability = [] } = useQuery({ queryKey: ['availability'], queryFn: availabilityApi.list })

  const createMut = useMutation({
    mutationFn: () => staffApi.create({
      name: newName.trim(),
      join_date: joinDate || undefined,
      relieve_date: relieveDate || undefined,
    }),
    onSuccess: () => {
      toast.success('Staff added')
      setNewName('')
      setJoinDate('')
      setRelieveDate('')
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to add staff'),
  })

  const toggleMut = useMutation({
    mutationFn: (s: Staff) => staffApi.update(s.id, { active: !s.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => staffApi.delete(id),
    onSuccess: () => {
      toast.success('Staff removed')
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: () => toast.error('Failed to delete'),
  })

  const deleteAvailMut = useMutation({
    mutationFn: (id: number) => availabilityApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability'] }),
  })

  const updateServiceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { join_date?: string; relieve_date?: string } }) =>
      staffApi.update(id, data),
    onSuccess: () => {
      toast.success('Service window updated')
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: () => toast.error('Failed to update service window'),
  })

  const staffAvail = (sid: number) => availability.filter(a => a.staff_id === sid)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Staff Management</h1>
        <p className="text-sm text-slate-500">Add, remove, and manage staff members and their unavailability</p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add Staff Member
        </h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Name / Rank / Number"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newName.trim() && createMut.mutate()}
          />
          <button
            onClick={() => createMut.mutate()}
            disabled={!newName.trim() || createMut.isPending}
            className="btn-primary"
          >
            Add
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Join date (optional)</span>
            <input type="date" className="input" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-500">Relieve date (optional)</span>
            <input type="date" className="input" value={relieveDate} onChange={e => setRelieveDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Users className="w-4 h-4" /> Staff Members ({staff.length})
          </h2>
        </div>
        {isLoading ? (
          <div className="text-center py-10 text-slate-400">Loading...</div>
        ) : staff.length === 0 ? (
          <div className="text-center py-10 text-slate-400">No staff members yet. Add some above.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {staff.map(s => (
              <div key={s.id}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${s.active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'}`}>
                      {staffLabel(s).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className={`font-medium ${s.active ? 'text-slate-800' : 'text-slate-400 line-through'}`} title={s.name}>
                        {staffLabel(s)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{s.name}</div>
                      <div className="text-xs text-slate-400 flex gap-3 mt-0.5">
                        <span>W: {s.total_working_duties}</span>
                        <span>H: {s.total_holiday_duties}</span>
                        {s.duty_debt > 0 && <span className="text-orange-500">Debt: {s.duty_debt}</span>}
                      </div>
                      {(s.join_date || s.relieve_date) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {s.join_date ? `From ${format(new Date(`${s.join_date}T00:00:00`), 'dd MMM yyyy')}` : 'From start'}
                          {s.relieve_date ? ` • Until ${format(new Date(`${s.relieve_date}T00:00:00`), 'dd MMM yyyy')}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAvail(showAvail === s.id ? null : s.id)}
                      className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{staffAvail(s.id).length}</span>
                    </button>
                    <button onClick={() => toggleMut.mutate(s)} className={s.active ? 'text-emerald-500 hover:text-emerald-700' : 'text-slate-300 hover:text-slate-500'}>
                      {s.active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${s.name} (${staffLabel(s)})?`)) deleteMut.mutate(s.id)
                      }}
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {showAvail === s.id && (
                  <div className="px-4 pb-3 bg-orange-50 border-t border-orange-100">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-3">
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-500">Join date</span>
                        <input
                          type="date"
                          className="input bg-white"
                          value={(serviceWindow[s.id]?.join_date ?? s.join_date ?? '')}
                          onChange={e => setServiceWindow(current => ({
                            ...current,
                            [s.id]: {
                              join_date: e.target.value,
                              relieve_date: current[s.id]?.relieve_date ?? s.relieve_date ?? '',
                            },
                          }))}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-semibold text-slate-500">Relieve date</span>
                        <input
                          type="date"
                          className="input bg-white"
                          value={(serviceWindow[s.id]?.relieve_date ?? s.relieve_date ?? '')}
                          onChange={e => setServiceWindow(current => ({
                            ...current,
                            [s.id]: {
                              join_date: current[s.id]?.join_date ?? s.join_date ?? '',
                              relieve_date: e.target.value,
                            },
                          }))}
                        />
                      </label>
                    </div>
                    <div className="mt-2">
                      <button
                        onClick={() => updateServiceMut.mutate({
                          id: s.id,
                          data: {
                            join_date: serviceWindow[s.id]?.join_date || undefined,
                            relieve_date: serviceWindow[s.id]?.relieve_date || undefined,
                          },
                        })}
                        className="btn-secondary"
                        disabled={updateServiceMut.isPending}
                      >
                        Save Service Window
                      </button>
                    </div>
                    <div className="text-xs font-semibold text-orange-700 mt-2 mb-1.5">Unavailability Records</div>
                    {staffAvail(s.id).length === 0 ? (
                      <p className="text-xs text-slate-400">No unavailability records</p>
                    ) : (
                      <ul className="space-y-1">
                        {staffAvail(s.id).map(a => (
                          <li key={a.id} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1.5 border border-orange-100">
                            <span className="text-slate-700">
                              <span className="font-medium capitalize">{(a.availability_type || 'leave').replace('_', ' ')}</span>
                              <span className="mx-1">•</span>
                              {format(new Date(a.start_date + 'T00:00:00'), 'dd MMM')}
                              {a.start_date !== a.end_date && ` → ${format(new Date(a.end_date + 'T00:00:00'), 'dd MMM')}`}
                              {a.reason && <span className="text-slate-400 ml-2">— {a.reason}</span>}
                            </span>
                            <button onClick={() => deleteAvailMut.mutate(a.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Duty Counters</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-center">Working</th>
                <th className="px-4 py-2 text-center">Holiday</th>
                <th className="px-4 py-2 text-center">Total</th>
                <th className="px-4 py-2 text-center">Debt</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{staffLabel(s)}</td>
                  <td className="px-4 py-2 text-slate-500">{s.name}</td>
                  <td className="px-4 py-2 text-center text-emerald-600">{s.total_working_duties}</td>
                  <td className="px-4 py-2 text-center text-orange-500">{s.total_holiday_duties}</td>
                  <td className="px-4 py-2 text-center font-semibold">{s.total_working_duties + s.total_holiday_duties}</td>
                  <td className="px-4 py-2 text-center">{s.duty_debt > 0 ? <span className="text-orange-600 font-medium">{s.duty_debt}</span> : <span className="text-slate-300">0</span>}</td>
                  <td className="px-4 py-2 text-center">
                    {s.active ? <span className="badge-working">Active</span> : <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">Inactive</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
