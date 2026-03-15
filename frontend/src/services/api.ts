import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({ baseURL: BASE })

// Types
export interface Staff {
  id: number
  name: string
  abbreviation: string
  active: boolean
  join_date?: string
  relieve_date?: string
  weekday_pointer: number
  holiday_pointer: number
  total_working_duties: number
  total_holiday_duties: number
  duty_debt: number
  created_at?: string
}

export interface Availability {
  id: number
  staff_id: number
  start_date: string
  end_date: string
  availability_type?: 'leave' | 'official_duty'
  reason?: string
  created_at?: string
  staff?: Staff
}

export interface CalendarEntry {
  id: number
  date: string
  day_type: 'working' | 'weekend' | 'holiday'
  is_holiday: boolean
  holiday_name?: string
  assigned_duty_id?: number
  assigned_standby_id?: number
  status: 'assigned' | 'pending' | 'modified' | 'vacant'
  remarks?: string
  duty_staff?: Staff
  standby_staff?: Staff
}

export interface RosterSettings {
  id: number
  auto_assign_standby: boolean
  separate_weekend_pool: boolean
  gap_hours: number
  leave_rejoin_buffer_days: number
  official_duty_min_buffer_days: number
  official_duty_comfort_buffer_days: number
  comfort_unavailability_threshold: number
}

export interface StaffStats {
  staff: Staff
  working_duties: number
  holiday_duties: number
  total_duties: number
}

export interface AuditReport {
  month: number
  year: number
  stats: StaffStats[]
  max_duties: number
  min_duties: number
  variance: number
  imbalance_warning: boolean
}

export interface Remark {
  id: number
  message: string
  level: string
  date_ref?: string
  created_at?: string
}

// Staff API
export const staffApi = {
  list: () => api.get<Staff[]>('/staff/').then(r => r.data),
  create: (data: { name: string; active?: boolean; join_date?: string; relieve_date?: string }) => api.post<Staff>('/staff/', data).then(r => r.data),
  update: (id: number, data: Partial<Staff>) => api.put<Staff>(`/staff/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/staff/${id}`),
}

// Availability API
export const availabilityApi = {
  list: () => api.get<Availability[]>('/availability/').then(r => r.data),
  create: (data: { staff_id: number; start_date: string; end_date: string; availability_type?: 'leave' | 'official_duty'; reason?: string }) =>
    api.post<Availability>('/availability/', data).then(r => r.data),
  update: (id: number, data: { staff_id: number; start_date: string; end_date: string; availability_type?: 'leave' | 'official_duty'; reason?: string }) =>
    api.put<Availability>(`/availability/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/availability/${id}`),
}

// Calendar API
export const calendarApi = {
  list: (year: number, month: number) =>
    api.get<CalendarEntry[]>('/calendar/', { params: { year, month } }).then(r => r.data),
  get: (date: string) => api.get<CalendarEntry>(`/calendar/${date}`).then(r => r.data),
  update: (date: string, data: Partial<CalendarEntry>) =>
    api.put<CalendarEntry>(`/calendar/${date}`, data).then(r => r.data),
  markHoliday: (data: { date: string; holiday_name?: string; is_holiday: boolean }) =>
    api.post<CalendarEntry>('/calendar/holiday', data).then(r => r.data),
}

// Roster API
export const rosterApi = {
  generate: (year: number, month: number, force = false) =>
    api.post<CalendarEntry[]>('/roster/generate', { year, month, force_regenerate: force }).then(r => r.data),
  heal: (year: number, month: number) =>
    api.post<CalendarEntry[]>('/roster/heal', null, { params: { year, month } }).then(r => r.data),
  audit: (year: number, month: number) =>
    api.get<AuditReport>('/roster/audit', { params: { year, month } }).then(r => r.data),
  remarks: () => api.get<Remark[]>('/roster/remarks').then(r => r.data),
  clearRemarks: () => api.delete('/roster/remarks'),
  swap: (first_date: string, second_date: string, reason?: string) =>
    api.post<CalendarEntry[]>('/roster/swap', { first_date, second_date, reason }).then(r => r.data),
  getSettings: () => api.get<RosterSettings>('/roster/settings').then(r => r.data),
  updateSettings: (data: Partial<RosterSettings>) =>
    api.put<RosterSettings>('/roster/settings', data).then(r => r.data),
  exportCsv: (year: number, month: number) =>
    `${BASE}/roster/export/csv?year=${year}&month=${month}`,
  exportPdf: (year: number, month: number) =>
    `${BASE}/roster/export/pdf?year=${year}&month=${month}`,
}
