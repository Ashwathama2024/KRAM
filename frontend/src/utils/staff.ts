import type { Staff } from '../services/api'

export function staffLabel(staff?: Pick<Staff, 'abbreviation' | 'name'> | null) {
  if (!staff) return ''
  return staff.abbreviation || staff.name
}
