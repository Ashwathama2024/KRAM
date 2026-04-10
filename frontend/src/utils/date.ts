import { startOfMonth } from 'date-fns'

export function currentMonthDate(): Date {
  return startOfMonth(new Date())
}

