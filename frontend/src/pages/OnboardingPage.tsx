import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Zap, ArrowRight, ArrowLeft, Building2, Settings2,
  CheckCircle2, ChevronRight, Shield, Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { setupApi, apiError } from '../services/api'

// ── Wizard state ──────────────────────────────────────────────────────────────
interface WizardData {
  orgName: string
  unit: string
  leaveBuffer: number
  autoStandby: boolean
}

const TOTAL_STEPS = 4  // 0=Welcome, 1=Org, 2=Settings, 3=Launch

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ current }: { current: number }) {
  const steps = ['Welcome', 'Organization', 'Settings', 'Launch']
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={clsx(
            'flex items-center justify-center rounded-full text-[10px] font-black transition-all duration-300',
            i < current
              ? 'w-6 h-6 bg-brand-500 text-white'
              : i === current
                ? 'w-7 h-7 bg-white text-brand-900 shadow-lg'
                : 'w-5 h-5 bg-white/20 text-white/40',
          )}>
            {i < current ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={clsx(
              'h-px w-8 transition-all duration-500',
              i < current ? 'bg-brand-400' : 'bg-white/20',
            )} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 0: Welcome ───────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-in fade-in zoom-in-95 duration-700">
      {/* Logo */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-brand-500/20 rounded-3xl flex items-center justify-center ring-2 ring-brand-400/30 shadow-2xl shadow-brand-500/30">
          <Zap className="w-12 h-12 text-brand-300 fill-brand-400/40" />
        </div>
        <div className="absolute -inset-3 bg-brand-500/10 rounded-3xl blur-xl -z-10" />
      </div>

      <div className="mb-3">
        <span className="kram-wordmark text-5xl tracking-[0.3em] text-white font-black">KRAM</span>
      </div>
      <p className="kram-tagline text-brand-300 text-sm tracking-[0.2em] mb-2 uppercase">
        Kartavya Roster &amp; App Management
      </p>
      <p className="text-slate-400 text-base max-w-md leading-relaxed mb-12">
        Professional duty roster management system for your organization.
        Quick setup — be running in under a minute.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-12 max-w-lg w-full">
        {[
          { icon: Shield, label: 'Fair Rotation', desc: 'Balanced duty distribution' },
          { icon: Users, label: 'Team Ready', desc: 'Full staff management' },
          { icon: Settings2, label: 'Smart Logic', desc: 'Auto-scheduling engine' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
            <Icon className="w-5 h-5 text-brand-300 mx-auto mb-2" />
            <div className="text-white text-xs font-bold">{label}</div>
            <div className="text-slate-500 text-[10px] mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="group flex items-center gap-3 bg-brand-600 hover:bg-brand-500 text-white font-bold px-8 py-4 rounded-2xl shadow-lg shadow-brand-900/50 transition-all duration-200 hover:scale-105 text-base"
      >
        Begin Setup
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
      <p className="text-slate-600 text-xs mt-4">Takes less than a minute</p>
    </div>
  )
}

// ── Step 1: Organization ──────────────────────────────────────────────────────
function StepOrganization({
  data, onChange, onNext, onBack,
}: {
  data: WizardData
  onChange: (d: Partial<WizardData>) => void
  onNext: () => void
  onBack: () => void
}) {
  const canNext = data.orgName.trim().length >= 2

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-8 fade-in duration-400">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Building2 className="w-5 h-5 text-brand-300" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">Your Organization</h2>
          <p className="text-slate-400 text-sm">Tell us who you are</p>
        </div>
      </div>

      <div className="space-y-5 flex-1">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            Organization / Unit Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={data.orgName}
            onChange={e => onChange({ orgName: e.target.value })}
            placeholder="e.g. Kartavya Battalion, HQ Unit..."
            className="w-full bg-white/5 border border-white/10 hover:border-brand-500/50 focus:border-brand-400 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 outline-none transition-all text-base"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
            Sub-Unit / Department <span className="text-slate-600">(optional)</span>
          </label>
          <input
            type="text"
            value={data.unit}
            onChange={e => onChange({ unit: e.target.value })}
            placeholder="e.g. Operations Wing, Admin Section..."
            className="w-full bg-white/5 border border-white/10 hover:border-brand-500/50 focus:border-brand-400 rounded-xl px-4 py-3.5 text-white placeholder-slate-600 outline-none transition-all text-base"
          />
        </div>

        {data.orgName.trim() && (
          <div className="bg-brand-900/40 border border-brand-700/30 rounded-2xl p-4 animate-in fade-in duration-300">
            <div className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-2">Preview</div>
            <div className="text-white font-bold text-base">{data.orgName.trim()}</div>
            {data.unit.trim() && (
              <div className="text-brand-300 text-sm mt-0.5">{data.unit.trim()}</div>
            )}
            <div className="text-slate-500 text-xs mt-2 font-mono">Powered by KRAM v1.0</div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!canNext}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-base transition-all',
            canNext
              ? 'bg-brand-600 hover:bg-brand-500 text-white'
              : 'bg-white/5 text-slate-600 cursor-not-allowed',
          )}
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Settings ──────────────────────────────────────────────────────────
function StepSettings({
  data, onChange, onNext, onBack,
}: {
  data: WizardData
  onChange: (d: Partial<WizardData>) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-8 fade-in duration-400">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-brand-300" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">Roster Rules</h2>
          <p className="text-slate-400 text-sm">Smart defaults — change anytime in Settings</p>
        </div>
      </div>

      <div className="space-y-4 flex-1">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <div className="text-white font-bold text-sm">Leave Rejoin Buffer</div>
              <div className="text-slate-500 text-xs mt-0.5">Days before staff re-enters duty pool after leave</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange({ leaveBuffer: Math.max(0, data.leaveBuffer - 1) })}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
              >−</button>
              <span className="text-white font-black text-lg w-6 text-center">{data.leaveBuffer}</span>
              <button
                onClick={() => onChange({ leaveBuffer: Math.min(7, data.leaveBuffer + 1) })}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
              >+</button>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-bold text-sm">Auto-Assign Standby</div>
              <div className="text-slate-500 text-xs mt-0.5">Automatically assign standby for each duty day</div>
            </div>
            <button
              onClick={() => onChange({ autoStandby: !data.autoStandby })}
              className={clsx(
                'relative w-12 h-6 rounded-full transition-all duration-300',
                data.autoStandby ? 'bg-brand-500' : 'bg-white/10',
              )}
            >
              <div className={clsx(
                'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300',
                data.autoStandby ? 'left-7' : 'left-1',
              )} />
            </button>
          </div>
        </div>

        <div className="bg-brand-900/30 border border-brand-700/20 rounded-2xl p-4">
          <p className="text-brand-300 text-xs leading-relaxed">
            These are recommended defaults. All settings can be fine-tuned later from the{' '}
            <strong className="text-brand-200">Settings</strong> page.
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all text-sm font-medium">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-base bg-brand-600 hover:bg-brand-500 text-white transition-all"
        >
          Review &amp; Launch <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Confirm + Launch ──────────────────────────────────────────────────
function StepLaunch({
  data, onBack, onComplete,
}: {
  data: WizardData
  onBack: () => void
  onComplete: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  const handleLaunch = async () => {
    setSubmitting(true)
    try {
      await setupApi.initialize({
        org_name: data.orgName.trim(),
        unit: data.unit.trim() || undefined,
        staff: [],
        leave_rejoin_buffer_days: data.leaveBuffer,
        auto_assign_standby: data.autoStandby,
      })
      toast.success('KRAM is ready!')
      onComplete()
    } catch (e: unknown) {
      toast.error(apiError(e, 'Setup failed — please try again'))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-8 fade-in duration-400">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">Review &amp; Launch</h2>
          <p className="text-slate-400 text-sm">Confirm your setup</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Organization</div>
          <div className="text-white font-bold">{data.orgName}</div>
          {data.unit && <div className="text-brand-300 text-sm">{data.unit}</div>}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Settings</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-400">Leave Buffer</div>
            <div className="text-white font-bold">{data.leaveBuffer} day{data.leaveBuffer !== 1 ? 's' : ''}</div>
            <div className="text-slate-400">Auto Standby</div>
            <div className={clsx('font-bold', data.autoStandby ? 'text-emerald-400' : 'text-slate-500')}>
              {data.autoStandby ? 'Enabled' : 'Disabled'}
            </div>
          </div>
        </div>

        <div className="bg-brand-900/30 border border-brand-700/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-brand-400" />
            <span className="text-brand-300 text-xs font-bold uppercase tracking-wider">Staff</span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Add your team members from the <strong className="text-slate-300">Staff</strong> page after setup.
            You can add, edit, and manage staff at any time.
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all text-sm font-medium disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={handleLaunch}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-base bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-60 shadow-lg shadow-emerald-900/50"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Setting up KRAM...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 fill-white/20" />
              Launch KRAM
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main Wizard ───────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const qc = useQueryClient()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<WizardData>({
    orgName: '',
    unit: '',
    leaveBuffer: 2,
    autoStandby: true,
  })

  const update = useCallback((patch: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...patch }))
  }, [])

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  const onComplete = () => {
    qc.invalidateQueries({ queryKey: ['setup-status'] })
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 flex flex-col overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-brand-800/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      {step > 0 && (
        <div className="relative z-10 flex items-center justify-between px-8 pt-8 pb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-400 fill-brand-400/30" />
            <span className="kram-wordmark text-sm tracking-[0.2em] text-white/60">KRAM</span>
          </div>
          <StepDots current={step} />
          <div className="text-xs text-slate-600 font-mono">Step {step} of {TOTAL_STEPS - 1}</div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 overflow-hidden">
        <div className={clsx(
          'w-full',
          step === 0 ? 'max-w-lg h-full flex items-center' : 'max-w-xl',
        )}>
          {step === 0 && (
            <div className="w-full">
              <StepWelcome onNext={next} />
            </div>
          )}
          {step === 1 && (
            <div className="bg-white/3 border border-white/8 rounded-3xl p-8 backdrop-blur-sm" style={{ minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
              <StepOrganization data={data} onChange={update} onNext={next} onBack={back} />
            </div>
          )}
          {step === 2 && (
            <div className="bg-white/3 border border-white/8 rounded-3xl p-8 backdrop-blur-sm" style={{ minHeight: '440px', display: 'flex', flexDirection: 'column' }}>
              <StepSettings data={data} onChange={update} onNext={next} onBack={back} />
            </div>
          )}
          {step === 3 && (
            <div className="bg-white/3 border border-white/8 rounded-3xl p-8 backdrop-blur-sm" style={{ minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
              <StepLaunch data={data} onBack={back} onComplete={onComplete} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center py-4 text-slate-700 text-[10px] tracking-widest">
        KRAM v1.0 &nbsp;·&nbsp; Kartavya Development &nbsp;·&nbsp; Not for commercial use
      </div>
    </div>
  )
}
