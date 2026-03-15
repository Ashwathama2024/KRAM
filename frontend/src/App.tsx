import { Routes, Route, NavLink } from 'react-router-dom'
import { CalendarDays, Users, Settings, BarChart3, Shield, BookOpen } from 'lucide-react'
import clsx from 'clsx'

import CalendarPage from './pages/CalendarPage'
import StaffPage from './pages/StaffPage'
import RosterPage from './pages/RosterPage'
import AuditPage from './pages/AuditPage'
import SettingsPage from './pages/SettingsPage'
import OperationsHandbookPage from './pages/OperationsHandbookPage'

const navItems = [
  { to: '/', icon: CalendarDays, label: 'Calendar' },
  { to: '/roster', icon: Shield, label: 'Roster' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/audit', icon: BarChart3, label: 'Audit' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/handbook', icon: BookOpen, label: 'Handbook' },
]

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-brand-300" />
            <div className="flex flex-col leading-none">
              <span className="kram-wordmark text-lg tracking-[0.22em]">KRAM</span>
              <span className="kram-tagline hidden sm:block text-[10px] tracking-[0.12em] text-brand-200">
                Kartavya Roster & App Management
              </span>
            </div>
          </div>
          <span className="kram-tagline text-xs hidden sm:block text-brand-300">Kartavya Control Console</span>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200 shadow-sm no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                    isActive
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                  )
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/handbook" element={<OperationsHandbookPage />} />
        </Routes>
      </main>

      <footer className="text-center text-xs text-slate-400 py-3 border-t border-slate-100 no-print">
        <span className="kram-tagline">KRAM v1.0 | Kartavya Roster & App Management</span>
      </footer>
    </div>
  )
}
