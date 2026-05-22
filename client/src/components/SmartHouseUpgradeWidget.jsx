import { createPortal } from 'react-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Download, Shield, Wrench, Cloud, RefreshCw, CheckCircle,
  XCircle, AlertTriangle, X, Package, RotateCcw,
  HardDrive, ChevronDown, ChevronUp, Archive, Power,
  ChevronRight, Server, Activity, Zap, Cpu, Terminal,
} from 'lucide-react'

// ─── design tokens ────────────────────────────────────────────────────────────
const T = {
  accent:    'var(--accent, #2563eb)',
  success:   '#10b981',
  danger:    '#ef4444',
  warning:   '#f59e0b',
  cyan:      '#06b6d4',
  purple:    '#8b5cf6',
  textPri:   'var(--text-primary)',
  textSec:   'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  bgSurf:    'var(--bg-surface)',
  bgSurf2:   'var(--bg-surface-2)',
  bgSurf3:   'var(--bg-surface-3)',
  border:    'var(--border)',
  mono:      'var(--font-mono)',
  r:         { sm: '5px', md: '9px', lg: '13px', xl: '18px', full: '99px' },
  sp:        { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem' },
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const fj = async (url, opts) => {
  const r = await fetch(url, opts)
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || d.message || `HTTP ${r.status}`)
  return d
}
const parseSize = s => (s ? s.split('\t')[0].trim() : '—')
const toInt     = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n }
const clamp     = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

const parseDf = raw => {
  if (!raw) return null
  const lines = raw.trim().split('\n').filter(Boolean)
  const cols  = lines[lines.length - 1].split(/\s+/)
  if (cols.length < 5) return null
  return { size: cols[1], used: cols[2], avail: cols[3], pct: parseInt(cols[4]) }
}

const EMPTY_WF = {
  kind: '', title: '', color: '#10b981',
  running: false, done: false, error: null,
  step: '', progress: 0, output: [], message: '',
}

// Nextcloud steps per la progress bar granulare
const NC_STEPS = [
  { n: 1, label: 'Pre-check',           color: T.cyan   },
  { n: 2, label: 'Maintenance ON',      color: T.warning },
  { n: 3, label: 'DB backup',           color: T.success },
  { n: 4, label: 'Volume snapshot',     color: T.success },
  { n: 5, label: 'Pull images',         color: T.purple  },
  { n: 6, label: 'Recreate containers', color: T.purple  },
  { n: 7, label: 'occ upgrade',         color: T.accent  },
  { n: 8, label: 'Maintenance OFF',     color: T.success },
]

