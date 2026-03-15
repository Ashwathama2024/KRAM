import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Info, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
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
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">System Settings</h1>
        <p className="text-sm text-slate-500">Configure roster generation logic</p>
      </div>

      <div className="card space-y-5">
        <h2 className="text-sm font-semibold text-slate-700">Logic Controls</h2>

        {/* Auto Assign Standby */}
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <div className="font-medium text-slate-700">Auto Assign Standby</div>
            <div className="text-xs text-slate-500 mt-0.5">Automatically assign the next-in-queue person as standby</div>
          </div>
          <button onClick={() => toggle('auto_assign_standby')} className={form.auto_assign_standby ? 'text-emerald-500' : 'text-slate-300'}>
            {form.auto_assign_standby ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
          </button>
        </div>

        {/* Separate Weekend Pool */}
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <div className="font-medium text-slate-700">Separate Weekend/Holiday Queue</div>
            <div className="text-xs text-slate-500 mt-0.5">Maintain independent rotation for working days vs non-working days</div>
          </div>
          <button onClick={() => toggle('separate_weekend_pool')} className={form.separate_weekend_pool ? 'text-emerald-500' : 'text-slate-300'}>
            {form.separate_weekend_pool ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
          </button>
        </div>

        {/* Gap Hours */}
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="font-medium text-slate-700">Minimum Gap Hours</div>
            <div className="text-xs text-slate-500 mt-0.5">Minimum hours between duties for the same staff member</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="72"
              value={form.gap_hours ?? 24}
              onChange={e => setForm(f => ({ ...f, gap_hours: Number(e.target.value) }))}
              className="input w-20 text-center"
            />
            <span className="text-sm text-slate-400">hours</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Leave Rejoin Buffer</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="14"
                value={form.leave_rejoin_buffer_days ?? 2}
                onChange={e => setForm(f => ({ ...f, leave_rejoin_buffer_days: Number(e.target.value) }))}
                className="input w-24 text-center"
              />
              <span className="text-sm text-slate-400">days</span>
            </div>
            <div className="text-xs text-slate-500">Days after leave ends before the staff becomes eligible again.</div>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Official Duty Min Buffer</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="14"
                value={form.official_duty_min_buffer_days ?? 2}
                onChange={e => setForm(f => ({ ...f, official_duty_min_buffer_days: Number(e.target.value) }))}
                className="input w-24 text-center"
              />
              <span className="text-sm text-slate-400">days</span>
            </div>
            <div className="text-xs text-slate-500">Used when the month is tight and coverage is needed quickly.</div>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Official Duty Comfort Buffer</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="14"
                value={form.official_duty_comfort_buffer_days ?? 4}
                onChange={e => setForm(f => ({ ...f, official_duty_comfort_buffer_days: Number(e.target.value) }))}
                className="input w-24 text-center"
              />
              <span className="text-sm text-slate-400">days</span>
            </div>
            <div className="text-xs text-slate-500">Used when the month is comfortable and re-entry can be delayed more.</div>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Comfort Threshold</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={form.comfort_unavailability_threshold ?? 12}
                onChange={e => setForm(f => ({ ...f, comfort_unavailability_threshold: Number(e.target.value) }))}
                className="input w-24 text-center"
              />
              <span className="text-sm text-slate-400">% unavailable</span>
            </div>
            <div className="text-xs text-slate-500">If monthly unavailability stays at or below this level, the comfort buffer is used.</div>
          </label>
        </div>

        <button onClick={() => updateMut.mutate()} disabled={updateMut.isPending} className="btn-primary">
          <Save className="w-4 h-4" />
          {updateMut.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      {/* Info box */}
      <div className="card bg-brand-50 border-brand-100">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm text-brand-800">
            <div className="font-semibold">System Logic Reference</div>
            <ul className="space-y-1 text-xs text-brand-700">
              <li><strong>Sequence 1:</strong> Working days (Mon–Fri) rotate independently</li>
              <li><strong>Sequence 2:</strong> Non-working days (Sat, Sun, Holidays) rotate independently</li>
              <li><strong>Standby Rule:</strong> Standby = next person after duty in the same queue</li>
              <li><strong>24-Hour Gap:</strong> Staff cannot perform duties on consecutive days</li>
              <li><strong>Auto-Heal:</strong> Recalculates future duties when unavailability is added</li>
              <li><strong>Duty Debt:</strong> Tracks skipped assignments for future compensation</li>
              <li><strong>Return Buffers:</strong> Leave and official-duty re-entry delays are editable here</li>
              <li><strong>Imbalance Warning:</strong> Triggered when duty variance exceeds 2</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
