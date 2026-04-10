import { Routes, Route, NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Users, Settings, BarChart3, BookOpen, Zap, Repeat } from 'lucide-react'
import clsx from 'clsx'

import CalendarPage from './pages/CalendarPage'
import StaffPage from './pages/StaffPage'
import RosterPage from './pages/RosterPage'
import AuditPage from './pages/AuditPage'
import SettingsPage from './pages/SettingsPage'
import OperationsHandbookPage from './pages/OperationsHandbookPage'
import OnboardingPage from './pages/OnboardingPage'
import { setupApi, type SetupStatus } from './services/api'

const navItems = [
  { to: '/', icon: CalendarDays, label: 'Calendar' },
  { to: '/roster', icon: Repeat, label: 'Roster' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/audit', icon: BarChart3, label: 'Audit' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/handbook', icon: BookOpen, label: 'Handbook' },
]

// ── Splash shown while setup-status loads ─────────────────────────────────────
function KRAMSplash() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 flex flex-col items-center justify-center gap-6 z-50">
      <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center ring-2 ring-brand-400/20">
        <Zap className="w-8 h-8 text-brand-300 fill-brand-400/30" />
      </div>
      <span className="kram-wordmark text-3xl tracking-[0.3em] text-white">KRAM</span>
      <div className="w-6 h-6 border-2 border-brand-700 border-t-brand-400 rounded-full animate-spin" />
    </div>
  )
}

// ── Full main application shell ───────────────────────────────────────────────
function MainAppShell({ orgName }: { orgName: string | null }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white shadow-lg no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-brand-300 fill-brand-300/20" />
            <div className="flex flex-col leading-none">
              <span className="kram-wordmark text-lg tracking-[0.22em]">KRAM</span>
              <span className="kram-tagline hidden sm:block text-[10px] tracking-[0.12em] text-brand-200">
                Kartavya Roster &amp; App Management
              </span>
            </div>
          </div>
          <span className="kram-tagline text-xs hidden sm:block text-brand-300">
            {orgName ?? 'Kartavya Control Console'}
          </span>
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

      <footer className="text-center text-xs text-slate-400 py-4 border-t border-slate-100 no-print space-y-1">
        <div className="kram-tagline">KRAM v1.0 | Kartavya Roster &amp; App Management</div>
        <div className="text-slate-300 text-[10px] tracking-wide">
          &copy; {new Date().getFullYear()} Kartavya. All rights reserved. Not for commercial use.
          Developed by <span className="text-slate-400 font-medium">Kartavya Development</span>.
        </div>
      </footer>
    </div>
  )
}

// ── Root app — setup gate ─────────────────────────────────────────────────────
export default function App() {
  const { data: status, isLoading } = useQuery<SetupStatus>({
    queryKey: ['setup-status'],
    queryFn: setupApi.status,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })

  // 1. Waiting for status check
  if (isLoading) return <KRAMSplash />

  // 2. Not yet configured — show onboarding wizard
  if (!status?.is_configured) {
    return <OnboardingPage />
  }

  // 3. Configured — render full app
  return <MainAppShell orgName={status.org_name} />
}