function useIsMobile(bp = 640) {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= bp : false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${bp}px)`)
    const handler = e => setIsMobile(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    setIsMobile(mq.matches)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', handler); else mq.removeListener(handler) }
  }, [bp])
  return isMobile
}

// ─── atoms ────────────────────────────────────────────────────────────────────
function Dot({ color, pulse }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: color, display: 'inline-block',
      animation: pulse ? 'shu-pulse 1.8s ease-in-out infinite' : 'none',
    }} />
  )
}

function MiniBar({ pct = 0, color = T.accent, height = 4, bg }) {
  const p = clamp(pct, 0, 100)
  return (
    <div style={{ height, background: bg || T.bgSurf3, borderRadius: T.r.full, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <div style={{
        height: '100%', width: `${p}%`, borderRadius: T.r.full,
        background: color,
        transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
      }} />
    </div>
  )
}

function OutputLog({ lines = [], maxHeight = 180 }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [lines])
  return (
    <div ref={ref} style={{
      background: '#060d1f', borderRadius: T.r.md,
      padding: '0.6rem 0.75rem', fontFamily: T.mono,
      fontSize: '0.63rem', lineHeight: 1.7, color: '#6b8cb0',
      maxHeight, minHeight: 48, overflowY: 'auto',
      border: '1px solid rgba(37,99,235,0.12)',
    }}>
      {lines.length === 0
        ? <span style={{ color: 'rgba(255,255,255,0.12)' }}>Waiting for output…</span>
        : lines.map((l, i) => {
            const isErr = /error|fail|errore|❌/i.test(l)
            const isOk  = /✓|success|completat/i.test(l)
            const isCmd = l.includes('$ ')
            const isHdr = l.startsWith('═') || l.includes('STEP ')
            const isWrn = /⚠|warning/i.test(l)
            return (
              <div key={i} style={{
                color: isErr ? '#f87171' : isOk ? '#34d399' : isCmd ? '#93c5fd' : isHdr ? '#60a5fa' : isWrn ? '#fbbf24' : '#6b8cb0',
                fontWeight: isHdr || isCmd ? 600 : 400,
              }}>{l}</div>
            )
          })}
    </div>
  )
}

function Chip({ label, value, color, pulse }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '0.28rem 0.55rem', borderRadius: T.r.md,
      background: `color-mix(in srgb,${color} 8%,${T.bgSurf3})`,
      border: `1px solid color-mix(in srgb,${color} 20%,${T.border})`,
    }}>
      <Dot color={color} pulse={pulse} />
      <span style={{ fontSize: '0.55rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: '0.63rem', fontWeight: 800, color }}>{value}</span>
    </div>
  )
}

function ActionCard({ icon: Icon, label, sub, color = T.accent, primary, onClick, disabled, badge }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        width: '100%', textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: primary ? '0.72rem 0.85rem' : '0.48rem 0.7rem',
        borderRadius: T.r.md, opacity: disabled ? 0.42 : 1,
        background: primary
          ? hov ? `color-mix(in srgb,${color} 18%,${T.bgSurf2})` : `color-mix(in srgb,${color} 10%,${T.bgSurf2})`
          : hov ? T.bgSurf3 : T.bgSurf2,
        border: `1px solid ${primary
          ? `color-mix(in srgb,${color} ${hov ? 42 : 24}%,${T.border})`
          : hov ? `color-mix(in srgb,${color} 26%,${T.border})` : T.border}`,
        transition: 'all 0.14s ease',
        boxShadow: primary && hov ? `0 4px 18px color-mix(in srgb,${color} 16%,transparent)` : 'none',
      }}
    >
      <span style={{
        width: primary ? 30 : 24, height: primary ? 30 : 24,
        borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb,${color} 14%,transparent)`,
        border: `1.5px solid color-mix(in srgb,${color} 28%,transparent)`, color,
      }}>
        <Icon size={primary ? 13 : 10} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: primary ? '0.71rem' : '0.66rem', fontWeight: 700, color: T.textPri, lineHeight: 1.2 }}>{label}</div>
        {sub && <div style={{ fontSize: '0.56rem', color: T.textMuted, marginTop: 1, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {badge && (
        <span style={{ padding: '1px 7px', borderRadius: T.r.full, background: `color-mix(in srgb,${color} 14%,transparent)`, color, fontFamily: T.mono, fontSize: '0.55rem', fontWeight: 800, border: `1px solid color-mix(in srgb,${color} 24%,transparent)`, flexShrink: 0 }}>
          {badge}
        </span>
      )}
      <ChevronRight size={9} style={{ color: T.textMuted, flexShrink: 0, opacity: hov ? 1 : 0.3, transition: 'opacity 0.14s' }} />
    </button>
  )
}

// ── StepBadge generico ────────────────────────────────────────────────────────
function StepBadge({ step, progress, running, color }) {
  if (!step || !running) return null
  const c = color || T.cyan
  return (
    <div style={{
      padding: '0.38rem 0.65rem', borderRadius: T.r.sm,
      background: `color-mix(in srgb,${c} 6%,${T.bgSurf3})`,
      border: `1px solid color-mix(in srgb,${c} 15%,${T.border})`,
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={8} style={{ color: c, animation: 'shu-spin 0.9s linear infinite' }} />
          <span style={{ fontFamily: T.mono, fontSize: '0.59rem', color: c, fontWeight: 700 }}>{step}</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: '0.59rem', color: T.textMuted }}>{progress}%</span>
      </div>
      <MiniBar pct={progress} color={c} height={2} bg={`color-mix(in srgb,${c} 8%,transparent)`} />
    </div>
  )
}

// ── Nextcloud step stepper ─────────────────────────────────────────────────────
function NextcloudStepper({ workflow }) {
  const running  = workflow.running && !workflow.done && !workflow.error
  const done     = workflow.done && !workflow.error
  const pct      = clamp(workflow.progress || 0, 0, 100)
  // Calcola step corrente dal progresso (1-8)
  const curStep  = Math.ceil(pct / (100 / NC_STEPS.length))

  return (
    <div style={{
      background: T.bgSurf2, borderRadius: T.r.md, padding: '0.65rem 0.75rem',
      border: `1px solid color-mix(in srgb,${T.purple} 18%,${T.border})`,
      display: 'flex', flexDirection: 'column', gap: '0.45rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Cloud size={10} style={{ color: T.purple, flexShrink: 0 }} />
        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: T.purple, flex: 1 }}>
          Nextcloud Update
        </span>
        {running && (
          <span style={{ fontFamily: T.mono, fontSize: '0.57rem', color: T.textMuted }}>
            {pct}%
          </span>
        )}
        {done && <CheckCircle size={10} style={{ color: T.success }} />}
        {workflow.error && <XCircle size={10} style={{ color: T.danger }} />}
      </div>

      {/* Barra globale */}
      <MiniBar
        pct={pct}
        color={workflow.error ? T.danger : done ? T.success : T.purple}
        height={3}
        bg={`color-mix(in srgb,${T.purple} 10%,${T.bgSurf3})`}
      />

      {/* Griglia step */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.28rem' }}>
        {NC_STEPS.map(s => {
          const isPast    = pct >= (s.n / NC_STEPS.length * 100)
          const isCurrent = running && curStep === s.n
          const isError   = workflow.error && curStep === s.n
          const dotColor  = isError ? T.danger : isPast || isCurrent ? s.color : T.textMuted
          return (
            <div key={s.n} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0.2rem 0.3rem', borderRadius: T.r.sm,
              background: isCurrent
                ? `color-mix(in srgb,${s.color} 10%,${T.bgSurf3})`
                : 'transparent',
              border: isCurrent
                ? `1px solid color-mix(in srgb,${s.color} 22%,${T.border})`
                : '1px solid transparent',
              transition: 'all 0.2s',
            }}>
              <Dot color={dotColor} pulse={isCurrent} />
              <span style={{
                fontFamily: T.mono, fontSize: '0.5rem',
                color: isCurrent ? s.color : isPast ? T.textSec : T.textMuted,
                fontWeight: isCurrent ? 800 : 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.n}. {s.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step corrente + output live */}
      {(running || workflow.error) && workflow.step && (
        <div style={{ fontSize: '0.58rem', color: workflow.error ? T.danger : T.purple, fontFamily: T.mono, display: 'flex', alignItems: 'center', gap: 5 }}>
          {running && <RefreshCw size={7} style={{ animation: 'shu-spin 0.8s linear infinite', flexShrink: 0 }} />}
          {workflow.error && <XCircle size={7} style={{ flexShrink: 0 }} />}
          {workflow.step}
        </div>
      )}
    </div>
  )
}

function DiskBar({ dfData }) {
  if (!dfData) return null
  const pct   = isNaN(dfData.pct) ? 0 : dfData.pct
  const color = pct > 85 ? T.danger : pct > 70 ? T.warning : T.success
  return (
    <div style={{ background: T.bgSurf2, borderRadius: T.r.md, padding: '0.58rem 0.7rem', border: `1px solid ${pct > 85 ? 'rgba(239,68,68,0.25)' : T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <span style={{ fontFamily: T.mono, fontSize: '0.58rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          / root
        </span>
        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <span style={{ fontFamily: T.mono, fontSize: '0.6rem', color: T.textSec }}>
            <span style={{ color, fontWeight: 800 }}>{dfData.used}</span>
            <span style={{ color: T.textMuted }}> / {dfData.size}</span>
          </span>
          <span style={{ fontFamily: T.mono, fontSize: '0.65rem', fontWeight: 800, color, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
        </div>
      </div>
      <MiniBar pct={pct} color={color} height={5} />
      <div style={{ marginTop: '0.22rem', fontFamily: T.mono, fontSize: '0.55rem', color: T.textMuted, textAlign: 'right' }}>
        {dfData.avail} available
      </div>
    </div>
  )
}

function StatTile({ label, value, color, loading }) {
  return (
    <div style={{ padding: '0.5rem 0.6rem', borderRadius: T.r.md, background: T.bgSurf2, border: `1px solid ${T.border}`, textAlign: 'center' }}>
      <div style={{ fontFamily: T.mono, fontSize: '0.9rem', fontWeight: 900, color, lineHeight: 1.1 }}>
        {loading ? '…' : value}
      </div>
      <div style={{ fontSize: '0.52rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function WorkflowFooter({ wf, expanded, onToggle, onClear }) {
  if (!wf.kind) return null
  const running   = wf.running && !wf.done && !wf.error
  const statusC   = wf.error ? T.danger : wf.done ? T.success : running ? wf.color : T.textMuted
  const statusLbl = wf.error ? 'Error' : wf.done ? 'Done ✓' : running ? 'Running…' : 'Idle'
  const pct       = clamp(wf.progress || 0, 0, 100)

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.bgSurf2 }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.42rem 0.85rem', cursor: 'pointer', userSelect: 'none' }}>
        <Dot color={statusC} pulse={running} />
        <span style={{ fontFamily: T.mono, fontSize: '0.62rem', fontWeight: 700, color: T.textPri, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {wf.title}
        </span>
        <div style={{ width: 68, flexShrink: 0 }}>
          <MiniBar pct={pct} color={wf.color || T.success} height={3} />
        </div>
        <span style={{ fontFamily: T.mono, fontSize: '0.56rem', fontWeight: 800, color: statusC, flexShrink: 0, minWidth: 26, textAlign: 'right' }}>{pct}%</span>
        <span style={{ fontSize: '0.57rem', fontWeight: 700, color: statusC, flexShrink: 0 }}>{statusLbl}</span>
        {!running && (wf.done || wf.error) && (
          <button onClick={e => { e.stopPropagation(); onClear() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, display: 'flex', padding: 1 }}>
            <X size={10} />
          </button>
        )}
        <span style={{ color: T.textMuted, display: 'flex' }}>{expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</span>
      </div>
      {!expanded && wf.step && running && (
        <div style={{ padding: '0 0.85rem 0.35rem', fontSize: '0.57rem', color: T.textMuted, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <RefreshCw size={7} style={{ display: 'inline', marginRight: 5, animation: 'shu-spin 0.8s linear infinite' }} />
          {wf.step}
        </div>
      )}
      {expanded && (
        <div style={{ padding: '0 0.72rem 0.72rem' }}>
          {wf.error && (
            <div style={{ marginBottom: '0.4rem', padding: '0.32rem 0.5rem', borderRadius: T.r.sm, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', fontSize: '0.62rem', color: T.danger }}>
              {wf.error}
            </div>
          )}
          {/* Terminal output espanso */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: '0.28rem' }}>
            <Terminal size={8} style={{ color: T.textMuted }} />
            <span style={{ fontFamily: T.mono, fontSize: '0.52rem', color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Output
            </span>
          </div>
          <OutputLog lines={(wf.output || []).slice(-40)} maxHeight={220} />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATION SYSTEM
// ════════════════════════════════════════════════════════════════════════════
function Toast({ notice, onClose, isMobile }) {
  const timerRef = useRef(null)
  const tone = notice?.tone

  useEffect(() => {
    if (!notice) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onClose, 4000)
    return () => clearTimeout(timerRef.current)
  }, [notice, onClose])

  if (!notice) return null

  const c   = tone === 'danger' ? T.danger : tone === 'success' ? T.success : T.warning
  const Ico = tone === 'danger' ? XCircle  : tone === 'success' ? CheckCircle : AlertTriangle

  const sharedStyle = {
    zIndex: 300,
    background: T.bgSurf,
    border: `1px solid color-mix(in srgb, ${c} 28%, ${T.border})`,
    borderLeft: `3px solid ${c}`,
    padding: '0.75rem 0.85rem 0.75rem 0.9rem',
    boxShadow: `0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)`,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    overflow: 'hidden',
    pointerEvents: 'auto',
    position: 'fixed',
  }

  const containerStyle = isMobile ? {
    ...sharedStyle,
    bottom: 12, right: 'auto', left: '50%', top: 'auto',
    transform: 'translateX(-50%)',
    width: 'min(92vw, 640px)',
    borderRadius: T.r.md,
    animation: 'shu-toast-in-mobile 0.28s cubic-bezier(.32,1.1,.42,1)',
  } : {
    ...sharedStyle,
    top: 24, right: 24, bottom: 'auto', left: 'auto', transform: 'none',
    width: 'min(340px, calc(100vw - 48px))',
    borderRadius: T.r.xl,
    animation: 'shu-toast-in-desktop 0.28s cubic-bezier(.32,1.1,.42,1)',
  }

  const toastNode = (
    <div style={containerStyle}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, height: 2,
        background: c, borderRadius: '0 0 0 3px',
        animation: 'shu-toast-progress 4s linear forwards',
        transformOrigin: 'left', opacity: 0.55,
      }} />
      <span style={{ color: c, flexShrink: 0, marginTop: 1 }}><Ico size={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: T.textPri }}>{notice.title}</div>
        {notice.message && (
          <div style={{ fontSize: '0.63rem', color: T.textSec, lineHeight: 1.45, marginTop: 2 }}>{notice.message}</div>
        )}
        {notice.details && (
          <div style={{ marginTop: 6 }}>
            <OutputLog lines={String(notice.details).split('\n')} maxHeight={90} />
          </div>
        )}
      </div>
      <button onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, flexShrink: 0, padding: 2, borderRadius: 4, lineHeight: 1, transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = T.textPri}
        onMouseLeave={e => e.currentTarget.style.color = T.textMuted}
      >
        <X size={12} />
      </button>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(toastNode, document.body) : toastNode
}

function ConfirmSheet({ data, onClose, onConfirm }) {
  useEffect(() => {
    if (!data) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [data, onClose])

  if (!data) return null

  const c   = data.tone === 'danger' ? T.danger : T.warning
  const Ico = data.tone === 'danger' ? XCircle : AlertTriangle

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 298, background: 'rgba(0,0,0,0.28)' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 299,
        background: T.bgSurf, borderTop: `1px solid ${T.border}`,
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: '0 0 env(safe-area-inset-bottom)',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.22)',
        animation: 'shu-sheet-up 0.28s cubic-bezier(.32,1.1,.42,1)',
        maxWidth: 600, margin: '0 auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.30)' }} />
        </div>
        <div style={{ padding: '0.75rem 1.25rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `color-mix(in srgb,${c} 14%,transparent)`,
              color: c, border: `1px solid color-mix(in srgb,${c} 24%,transparent)`,
            }}><Ico size={13} /></span>
            <span style={{ fontWeight: 800, fontSize: '0.82rem', color: T.textPri, flex: 1 }}>{data.title}</span>
            <button onClick={onClose} style={{ background: T.bgSurf2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 6px', cursor: 'pointer', color: T.textMuted, lineHeight: 1 }}>
              <X size={13} />
            </button>
          </div>
          <p style={{
            fontSize: '0.68rem', color: T.textSec, lineHeight: 1.6, marginBottom: '1rem',
            padding: '0.55rem 0.7rem',
            background: `color-mix(in srgb,${c} 5%,${T.bgSurf2})`,
            border: `1px solid color-mix(in srgb,${c} 14%,${T.border})`,
            borderRadius: T.r.md,
          }}>
            {data.message}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary btn--sm" onClick={onConfirm}>
              {data.confirmLabel || 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0.15rem 0 0.35rem' }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{ fontSize: '0.53rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.textMuted, fontFamily: T.mono, flexShrink: 0 }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  )
}
const Sep = () => <div style={{ height: 1, background: T.border, margin: '0.5rem 0' }} />

// ══════════════════════════════════════════════════════════════════════════════
// MAIN WIDGET
// ══════════════════════════════════════════════════════════════════════════════
export default function SmartHouseUpgradeWidget() {
  const [tab,         setTab]         = useState('upgrade')
  const [pkgInfo,     setPkgInfo]     = useState(null)
  const [diskUsage,   setDiskUsage]   = useState(null)
  const [throttle,    setThrottle]    = useState(null)
  const [reboot,      setReboot]      = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [workflow,    setWorkflow]    = useState(EMPTY_WF)
  const [wfExpanded,  setWfExpanded]  = useState(false)
  const [confirm,     setConfirm]     = useState(null)
  const [notice,      setNotice]      = useState(null)
  const [busy,        setBusy]        = useState(false)
  const [pkgOpen,     setPkgOpen]     = useState(false)
  const [dirOpen,     setDirOpen]     = useState(false)
  const [backing,     setBacking]     = useState(false)
  const [backupLines, setBackupLines] = useState([])

  // Stato locale Nextcloud per mostrare lo stepper
  const [ncWorkflow,  setNcWorkflow]  = useState(null)

  const isMobile = useIsMobile(640)
  const closeNotice = useCallback(() => setNotice(null), [])

  // ── load all health data ─────────────────────────────────────────────────
  const loadHealth = async () => {
    setLoading(true)
    const [pkg, disk, thr, rb] = await Promise.allSettled([
      fj('/api/system/package_info'),
      fj('/api/system/disk_usage'),
      fj('/api/system/throttle'),
      fj('/api/system/check_reboot_required'),
    ])
    if (pkg.status  === 'fulfilled') setPkgInfo(pkg.value)
    if (disk.status === 'fulfilled') setDiskUsage(disk.value)
    if (thr.status  === 'fulfilled') setThrottle(thr.value)
    if (rb.status   === 'fulfilled') setReboot(rb.value)
    setLoading(false)
  }
  useEffect(() => { loadHealth() }, [])

  // ── poll active workflow ─────────────────────────────────────────────────
  useEffect(() => {
    if (!workflow.kind || !workflow.running) return
    const POLL_URLS = {
      upgrade:     '/api/system/upgrade/status',
      fullUpgrade: '/api/system/full_upgrade/status',
      maintenance: '/api/system/maintenance/status',
      nextcloud:   '/api/system/nextcloud_update/status',
    }
    const url = POLL_URLS[workflow.kind]
    if (!url) return
    const id = setInterval(async () => {
      try {
        const d = await fj(url)
        setWorkflow(prev => ({
          ...prev, ...d,
          running: !(d.done || d.error),
          output:  d.output || prev.output,
          color:   prev.color,
          title:   prev.title,
        }))
        // Aggiorna anche lo stepper Nextcloud dedicato
        if (workflow.kind === 'nextcloud') {
          setNcWorkflow(d)
        }
        if (d.done || d.error) {
          clearInterval(id)
          setBusy(false)
          loadHealth()
          setNotice({
            title:   d.error ? 'Nextcloud update failed' : 'Nextcloud update completed ✓',
            tone:    d.error ? 'danger' : 'success',
            message: d.error || d.message || 'Done.',
          })
        }
      } catch (e) {
        setWorkflow(prev => ({ ...prev, error: e.message, running: false }))
        clearInterval(id)
        setBusy(false)
        setNotice({ title: 'Poll error', tone: 'danger', message: e.message })
      }
    }, 2000)
    return () => clearInterval(id)
  }, [workflow.kind, workflow.running])

  // ── start async workflow ──────────────────────────────────────────────────
  const startWf = async ({ kind, title, color, url, step, body }) => {
    setBusy(true)
    try {
      await fj(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      setWorkflow({ kind, title, color, running: true, done: false, error: null, step, progress: 0, output: [], message: '' })
    } catch (e) {
      setNotice({ title: 'Workflow error', tone: 'danger', message: e.message })
    } finally {
      setBusy(false)
    }
  }

  const ask = (title, message, confirmLabel, fn, tone = 'warning') =>
    setConfirm({ title, message, confirmLabel, tone, onConfirm: fn })

  // ── backup ────────────────────────────────────────────────────────────────
  const runBackup = async () => {
    setBacking(true)
    setBackupLines(['$ /usr/local/bin/backup.sh'])
    try {
      const d = await fj('/api_run_backup', { method: 'POST' })
      setBackupLines(prev => [...prev, ...(d.output || d.message || 'Done').split('\n'), '✓ Backup completed'])
      setNotice({ title: 'Backup completed', tone: 'success', message: d.message || 'Script executed successfully.' })
    } catch (e) {
      setBackupLines(prev => [...prev, `❌ ${e.message}`])
      setNotice({ title: 'Backup error', tone: 'danger', message: e.message })
    } finally { setBacking(false) }
  }

  // ── power actions ─────────────────────────────────────────────────────────
  const doPower = async action => {
    setBusy(true)
    try {
      await fj(`/api/system/${action}`, { method: 'POST' })
      setNotice({
        title: action === 'reboot' ? 'Rebooting…' : 'Shutting down…',
        tone: 'success',
        message: `Host ${action === 'reboot' ? 'reboot' : 'shutdown'} initiated.`,
      })
    } catch (e) {
      setNotice({ title: 'Error', tone: 'danger', message: e.message })
    } finally { setBusy(false) }
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const upgradable  = toInt(pkgInfo?.upgradable_count)
  const autoremove  = toInt(pkgInfo?.autoremovable_count)
  const installed   = toInt(pkgInfo?.installed_count)
  const aptCache    = parseSize(diskUsage?.apt_cache_size)
  const logSize     = parseSize(diskUsage?.log_size)
  const needsReboot = reboot?.required
  const throttleOk  = throttle?.ok
  const throttleFlg = (throttle?.flags || []).length
  const dfData      = parseDf(diskUsage?.summary?.raw)

  // Workflow Nextcloud attivo (sia dal wf globale che dallo stato locale)
  const ncActive = workflow.kind === 'nextcloud' ? workflow : null
  const showNcStepper = ncActive || (ncWorkflow && (ncWorkflow.running || ncWorkflow.done || ncWorkflow.error))

  const TABS = [
    { id: 'upgrade',  label: 'Upgrade',  icon: Download },
    { id: 'maintain', label: 'Maintain', icon: Wrench   },
    { id: 'backup',   label: 'Backup',   icon: Archive  },
  ]

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: UPGRADE
  // ══════════════════════════════════════════════════════════════════════════
  const renderUpgrade = () => {
    const isFullUpgradeRunning = workflow.running && workflow.kind === 'fullUpgrade'
    const isNcRunning          = workflow.running && workflow.kind === 'nextcloud'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp.sm }}>
        {/* Progress badge per Full Upgrade */}
        {isFullUpgradeRunning && (
          <StepBadge
            step={workflow.step} progress={workflow.progress}
            running={true} color={T.accent}
          />
        )}

        <ActionCard
          primary icon={Download} label="Full Upgrade" color={T.accent}
          sub="8 steps · pre-check · full-upgrade · autoremove · autoclean · firmware check · report"
          badge={upgradable > 0 ? `${upgradable} pkg` : null}
          disabled={busy}
          onClick={() => ask(
            'Start Full Upgrade?',
            '8 steps: pre-check (disk + connection), backup package list, apt update, apt full-upgrade (non-interactive), autoremove, autoclean, firmware verification, final report + reboot check.',
            'Start Full Upgrade',
            () => startWf({ kind: 'fullUpgrade', title: 'Full Upgrade', color: T.accent, url: '/api/system/full_upgrade/start', step: 'Initializing…' }),
          )}
        />

        <ActionCard
          icon={Shield} label="APT Upgrade" color={T.cyan}
          sub="apt-get update + apt-get upgrade"
          disabled={busy}
          onClick={() => ask(
            'Start APT Upgrade?',
            'Runs apt-get update then apt-get upgrade. Faster than Full Upgrade — does not remove obsolete packages or check firmware.',
            'Start',
            () => startWf({ kind: 'upgrade', title: 'APT Upgrade', color: T.cyan, url: '/api/system/upgrade/start', step: 'Updating packages…' }),
          )}
        />

        <Sep />
        <SectionLabel>Nextcloud</SectionLabel>

        {/* Stepper Nextcloud — visibile se c'è un workflow NC attivo o completato */}
        {showNcStepper && (
          <NextcloudStepper workflow={ncActive || ncWorkflow} />
        )}

        <ActionCard
          primary={!showNcStepper} icon={Cloud} label="Nextcloud Update" color={T.purple}
          sub="8 step sicuri · pre-check · maintenance · DB dump · pull · occ upgrade"
          disabled={busy}
          onClick={() => ask(
            'Aggiornare Nextcloud?',
            [
              'Processo in 8 step:',
              '1. Pre-check Docker e container',
              '2. Maintenance mode ON',
              '3. Backup database MariaDB → /tmp',
              '4. Snapshot volume dati',
              '5. docker compose pull (nuove immagini)',
              '6. docker compose up -d --force-recreate',
              '7. occ upgrade + migrazioni DB',
              '8. Maintenance mode OFF + status check',
              '',
              'In caso di errore il maintenance mode rimane attivo per sicurezza.',
            ].join('\n'),
            'Avvia aggiornamento',
            () => startWf({
              kind: 'nextcloud', title: 'Nextcloud Update', color: T.purple,
              url: '/api/system/nextcloud_update/start',
              step: 'Pre-check…',
            }),
          )}
        />

        {/* Lista pacchetti upgradabili */}
        {(pkgInfo?.upgradable_list || []).length > 0 && (
          <>
            <Sep />
            <button
              onClick={() => setPkgOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '0.12rem 0', color: T.textSec }}
            >
              <Package size={10} />
              <span style={{ fontFamily: T.mono, fontSize: '0.6rem', fontWeight: 700, flex: 1, textAlign: 'left' }}>
                {pkgInfo.upgradable_list.length} upgradable packages
              </span>
              {pkgOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
            {pkgOpen && (
              <div style={{ background: T.bgSurf3, borderRadius: T.r.sm, padding: '0.4rem 0.6rem', border: `1px solid ${T.border}` }}>
                {pkgInfo.upgradable_list.slice(0, 20).map((p, i) => (
                  <div key={i} style={{ fontFamily: T.mono, fontSize: '0.58rem', color: T.textSec, lineHeight: 1.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</div>
                ))}
                {pkgInfo.upgradable_list.length > 20 && (
                  <div style={{ fontSize: '0.56rem', color: T.textMuted, marginTop: 2 }}>…and {pkgInfo.upgradable_list.length - 20} more</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: MAINTAIN
  // ══════════════════════════════════════════════════════════════════════════
  const renderMaintain = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp.sm }}>
      <SectionLabel>Package repair</SectionLabel>

      <ActionCard
        primary icon={Wrench} label="Fix Broken Packages" color={T.warning}
        sub="dpkg --configure -a · apt-get install -f"
        disabled={busy}
        onClick={() => ask(
          'Fix broken packages?',
          'dpkg --configure -a reconfigures half-installed packages, then apt-get install -f resolves broken dependencies. Safe, non-destructive.',
          'Fix',
          () => startWf({ kind: 'maintenance', title: 'Fix Broken', color: T.warning, url: '/api/system/maintenance/fix_broken', step: 'Repairing…' }),
          'warning',
        )}
      />

      <ActionCard
        icon={RotateCcw} label="Clean All" color={T.success}
        sub="apt clean · autoclean · autoremove --purge · vacuum logs 7d · thumbnail cache"
        disabled={busy}
        onClick={() => ask(
          'Full system cleanup?',
          'apt clean → autoclean → autoremove --purge → journalctl --vacuum-time=7d → thumbnail cache. Frees space without removing user-installed packages.',
          'Clean',
          () => startWf({ kind: 'maintenance', title: 'Clean All', color: T.success, url: '/api/system/maintenance/clean_all', step: 'Cleaning…' }),
        )}
      />

      <Sep />
      <SectionLabel>Power</SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: T.sp.sm }}>
        <ActionCard
          icon={RotateCcw} label="Reboot" color={T.warning}
          sub="restart host OS"
          disabled={busy}
          onClick={() => ask(
            'Reboot the host?',
            'The host will restart in a few seconds. All running services will be interrupted briefly.',
            'Reboot',
            () => doPower('reboot'),
            'danger',
          )}
        />
        <ActionCard
          icon={Power} label="Shutdown" color={T.danger}
          sub="power off host"
          disabled={busy}
          onClick={() => ask(
            'Power off the host?',
            'The host will shut down completely. You will need physical access to turn it back on.',
            'Shut down',
            () => doPower('shutdown'),
            'danger',
          )}
        />
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: BACKUP
  // ══════════════════════════════════════════════════════════════════════════
  const renderBackup = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: T.sp.sm }}>
      <div style={{
        padding: '0.58rem 0.72rem', borderRadius: T.r.md,
        background: `color-mix(in srgb,${T.success} 7%,${T.bgSurf2})`,
        border: `1px solid color-mix(in srgb,${T.success} 22%,${T.border})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Archive size={10} style={{ color: T.success }} />
          <span style={{ fontSize: '0.64rem', fontWeight: 700, color: T.success }}>Script configured</span>
        </div>
        <p style={{ fontSize: '0.6rem', color: T.textSec, lineHeight: 1.5, margin: 0 }}>
          Runs <span style={{ fontFamily: T.mono, color: T.cyan }}>/usr/local/bin/backup.sh</span> — snapshots config, user data and packages, then sends the archive via SMTP.
        </p>
      </div>

      <ActionCard
        primary icon={Archive} label="Start Backup" color={T.success}
        sub="snapshot · user data · email attachment"
        disabled={backing}
        badge={backing ? 'Running…' : null}
        onClick={runBackup}
      />

      {reboot && (
        <>
          <Sep />
          <div style={{
            padding: '0.48rem 0.68rem', borderRadius: T.r.md,
            background: needsReboot ? 'rgba(239,68,68,0.07)' : `color-mix(in srgb,${T.success} 7%,${T.bgSurf2})`,
            border: `1px solid ${needsReboot ? 'rgba(239,68,68,0.26)' : `color-mix(in srgb,${T.success} 22%,${T.border})`}`,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <Power size={10} style={{ color: needsReboot ? T.danger : T.success, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: '0.63rem', fontWeight: 700, color: needsReboot ? T.danger : T.success }}>
                {needsReboot ? '⚠ Reboot required' : '✓ No reboot required'}
              </div>
              {reboot.message && (
                <div style={{ fontFamily: T.mono, fontSize: '0.56rem', color: T.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                  {reboot.message}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {pkgInfo && (
        <>
          <SectionLabel>Package status</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: T.sp.sm }}>
            <StatTile label="Installed"  value={installed}  color={T.textSec}                              loading={loading} />
            <StatTile label="Upgradable" value={upgradable} color={upgradable > 0 ? T.warning : T.success} loading={loading} />
            <StatTile label="To remove"  value={autoremove} color={autoremove > 0 ? T.cyan : T.textSec}    loading={loading} />
          </div>
        </>
      )}

      {backupLines.length > 0 && (
        <>
          <SectionLabel>Last backup output</SectionLabel>
          <OutputLog lines={backupLines} maxHeight={110} />
        </>
      )}
    </div>
  )

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: T.sp.sm,
        padding: `0.42rem ${T.sp.lg}`, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <span style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: `color-mix(in srgb,${T.accent} 12%,transparent)`, color: T.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid color-mix(in srgb,${T.accent} 24%,transparent)`,
        }}>
          <Server size={11} />
        </span>
        <span style={{ fontWeight: 800, fontSize: '0.69rem', color: T.textPri, flex: 1, letterSpacing: '-0.01em' }}>
          System Manager
        </span>

        <div style={{ display: 'flex', gap: 3 }}>
          <Chip
            label="pkg"
            value={loading ? '…' : upgradable > 0 ? `${upgradable}↑` : '✓'}
            color={loading ? T.textMuted : upgradable > 0 ? T.warning : T.success}
            pulse={upgradable > 0}
          />
          <Chip
            label="cpu"
            value={loading ? '…' : throttleOk == null ? '—' : throttleOk ? 'OK' : `${throttleFlg}!`}
            color={loading ? T.textMuted : throttleOk == null ? T.textMuted : throttleOk ? T.success : T.warning}
            pulse={throttleOk === false}
          />
          <Chip
            label="reboot"
            value={loading ? '…' : needsReboot ? '⚠' : 'OK'}
            color={loading ? T.textMuted : needsReboot ? T.danger : T.success}
            pulse={!!needsReboot}
          />
        </div>

        <button
          onClick={loadHealth} disabled={loading}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, display: 'flex', padding: 2 }}
          title="Refresh"
        >
          <RefreshCw size={11} style={{ animation: loading ? 'shu-spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.bgSurf2 }}>
        {TABS.map(t => {
          const Icon   = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '0.46rem 0.2rem', background: 'none', border: 'none',
              borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
              cursor: 'pointer', color: active ? T.accent : T.textMuted,
              fontSize: '0.6rem', fontWeight: active ? 800 : 500,
              transition: 'all 0.13s ease',
            }}>
              <Icon size={10} strokeWidth={active ? 2.5 : 1.8} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: T.sp.lg }}>
        {tab === 'upgrade'  && renderUpgrade()}
        {tab === 'maintain' && renderMaintain()}
        {tab === 'backup'   && renderBackup()}
      </div>

      {/* ── Workflow footer ── */}
      <WorkflowFooter
        wf={workflow} expanded={wfExpanded}
        onToggle={() => setWfExpanded(v => !v)}
        onClear={() => { setWorkflow(EMPTY_WF); setWfExpanded(false); setNcWorkflow(null) }}
      />

      {/* ── Notifications ── */}
      <ConfirmSheet
        data={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const fn = confirm?.onConfirm
          setConfirm(null)
          try { await fn?.() } catch (e) { setNotice({ title: 'Error', tone: 'danger', message: e.message }) }
        }}
      />

      <Toast notice={notice} onClose={closeNotice} isMobile={isMobile} />

      <style>{`
        @keyframes shu-spin  { to { transform: rotate(360deg); } }
        @keyframes shu-pulse { 0%,100%{opacity:1} 50%{opacity:0.28} }
        @keyframes shu-toast-in-desktop {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes shu-toast-in-mobile {
          from { opacity: 0; transform: translateY(12px) translateX(-50%); }
          to   { opacity: 1; transform: translateY(0)    translateX(-50%); }
        }
        @keyframes shu-toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        @keyframes shu-sheet-up {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}