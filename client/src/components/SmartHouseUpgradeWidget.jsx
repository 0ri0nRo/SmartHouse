import { createPortal } from 'react-dom'
import { createElement, useEffect, useState, useRef, useCallback } from 'react'
import {
  Download, Shield, Wrench, Cloud, RefreshCw, CheckCircle,
  XCircle, AlertTriangle, X, Package, RotateCcw,
  HardDrive, ChevronDown, ChevronUp, Archive, Power,
  ChevronRight, Server, Activity, Zap, Cpu, Terminal,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/Card'
import Button from './ui/Button'
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from './ui/Modal'

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
  r:         { sm: '6px', md: '10px', lg: '14px', xl: '20px', full: '99px' },
  sp:        { xs: '0.25rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
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

const NC_STEPS = [
  { n: 1, label: 'Pre-check',      color: T.cyan   },
  { n: 2, label: 'Maintenance ON', color: T.warning },
  { n: 3, label: 'DB backup',      color: T.success },
  { n: 4, label: 'Snapshot',       color: T.success },
  { n: 5, label: 'Pull images',    color: T.purple  },
  { n: 6, label: 'Recreate',       color: T.purple  },
  { n: 7, label: 'occ upgrade',    color: T.accent  },
  { n: 8, label: 'Maint. OFF',     color: T.success },
]

function useIsMobile(bp = 640) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    if (window.matchMedia) return window.matchMedia(`(max-width: ${bp}px)`).matches
    return window.innerWidth <= bp
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${bp}px)`)
    const handler = e => setIsMobile(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [bp])
  return isMobile
}

// ─── atoms ────────────────────────────────────────────────────────────────────
function Dot({ color, pulse }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: color, display: 'inline-block',
      animation: pulse ? 'shu-pulse 1.8s ease-in-out infinite' : 'none',
    }} />
  )
}

function MiniBar({ pct = 0, color = T.accent, height = 4, bg }) {
  const p = clamp(pct, 0, 100)
  return (
    <div style={{
      height,
      background: bg || T.bgSurf3,
      borderRadius: T.r.full,
      overflow: 'hidden',
      border: `1px solid ${T.border}`,
    }}>
      <div style={{
        height: '100%',
        width: `${p}%`,
        borderRadius: T.r.full,
        background: color,
        transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
      }} />
    </div>
  )
}

function OutputLog({ lines = [], maxHeight = 180 }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])
  return (
    <div ref={ref} style={{
      background: '#060d1f',
      borderRadius: T.r.md,
      padding: '0.75rem 1rem',
      fontFamily: T.mono,
      fontSize: '0.68rem',
      lineHeight: 1.8,
      color: '#6b8cb0',
      maxHeight,
      minHeight: 56,
      overflowY: 'auto',
      border: '1px solid rgba(37,99,235,0.12)',
    }}>
      {lines.length === 0
        ? <span style={{ color: 'rgba(255,255,255,0.18)' }}>Waiting for output…</span>
        : lines.map((l, i) => {
            const isErr = /error|fail|errore|❌/i.test(l)
            const isOk  = /✓|success|completat/i.test(l)
            const isCmd = l.includes('$ ')
            const isHdr = l.startsWith('═') || l.includes('STEP ')
            const isWrn = /⚠|warning/i.test(l)
            return (
              <div key={i} style={{
                color: isErr ? '#f87171' : isOk ? '#34d399' : isCmd ? '#93c5fd'
                  : isHdr ? '#60a5fa' : isWrn ? '#fbbf24' : '#6b8cb0',
                fontWeight: isHdr || isCmd ? 600 : 400,
              }}>{l}</div>
            )
          })}
    </div>
  )
}

// ─── StatusBadge (replaces Chip) ──────────────────────────────────────────────
function StatusBadge({ label, value, color, pulse }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0.35rem 0.7rem',
      borderRadius: T.r.full,
      background: `color-mix(in srgb,${color} 10%,${T.bgSurf3})`,
      border: `1px solid color-mix(in srgb,${color} 22%,${T.border})`,
      flexShrink: 0,
    }}>
      <Dot color={color} pulse={pulse} />
      <span style={{
        fontSize: '0.6rem',
        color: T.textMuted,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: T.mono,
      }}>{label}</span>
      <span style={{
        fontFamily: T.mono,
        fontSize: '0.68rem',
        fontWeight: 800,
        color,
      }}>{value}</span>
    </div>
  )
}

// ─── ActionCard ───────────────────────────────────────────────────────────────
function ActionCard({ icon: Icon, label, sub, color = T.accent, primary, onClick, disabled, badge }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        width: '100%',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: primary ? '1rem 1.1rem' : '0.7rem 0.9rem',
        borderRadius: T.r.lg,
        opacity: disabled ? 0.42 : 1,
        background: primary
          ? hov
            ? `color-mix(in srgb,${color} 16%,${T.bgSurf2})`
            : `color-mix(in srgb,${color} 9%,${T.bgSurf2})`
          : hov ? T.bgSurf3 : T.bgSurf2,
        border: `1px solid ${
          primary
            ? `color-mix(in srgb,${color} ${hov ? 40 : 22}%,${T.border})`
            : hov
              ? `color-mix(in srgb,${color} 24%,${T.border})`
              : T.border
        }`,
        transition: 'all 0.15s ease',
        boxShadow: primary && hov
          ? `0 4px 20px color-mix(in srgb,${color} 14%,transparent)`
          : 'none',
      }}
    >
      <span style={{
        width: primary ? 36 : 30,
        height: primary ? 36 : 30,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `color-mix(in srgb,${color} 14%,transparent)`,
        border: `1.5px solid color-mix(in srgb,${color} 28%,transparent)`,
        color,
      }}>
        {createElement(Icon, { size: primary ? 15 : 13 })}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: primary ? '0.78rem' : '0.72rem',
          fontWeight: 700,
          color: T.textPri,
          lineHeight: 1.3,
          marginBottom: sub ? '0.2rem' : 0,
        }}>{label}</div>
        {sub && (
          <div style={{
            fontSize: '0.62rem',
            color: T.textMuted,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{sub}</div>
        )}
      </div>

      {badge && (
        <span style={{
          padding: '3px 9px',
          borderRadius: T.r.full,
          background: `color-mix(in srgb,${color} 14%,transparent)`,
          color,
          fontFamily: T.mono,
          fontSize: '0.6rem',
          fontWeight: 800,
          border: `1px solid color-mix(in srgb,${color} 24%,transparent)`,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>
          {badge}
        </span>
      )}

      <ChevronRight
        size={12}
        style={{
          color: T.textMuted,
          flexShrink: 0,
          opacity: hov ? 1 : 0.25,
          transition: 'opacity 0.14s',
        }}
      />
    </button>
  )
}

// ─── StepBadge ────────────────────────────────────────────────────────────────
function StepBadge({ step, progress, running, color }) {
  if (!step || !running) return null
  const c = color || T.cyan
  return (
    <div style={{
      padding: '0.6rem 0.85rem',
      borderRadius: T.r.md,
      background: `color-mix(in srgb,${c} 7%,${T.bgSurf3})`,
      border: `1px solid color-mix(in srgb,${c} 16%,${T.border})`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={10} style={{ color: c, animation: 'shu-spin 0.9s linear infinite', flexShrink: 0 }} />
          <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: c, fontWeight: 700 }}>{step}</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: T.textMuted, fontWeight: 700 }}>{progress}%</span>
      </div>
      <MiniBar pct={progress} color={c} height={3} bg={`color-mix(in srgb,${c} 10%,transparent)`} />
    </div>
  )
}

// ─── Nextcloud stepper ────────────────────────────────────────────────────────
function NextcloudStepper({ workflow }) {
  const running = workflow.running && !workflow.done && !workflow.error
  const done    = workflow.done && !workflow.error
  const pct     = clamp(workflow.progress || 0, 0, 100)
  const curStep = Math.ceil(pct / (100 / NC_STEPS.length))

  return (
    <div style={{
      background: T.bgSurf2,
      borderRadius: T.r.lg,
      padding: '1rem 1.1rem',
      border: `1px solid color-mix(in srgb,${T.purple} 20%,${T.border})`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Cloud size={13} style={{ color: T.purple, flexShrink: 0 }} />
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: T.purple, flex: 1 }}>
          Nextcloud Update
        </span>
        {running && (
          <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: T.textMuted, fontWeight: 700 }}>
            {pct}%
          </span>
        )}
        {done && <CheckCircle size={13} style={{ color: T.success }} />}
        {workflow.error && <XCircle size={13} style={{ color: T.danger }} />}
      </div>

      {/* Progress bar */}
      <MiniBar
        pct={pct}
        color={workflow.error ? T.danger : done ? T.success : T.purple}
        height={4}
        bg={`color-mix(in srgb,${T.purple} 12%,${T.bgSurf3})`}
      />

      {/* Steps grid — 4 columns, wraps to 2 rows of 4 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0.4rem',
      }}>
        {NC_STEPS.map(s => {
          const isPast    = pct >= (s.n / NC_STEPS.length * 100)
          const isCurrent = running && curStep === s.n
          const isError   = workflow.error && curStep === s.n
          const dotColor  = isError ? T.danger : isPast || isCurrent ? s.color : T.textMuted

          return (
            <div key={s.n} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0.28rem 0.4rem',
              borderRadius: T.r.sm,
              background: isCurrent
                ? `color-mix(in srgb,${s.color} 12%,${T.bgSurf3})`
                : 'transparent',
              border: isCurrent
                ? `1px solid color-mix(in srgb,${s.color} 24%,${T.border})`
                : '1px solid transparent',
              transition: 'all 0.2s',
            }}>
              <Dot color={dotColor} pulse={isCurrent} />
              <span style={{
                fontFamily: T.mono,
                fontSize: '0.58rem',
                color: isCurrent ? s.color : isPast ? T.textSec : T.textMuted,
                fontWeight: isCurrent ? 800 : 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {s.n}. {s.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Current step label */}
      {(running || workflow.error) && workflow.step && (
        <div style={{
          fontSize: '0.62rem',
          color: workflow.error ? T.danger : T.purple,
          fontFamily: T.mono,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderTop: `1px solid color-mix(in srgb,${T.purple} 14%,${T.border})`,
          paddingTop: '0.5rem',
          marginTop: '0.1rem',
        }}>
          {running && (
            <RefreshCw size={9} style={{ animation: 'shu-spin 0.8s linear infinite', flexShrink: 0 }} />
          )}
          {workflow.error && <XCircle size={9} style={{ flexShrink: 0 }} />}
          {workflow.step}
        </div>
      )}
    </div>
  )
}

// ─── DiskBar ──────────────────────────────────────────────────────────────────
function DiskBar({ dfData }) {
  if (!dfData) return null
  const pct   = isNaN(dfData.pct) ? 0 : dfData.pct
  const color = pct > 85 ? T.danger : pct > 70 ? T.warning : T.success

  return (
    <div style={{
      background: T.bgSurf2,
      borderRadius: T.r.md,
      padding: '0.75rem 0.9rem',
      border: `1px solid ${pct > 85 ? 'rgba(239,68,68,0.25)' : T.border}`,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem',
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: '0.62rem',
          color: T.textMuted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}>/ root</span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: T.textSec }}>
            <span style={{ color, fontWeight: 800 }}>{dfData.used}</span>
            <span style={{ color: T.textMuted }}> / {dfData.size}</span>
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize: '0.72rem',
            fontWeight: 800,
            color,
            minWidth: 32,
            textAlign: 'right',
          }}>{pct}%</span>
        </div>
      </div>
      <MiniBar pct={pct} color={color} height={6} />
      <div style={{
        marginTop: '0.3rem',
        fontFamily: T.mono,
        fontSize: '0.58rem',
        color: T.textMuted,
        textAlign: 'right',
      }}>
        {dfData.avail} available
      </div>
    </div>
  )
}

// ─── StatTile ─────────────────────────────────────────────────────────────────
function StatTile({ label, value, color, loading }) {
  return (
    <div style={{
      padding: '0.75rem 0.9rem',
      borderRadius: T.r.md,
      background: T.bgSurf2,
      border: `1px solid ${T.border}`,
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: '1rem',
        fontWeight: 900,
        color,
        lineHeight: 1.1,
      }}>
        {loading ? '…' : value}
      </div>
      <div style={{
        fontSize: '0.56rem',
        color: T.textMuted,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginTop: 5,
      }}>{label}</div>
    </div>
  )
}

// ─── WorkflowFooter ───────────────────────────────────────────────────────────
function WorkflowFooter({ wf, expanded, onToggle, onClear }) {
  if (!wf.kind) return null
  const running   = wf.running && !wf.done && !wf.error
  const statusC   = wf.error ? T.danger : wf.done ? T.success : running ? wf.color : T.textMuted
  const statusLbl = wf.error ? 'Error' : wf.done ? 'Done ✓' : running ? 'Running…' : 'Idle'
  const pct       = clamp(wf.progress || 0, 0, 100)

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.bgSurf2 }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.6rem 1rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Dot color={statusC} pulse={running} />
        <span style={{
          fontFamily: T.mono,
          fontSize: '0.68rem',
          fontWeight: 700,
          color: T.textPri,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {wf.title}
        </span>
        <div style={{ width: 80, flexShrink: 0 }}>
          <MiniBar pct={pct} color={wf.color || T.success} height={3} />
        </div>
        <span style={{
          fontFamily: T.mono,
          fontSize: '0.62rem',
          fontWeight: 800,
          color: statusC,
          flexShrink: 0,
          minWidth: 30,
          textAlign: 'right',
        }}>{pct}%</span>
        <span style={{
          fontSize: '0.62rem',
          fontWeight: 700,
          color: statusC,
          flexShrink: 0,
        }}>{statusLbl}</span>
        {!running && (wf.done || wf.error) && (
          <button
            onClick={e => { e.stopPropagation(); onClear() }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.textMuted,
              display: 'flex',
              padding: 2,
            }}
          >
            <X size={12} />
          </button>
        )}
        <span style={{ color: T.textMuted, display: 'flex' }}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </div>

      {!expanded && wf.step && running && (
        <div style={{
          padding: '0 1rem 0.45rem',
          fontSize: '0.62rem',
          color: T.textMuted,
          fontFamily: T.mono,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <RefreshCw size={8} style={{ animation: 'shu-spin 0.8s linear infinite', flexShrink: 0 }} />
          {wf.step}
        </div>
      )}

      {expanded && (
        <div style={{ padding: '0 1rem 1rem' }}>
          {wf.error && (
            <div style={{
              marginBottom: '0.6rem',
              padding: '0.5rem 0.75rem',
              borderRadius: T.r.md,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.22)',
              fontSize: '0.65rem',
              color: T.danger,
            }}>
              {wf.error}
            </div>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: '0.4rem',
          }}>
            <Terminal size={10} style={{ color: T.textMuted }} />
            <span style={{
              fontFamily: T.mono,
              fontSize: '0.56rem',
              color: T.textMuted,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>Output</span>
          </div>
          <OutputLog lines={(wf.output || []).slice(-40)} maxHeight={240} />
        </div>
      )}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ notice, onClose, isMobile }) {
  const timerRef = useRef(null)
  const tone = notice?.tone

  useEffect(() => {
    if (!notice) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onClose, 4500)
    return () => clearTimeout(timerRef.current)
  }, [notice, onClose])

  if (!notice) return null

  const c   = tone === 'danger' ? T.danger : tone === 'success' ? T.success : T.warning
  const Ico = tone === 'danger' ? XCircle  : tone === 'success' ? CheckCircle : AlertTriangle

  const baseStyle = {
    position: 'fixed',
    zIndex: 300,
    background: T.bgSurf,
    border: `1px solid color-mix(in srgb, ${c} 28%, ${T.border})`,
    borderLeft: `3px solid ${c}`,
    padding: '0.9rem 1rem 0.9rem 1.05rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    overflow: 'hidden',
    pointerEvents: 'auto',
    animation: 'shu-toast-in-bottom 0.28s cubic-bezier(.32,1.1,.42,1)',
  }

  const containerStyle = isMobile ? {
    ...baseStyle,
    bottom: 80,
    right: 'auto',
    left: '50%',
    top: 'auto',
    transform: 'translateX(-50%)',
    width: 'min(92vw, 640px)',
    borderRadius: T.r.lg,
  } : {
    ...baseStyle,
    bottom: 28,
    right: 28,
    top: 'auto',
    left: 'auto',
    transform: 'none',
    width: 'min(360px, calc(100vw - 56px))',
    borderRadius: T.r.xl,
  }

  const toastNode = (
    <div style={containerStyle}>
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 2,
        background: c,
        borderRadius: '0 0 0 3px',
        animation: 'shu-toast-progress 4.5s linear forwards',
        transformOrigin: 'left',
        opacity: 0.5,
      }} />
      <span style={{ color: c, flexShrink: 0, marginTop: 1 }}>
        <Ico size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: T.textPri }}>{notice.title}</div>
        {notice.message && (
          <div style={{
            fontSize: '0.67rem',
            color: T.textSec,
            lineHeight: 1.5,
            marginTop: 3,
          }}>{notice.message}</div>
        )}
        {notice.details && (
          <div style={{ marginTop: 8 }}>
            <OutputLog lines={String(notice.details).split('\n')} maxHeight={90} />
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: T.textMuted,
          flexShrink: 0,
          padding: 2,
          borderRadius: 4,
          lineHeight: 1,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = T.textPri}
        onMouseLeave={e => e.currentTarget.style.color = T.textMuted}
      >
        <X size={13} />
      </button>
    </div>
  )

  return typeof document !== 'undefined'
    ? createPortal(toastNode, document.body)
    : toastNode
}

// ─── Layout helpers ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '0.25rem 0 0.5rem',
    }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      <span style={{
        fontSize: '0.57rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: T.textMuted,
        fontFamily: T.mono,
        flexShrink: 0,
      }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  )
}

const Sep = () => <div style={{ height: 1, background: T.border, margin: '0.75rem 0' }} />

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
  const [backing,     setBacking]     = useState(false)
  const [backupLines, setBackupLines] = useState([])
  const [ncWorkflow,  setNcWorkflow]  = useState(null)

  const isMobile   = useIsMobile(640)
  const closeNotice = useCallback(() => setNotice(null), [])

  // ── load health ──────────────────────────────────────────────────────────
  const loadHealth = useCallback(async () => {
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
  }, [])

  useEffect(() => { loadHealth() }, [loadHealth])

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
        if (workflow.kind === 'nextcloud') setNcWorkflow(d)
        if (d.done || d.error) {
          clearInterval(id)
          setBusy(false)
          loadHealth()
          setNotice({
            title:   d.error ? `${workflow.title} failed` : `${workflow.title} completed ✓`,
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
  }, [workflow.kind, workflow.running, loadHealth, workflow.title])

  // ── start workflow ───────────────────────────────────────────────────────
  const startWf = async ({ kind, title, color, url, step, body }) => {
    setBusy(true)
    try {
      await fj(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      setWorkflow({
        kind, title, color,
        running: true, done: false, error: null,
        step, progress: 0, output: [], message: '',
      })
      setWfExpanded(false)
    } catch (e) {
      setNotice({ title: 'Workflow error', tone: 'danger', message: e.message })
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
      setBackupLines(prev => [
        ...prev,
        ...(d.output || d.message || 'Done').split('\n'),
        '✓ Backup completed',
      ])
      setNotice({ title: 'Backup completed', tone: 'success', message: d.message || 'Script executed successfully.' })
    } catch (e) {
      setBackupLines(prev => [...prev, `❌ ${e.message}`])
      setNotice({ title: 'Backup error', tone: 'danger', message: e.message })
    } finally {
      setBacking(false)
    }
  }

  // ── power ─────────────────────────────────────────────────────────────────
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
    } finally {
      setBusy(false)
    }
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

  const ncActive      = workflow.kind === 'nextcloud' ? workflow : null
  const showNcStepper = ncActive || (ncWorkflow && (ncWorkflow.running || ncWorkflow.done || ncWorkflow.error))

  const TABS = [
    { id: 'upgrade',  label: 'Upgrade',  icon: Download },
    { id: 'maintain', label: 'Maintain', icon: Wrench   },
    { id: 'backup',   label: 'Backup',   icon: Archive  },
  ]

  // ── Tab: UPGRADE ─────────────────────────────────────────────────────────
  const renderUpgrade = () => {
    const isFullRunning = workflow.running && workflow.kind === 'fullUpgrade'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {isFullRunning && (
          <StepBadge
            step={workflow.step}
            progress={workflow.progress}
            running={true}
            color={T.accent}
          />
        )}

        <ActionCard
          primary
          icon={Download}
          label="Full Upgrade"
          color={T.accent}
          sub="8 steps · pre-check · full-upgrade · autoremove · autoclean · firmware · report"
          badge={upgradable > 0 ? `${upgradable} pkg` : null}
          disabled={busy}
          onClick={() => ask(
            'Start Full Upgrade?',
            '8 steps: pre-check (disk + connection), backup package list, apt update, apt full-upgrade (non-interactive), autoremove, autoclean, firmware verification, final report + reboot check.',
            'Start Full Upgrade',
            () => startWf({
              kind: 'fullUpgrade', title: 'Full Upgrade', color: T.accent,
              url: '/api/system/full_upgrade/start', step: 'Initializing…',
            }),
          )}
        />

        <ActionCard
          icon={Shield}
          label="APT Upgrade"
          color={T.cyan}
          sub="apt-get update + apt-get upgrade"
          disabled={busy}
          onClick={() => ask(
            'Start APT Upgrade?',
            'Runs apt-get update then apt-get upgrade. Faster than Full Upgrade — does not remove obsolete packages or check firmware.',
            'Start',
            () => startWf({
              kind: 'upgrade', title: 'APT Upgrade', color: T.cyan,
              url: '/api/system/upgrade/start', step: 'Updating packages…',
            }),
          )}
        />

        <Sep />
        <SectionLabel>Nextcloud</SectionLabel>

        {showNcStepper && (
          <NextcloudStepper workflow={ncActive || ncWorkflow} />
        )}

        <ActionCard
          primary={!showNcStepper}
          icon={Cloud}
          label="Nextcloud Update"
          color={T.purple}
          sub="8 step sicuri · pre-check · maintenance · DB dump · pull · occ upgrade"
          disabled={busy}
          onClick={() => ask(
            'Update Nextcloud?',
            [
              '8-step process:',
              '1. Pre-check Docker and container',
              '2. Maintenance mode ON',
              '3. Backup MariaDB database → /tmp',
              '4. Snapshot data volume',
              '5. docker compose pull (new images)',
              '6. docker compose up -d --force-recreate',
              '7. occ upgrade + DB migrations',
              '8. Maintenance mode OFF + status check',
              '',
              'If an error occurs, maintenance mode remains active for safety.',
            ].join('\n'),
            'Start Update',
            () => startWf({
              kind: 'nextcloud', title: 'Nextcloud Update', color: T.purple,
              url: '/api/system/nextcloud_update/start', step: 'Pre-check…',
            }),
          )}
        />

        {(pkgInfo?.upgradable_list || []).length > 0 && (
          <>
            <Sep />
            <button
              onClick={() => setPkgOpen(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.15rem 0.1rem',
                color: T.textSec,
              }}
            >
              <Package size={12} />
              <span style={{ fontFamily: T.mono, fontSize: '0.66rem', fontWeight: 700, flex: 1, textAlign: 'left' }}>
                {pkgInfo.upgradable_list.length} upgradable packages
              </span>
              {pkgOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>

            {pkgOpen && (
              <div style={{
                background: T.bgSurf3,
                borderRadius: T.r.md,
                padding: '0.6rem 0.8rem',
                border: `1px solid ${T.border}`,
              }}>
                {pkgInfo.upgradable_list.slice(0, 20).map((p, i) => (
                  <div key={i} style={{
                    fontFamily: T.mono,
                    fontSize: '0.63rem',
                    color: T.textSec,
                    lineHeight: 1.8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{p}</div>
                ))}
                {pkgInfo.upgradable_list.length > 20 && (
                  <div style={{ fontSize: '0.6rem', color: T.textMuted, marginTop: 4 }}>
                    …and {pkgInfo.upgradable_list.length - 20} more
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Tab: MAINTAIN ────────────────────────────────────────────────────────
  const renderMaintain = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <SectionLabel>Package repair</SectionLabel>

      <ActionCard
        primary
        icon={Wrench}
        label="Fix Broken Packages"
        color={T.warning}
        sub="dpkg --configure -a · apt-get install -f"
        disabled={busy}
        onClick={() => ask(
          'Fix broken packages?',
          'dpkg --configure -a reconfigures half-installed packages, then apt-get install -f resolves broken dependencies. Safe, non-destructive.',
          'Fix',
          () => startWf({
            kind: 'maintenance', title: 'Fix Broken', color: T.warning,
            url: '/api/system/maintenance/fix_broken', step: 'Repairing…',
          }),
          'warning',
        )}
      />

      <ActionCard
        icon={RotateCcw}
        label="Clean All"
        color={T.success}
        sub="apt clean · autoclean · autoremove --purge · vacuum logs 7d · thumbnail cache"
        disabled={busy}
        onClick={() => ask(
          'Full system cleanup?',
          'apt clean → autoclean → autoremove --purge → journalctl --vacuum-time=7d → thumbnail cache. Frees space without removing user-installed packages.',
          'Clean',
          () => startWf({
            kind: 'maintenance', title: 'Clean All', color: T.success,
            url: '/api/system/maintenance/clean_all', step: 'Cleaning…',
          }),
        )}
      />

      <Sep />
      <SectionLabel>Power</SectionLabel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
        <ActionCard
          icon={RotateCcw}
          label="Reboot"
          color={T.warning}
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
          icon={Power}
          label="Shutdown"
          color={T.danger}
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

  // ── Tab: BACKUP ──────────────────────────────────────────────────────────
  const renderBackup = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <div style={{
        padding: '0.75rem 0.9rem',
        borderRadius: T.r.lg,
        background: `color-mix(in srgb,${T.success} 7%,${T.bgSurf2})`,
        border: `1px solid color-mix(in srgb,${T.success} 22%,${T.border})`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Archive size={12} style={{ color: T.success, flexShrink: 0 }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: T.success }}>Script configured</span>
        </div>
        <p style={{ fontSize: '0.64rem', color: T.textSec, lineHeight: 1.55, margin: 0 }}>
          Runs{' '}
          <span style={{ fontFamily: T.mono, color: T.cyan }}>/usr/local/bin/backup.sh</span>
          {' '}— snapshots config, user data and packages, then sends the archive via SMTP.
        </p>
      </div>

      <ActionCard
        primary
        icon={Archive}
        label="Start Backup"
        color={T.success}
        sub="snapshot · user data · email attachment"
        disabled={backing}
        badge={backing ? 'Running…' : null}
        onClick={runBackup}
      />

      {reboot && (
        <>
          <Sep />
          <div style={{
            padding: '0.65rem 0.85rem',
            borderRadius: T.r.md,
            background: needsReboot
              ? 'rgba(239,68,68,0.07)'
              : `color-mix(in srgb,${T.success} 7%,${T.bgSurf2})`,
            border: `1px solid ${
              needsReboot
                ? 'rgba(239,68,68,0.26)'
                : `color-mix(in srgb,${T.success} 22%,${T.border})`
            }`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}>
            <Power
              size={13}
              style={{ color: needsReboot ? T.danger : T.success, flexShrink: 0, marginTop: 1 }}
            />
            <div>
              <div style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: needsReboot ? T.danger : T.success,
                marginBottom: reboot.message ? 3 : 0,
              }}>
                {needsReboot ? '⚠ Reboot required' : '✓ No reboot required'}
              </div>
              {reboot.message && (
                <div style={{
                  fontFamily: T.mono,
                  fontSize: '0.6rem',
                  color: T.textMuted,
                  lineHeight: 1.45,
                }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem' }}>
            <StatTile label="Installed"  value={installed}  color={T.textSec}                              loading={loading} />
            <StatTile label="Upgradable" value={upgradable} color={upgradable > 0 ? T.warning : T.success} loading={loading} />
            <StatTile label="To remove"  value={autoremove} color={autoremove > 0 ? T.cyan : T.textSec}    loading={loading} />
          </div>
        </>
      )}

      {(dfData || aptCache !== '—' || logSize !== '—') && (
        <>
          <SectionLabel>Disk usage</SectionLabel>
          {dfData && <DiskBar dfData={dfData} />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginTop: '0.1rem' }}>
            <StatTile label="APT cache" value={aptCache} color={T.cyan}    loading={loading} />
            <StatTile label="Logs"      value={logSize}  color={T.warning} loading={loading} />
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
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.65rem 1.1rem',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        <span style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          flexShrink: 0,
          background: `color-mix(in srgb,${T.accent} 12%,transparent)`,
          color: T.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1.5px solid color-mix(in srgb,${T.accent} 24%,transparent)`,
        }}>
          <Server size={13} />
        </span>

        <span style={{
          fontWeight: 800,
          fontSize: '0.76rem',
          color: T.textPri,
          flex: 1,
          letterSpacing: '-0.01em',
        }}>
          System Manager
        </span>

        {/* Status badges — spaced out, never squished */}
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <StatusBadge
            label="pkg"
            value={loading ? '…' : upgradable > 0 ? `${upgradable}↑` : '✓'}
            color={loading ? T.textMuted : upgradable > 0 ? T.warning : T.success}
            pulse={upgradable > 0}
          />
          <StatusBadge
            label="cpu"
            value={loading ? '…' : throttleOk == null ? '—' : throttleOk ? 'OK' : `${throttleFlg}!`}
            color={loading ? T.textMuted : throttleOk == null ? T.textMuted : throttleOk ? T.success : T.warning}
            pulse={throttleOk === false}
          />
          <StatusBadge
            label="reboot"
            value={loading ? '…' : needsReboot ? '⚠' : 'OK'}
            color={loading ? T.textMuted : needsReboot ? T.danger : T.success}
            pulse={!!needsReboot}
          />
        </div>

        <button
          onClick={loadHealth}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.textMuted,
            display: 'flex',
            padding: 4,
            borderRadius: T.r.sm,
            flexShrink: 0,
          }}
          title="Refresh"
        >
          <RefreshCw size={13} style={{ animation: loading ? 'shu-spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        background: T.bgSurf2,
      }}>
        {TABS.map(t => {
          const Icon   = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '0.6rem 0.5rem',
                background: 'none',
                border: 'none',
                borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
                cursor: 'pointer',
                color: active ? T.accent : T.textMuted,
                fontSize: '0.64rem',
                fontWeight: active ? 800 : 500,
                transition: 'all 0.13s ease',
              }}
            >
              <Icon size={12} strokeWidth={active ? 2.5 : 1.8} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.1rem' }}>
        {tab === 'upgrade'  && renderUpgrade()}
        {tab === 'maintain' && renderMaintain()}
        {tab === 'backup'   && renderBackup()}
      </div>

      {/* ── Workflow footer ── */}
      <WorkflowFooter
        wf={workflow}
        expanded={wfExpanded}
        onToggle={() => setWfExpanded(v => !v)}
        onClear={() => { setWorkflow(EMPTY_WF); setWfExpanded(false); setNcWorkflow(null) }}
      />

      {/* ── Confirm modal ── */}
      <Modal isOpen={!!confirm} onClose={() => setConfirm(null)}>
        <ModalHeader>
          <ModalTitle>{confirm?.title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <p>{confirm?.message}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={async () => {
              const fn = confirm?.onConfirm
              setConfirm(null)
              try { await fn?.() } catch (e) {
                setNotice({ title: 'Error', tone: 'danger', message: e.message })
              }
            }}
          >
            {confirm?.confirmLabel || 'Continue'}
          </Button>
        </ModalFooter>
      </Modal>

      <Toast notice={notice} onClose={closeNotice} isMobile={isMobile} />

      <style>{`
        @keyframes shu-spin { to { transform: rotate(360deg); } }
        @keyframes shu-pulse { 0%,100%{opacity:1} 50%{opacity:0.28} }
        @keyframes shu-toast-in-bottom {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shu-toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}