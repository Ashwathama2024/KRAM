import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Trash2, ToggleLeft, ToggleRight, Users, Calendar, Briefcase, Pencil, X, Check } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { staffApi, availabilityApi, apiError, type Staff } from '../services/api'
import { staffLabel } from '../utils/staff'

/** Split a stored name string back into rank / name / service-number parts. */
function parseName(full: string): { rank: string; name: string; number: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { rank: '', name: full, number: '' }

  // Last token looks like a service number if it contains a digit
  const last = parts[parts.length - 1]
  const hasNum = /\d/.test(last)

  if (hasNum && parts.length > 1) {
    const rest = parts.slice(0, -1)
    // First token is a rank if it has brackets/dots or is all-caps
    const first = rest[0]
    const looksLikeRank = /[()./]/.test(first) || first === first.toUpperCase()
    if (looksLikeRank && rest.length > 1) {
      return { rank: rest[0], name: rest.slice(1).join(' '), number: last }
    }
    return { rank: '', name: rest.join(' '), number: last }
  }
  return { rank: '', name: full, number: '' }
}

export default function StaffPage() {
  const [newRank, setNewRank] = useState('')
  const [newName, setNewName] = useState('')
  const [newNumber, setNewNumber] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [relieveDate, setRelieveDate] = useState('')
  const [showAvail, setShowAvail] = useState<number | null>(null)
  const [serviceWindow, setServiceWindow] = useState<Record<number, { join_date: string; relieve_date: string }>>({})

  // Inline-edit state
  const [editId, setEditId] = useState<number | null>(null)
  const [editRank, setEditRank] = useState('')
  const [editName, setEditName] = useState('')
  const [editNumber, setEditNumber] = useState('')
  const editComposed = () => [editRank.trim(), editName.trim(), editNumber.trim()].filter(Boolean).join(' ')

  const qc = useQueryClient()

  const { data: staff = [], isLoading } = useQuery({ queryKey: ['staff'], queryFn: staffApi.list })
  const { data: availability = [] } = useQuery({ queryKey: ['availability'], queryFn: availabilityApi.list })

  const composedName = () =>
    [newRank.trim(), newName.trim(), newNumber.trim()].filter(Boolean).join(' ')

  const createMut = useMutation({
    mutationFn: () => staffApi.create({
      name: composedName(),
      join_date: joinDate || undefined,
      relieve_date: relieveDate || undefined,
    }),
    onSuccess: () => {
      toast.success('Staff added')
      setNewRank('')
      setNewName('')
      setNewNumber('')
      setJoinDate('')
      setRelieveDate('')
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (e: unknown) => toast.error(apiError(e, 'Failed to add staff')),
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

  const updateNameMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => staffApi.update(id, { name }),
    onSuccess: () => {
      toast.success('Name updated')
      setEditId(null)
      qc.invalidateQueries({ queryKey: ['staff'] })
      qc.invalidateQueries({ queryKey: ['calendar'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
    onError: (e: unknown) => toast.error(apiError(e, 'Failed to update name')),
  })

  const openEdit = (s: Staff) => {
    const parsed = parseName(s.name)
    setEditRank(parsed.rank)
    setEditName(parsed.name)
    setEditNumber(parsed.number)
    setEditId(s.id)
    setShowAvail(null)   // close availability panel if open
  }

  const staffAvail = (sid: number) => availability.filter(a => a.staff_id === sid)

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-brand-600" />
            Staff Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">Manage personnel records, service windows, and unavailability.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Add New Staff Member
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Rank</span>
            <input
              className="input rounded-xl border-slate-200 w-full"
              placeholder="Rank"
              value={newRank}
              onChange={e => setNewRank(e.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Name <span className="text-rose-500">*</span></span>
            <input
              className="input rounded-xl border-slate-200 w-full"
              placeholder="Full name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newName.trim() && createMut.mutate()}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Service Number</span>
            <input
              className="input rounded-xl border-slate-200 w-full"
              placeholder="Service Number"
              value={newNumber}
              onChange={e => setNewNumber(e.target.value)}
            />
          </label>
        </div>
        {newName.trim() && (
          <div className="text-xs text-slate-400 px-1">
            Full record: <span className="font-semibold text-slate-600">{composedName()}</span>
            {' '}&mdash; abbreviation auto-derived from name
          </div>
        )}
        <button
          onClick={() => createMut.mutate()}
          disabled={!newName.trim() || createMut.isPending}
          className="btn-primary px-8 rounded-xl w-full sm:w-auto"
        >
          {createMut.isPending ? 'Adding...' : 'Add Staff'}
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500 ml-1">Reporting Date</span>
            <input type="date" className="input rounded-xl border-slate-200" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500 ml-1">Relieve Date (Optional)</span>
            <input type="date" className="input rounded-xl border-slate-200" value={relieveDate} onChange={e => setRelieveDate(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" /> Active Roster Pool ({staff.filter(s => s.active).length})
          </h2>
        </div>
        {isLoading ? (
          <div className="text-center py-20 text-slate-400">Synchronizing staff data...</div>
        ) : staff.length === 0 ? (
          <div className="text-center py-20 text-slate-400 font-medium">No staff members registered.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {staff.map(s => (
              <div key={s.id} className="group">
                <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                        "w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm transition-all shadow-sm",
                        s.active ? "bg-brand-600 text-white shadow-brand-100" : "bg-slate-100 text-slate-400"
                    )}>
                      {staffLabel(s).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={clsx("font-bold text-base", s.active ? "text-slate-900" : "text-slate-400 line-through")}>
                            {staffLabel(s)}
                        </div>
                        {!s.active && <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Inactive</span>}
                      </div>
                      <div className="text-xs text-slate-400 font-medium">{s.name}</div>
                      <div className="flex items-center gap-4 mt-1.5">
                         <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                             <Briefcase className="w-3 h-3 text-emerald-500" />
                             <span>W: {s.total_working_duties}</span>
                         </div>
                         <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                             <Calendar className="w-3 h-3 text-amber-500" />
                             <span>H: {s.total_holiday_duties}</span>
                         </div>
                         {s.duty_debt > 0 && (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                <span>Debt: {s.duty_debt}</span>
                            </div>
                         )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        if (editId === s.id) { setEditId(null) } else { openEdit(s) }
                      }}
                      title="Edit name / rank / number"
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                        editId === s.id
                          ? 'bg-brand-50 text-brand-700 border border-brand-100'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      )}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      onClick={() => { setShowAvail(showAvail === s.id ? null : s.id); setEditId(null) }}
                      className={clsx(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          showAvail === s.id ? "bg-brand-50 text-brand-700 border border-brand-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <Calendar className="w-4 h-4" />
                      <span>{staffAvail(s.id).length} records</span>
                    </button>
                    <div className="w-px h-6 bg-slate-200 mx-1" />
                    <button onClick={() => toggleMut.mutate(s)} className={clsx("transition-colors", s.active ? 'text-emerald-500 hover:text-emerald-700' : 'text-slate-300 hover:text-slate-500')}>
                      {s.active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${s.name} (${staffLabel(s)}) from system?`)) deleteMut.mutate(s.id)
                      }}
                      className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* ── Inline name editor ── */}
                {editId === s.id && (
                  <div className="px-6 py-5 bg-brand-50/30 border-y border-brand-100 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <Pencil className="w-3 h-3" /> Edit Name / Rank / Service Number
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Rank</span>
                        <input
                          className="input bg-white rounded-xl border-slate-200 w-full"
                          placeholder="e.g. Commandant(JG)"
                          value={editRank}
                          onChange={e => setEditRank(e.target.value)}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Name <span className="text-rose-500">*</span></span>
                        <input
                          className="input bg-white rounded-xl border-slate-200 w-full"
                          placeholder="Full name"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editName.trim()) updateNameMut.mutate({ id: s.id, name: editComposed() })
                            if (e.key === 'Escape') setEditId(null)
                          }}
                          autoFocus
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Service Number</span>
                        <input
                          className="input bg-white rounded-xl border-slate-200 w-full"
                          placeholder="e.g. 5152-J"
                          value={editNumber}
                          onChange={e => setEditNumber(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && editName.trim()) updateNameMut.mutate({ id: s.id, name: editComposed() })
                            if (e.key === 'Escape') setEditId(null)
                          }}
                        />
                      </label>
                    </div>

                    {/* Live preview */}
                    {editName.trim() && (
                      <div className="text-xs text-slate-500 px-1 mb-4">
                        Preview: <span className="font-bold text-slate-800">{editComposed()}</span>
                        <span className="text-slate-400 ml-2">— abbreviation auto-updated on save</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateNameMut.mutate({ id: s.id, name: editComposed() })}
                        disabled={!editName.trim() || updateNameMut.isPending}
                        className="flex items-center gap-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {updateNameMut.isPending ? 'Saving...' : 'Save Name'}
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="flex items-center gap-1.5 px-4 py-2 text-slate-500 hover:text-slate-700 bg-white border border-slate-200 text-xs font-bold rounded-xl transition-colors"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </div>
                  </div>
                )}

                {showAvail === s.id && (
                  <div className="px-6 py-5 bg-slate-50/50 border-y border-slate-100 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Reporting Date</span>
                        <input
                          type="date"
                          className="input bg-white rounded-xl border-slate-200"
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
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Relieve Date</span>
                        <input
                          type="date"
                          className="input bg-white rounded-xl border-slate-200"
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
                    <button
                      onClick={() => updateServiceMut.mutate({
                        id: s.id,
                        data: {
                          join_date: serviceWindow[s.id]?.join_date || undefined,
                          relieve_date: serviceWindow[s.id]?.relieve_date || undefined,
                        },
                      })}
                      className="btn-secondary w-full md:w-auto px-6 py-2 rounded-xl text-xs font-bold"
                      disabled={updateServiceMut.isPending}
                    >
                      Update Service Window
                    </button>
                    
                    <div className="mt-6">
                        <div className="text-[10px] font-bold text-brand-600 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                            <span className="w-1 h-1 bg-brand-600 rounded-full" />
                            Unavailability History
                        </div>
                        {staffAvail(s.id).length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No leave or official duty records found.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {staffAvail(s.id).map(a => (
                              <div key={a.id} className="flex items-center justify-between text-xs bg-white rounded-xl px-4 py-2.5 border border-slate-200 shadow-sm group/item hover:border-brand-200 transition-all">
                                <div>
                                  <span className="font-bold text-slate-800 capitalize">{(a.availability_type || 'leave').replace('_', ' ')}</span>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {format(new Date(a.start_date + 'T00:00:00'), 'dd MMM')}
                                    {a.start_date !== a.end_date && ` → ${format(new Date(a.end_date + 'T00:00:00'), 'dd MMM')}`}
                                    {a.reason && <span className="text-slate-400 ml-2 italic">— {a.reason}</span>}
                                  </div>
                                </div>
                                <button onClick={() => deleteAvailMut.mutate(a.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="font-bold text-slate-800 text-sm">Duty Counters Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                <th className="px-6 py-4 text-left">Code</th>
                <th className="px-6 py-4 text-left">Full Name</th>
                <th className="px-6 py-4 text-center">Working</th>
                <th className="px-6 py-4 text-center">Holiday</th>
                <th className="px-6 py-4 text-center">Total</th>
                <th className="px-6 py-4 text-center">Debt</th>
                <th className="px-6 py-4 text-center">Pool Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3.5 font-bold text-slate-900">{staffLabel(s)}</td>
                  <td className="px-6 py-3.5 text-slate-500 font-medium">{s.name}</td>
                  <td className="px-6 py-3.5 text-center text-emerald-600 font-bold">{s.total_working_duties}</td>
                  <td className="px-6 py-3.5 text-center text-amber-500 font-bold">{s.total_holiday_duties}</td>
                  <td className="px-6 py-3.5 text-center font-black text-slate-800">{s.total_working_duties + s.total_holiday_duties}</td>
                  <td className="px-6 py-3.5 text-center">{s.duty_debt > 0 ? <span className="text-rose-600 font-black">{s.duty_debt}</span> : <span className="text-slate-200">0</span>}</td>
                  <td className="px-6 py-3.5 text-center">
                    {s.active ? (
                        <span className="text-[10px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 uppercase tracking-tighter">Active Pool</span>
                    ) : (
                        <span className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full uppercase tracking-tighter">Stand Down</span>
                    )}
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
