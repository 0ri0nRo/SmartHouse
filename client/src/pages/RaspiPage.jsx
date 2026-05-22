import { useState, useEffect, useRef, useCallback, Component } from 'react'
import {
  Activity, Terminal, Shield, RefreshCw, Play, X,
  Power, RotateCcw, Cpu, Wifi, FileText,
  AlertTriangle, Server, Zap, MapPin, Plus, Save, Trash2,
  ZoomIn, ZoomOut, GripVertical, Maximize2, Move, ChevronDown, ChevronUp,
  LayoutGrid, Eye, EyeOff, ExternalLink, Settings, ChevronRight,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import SmartHouseUpgradeWidget from '../components/SmartHouseUpgradeWidget'

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  accent:    'var(--accent, #2563eb)',
  success:   '#10b981',
  danger:    '#ef4444',
  warning:   '#f59e0b',
  muted:     '#8b5cf6',
  cyan:      '#06b6d4',
  textPri:   'var(--text-primary)',
  textSec:   'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  bgSurf:    'var(--bg-surface)',
  bgSurf2:   'var(--bg-surface-2)',
  bgSurf3:   'var(--bg-surface-3)',
  border:    'var(--border)',
  borderStr: 'var(--border-strong)',
  mono:      'var(--font-mono)',
  radius:    { sm:'6px', md:'10px', lg:'14px', xl:'18px', full:'99px' },
  space:     { xs:'0.25rem', sm:'0.5rem', md:'0.75rem', lg:'1rem', xl:'1.5rem' },
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT ENGINE  (desktop only)
// ─────────────────────────────────────────────────────────────────────────────
const GRID_COLS  = 12
const GRID_ROW_H = 60
const GRID_GAP   = 12
const MIN_CS     = 3
const MIN_RS     = 2
const LAYOUT_KEY = 'raspi-layout-v3'

const DEFAULT_LAYOUT = [
  { id:'gauges',    col:0,  row:0,  colSpan:12, rowSpan:3  },
  { id:'chart',     col:0,  row:3,  colSpan:8,  rowSpan:5  },
  { id:'devinfo',   col:8,  row:3,  colSpan:4,  rowSpan:3  },
  { id:'resources', col:8,  row:6,  colSpan:4,  rowSpan:2  },
  { id:'floorplan', col:0,  row:8,  colSpan:6,  rowSpan:4  },
  { id:'services',  col:6,  row:8,  colSpan:6,  rowSpan:4  },
  { id:'processes', col:6,  row:12, colSpan:6,  rowSpan:4  },
  { id:'network',   col:6,  row:16, colSpan:3,  rowSpan:4  },
  { id:'ssh',       col:0,  row:18, colSpan:12, rowSpan:5  },
  { id:'logs',      col:0,  row:23, colSpan:8,  rowSpan:5  },
  { id:'upgrade',   col:8,  row:23, colSpan:4,  rowSpan:3  },
  { id:'backup',    col:8,  row:26, colSpan:4,  rowSpan:2  },
]

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return DEFAULT_LAYOUT.map(d => ({ ...d, ...(saved.find(s => s.id === d.id) || {}) }))
    }
  } catch {}
  return DEFAULT_LAYOUT
}
function saveLayout(l) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID DRAG / RESIZE  (desktop only)
// ─────────────────────────────────────────────────────────────────────────────
function GridLayout({ layout, setLayout, editMode, children }) {
  const containerRef = useRef(null)
  const stateRef     = useRef(null)
  const rafRef       = useRef(null)

  const pxToCol = useCallback(px => {
    const el = containerRef.current
    if (!el) return 0
    return Math.round(px / ((el.offsetWidth + GRID_GAP) / GRID_COLS))
  }, [])
  const pxToRow = useCallback(px => Math.round(px / (GRID_ROW_H + GRID_GAP)), [])

  const onMove = useCallback(e => {
    if (!stateRef.current) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const { id, type, startX, startY, snapshot } = stateRef.current
      const dx = clientX - startX
      const dy = clientY - startY
      const base = snapshot.find(x => x.id === id)
      if (!base) return
      setLayout(prev => prev.map(x => {
        if (x.id !== id) return x
        if (type === 'drag') return {
          ...x,
          col: Math.max(0, Math.min(GRID_COLS - base.colSpan, base.col + pxToCol(dx))),
          row: Math.max(0, base.row + pxToRow(dy)),
        }
        return {
          ...x,
          colSpan: Math.max(MIN_CS, Math.min(GRID_COLS - base.col, base.colSpan + pxToCol(dx))),
          rowSpan: Math.max(MIN_RS, base.rowSpan + pxToRow(dy)),
        }
      }))
    })
  }, [pxToCol, pxToRow, setLayout])

  const onUp = useCallback(() => {
    if (!stateRef.current) return
    stateRef.current = null
    setLayout(prev => { saveLayout(prev); return prev })
  }, [setLayout])

  useEffect(() => {
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onMove, onUp])

  const startInteraction = (e, id, type) => {
    if (!editMode) return
    e.preventDefault(); e.stopPropagation()
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    stateRef.current = { id, type, startX: cx, startY: cy, snapshot: layout.map(x => ({ ...x })) }
  }

  const totalRows = layout.reduce((m, x) => Math.max(m, x.row + x.rowSpan), 0) + 1

  return (
    <div ref={containerRef} style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
      gridTemplateRows: `repeat(${totalRows}, ${GRID_ROW_H}px)`,
      gap: GRID_GAP,
    }}>
      {children(layout, (id, type) => editMode ? e => startInteraction(e, id, type) : undefined)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET SHELL  (desktop only)
// ─────────────────────────────────────────────────────────────────────────────
function Widget({ item, editMode, onDragStart, onResizeStart, hidden, children }) {
  if (hidden) return null
  return (
    <div style={{
      gridColumn: `${item.col + 1} / span ${item.colSpan}`,
      gridRow: `${item.row + 1} / span ${item.rowSpan}`,
      position: 'relative', borderRadius: T.radius.xl, overflow: 'hidden',
      outline: editMode ? `2px dashed ${T.accent}` : 'none', outlineOffset: 3,
      touchAction: editMode ? 'none' : 'auto',
    }}>
      {editMode && (
        <div onPointerDown={onDragStart} style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 30, zIndex: 30,
          cursor: 'grab', background: `color-mix(in srgb, ${T.accent} 12%, transparent)`,
          borderBottom: `1px dashed color-mix(in srgb, ${T.accent} 40%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <GripVertical size={13} color={T.accent} />
          <span style={{ fontFamily: T.mono, fontSize: '0.58rem', color: T.accent, opacity: 0.8 }}>{item.id}</span>
        </div>
      )}
      <div style={{ height: '100%', paddingTop: editMode ? 30 : 0, boxSizing: 'border-box' }}>{children}</div>
      {editMode && (
        <div onPointerDown={onResizeStart} style={{
          position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, zIndex: 30,
          cursor: 'nwse-resize', background: `color-mix(in srgb, ${T.accent} 15%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 6,
        }}>
          <Maximize2 size={10} color={T.accent} />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const toNum = v => { const x = parseFloat(v); return isNaN(x) ? null : x }
const fmtBytes = b => {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024).toFixed(0)} KB`
}

// ─────────────────────────────────────────────────────────────────────────────
// ──────────────────────────── MOBILE PRIMITIVES ──────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// ── BOTTOM SHEET ─────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children, maxHeight = '85vh' }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: T.bgSurf,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight, display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.35)',
        animation: 'slideUp 0.28s cubic-bezier(.32,1.1,.42,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.35)' }} />
        </div>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 14px', flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: T.textPri }}>{title}</span>
            <button onClick={onClose} style={{ background: T.bgSurf2, border: `1px solid ${T.border}`, borderRadius: 8, padding: '5px 7px', cursor: 'pointer', color: T.textSec, lineHeight: 1 }}>
              <X size={14} />
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
      </div>
    </>
  )
}

// ── BOTTOM NAV ───────────────────────────────────────────────────────────────
const NAV_TABS = [
  { id: 'stats',    label: 'Stats',    icon: Activity },
  { id: 'system',   label: 'System',   icon: Cpu },
  { id: 'control',  label: 'Control',  icon: Power },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
]

function BottomNav({ active, onChange, alerts }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: T.bgSurf, borderTop: `1px solid ${T.border}`,
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
      backdropFilter: 'blur(20px)',
    }}>
      {NAV_TABS.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, padding: '10px 0 8px', background: 'none', border: 'none',
              cursor: 'pointer', color: isActive ? T.accent : T.textMuted, position: 'relative',
              transition: 'color 0.15s',
            }}>
            {isActive && (
              <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, borderRadius: 1, background: T.accent }} />
            )}
            <div style={{ position: 'relative' }}>
              <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
              {tab.id === 'control' && alerts > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -6, width: 14, height: 14, borderRadius: '50%', background: T.danger, color: '#fff', fontSize: '0.46rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${T.bgSurf}` }}>{alerts}</span>
              )}
            </div>
            <span style={{ fontSize: '0.60rem', fontWeight: isActive ? 700 : 500, letterSpacing: '0.2px' }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── SETTINGS SHEET ───────────────────────────────────────────────────────────
const WIDGET_LABELS = {
  gauges: 'Gauges', chart: 'Live Trends', devinfo: 'Device Info',
  resources: 'Resources', floorplan: 'Mappa di Casa',
  services: 'Services', processes: 'Processes', network: 'Network',
  ssh: 'SSH Terminal', logs: 'Logs', upgrade: 'Updates', backup: 'Backup',
}

function SettingsSheet({ open, onClose, editMode, setEditMode, hiddenIds, toggleHidden, resetLayout, isMobile }) {
  const Section = ({ label, children }) => (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: T.textMuted, marginBottom: 10, fontFamily: T.mono }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )

  const ToggleRow = ({ icon: Icon, label, desc, active, onToggle, accentColor }) => (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 12,
      background: active ? `color-mix(in srgb,${accentColor || T.accent} 10%, transparent)` : T.bgSurf2,
      border: `1px solid ${active ? `color-mix(in srgb,${accentColor || T.accent} 35%, transparent)` : T.border}`,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: active ? `color-mix(in srgb,${accentColor || T.accent} 15%, transparent)` : 'rgba(148,163,184,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} style={{ color: active ? (accentColor || T.accent) : T.textMuted }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: T.textPri }}>{label}</div>
        {desc && <div style={{ fontSize: '0.65rem', color: T.textSec, marginTop: 1 }}>{desc}</div>}
      </div>
      <div style={{ width: 42, height: 24, borderRadius: 999, background: active ? (accentColor || T.accent) : 'rgba(148,163,184,0.25)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', left: active ? 21 : 3, transition: 'left 0.2s' }} />
      </div>
    </div>
  )

  const ActionRow = ({ icon: Icon, label, desc, onClick, danger }) => (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 12,
      background: danger ? 'rgba(239,68,68,0.06)' : T.bgSurf2,
      border: `1px solid ${danger ? 'rgba(239,68,68,0.25)' : T.border}`,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: danger ? 'rgba(239,68,68,0.10)' : 'rgba(148,163,184,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} style={{ color: danger ? T.danger : T.textSec }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: danger ? T.danger : T.textPri }}>{label}</div>
        {desc && <div style={{ fontSize: '0.65rem', color: T.textSec, marginTop: 1 }}>{desc}</div>}
      </div>
      <ChevronRight size={14} style={{ color: T.textMuted, flexShrink: 0 }} />
    </div>
  )

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings" maxHeight="92vh">
      {!isMobile && (
        <Section label="Desktop layout">
          <ToggleRow icon={LayoutGrid} label="Edit layout" desc="Drag & resize widgets on the grid"
            active={editMode} onToggle={() => setEditMode(v => !v)} />
          {editMode && (
            <ActionRow icon={RotateCcw} label="Reset layout" desc="Restore default widget positions"
              danger onClick={() => { resetLayout(); onClose() }} />
          )}
        </Section>
      )}

      <Section label="Widget visibility">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(WIDGET_LABELS).map(([id, label]) => {
            const vis = !hiddenIds.has(id)
            return (
              <button key={id} onClick={() => toggleHidden(id)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 999,
                background: vis ? `color-mix(in srgb,${T.accent} 12%,transparent)` : T.bgSurf2,
                border: `1px solid ${vis ? `color-mix(in srgb,${T.accent} 30%,transparent)` : T.border}`,
                color: vis ? T.accent : T.textMuted,
                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {vis ? <Eye size={11} /> : <EyeOff size={11} />} {label}
              </button>
            )
          })}
        </div>
      </Section>
      <div style={{ height: 24 }} />
    </BottomSheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD  (shared)
// ─────────────────────────────────────────────────────────────────────────────
function Card({ icon: Icon, title, accent = T.accent, badge, headerRight, children }) {
  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: T.space.sm,
        padding: `${T.space.sm} ${T.space.lg}`, borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: `color-mix(in srgb, ${accent} 12%, transparent)`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid color-mix(in srgb, ${accent} 22%, transparent)` }}>
          <Icon size={13} />
        </span>
        <span style={{ fontWeight: 700, fontSize: '0.75rem', color: T.textPri }}>{title}</span>
        {badge != null && (
          <span style={{ padding: '1px 7px', borderRadius: T.radius.full, background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent, fontFamily: T.mono, fontSize: '0.62rem', fontWeight: 700, border: `1px solid color-mix(in srgb, ${accent} 20%, transparent)` }}>{badge}</span>
        )}
        {headerRight && <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>{headerRight}</div>}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: T.space.lg }}>{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GAUGE RING
// ─────────────────────────────────────────────────────────────────────────────
let _gid = 0
function GaugeRing({ value, max = 100, color, size = 96, label, unit = '%', sub, alert }) {
  const uid = useRef(`gr_${_gid++}`)
  const pct = value != null ? Math.min(Math.max(value / max, 0), 1) : 0
  const r = 34, circ = 2 * Math.PI * r, dash = circ * pct
  const c = alert || color
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={uid.current} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor={c} />
          </linearGradient>
        </defs>
        <circle cx={50} cy={50} r={r} fill="none" stroke={T.bgSurf3} strokeWidth={9} />
        <circle cx={50} cy={50} r={r} fill="none"
          stroke={`url(#${uid.current})`} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)' }} />
        <text x={50} y={46} textAnchor="middle" dominantBaseline="central"
          fontFamily={T.mono} fontSize={17} fontWeight={700} fill={alert || T.textPri}>
          {value != null ? (value % 1 === 0 ? value : value.toFixed(1)) : '—'}
        </text>
        <text x={50} y={60} textAnchor="middle" fontFamily={T.mono} fontSize={8} fill={T.textSec}>{unit}</text>
      </svg>
      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: T.textPri }}>{label}</div>
        {sub && <div style={{ fontSize: '0.58rem', fontWeight: 600, color: alert || c, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS ROW
// ─────────────────────────────────────────────────────────────────────────────
function ProgressRow({ label, value, max = 100, color, unit = '%', warn }) {
  const pct = value != null ? Math.min(Math.max(value / max * 100, 0), 100) : 0
  const c = warn ? T.danger : color
  return (
    <div style={{ marginBottom: T.space.md }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: '0.65rem', color: T.textSec, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: T.mono, fontSize: '0.65rem', fontWeight: 700, color: warn ? T.danger : T.textPri }}>
          {value != null ? `${value % 1 === 0 ? value : value.toFixed(1)}${unit}` : '—'}
        </span>
      </div>
      <div style={{ height: 5, background: T.bgSurf3, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: `linear-gradient(90deg,#2563eb,${c})`, transition: 'width 0.7s cubic-bezier(.4,0,.2,1)' }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS PILL
// ─────────────────────────────────────────────────────────────────────────────
function StatusPill({ active }) {
  const c = active ? T.success : T.danger
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: T.radius.full, background: `color-mix(in srgb, ${c} 10%, transparent)`, color: c, fontFamily: T.mono, fontSize: '0.58rem', fontWeight: 700, flexShrink: 0, border: `1px solid color-mix(in srgb, ${c} 22%, transparent)` }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c, animation: active ? 'lp 2s infinite' : 'none' }} />
      {active ? 'active' : 'inactive'}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BTN
// ─────────────────────────────────────────────────────────────────────────────
function Btn({ onClick, disabled, children, variant = 'ghost', size = 'sm', color, full, style }) {
  const cls = `btn btn--${variant} btn--${size}${full ? ' btn--full' : ''}`
  return (
    <button className={cls} onClick={onClick} disabled={disabled}
      style={{ color, borderColor: color ? `color-mix(in srgb,${color} 30%,transparent)` : undefined, background: color ? `color-mix(in srgb,${color} 7%,transparent)` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.68rem', ...style }}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME MAP WIDGET
// ─────────────────────────────────────────────────────────────────────────────
const PREVIEW_SENSORS = [
  { id: 1, x: '22%', y: '35%', type: 'temp_hum', name: 'Camera',    value: '21.3° 58%', color: '#f59e0b' },
  { id: 2, x: '65%', y: '28%', type: 'temp',     name: 'Soggiorno', value: '22.1°',     color: '#ef4444' },
  { id: 3, x: '42%', y: '68%', type: 'humidity', name: 'Bagno',     value: '74%',       color: '#2563eb' },
  { id: 4, x: '78%', y: '62%', type: 'motion',   name: 'Ingresso',  value: 'attivo',    color: '#8b5cf6' },
  { id: 5, x: '55%', y: '48%', type: 'door',     name: 'Cucina',    value: 'chiusa',    color: '#10b981' },
]
const SENSOR_DOT_COLORS = { temp_hum: '#f59e0b', temp: '#ef4444', humidity: '#2563eb', motion: '#8b5cf6', door: '#10b981', air: '#06b6d4' }

function HomeMapWidget() {
  const [hovered, setHovered] = useState(null)
  return (
    <a href="/floorplan" style={{
      display: 'block', height: '100%', textDecoration: 'none', borderRadius: T.radius.xl, overflow: 'hidden',
      position: 'relative', cursor: 'pointer', background: T.bgSurf, border: `1px solid ${T.border}`,
      transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 32px rgba(37,99,235,0.15)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, #2563eb 40%, transparent)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: T.space.sm, padding: `${T.space.sm} ${T.space.lg}`, borderBottom: `1px solid ${T.border}`, background: T.bgSurf2 }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'color-mix(in srgb, #2563eb 12%, transparent)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid color-mix(in srgb, #2563eb 22%, transparent)' }}>
          <MapPin size={13} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.75rem', color: T.textPri, lineHeight: 1.2 }}>Mappa di Casa</div>
          <div style={{ fontSize: '0.58rem', color: T.textSec, fontFamily: T.mono, marginTop: 1 }}>{PREVIEW_SENSORS.length} sensori attivi · live</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: T.radius.full, background: 'color-mix(in srgb, #2563eb 12%, transparent)', color: '#2563eb', border: '1px solid color-mix(in srgb, #2563eb 28%, transparent)', fontSize: '0.62rem', fontWeight: 700, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
          <ExternalLink size={10} /> Apri mappa
        </span>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden', height: 'calc(100% - 44px)' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">
          <rect x={0} y={0} width={100} height={100} fill="#f0f4ff" />
          <rect x={3} y={4} width={94} height={92} rx={1.5} fill="none" stroke="#7a98c0" strokeWidth={0.7} />
          {[
            { x: 3.5, y: 4.5, w: 38, h: 37, label: 'Camera', area: '16 m²' },
            { x: 41.5, y: 4.5, w: 10, h: 13, label: 'Studio', area: '' },
            { x: 3.5, y: 41.5, w: 38, h: 29, label: 'Cucina', area: '23 m²' },
            { x: 51.5, y: 4.5, w: 45, h: 53, label: 'Soggiorno', area: '22 m²' },
            { x: 51.5, y: 57.5, w: 28, h: 20, label: 'Bagno', area: '5.6 m²' },
            { x: 51.5, y: 77.5, w: 45, h: 18, label: 'Camera 2', area: '6 m²' },
          ].map((r, i) => (
            <g key={i}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.82)" stroke="#b8c8e8" strokeWidth={0.4} rx={0.5} />
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 - (r.area ? 1.5 : 0)} textAnchor="middle" fontSize={r.w > 20 ? 2.5 : 2.1} fill="#1e3a5f" fontFamily="sans-serif" fontWeight="600">{r.label}</text>
              {r.area && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 2.2} textAnchor="middle" fontSize={1.6} fill="#6b82a0" fontFamily="sans-serif">{r.area}</text>}
            </g>
          ))}
          <rect x={41.5} y={17.5} width={10} height={54} rx={0.5} fill="rgba(255,255,255,0.5)" stroke="#b8c8e8" strokeWidth={0.4} />
          <text x={46.5} y={44.5} textAnchor="middle" fontSize={1.8} fill="#9bb4cc" fontFamily="sans-serif" transform="rotate(-90,46.5,44.5)">Corridoio</text>
          {PREVIEW_SENSORS.map(s => {
            const cx = parseFloat(s.x); const cy = parseFloat(s.y)
            const col = SENSOR_DOT_COLORS[s.type] || '#2563eb'
            const isHov = hovered === s.id
            return (
              <g key={s.id} onMouseEnter={() => setHovered(s.id)} onMouseLeave={() => setHovered(null)}>
                <circle cx={cx} cy={cy} r={3.5} fill={col} opacity={0.12}>
                  <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.15;0.04;0.15" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx={cx} cy={cy} r={isHov ? 2.8 : 2.2} fill={isHov ? col : '#fff'} stroke={col} strokeWidth={isHov ? 0 : 0.8} style={{ transition: 'r 0.2s', filter: isHov ? `drop-shadow(0 0 2px ${col})` : 'none' }} />
                {isHov && (
                  <g>
                    <rect x={cx - 8} y={cy - 9} width={16} height={6} rx={3} fill={col} />
                    <polygon points={`${cx - 2},${cy - 3} ${cx + 2},${cy - 3} ${cx},${cy - 1}`} fill={col} />
                    <text x={cx} y={cy - 5.8} textAnchor="middle" fontSize={2.4} fontFamily="monospace" fontWeight="800" fill="#fff">{s.value}</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: T.radius.full, background: '#2563eb', color: '#fff', fontSize: '0.65rem', fontWeight: 700, boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
            <MapPin size={11} /> Visualizza sensori in tempo reale <ExternalLink size={10} style={{ opacity: 0.8 }} />
          </div>
        </div>
      </div>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GAUGES WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function GaugesWidget({ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, diskUsed, memUsed, loading, compact }) {
  const gs = [
    { value: cpu,     max: 100, color: '#2563eb',  label: 'CPU',    unit: '%',  sub: cpuHigh  ? '⚠ High'  : 'Normal', alert: cpuHigh  ? T.danger : null },
    { value: temp,    max: 85,  color: T.warning,  label: 'Temp',   unit: '°C', sub: tempHigh ? '⚠ Risk'  : 'OK',     alert: tempHigh ? T.danger : null },
    { value: diskPct != null ? parseFloat(diskPct.toFixed(1)) : null, max: 100, color: T.success, label: 'Disk',   unit: '%', sub: diskUsed != null ? `${diskUsed.toFixed(1)} GB` : null },
    { value: memPct  != null ? parseFloat(memPct.toFixed(1))  : null, max: 100, color: T.muted,   label: 'Memory', unit: '%', sub: memUsed  != null ? `${memUsed.toFixed(1)} GB`  : null },
  ]
  if (compact) {
    // Mobile: 2 columns of bigger gauges
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '1rem' }}>
        {gs.map((g, i) => (
          <div key={i} style={{ padding: '1rem', borderRadius: 14, background: T.bgSurf2, border: `1px solid ${g.alert ? 'rgba(239,68,68,0.28)' : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? <div className="loading-box"><span className="spinner" /></div> : <GaugeRing {...g} size={100} />}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem', height: '100%' }}>
      {gs.map((g, i) => (
        <div key={i} className="card rp-gauge" style={{ borderColor: g.alert ? 'rgba(239,68,68,0.28)' : undefined }}>
          <div style={{ padding: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            {loading ? <div className="loading-box"><span className="spinner" /></div> : <GaugeRing {...g} size={92} />}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE INFO WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function DeviceInfoWidget({ stats, diskTotal, memTotal }) {
  const rows = [
    ['IP',     '192.168.178.101'],
    ['Host',   'raspberrypi'],
    ['SSH',    '2244'],
    ['Disk',   diskTotal ? `${(diskTotal / 1024).toFixed(0)} GB` : '—'],
    ['RAM',    memTotal  ? `${(memTotal / 1024).toFixed(1)} GB`  : '—'],
    ['Load',   stats?.loadAvg ? `${stats.loadAvg['1m']} / ${stats.loadAvg['5m']} / ${stats.loadAvg['15m']}` : '—'],
    ['Uptime', stats?.uptime || '—'],
  ]
  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: `${T.space.sm} ${T.space.lg}`, borderBottom: `1px solid ${T.border}`, fontSize: '0.62rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.9px', fontFamily: T.mono }}>Device Info</div>
      <div style={{ padding: T.space.lg, flex: 1, overflow: 'auto' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: '0.62rem', color: T.textMuted, fontFamily: T.mono, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</span>
            <span style={{ fontFamily: T.mono, fontSize: '0.68rem', color: T.textPri, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCES WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function ResourcesWidget({ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, loading }) {
  return (
    <Card icon={Cpu} title="Live Resources" accent={T.accent}
      headerRight={
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: T.mono, fontSize: '0.6rem', color: T.success, fontWeight: 700 }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.success, animation: 'lp 2s infinite' }} /> live
        </span>
      }>
      {loading ? <div className="loading-box"><span className="spinner" /></div> : (
        <>
          <ProgressRow label="CPU"         value={cpu}     max={100} color='#2563eb'  unit="%" warn={cpuHigh} />
          <ProgressRow label="Temperature" value={temp}    max={85}  color={T.warning} unit="°C" warn={tempHigh} />
          <ProgressRow label="Disk"        value={diskPct} max={100} color={T.success} unit="%" warn={diskPct != null && diskPct > 85} />
          <ProgressRow label="Memory"      value={memPct}  max={100} color={T.muted}   unit="%" warn={memPct != null && memPct > 90} />
        </>
      )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART WIDGET
// ─────────────────────────────────────────────────────────────────────────────
const TT = {
  contentStyle: { background: 'var(--bg-surface)', border: `1px solid var(--border-strong)`, borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-primary)' },
}
function ChartWidget({ history }) {
  return (
    <Card icon={Activity} title="Live Trends" accent={T.warning}
      headerRight={
        <div style={{ display: 'flex', gap: T.space.lg }}>
          {[{ l: 'CPU %', c: '#2563eb' }, { l: 'Temp °C', c: T.warning }].map(x => (
            <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 14, height: 3, borderRadius: 2, background: x.c }} />
              <span style={{ fontSize: '0.6rem', color: T.textSec, fontFamily: T.mono }}>{x.l}</span>
            </div>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: T.mono, fontSize: '0.6rem', color: T.success, fontWeight: 700 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.success, animation: 'lp 2s infinite' }} />5s
          </span>
        </div>
      }>
      <div style={{ height: '100%', paddingBottom: '0.5rem' }}>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ left: -16, right: 8 }}>
              <defs>
                {[{ id: 'gcpu', c: '#2563eb' }, { id: 'gtmp', c: T.warning }].map(g => (
                  <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={g.c} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={g.c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke={T.border} vertical={false} />
              <XAxis dataKey="ts" tick={{ fontFamily: T.mono, fontSize: 8, fill: T.textMuted }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontFamily: T.mono, fontSize: 9, fill: T.textMuted }} axisLine={false} tickLine={false} width={30} domain={[0, 'auto']} />
              <Tooltip {...TT} formatter={(v, n) => [`${parseFloat(v).toFixed(1)}${n === 'cpu' ? '%' : '°C'}`, n === 'cpu' ? 'CPU' : 'Temp']} />
              <Area type="monotone" dataKey="cpu"  stroke="#2563eb"   fill="url(#gcpu)" strokeWidth={2.5} dot={false} />
              <Area type="monotone" dataKey="temp" stroke={T.warning} fill="url(#gtmp)" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <div className="loading-box"><span className="spinner" /></div>}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SSH PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SshPanel() {
  const [mode,       setMode]       = useState('server')
  const [port,       setPort]       = useState('2244')
  const [keyFile,    setKeyFile]    = useState(null)
  const [keyName,    setKeyName]    = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [command,    setCommand]    = useState('')
  const [lines,      setLines]      = useState([])
  const [loading,    setLoading]    = useState(false)
  const termRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => { if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight }, [lines])

  const addLine = (type, text) => setLines(p => [...p, { type, text, ts: new Date().toLocaleTimeString('it-IT') }])

  const run = async () => {
    if (!command.trim()) return
    const portNum = parseInt(port, 10)
    if (!portNum || portNum < 1 || portNum > 65535) return
    setLoading(true); addLine('info', `$ ${command}`)
    try {
      let res
      if (mode === 'server') {
        res = await fetch('/api/ssh_exec_host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, port: portNum }) })
      } else {
        const keyText = await keyFile.text()
        res = await fetch('/api/ssh_exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: '192.168.178.101', port: portNum, username: 'orion', privateKey: keyText, passphrase: passphrase || undefined, command }) })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'SSH error')
      addLine('output', data.output || '(no output)')
    } catch (e) { addLine('error', e.message) }
    finally { setLoading(false) }
  }

  const QUICK = ['df -h', 'free -h', 'uptime', 'top -bn1 | head -5']
  const LC = { info: T.accent, output: '#7a9ac0', error: T.danger }

  return (
    <Card icon={Terminal} title="SSH Terminal" accent={T.accent}
      headerRight={lines.length > 0 ? <Btn size="sm" onClick={() => setLines([])}><X size={10} /> Clear</Btn> : null}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.md }}>
        <div style={{ display: 'flex', gap: T.space.sm, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ id: 'server', label: '🔑 Server key' }, { id: 'upload', label: '📂 Upload key' }].map(m => (
            <Btn key={m.id} variant={mode === m.id ? 'primary' : 'ghost'} onClick={() => setMode(m.id)}>{m.label}</Btn>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: T.space.sm }}>
            <span style={{ fontSize: '0.6rem', color: T.textSec, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Port</span>
            <input className="input input--mono" type="number" min="1" max="65535" value={port} onChange={e => setPort(e.target.value)} style={{ width: 64, textAlign: 'center', fontSize: '0.68rem', padding: '3px 6px' }} />
          </div>
        </div>
        {mode === 'server' && (
          <div style={{ padding: '0.45rem 0.7rem', borderRadius: T.radius.md, background: T.bgSurf2, borderLeft: `3px solid ${T.accent}`, fontSize: '0.65rem', color: T.textSec, fontFamily: T.mono }}>
            Using <span style={{ color: T.accent }}>/run/secrets/id_rsa</span> · port <span style={{ color: T.accent }}>{port}</span>
          </div>
        )}
        {mode === 'upload' && (
          <div style={{ display: 'flex', gap: T.space.sm, flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: T.space.sm, alignItems: 'center' }}>
              <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pem,.key,*" onChange={e => { const f = e.target.files?.[0]; if (f) { setKeyFile(f); setKeyName(f.name) } }} />
              <Btn onClick={() => fileRef.current?.click()}>Choose file</Btn>
              <span style={{ fontFamily: T.mono, fontSize: '0.65rem', color: keyName ? T.textSec : T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{keyName || 'No file selected'}</span>
              {keyFile && <Btn onClick={() => { setKeyFile(null); setKeyName(''); fileRef.current.value = '' }}><X size={11} /></Btn>}
            </div>
            <input type="password" className="input input--mono" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Passphrase (optional)" style={{ fontSize: '0.68rem' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: T.space.sm }}>
          <input className="input input--mono" value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => e.key === 'Enter' && !loading && run()} placeholder="ls -la" style={{ flex: 1, fontSize: '0.72rem' }} />
          <button className="btn btn--primary" onClick={run} disabled={loading} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {loading ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Play size={13} />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {QUICK.map(cmd => <Btn key={cmd} onClick={() => setCommand(cmd)} style={{ fontFamily: T.mono, fontSize: '0.6rem', padding: '2px 7px' }}>{cmd}</Btn>)}
        </div>
        <div ref={termRef} style={{ background: '#080f24', borderRadius: T.radius.md, padding: '0.75rem 0.9rem', fontFamily: T.mono, fontSize: '0.7rem', lineHeight: 1.7, maxHeight: 200, minHeight: 64, overflowY: 'auto', border: '1px solid rgba(37,99,235,0.15)' }}>
          {lines.length === 0
            ? <span style={{ color: 'rgba(255,255,255,0.14)' }}>Ready · type a command and press ↵</span>
            : lines.map((l, i) => (
              <div key={i}>
                <span style={{ color: 'rgba(255,255,255,0.18)', marginRight: T.space.sm, userSelect: 'none' }}>{l.ts}</span>
                <span style={{ color: LC[l.type] || '#c8e0f8', whiteSpace: 'pre-wrap' }}>{l.text}</span>
              </div>
            ))}
        </div>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// POWER PANEL
// ─────────────────────────────────────────────────────────────────────────────
function PowerPanel() {
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(null)
  const [msg,     setMsg]     = useState(null)

  const exec = async action => {
    setLoading(action)
    try {
      const res  = await fetch(`/api/system/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMsg({ t: data.message, v: 'success' })
    } catch (e) { setMsg({ t: e.message, v: 'error' }) }
    finally { setLoading(null); setConfirm(null); setTimeout(() => setMsg(null), 3000) }
  }

  return (
    <Card icon={Power} title="Power" accent={T.danger}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.md }}>
        <div style={{ padding: '0.4rem 0.6rem', borderRadius: T.radius.md, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)', fontSize: '0.65rem', color: '#b45309', fontWeight: 500 }}>⚠ Physical actions on device</div>
        {msg && <div style={{ fontSize: '0.65rem', fontWeight: 600, color: msg.v === 'error' ? T.danger : T.success, padding: '3px 0' }}>{msg.t}</div>}
        {[{ a: 'reboot', icon: RotateCcw, label: 'Reboot', c: T.warning }, { a: 'shutdown', icon: Power, label: 'Shutdown', c: T.danger }].map(({ a, icon: Icon, label, c }) =>
          confirm === a ? (
            <div key={a} style={{ display: 'flex', gap: T.space.sm, alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: '#b45309', flex: 1 }}>Confirm {label.toLowerCase()}?</span>
              <Btn variant="danger" size="sm" onClick={() => exec(a)} disabled={loading === a}>
                {loading === a ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Yes'}
              </Btn>
              <Btn size="sm" onClick={() => setConfirm(null)}>No</Btn>
            </div>
          ) : (
            <Btn key={a} full color={c} style={{ justifyContent: 'flex-start', gap: T.space.sm, padding: '0.55rem 0.75rem' }} onClick={() => setConfirm(a)}>
              <Icon size={13} /> {label}
            </Btn>
          )
        )}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ServicesPanel() {
  const [services, setServices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState(null)
  const [msg,      setMsg]      = useState(null)

  const load = async () => {
    try {
      const d = await fetch('/api/services').then(r => r.json())
      setServices(Array.isArray(d) ? d : (d.services ?? []))
    } catch { setMsg({ t: 'Error loading services', v: 'error' }) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const act = async (svc, action) => {
    const k = `${svc}:${action}`; setActing(k)
    try {
      const res = await fetch(`/api/services/${svc}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setMsg({ t: `${svc} ${action}ed`, v: 'success' }); await load()
    } catch (e) { setMsg({ t: e.message, v: 'error' }) }
    finally { setActing(null); setTimeout(() => setMsg(null), 2500) }
  }

  return (
    <Card icon={Server} title="Services" accent='#2563eb' badge={services.length || undefined}
      headerRight={<Btn size="sm" onClick={load} style={{ padding: '2px 6px' }}><RefreshCw size={10} /></Btn>}>
      {msg && <div style={{ fontSize: '0.65rem', marginBottom: T.space.sm, color: msg.v === 'error' ? T.danger : T.success, fontWeight: 600 }}>{msg.t}</div>}
      {loading ? <div className="loading-box"><span className="spinner" /></div>
        : services.length === 0 ? <div className="empty-state"><Server size={20} /><div>No services</div></div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.xs }}>
              {services.map(svc => (
                <div key={svc.service} style={{ display: 'flex', alignItems: 'center', gap: T.space.sm, padding: '0.4rem 0.55rem', borderRadius: T.radius.md, background: T.bgSurf2, border: `1px solid ${T.border}` }}>
                  <StatusPill active={svc.isActive} />
                  <span style={{ fontFamily: T.mono, fontSize: '0.65rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.service}</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {['start', 'stop', 'restart'].map(a => {
                      const k = `${svc.service}:${a}`
                      return (
                        <Btn key={a} size="sm" disabled={acting === k} onClick={() => act(svc.service, a)} style={{ fontSize: '0.58rem', padding: '1px 5px' }}>
                          {acting === k ? <RefreshCw size={9} style={{ animation: 'spin 0.8s linear infinite' }} /> : a}
                        </Btn>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESSES PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ProcessesPanel() {
  const [procs,   setProcs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [killing, setKilling] = useState(null)

  const load = async () => {
    setLoading(true)
    try { const d = await fetch('/api/processes').then(r => r.json()); setProcs(Array.isArray(d) ? d : []) }
    catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const kill = async (pid, name) => {
    if (!window.confirm(`Kill ${name} (PID ${pid})?`)) return
    setKilling(pid)
    try { const res = await fetch(`/api/processes/${pid}/kill`, { method: 'POST' }); if (!res.ok) throw new Error(); await load() }
    catch {} finally { setKilling(null) }
  }

  const Bar = ({ pct, c }) => (
    <div style={{ width: 36, height: 4, background: T.bgSurf3, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )

  return (
    <Card icon={Activity} title="Processes" accent={T.muted}
      headerRight={<Btn size="sm" onClick={load} style={{ padding: '2px 6px' }}><RefreshCw size={10} /></Btn>}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>PID</th><th>Name</th><th>CPU</th><th>RAM</th><th></th></tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: T.space.lg }}><span className="spinner" /></td></tr>
              : procs.slice(0, 10).map(p => (
                <tr key={p.pid}>
                  <td className="td-mono td-muted" style={{ fontSize: '0.62rem' }}>{p.pid}</td>
                  <td style={{ fontFamily: T.mono, fontSize: '0.65rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Bar pct={p.cpu} c={p.cpu > 50 ? T.danger : '#2563eb'} /><span style={{ fontSize: '0.62rem', fontFamily: T.mono, color: p.cpu > 50 ? T.danger : T.textSec }}>{p.cpu.toFixed(1)}</span></div></td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Bar pct={p.mem} c={T.muted} /><span style={{ fontSize: '0.62rem', fontFamily: T.mono, color: T.textSec }}>{p.mem.toFixed(1)}</span></div></td>
                  <td><Btn size="sm" color={T.danger} disabled={killing === p.pid} style={{ padding: '1px 5px' }} onClick={() => kill(p.pid, p.name)}>{killing === p.pid ? <RefreshCw size={9} style={{ animation: 'spin 0.8s linear infinite' }} /> : <X size={9} />}</Btn></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK PANEL
// ─────────────────────────────────────────────────────────────────────────────
function NetworkPanel() {
  const [ifaces,  setIfaces]  = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { const d = await fetch('/api/network').then(r => r.json()); setIfaces(Array.isArray(d) ? d : []) }
    catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <Card icon={Wifi} title="Network" accent={T.success} badge={ifaces.length || undefined}
      headerRight={<Btn size="sm" onClick={load} style={{ padding: '2px 6px' }}><RefreshCw size={10} /></Btn>}>
      {loading ? <div className="loading-box"><span className="spinner" /></div>
        : ifaces.length === 0 ? <div className="empty-state"><Wifi size={20} /><div>No interfaces</div></div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: T.space.sm }}>
              {ifaces.map(iface => (
                <div key={iface.interface} style={{ padding: '0.5rem 0.65rem', borderRadius: T.radius.md, background: T.bgSurf2, border: `1px solid ${T.border}`, borderLeft: `3px solid ${iface.isUp ? T.success : T.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontFamily: T.mono, fontSize: '0.68rem', fontWeight: 700 }}>{iface.interface}</span>
                    <span style={{ fontSize: '0.6rem', fontFamily: T.mono, fontWeight: 700, color: iface.isUp ? T.success : T.textSec }}>{iface.isUp ? '● UP' : '○ DOWN'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: T.space.lg, flexWrap: 'wrap' }}>
                    {[['IP', iface.ip || '—'], ['↑', fmtBytes(iface.bytesSent)], ['↓', fmtBytes(iface.bytesRecv)]].map(([k, v]) => (
                      <div key={k}><span style={{ fontSize: '0.58rem', color: T.textSec, fontFamily: T.mono }}>{k} </span><span style={{ fontFamily: T.mono, fontSize: '0.65rem', fontWeight: 600 }}>{v}</span></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function LogsPanel() {
  const [tab,     setTab]     = useState('system')
  const [lines,   setLines]   = useState([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  const load = async (t = tab) => {
    setLoading(true)
    try {
      const d = await fetch(t === 'auth' ? '/api/logs/auth' : '/api/logs/system?lines=60').then(r => r.json())
      setLines(d.lines || [])
      setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, 50)
    } catch { setLines(['Error loading logs']) }
    finally { setLoading(false) }
  }
  useEffect(() => { load(tab) }, [tab])

  return (
    <Card icon={FileText} title="System Logs" accent="#5a6a8a"
      headerRight={
        <div style={{ display: 'flex', gap: 4 }}>
          {['system', 'auth'].map(t => <Btn key={t} variant={tab === t ? 'primary' : 'ghost'} onClick={() => setTab(t)}>{t === 'auth' ? 'Auth' : 'System'}</Btn>)}
          <Btn size="sm" onClick={() => load(tab)} style={{ padding: '2px 6px' }}><RefreshCw size={10} /></Btn>
        </div>
      }>
      <div ref={boxRef} style={{ background: '#080f24', borderRadius: T.radius.md, padding: '0.7rem 0.85rem', fontFamily: T.mono, fontSize: '0.67rem', lineHeight: 1.65, height: 'calc(100% - 1rem)', minHeight: 200, overflowY: 'auto', border: '1px solid rgba(37,99,235,0.12)', color: '#7a9ac0' }}>
        {loading ? <span style={{ color: T.textSec }}>Loading…</span> : lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VISIBILITY PANEL (desktop edit mode)
// ─────────────────────────────────────────────────────────────────────────────
function VisibilityPanel({ hidden, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: T.space.xs, padding: `${T.space.sm} ${T.space.lg}`, marginBottom: T.space.sm, borderRadius: T.radius.lg, background: T.bgSurf2, border: `1px solid ${T.border}` }}>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', width: '100%', marginBottom: 2 }}>Widget Visibility</span>
      {Object.entries(WIDGET_LABELS).map(([id, label]) => {
        const vis = !hidden.has(id)
        return (
          <button key={id} onClick={() => onToggle(id)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: T.radius.full, background: vis ? `color-mix(in srgb,${T.accent} 12%,transparent)` : T.bgSurf3, border: `1px solid ${vis ? `color-mix(in srgb,${T.accent} 30%,transparent)` : T.border}`, color: vis ? T.accent : T.textMuted, fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer' }}>
            {vis ? <Eye size={9} /> : <EyeOff size={9} />} {label}
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BOUNDARY
// ─────────────────────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught', error, info) }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>An error occurred rendering this page</div>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#111827', color: '#fca5a5', padding: 12, borderRadius: 6 }}>{String(this.state.error)}</pre>
      </div>
    )
    return this.props.children
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE SECTION WRAPPER — card with title for mobile stacked layout
// ─────────────────────────────────────────────────────────────────────────────
function MobileSection({ children, minHeight }) {
  return (
    <div style={{ borderRadius: T.radius.xl, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.bgSurf, minHeight: minHeight || 'auto' }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function RaspiPage() {
  const [stats,       setStats]       = useState(null)
  const [history,     setHistory]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [backing,     setBacking]     = useState(false)
  const [layout,      setLayout]      = useState(loadLayout)
  const [editMode,    setEditMode]    = useState(false)
  const [hiddenIds,   setHiddenIds]   = useState(new Set())
  const [isMobile,    setIsMobile]    = useState(false)
  const [msg,         setMsg]         = useState(null)
  const [mobileTab,   setMobileTab]   = useState('stats')
  const [settingsOpen,setSettingsOpen]= useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 860)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadStats = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const d = await fetch('/api_raspberry_pi_stats').then(r => r.json())
      setStats(d)
      setHistory(prev => [...prev.slice(-39), {
        ts:   new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu:  toNum(d.cpuUsage)    ?? 0,
        temp: toNum(d.temperature) ?? 0,
      }])
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(() => loadStats(true), 5000)
    return () => clearInterval(id)
  }, [])

  const backup = async () => {
    setBacking(true)
    try { await fetch('/api_run_backup', { method: 'POST' }); setMsg({ t: 'Backup started', v: 'success' }) }
    catch { setMsg({ t: 'Backup error', v: 'error' }) }
    finally { setBacking(false); setTimeout(() => setMsg(null), 3000) }
  }

  const resetLayout = () => { setLayout(DEFAULT_LAYOUT); saveLayout(DEFAULT_LAYOUT) }
  const toggleHidden = id => setHiddenIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const cpu       = stats ? toNum(stats.cpuUsage)    : null
  const temp      = stats ? toNum(stats.temperature) : null
  const diskUsed  = stats ? toNum(stats.diskUsed)    : null
  const diskFree  = stats ? toNum(stats.diskFree)    : null
  const diskTotal = stats ? (toNum(stats.diskTotal) ?? (diskUsed != null && diskFree != null ? diskUsed + diskFree : null)) : null
  const diskPct   = diskTotal && diskUsed != null ? (diskUsed / diskTotal) * 100 : null
  const memUsed   = stats ? toNum(stats.memoryUsed)  : null
  const memTotal  = stats ? toNum(stats.memoryTotal) : null
  const memPct    = memTotal && memUsed != null ? (memUsed / memTotal) * 100 : null
  const cpuHigh   = cpu  != null && cpu  > 80
  const tempHigh  = temp != null && temp > 70
  const alertCount = (cpuHigh ? 1 : 0) + (tempHigh ? 1 : 0)

  const renderWidget = (id, compact = false) => {
    switch (id) {
      case 'gauges':    return <GaugesWidget {...{ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, diskUsed, memUsed, loading, compact }} />
      case 'chart':     return <ChartWidget history={history} />
      case 'devinfo':   return <DeviceInfoWidget stats={stats} diskTotal={diskTotal} memTotal={memTotal} />
      case 'resources': return <ResourcesWidget {...{ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, loading }} />
      case 'floorplan': return <HomeMapWidget />
      case 'services':  return <ServicesPanel />
      case 'processes': return <ProcessesPanel />
      case 'network':   return <NetworkPanel />
      case 'ssh':       return <SshPanel />
      case 'logs':      return <LogsPanel />
      case 'upgrade':   return <SmartHouseUpgradeWidget />
      default:          return null
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE RENDER
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <ErrorBoundary>
        <div style={{
          minHeight: '100vh', background: T.bgSurf, color: T.textPri,
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
          paddingTop: 'env(safe-area-inset-top)',
        }}>

          {/* ── MOBILE HEADER ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: T.bgSurf,
            borderBottom: `1px solid ${T.border}`,
            position: 'sticky', top: 0, zIndex: 50,
            backdropFilter: 'blur(20px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'color-mix(in srgb, #2563eb 14%, transparent)', border: '1px solid color-mix(in srgb, #2563eb 28%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Cpu size={15} color={T.accent} />
              </div>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: T.textPri, letterSpacing: '-0.3px', lineHeight: 1.2 }}>Raspberry Pi</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', color: T.textMuted }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.success, animation: 'lp 2s infinite', display: 'inline-block' }} />
                  Online · 5s refresh
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {cpuHigh && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, fontSize: '0.58rem', fontWeight: 700, color: T.warning, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)' }}>
                  <Zap size={9} /> CPU
                </span>
              )}
              {tempHigh && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, fontSize: '0.58rem', fontWeight: 700, color: T.danger, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
                  <AlertTriangle size={9} /> Temp
                </span>
              )}
              <button
                onClick={() => loadStats(true)}
                disabled={refreshing}
                style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bgSurf2, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.textSec }}
              >
                <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
              {/* ── GEAR ICON ── */}
              <button
                onClick={() => setSettingsOpen(true)}
                style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: settingsOpen ? `color-mix(in srgb,${T.accent} 14%, transparent)` : T.bgSurf2, border: `1px solid ${settingsOpen ? `color-mix(in srgb,${T.accent} 40%,transparent)` : T.border}`, cursor: 'pointer', color: settingsOpen ? T.accent : T.textPri, transition: 'all 0.15s' }}
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* ── TAB CONTENT ── */}
          <div>
            {/* ── STATS TAB ── */}
            {mobileTab === 'stats' && (
              <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Gauges 2x2 */}
                <MobileSection>{renderWidget('gauges', true)}</MobileSection>
                {/* Chart — fixed height */}
                <MobileSection minHeight={280}>
                  <div style={{ height: 280 }}>{renderWidget('chart')}</div>
                </MobileSection>
                {/* Floorplan link */}
                <MobileSection minHeight={200}>
                  <div style={{ height: 200 }}>{renderWidget('floorplan')}</div>
                </MobileSection>
              </div>
            )}

            {/* ── SYSTEM TAB ── */}
            {mobileTab === 'system' && (
              <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Resources bar */}
                <MobileSection>{renderWidget('resources')}</MobileSection>
                {/* Device info */}
                <MobileSection>{renderWidget('devinfo')}</MobileSection>
                {/* Network */}
                <MobileSection>{renderWidget('network')}</MobileSection>
                {/* Processes */}
                <MobileSection>{renderWidget('processes')}</MobileSection>
              </div>
            )}

            {/* ── CONTROL TAB ── */}
            {mobileTab === 'control' && (
              <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Services */}
                <MobileSection>{renderWidget('services')}</MobileSection>
                {/* Upgrade */}
                <MobileSection>{renderWidget('upgrade')}</MobileSection>
                {/* Backup */}
                <MobileSection>{renderWidget('backup')}</MobileSection>
              </div>
            )}

            {/* ── TERMINAL TAB ── */}
            {mobileTab === 'terminal' && (
              <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <MobileSection>{renderWidget('ssh')}</MobileSection>
                <MobileSection minHeight={200}>
                  <div style={{ minHeight: 200 }}>{renderWidget('logs')}</div>
                </MobileSection>
              </div>
            )}

            {/* Global msg */}
            {msg && (
              <div style={{ margin: '0 12px 12px', padding: '0.5rem 1rem', borderRadius: T.radius.md, background: msg.v === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)', border: `1px solid ${msg.v === 'error' ? 'rgba(239,68,68,0.30)' : 'rgba(16,185,129,0.30)'}`, fontSize: '0.7rem', fontWeight: 600, color: msg.v === 'error' ? T.danger : T.success }}>
                {msg.t}
              </div>
            )}
          </div>

          {/* ── BOTTOM NAV ── */}
          <BottomNav active={mobileTab} onChange={setMobileTab} alerts={alertCount} />

          {/* ── SETTINGS SHEET ── */}
          <SettingsSheet
            open={settingsOpen} onClose={() => setSettingsOpen(false)}
            editMode={editMode} setEditMode={setEditMode}
            hiddenIds={hiddenIds} toggleHidden={toggleHidden}
            resetLayout={resetLayout} isMobile={true}
          />

          <style>{`
            @keyframes spin    { to { transform: rotate(360deg); } }
            @keyframes lp      { 0%,100%{opacity:1} 50%{opacity:0.3} }
            @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .rp-gauge { display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:12px; }
            .card { height:100%; }
          `}</style>
        </div>
      </ErrorBoundary>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESKTOP RENDER  (unchanged grid layout + gear icon added)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <ErrorBoundary>
      <div className="page animate-fade">

        {/* ── DESKTOP HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: T.space.md, marginBottom: '1.25rem' }}>
          <div>
            <h1 className="page-title">
              Raspberry <span style={{ color: 'var(--accent)', fontWeight: 400 }}>Pi</span>
            </h1>
            <p className="page-subtitle">System monitoring · Remote control</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: T.space.sm, flexWrap: 'wrap', marginTop: '0.4rem' }}>
            {tempHigh && <span className="badge badge--danger" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={9} /> High temp</span>}
            {cpuHigh  && <span className="badge badge--warning" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Zap size={9} /> High CPU</span>}

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.2rem 0.65rem', borderRadius: T.radius.full, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)', color: T.success, fontFamily: T.mono, fontSize: '0.62rem', fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success, animation: 'lp 2s infinite' }} /> Online
            </span>

            {stats?.uptime && <span style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.textSec }}>↑ {stats.uptime}</span>}

            <Btn onClick={() => loadStats(true)} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} /> 5s
            </Btn>

            <Btn variant={editMode ? 'primary' : 'ghost'} onClick={() => setEditMode(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <LayoutGrid size={12} />{editMode ? 'Done' : 'Edit layout'}
            </Btn>
            {editMode && <Btn color={T.danger} onClick={resetLayout} style={{ fontSize: '0.65rem' }}>Reset</Btn>}

            {/* ── GEAR ICON ── */}
            <button
              onClick={() => setSettingsOpen(v => !v)}
              title="Settings"
              style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: settingsOpen ? `color-mix(in srgb,${T.accent} 14%, transparent)` : T.bgSurf2, border: `1px solid ${settingsOpen ? `color-mix(in srgb,${T.accent} 40%,transparent)` : T.border}`, cursor: 'pointer', color: settingsOpen ? T.accent : T.textSec, transition: 'all 0.15s', flexShrink: 0 }}
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* ── SETTINGS SHEET (desktop) ── */}
        <SettingsSheet
          open={settingsOpen} onClose={() => setSettingsOpen(false)}
          editMode={editMode} setEditMode={setEditMode}
          hiddenIds={hiddenIds} toggleHidden={toggleHidden}
          resetLayout={resetLayout} isMobile={false}
        />

        {/* ── GLOBAL MSG ── */}
        {msg && (
          <div style={{ marginBottom: T.space.md, padding: '0.5rem 1rem', borderRadius: T.radius.md, background: msg.v === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: `1px solid ${msg.v === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`, fontSize: '0.7rem', fontWeight: 600, color: msg.v === 'error' ? T.danger : T.success }}>
            {msg.t}
          </div>
        )}

        {/* ── EDIT MODE BANNER ── */}
        {editMode && (
          <>
            <div style={{ marginBottom: T.space.md, padding: '0.55rem 1rem', borderRadius: T.radius.md, background: `color-mix(in srgb,${T.accent} 6%,transparent)`, border: `1px dashed ${T.accent}`, fontSize: '0.65rem', color: T.accent, fontFamily: T.mono, display: 'flex', alignItems: 'center', gap: T.space.sm }}>
              <GripVertical size={12} />
              <span><strong>Layout edit:</strong> drag top bar to move · drag bottom-right corner to resize · use visibility to show/hide widgets</span>
            </div>
            <VisibilityPanel hidden={hiddenIds} onToggle={toggleHidden} />
          </>
        )}

        {/* ── DESKTOP GRID ── */}
        <GridLayout layout={layout} setLayout={setLayout} editMode={editMode}>
          {(laidOut, getHandlers) => laidOut.map(item => (
            <Widget key={item.id} item={item} editMode={editMode}
              hidden={hiddenIds.has(item.id)}
              onDragStart={getHandlers(item.id, 'drag')}
              onResizeStart={getHandlers(item.id, 'resize')}>
              {renderWidget(item.id)}
            </Widget>
          ))}
        </GridLayout>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes lp   { 0%,100%{opacity:1} 50%{opacity:0.3} }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          .rp-gauge { display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:12px; transition:box-shadow 0.2s; }
          .rp-gauge:hover { box-shadow:0 6px 20px rgba(0,0,0,0.09); }
          .card { height:100%; }
          @media (max-width:600px) { table { font-size:0.62rem; } }
        `}</style>
      </div>
    </ErrorBoundary>
  )
}