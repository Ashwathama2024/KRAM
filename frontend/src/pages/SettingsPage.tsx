import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Info, ToggleLeft, ToggleRight, Clock, Shield, Settings as SettingsIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { rosterApi, type RosterSettings } from '../services/api'

export default function SettingsPage() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery<RosterSettings>({
    queryKey: ['settings'],
    queryFn: rosterApi.getSettings,
  })

  const [form, setForm] = useState<Partial<RosterSettings>>({})

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const updateMut = useMutation({
    mutationFn: () => rosterApi.updateSettings(form),
    onSuccess: () => {
      toast.success('Settings saved')
      qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const toggle = (key: keyof RosterSettings) => {
    setForm(f => ({ ...f, [key]: !f[key] }))
  }

  if (isLoading) return <div className="text-center py-16 text-slate-400">Loading settings…</div>

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-brand-600" />
          System Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">Fine-tune the roster engine algorithms and buffer parameters.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Engine Logic Controls</h2>
        </div>
        
        <div className="divide-y divide-slate-100">
            {/* Auto Assign Standby */}
            <div className="flex items-center justify-between p-6 hover:bg-slate-50/30 transition-colors">
              <div className="max-w-[70%]">
                <div className="font-bold text-slate-800 mb-0.5">Automated Standby Selection</div>
                <div className="text-xs text-slate-500 leading-relaxed text-pretty">When enabled, the engine automatically selects the next eligible person in the queue as Standby for the following day.</div>
              </div>
              <button 
                onClick={() => toggle('auto_assign_standby')} 
                className={clsx("transition-all transform active:scale-95", form.auto_assign_standby ? 'text-emerald-500' : 'text-slate-300')}
              >
                {form.auto_assign_standby ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
              </button>
            </div>

            {/* Separate Weekend Pool */}
            <div className="flex items-center justify-between p-6 hover:bg-slate-50/30 transition-colors">
              <div className="max-w-[70%]">
                <div className="font-bold text-slate-800 mb-0.5">Independent Holiday Queue</div>
                <div className="text-xs text-slate-500 leading-relaxed">Maintains a separate rotation pointer for weekends and public holidays, ensuring holiday duties are shared fairly regardless of weekday assignments.</div>
              </div>
              <button 
                onClick={() => toggle('separate_weekend_pool')} 
                className={clsx("transition-all transform active:scale-95", form.separate_weekend_pool ? 'text-emerald-500' : 'text-slate-300')}
              >
                {form.separate_weekend_pool ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
              </button>
            </div>

            {/* Gap Hours */}
            <div className="p-6 hover:bg-slate-50/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-bold text-slate-800 mb-0.5">Inter-Duty Recovery Gap</div>
                    <div className="text-xs text-slate-500">Minimum mandatory rest period between consecutive assignments.</div>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <input
                      type="number"
                      min="0"
                      max="72"
                      value={form.gap_hours ?? 24}
                      onChange={e => setForm(f => ({ ...f, gap_hours: Number(e.target.value) }))}
                      className="w-16 bg-white rounded-lg border-none text-center font-black text-slate-800 focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-[10px] font-black text-slate-400 uppercase pr-3">Hours</span>
                  </div>
              </div>
              <div className="grid grid-cols-4 gap-1">
                  {[12, 24, 36, 48].map(h => (
                      <button 
                        key={h}
                        onClick={() => setForm(f => ({ ...f, gap_hours: h }))}
                        className={clsx(
                            "py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                            form.gap_hours === h ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                        )}
                      >
                          {h}h
                      </button>
                  ))}
              </div>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Buffer & Recovery Rules</h2>
        </div>
        
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Leave Return Buffer</span>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="14"
                    value={form.leave_rejoin_buffer_days ?? 2}
                    onChange={e => setForm(f => ({ ...f, leave_rejoin_buffer_days: Number(e.target.value) }))}
                    className="input w-24 rounded-xl border-slate-200 font-bold"
                  />
                  <span className="text-sm font-bold text-slate-400 uppercase">Days</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed italic">The engine will wait this many days after leave ends before considering staff for duty again.</p>
              </label>

              <label className="block pt-4">
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Imbalance Threshold</span>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.comfort_unavailability_threshold ?? 12}
                    onChange={e => setForm(f => ({ ...f, comfort_unavailability_threshold: Number(e.target.value) }))}
                    className="input w-24 rounded-xl border-slate-200 font-bold"
                  />
                  <span className="text-sm font-bold text-slate-400 uppercase">% Load</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed italic">Triggers comfort buffers if the percentage of unavailable staff is below this value.</p>
              </label>
          </div>

          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-5">
              <div className="text-[10px] font-black text-brand-600 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-brand-600 rounded-full" />
                  Official Duty Settings
              </div>
              
              <label className="block">
                <span className="text-xs font-bold text-slate-600 block mb-1.5">Minimum Required Buffer</span>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min="0"
                        max="14"
                        value={form.official_duty_min_buffer_days ?? 2}
                        onChange={e => setForm(f => ({ ...f, official_duty_min_buffer_days: Number(e.target.value) }))}
                        className="input flex-1 rounded-xl border-slate-200 font-bold text-sm h-10"
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Days</span>
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-600 block mb-1.5">Comfort (Extended) Buffer</span>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min="0"
                        max="14"
                        value={form.official_duty_comfort_buffer_days ?? 4}
                        onChange={e => setForm(f => ({ ...f, official_duty_comfort_buffer_days: Number(e.target.value) }))}
                        className="input flex-1 rounded-xl border-slate-200 font-bold text-sm h-10"
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Days</span>
                </div>
              </label>
          </div>
        </div>

        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <Info className="w-4 h-4" />
                Changes apply immediately to future "Sync & Generate" actions.
            </div>
            <button 
                onClick={() => updateMut.mutate()} 
                disabled={updateMut.isPending} 
                className="btn-primary px-8 py-3 rounded-xl shadow-lg shadow-brand-200 flex items-center gap-2 font-bold"
            >
              <Save className="w-4 h-4" />
              {updateMut.isPending ? 'Syncing...' : 'Commit Configuration'}
            </button>
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 flex gap-4 items-start">
          <div className="bg-emerald-100 p-2 rounded-xl">
              <Shield className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
              <h4 className="font-black text-emerald-900 uppercase tracking-tight text-sm mb-1">Algorithm Integrity Protection</h4>
              <p className="text-xs text-emerald-700 leading-relaxed font-medium">These settings are guarded by the Core Roster Engine. Modifying them will clear the current "Generated" cache for the current month to ensure chain consistency.</p>
          </div>
      </div>
    </div>
  )
}
