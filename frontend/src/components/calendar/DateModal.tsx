import { useState } from 'react'
import { format } from 'date-fns'
import { X, Flag, UserX, Trash2, Briefcase, CalendarDays, Moon, Pencil, ShieldAlert, RefreshCw, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { calendarApi, availabilityApi, rosterApi, apiError, type CalendarEntry, type Staff, type Availability } from '../../services/api'
import { staffLabel } from '../../utils/staff'

interface Props {
  entry: CalendarEntry
  staff: Staff[]
  availability: Availability[]
  onClose: () => void
  onRefresh: () => void
}

export default function DateModal({ entry, staff, availability, onClose, onRefresh }: Props) {
  const dateStr = entry.date
  const defaultDayType = new Date(`${entry.date}T00:00:00`).getDay() === 0 || new Date(`${entry.date}T00:00:00`).getDay() === 6
    ? 'weekend'
    : 'working'

  const [dayType, setDayType] = useState<CalendarEntry['day_type']>(entry.day_type)
  const [holidayName, setHolidayName] = useState(entry.holiday_name || '')
  const [leaveStaffId, setLeaveStaffId] = useState<number | ''>('')
  const [leaveStartDate, setLeaveStartDate] = useState(dateStr)
  const [leaveEndDate, setLeaveEndDate] = useState(dateStr)
  const [availabilityType, setAvailabilityType] = useState<'leave' | 'official_duty'>('leave')
  const [leaveReason, setLeaveReason] = useState('')
  const [editingAvailabilityId, setEditingAvailabilityId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  // Manual override state
  const [overrideDutyId, setOverrideDutyId] = useState<number | ''>('')
  const [overrideStandbyId, setOverrideStandbyId] = useState<number | ''>('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideType, setOverrideType] = useState<'emergency' | 'routine' | 'other'>('emergency')

  const dateLabel = format(new Date(dateStr + 'T00:00:00'), 'EEEE, d MMMM yyyy')

  const dayAvailability = availability.filter(
    a => a.start_date <= dateStr && a.end_date >= dateStr,
  )
  const availabilityTypeLabel = (type?: Availability['availability_type']) =>
    (type || 'leave').replace('_', ' ')

  const resetAvailabilityForm = () => {
    setEditingAvailabilityId(null)
    setLeaveStaffId('')
    setLeaveStartDate(dateStr)
    setLeaveEndDate(dateStr)
    setAvailabilityType('leave')
    setLeaveReason('')
  }

  const handleDayTypeSave = async () => {
    setLoading(true)
    try {
      await calendarApi.update(dateStr, {
        day_type: dayType,
        is_holiday: dayType === 'holiday',
        holiday_name: dayType === 'holiday' ? (holidayName || 'Closed Holiday') : undefined,
      })
      toast.success(
        dayType === 'working'
          ? 'Marked as working day'
          : dayType === 'weekend'
            ? 'Marked as non-working day'
            : 'Marked as closed holiday',
      )
      onRefresh()
    } catch {
      toast.error('Failed to update day type')
    } finally {
      setLoading(false)
    }
  }

  const handleAddLeave = async () => {
    if (!leaveStaffId) return toast.error('Select a staff member')
    if (leaveEndDate < leaveStartDate) return toast.error('End date must be on or after start date')
    setLoading(true)
    try {
      const payload = {
        staff_id: Number(leaveStaffId),
        start_date: leaveStartDate,
        end_date: leaveEndDate,
        availability_type: availabilityType,
        reason: leaveReason,
      }
      if (editingAvailabilityId) {
        await availabilityApi.update(editingAvailabilityId, payload)
        toast.success('Unavailability updated')
      } else {
        await availabilityApi.create(payload)
        toast.success('Unavailability added')
      }
      resetAvailabilityForm()
      onRefresh()
    } catch (e: unknown) {
      toast.error(apiError(e, 'Failed to add unavailability'))
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveLeave = async (id: number) => {
    setLoading(true)
    try {
      await availabilityApi.delete(id)
      toast.success('Unavailability removed')
      onRefresh()
    } catch {
      toast.error('Failed to remove')
    } finally {
      setLoading(false)
    }
  }

  const handleEditLeave = (item: Availability) => {
    setEditingAvailabilityId(item.id)
    setLeaveStaffId(item.staff_id)
    setLeaveStartDate(item.start_date)
    setLeaveEndDate(item.end_date)
    setAvailabilityType(item.availability_type || 'leave')
    setLeaveReason(item.reason || '')
  }

  const handleManualOverride = async (healAfter: boolean) => {
    if (!overrideDutyId) return toast.error('Select a duty staff member')
    if (overrideStandbyId && overrideStandbyId === overrideDutyId)
      return toast.error('Duty and standby cannot be the same person')
    setLoading(true)
    try {
      await rosterApi.manualOverride({
        date: dateStr,
        new_duty_id: Number(overrideDutyId),
        new_standby_id: overrideStandbyId ? Number(overrideStandbyId) : undefined,
        reason: overrideReason || undefined,
        override_type: overrideType,
        heal_after: healAfter,
      })
      toast.success(
        healAfter
          ? 'Override applied — roster healed from this month'
          : 'Override applied — rest of roster unchanged'
      )
      onRefresh()
    } catch (e: unknown) {
      toast.error(apiError(e, 'Override failed'))
    } finally {
      setLoading(false)
    }
  }

  const dtBadge = dayType === 'working' ? 'badge-working'
    : dayType === 'holiday' ? 'badge-holiday' : 'badge-weekend'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-slate-800">{dateLabel}</h2>
            <span className={dtBadge}>{dayType}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Assignment info */}
          {entry.duty_staff && (
            <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
              <div className="text-xs font-medium text-emerald-700 uppercase tracking-wide">Current Assignment</div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Duty:</span>
                <span className="font-semibold" title={entry.duty_staff.name}>{staffLabel(entry.duty_staff)}</span>
              </div>
              {entry.standby_staff && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Standby:</span>
                  <span className="font-semibold" title={entry.standby_staff.name}>{staffLabel(entry.standby_staff)}</span>
                </div>
              )}
            </div>
          )}

          {/* Day type override */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand-500" /> Calendar Settings
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setDayType('working')}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  dayType === 'working' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Briefcase className="h-4 w-4 text-emerald-600" />
                <div>
                  <div className="text-sm font-medium text-slate-800">Working day</div>
                  <div className="text-xs text-slate-500">Use weekday rotation on this date.</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDayType('weekend')}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  dayType === 'weekend' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Moon className="h-4 w-4 text-orange-500" />
                <div>
                  <div className="text-sm font-medium text-slate-800">Non-working day</div>
                  <div className="text-xs text-slate-500">Use the weekend or holiday rotation without a holiday label.</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDayType('holiday')}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  dayType === 'holiday' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Flag className="h-4 w-4 text-red-500" />
                <div>
                  <div className="text-sm font-medium text-slate-800">Closed holiday</div>
                  <div className="text-xs text-slate-500">Treat this date as a holiday and show its name on the calendar.</div>
                </div>
              </button>
            </div>

            {dayType === 'holiday' && (
              <input
                className="input"
                placeholder="Holiday name (e.g. National Day)"
                value={holidayName}
                onChange={e => setHolidayName(e.target.value)}
              />
            )}

            {dayType !== defaultDayType && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                This date is overridden from its default {defaultDayType} classification.
              </div>
            )}

            <button
              onClick={handleDayTypeSave}
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              Save Day Type
            </button>
          </div>

          {/* Leave / unavailability */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <UserX className="w-4 h-4 text-orange-500" /> Staff Unavailability
            </div>

            {/* Existing unavailability */}
            {dayAvailability.length > 0 && (
              <ul className="space-y-1">
                {dayAvailability.map(a => (
                  <li key={a.id} className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium" title={a.staff?.name}>{a.staff ? staffLabel(a.staff) : `Staff #${a.staff_id}`}</span>
                      <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">
                        {availabilityTypeLabel(a.availability_type)}
                      </span>
                      {a.reason && <span className="text-slate-500 ml-2">— {a.reason}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEditLeave(a)} className="text-slate-400 hover:text-brand-600">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleRemoveLeave(a.id)} className="text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <select
              className="input"
              value={leaveStaffId}
              onChange={e => setLeaveStaffId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select staff member…</option>
              {staff.filter(s => s.active).map(s => (
                <option key={s.id} value={s.id}>{staffLabel(s)} - {s.name}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">Type</span>
                <select
                  className="input"
                  value={availabilityType}
                  onChange={e => setAvailabilityType(e.target.value as 'leave' | 'official_duty')}
                >
                  <option value="leave">Leave</option>
                  <option value="official_duty">Official duty</option>
                </select>
              </label>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">From</span>
                <input
                  type="date"
                  className="input"
                  value={leaveStartDate}
                  onChange={e => setLeaveStartDate(e.target.value)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-500">To</span>
                <input
                  type="date"
                  className="input"
                  value={leaveEndDate}
                  min={leaveStartDate}
                  onChange={e => setLeaveEndDate(e.target.value)}
                />
              </label>
            </div>
            <input
              className="input"
              placeholder="Reason (optional)"
              value={leaveReason}
              onChange={e => setLeaveReason(e.target.value)}
            />
            <div className="text-xs text-slate-500">
              Leave returns after 2 reporting days. Official duty gets a longer delay when the month has enough coverage.
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddLeave}
                disabled={loading || !leaveStaffId}
                className="btn-secondary w-full justify-center"
              >
                {editingAvailabilityId ? 'Update Unavailability' : 'Add Unavailability Range'}
              </button>
              {editingAvailabilityId && (
                <button
                  type="button"
                  onClick={resetAvailabilityForm}
                  disabled={loading}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* ── Manual Override ─────────────────────────────────────── */}
          <div className="space-y-3 border-t border-red-100 pt-4">
            <div className="text-sm font-semibold text-red-700 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Force Manual Assignment
            </div>

            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700 leading-relaxed">
              Replaces the current duty assignment for this date regardless of roster logic.
              The original entry is preserved in the audit log.
            </div>

            {/* Current assignment preview */}
            {(entry.duty_staff || entry.standby_staff) && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                <span className="font-semibold text-slate-600">Currently: </span>
                {entry.duty_staff && <>Duty — <span className="font-bold">{staffLabel(entry.duty_staff)}</span></>}
                {entry.standby_staff && <>, Standby — <span className="font-bold">{staffLabel(entry.standby_staff)}</span></>}
              </div>
            )}

            {/* Override type */}
            <div className="grid grid-cols-3 gap-2">
              {(['emergency', 'routine', 'other'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOverrideType(t)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize transition ${
                    overrideType === t
                      ? t === 'emergency'
                        ? 'border-red-500 bg-red-100 text-red-800'
                        : t === 'routine'
                          ? 'border-amber-500 bg-amber-100 text-amber-800'
                          : 'border-slate-500 bg-slate-100 text-slate-800'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* New duty */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> New Duty <span className="text-red-500">*</span>
              </label>
              <select
                className="input"
                value={overrideDutyId}
                onChange={e => setOverrideDutyId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select staff…</option>
                {staff.filter(s => s.active).map(s => (
                  <option key={s.id} value={s.id}>{staffLabel(s)} — {s.name}</option>
                ))}
              </select>
            </div>

            {/* New standby (optional) */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                <Lock className="w-3 h-3" /> New Standby <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <select
                className="input"
                value={overrideStandbyId}
                onChange={e => setOverrideStandbyId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select staff…</option>
                {staff.filter(s => s.active && s.id !== Number(overrideDutyId)).map(s => (
                  <option key={s.id} value={s.id}>{staffLabel(s)} — {s.name}</option>
                ))}
              </select>
            </div>

            {/* Reason */}
            <input
              className="input"
              placeholder="Reason for override (recommended)"
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
            />

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => handleManualOverride(false)}
                disabled={loading || !overrideDutyId}
                className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-40 transition"
              >
                <Lock className="w-3.5 h-3.5" />
                Apply &amp; Keep Roster
              </button>
              <button
                onClick={() => handleManualOverride(true)}
                disabled={loading || !overrideDutyId}
                className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-red-400 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-800 hover:bg-red-100 disabled:opacity-40 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Apply &amp; Heal Roster
              </button>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              <strong>Keep Roster</strong> — only this day is changed; chain continues as-is.<br />
              <strong>Heal Roster</strong> — this day is pinned; rest of month is regenerated around it.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
