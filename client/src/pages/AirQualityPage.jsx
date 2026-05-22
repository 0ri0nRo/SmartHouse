import { useState, useEffect, useRef } from 'react'
import { Wind, Activity, TrendingUp, Calendar, RefreshCw, ChevronLeft, ChevronRight, Terminal, X, Settings, ChevronRight as CRight } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Toast from '../components/Toast'
import AirQualityRangeChart from '../components/AirQualityRangeChart'
import { useToast } from '../hooks/useToast'
import { fetchJson } from '../lib/fetchCache'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS / HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const TT = {
  contentStyle: {
    background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
    borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
    color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)',
  },
  cursor: { stroke: 'var(--border-strong)', strokeDasharray: '3 3' },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function aqiColor(v) {
  if (v >= 80) return 'var(--color-success)'
  if (v >= 60) return 'var(--color-warning)'
  if (v >= 40) return 'var(--card-temp-accent)'
  return 'var(--color-danger)'
}
function aqiLabel(v) {
  if (v >= 80) return 'Good'
  if (v >= 60) return 'Moderate'
  if (v >= 40) return 'Poor'
  return 'Hazardous'
}

// Using shared fetchJson with short in-memory TTL to avoid duplicate GETs

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

// ── Bottom Sheet ──────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children, maxHeight = '80vh' }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: 'var(--bg-surface)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight, display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.35)',
        animation: 'slideUp 0.28s cubic-bezier(.32,1.1,.42,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.35)' }} />
        </div>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 14px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
            <button onClick={onClose} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 }}>
              <X size={14} />
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
      </div>
    </>
  )
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const NAV_TABS = [
  { id: 'live',    label: 'Live',    icon: Activity },
  { id: 'gas',     label: 'Gas',     icon: Wind },
  { id: 'history', label: 'History', icon: TrendingUp },
  { id: 'logs',    label: 'Logs',    icon: Terminal },
]

function BottomNav({ active, onChange }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'var(--bg-surface)', borderTop: '1px solid var(--border)',
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
              cursor: 'pointer', color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              position: 'relative', transition: 'color 0.15s',
            }}>
            {isActive && (
              <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, borderRadius: 1, background: 'var(--accent)' }} />
            )}
            <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
            <span style={{ fontSize: '0.60rem', fontWeight: isActive ? 700 : 500, letterSpacing: '0.2px' }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Settings Sheet ────────────────────────────────────────────────────────────
function SettingsSheet({ open, onClose, latestAQI, histMonth, histYear, setHistMonth, setHistYear, loadHistory, loadingHist, onRefresh, loading }) {
  const Section = ({ label, children }) => (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )

  const ActionRow = ({ icon: Icon, label, desc, onClick, accent }) => (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 12,
      background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: accent ? `${accent}14` : 'rgba(148,163,184,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} style={{ color: accent || 'var(--text-secondary)' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>{desc}</div>}
      </div>
      <CRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </div>
  )

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings" maxHeight="88vh">
      {/* AQI status summary */}
      {latestAQI != null && (
        <div style={{ margin: '16px 20px', padding: '14px', borderRadius: 14, background: `${aqiColor(latestAQI)}12`, border: `1px solid ${aqiColor(latestAQI)}30`, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 800, color: aqiColor(latestAQI), lineHeight: 1 }}>
            {latestAQI.toFixed(1)}
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{aqiLabel(latestAQI)}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>Current Air Quality Index</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)', fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-success)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-success)', animation: 'aq-pulse 2s ease infinite', display: 'inline-block' }} />
            Live
          </div>
        </div>
      )}

      <Section label="Data">
        <ActionRow icon={RefreshCw} label="Refresh now" desc="Reload live AQI and gas data"
          onClick={() => { onRefresh(); onClose() }} accent="var(--card-air-accent)" />
      </Section>

      <Section label="History period">
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
            Select month and year for historical charts
          </div>
          {/* Inline period nav */}
          <PeriodNavInline
            month={histMonth} year={histYear}
            onChangeMonth={setHistMonth} onChangeYear={setHistYear}
            onApply={() => { loadHistory(); onClose() }}
          />
        </div>
      </Section>

      <div style={{ height: 24 }} />
    </BottomSheet>
  )
}

// ── Inline period nav for settings sheet ─────────────────────────────────────
function PeriodNavInline({ month, year, onChangeMonth, onChangeYear, onApply }) {
  const now = new Date()
  const [m, setM] = useState(month)
  const [y, setY] = useState(year)

  const isFuture = (mm, yy) => yy > now.getFullYear() || (yy === now.getFullYear() && mm > now.getMonth() + 1)

  return (
    <div>
      {/* Year row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => setY(p => p - 1)} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{y}</span>
        <button onClick={() => setY(p => Math.min(now.getFullYear(), p + 1))} disabled={y >= now.getFullYear()} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: y >= now.getFullYear() ? 0.35 : 1 }}>
          <ChevronRight size={14} />
        </button>
      </div>
      {/* Month grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
        {MONTHS.map((name, i) => {
          const mNum = i + 1
          const future = isFuture(mNum, y)
          const active = mNum === m && y === year
          const sel = mNum === m
          return (
            <button key={name} onClick={() => !future && setM(mNum)} disabled={future}
              style={{
                padding: '8px 4px', borderRadius: 10, border: `1px solid ${sel && !future ? 'var(--accent)' : 'var(--border)'}`,
                background: sel && !future ? 'rgba(99,102,241,0.14)' : 'var(--bg-surface-2)',
                color: future ? 'var(--text-muted)' : sel ? 'var(--accent)' : 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: sel ? 700 : 400,
                cursor: future ? 'not-allowed' : 'pointer', opacity: future ? 0.35 : 1,
                transition: 'all 0.12s',
              }}>
              {name}
            </button>
          )
        })}
      </div>
      <button onClick={() => { onChangeMonth(m); onChangeYear(y); onApply() }}
        style={{ width: '100%', padding: '13px', borderRadius: 12, background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <RefreshCw size={14} /> Apply period
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PICO W LIVE LOGS
// ─────────────────────────────────────────────────────────────────────────────
function PicoLogsPanel() {
  const [logs,      setLogs]      = useState([])
  const [filter,    setFilter]    = useState('all')
  const [paused,    setPaused]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [connected, setConnected] = useState(true)
  const termRef   = useRef(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  const fetchLogs = async () => {
    if (pausedRef.current) return
    setLoading(true)
    try {
      const r = await fetch('/api/pico-logs?limit=100', { cache: 'no-store' })
      if (!r.ok) throw new Error(r.status)
      const d = await r.json()
      setLogs(d.logs || [])
      setConnected(true)
    } catch { setConnected(false) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchLogs()
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [logs, filter])

  const LEVEL_STYLE = {
    info:     { bg: '#0d2840', color: '#58a6ff', label: 'INFO'   },
    success:  { bg: '#0d2b1a', color: '#3fb950', label: 'OK'     },
    warning:  { bg: '#2d1e04', color: '#d29922', label: 'WARN'   },
    warn:     { bg: '#2d1e04', color: '#d29922', label: 'WARN'   },
    error:    { bg: '#2d0e0e', color: '#f85149', label: 'ERR'    },
    critical: { bg: '#3d0505', color: '#ff7b72', label: 'CRIT'   },
    sensor:   { bg: '#1a0d2d', color: '#d2a8ff', label: 'SENSOR' },
    system:   { bg: '#1c1c1e', color: '#8b949e', label: 'SYS'    },
  }
  const LEVELS = ['all', 'info', 'success', 'warning', 'error', 'sensor', 'system']

  const filtered = filter === 'all' ? logs : logs.filter(l => {
    const lv = (l.level || '').toLowerCase()
    return lv === filter || (filter === 'warning' && lv === 'warn')
  })

  const fmtTs = (raw) => {
    if (!raw) return '--:--:--'
    try {
      const d = new Date(raw)
      return isNaN(d) ? String(raw).slice(0, 8) : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return '--:--:--' }
  }

  const lastTs = logs.length ? fmtTs(logs[logs.length - 1].timestamp || logs[logs.length - 1].created_at) : null

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
          <Terminal size={14} />
        </div>
        <span className="card-header-title">Pico W — Live Logs</span>
        <span className={`badge ${connected ? 'badge--success' : 'badge--danger'}`} style={{ marginLeft: 'auto' }}>
          <span className={`dot ${connected ? 'dot--green dot--pulse' : 'dot--red'}`} />
          {connected ? 'online' : 'offline'}
        </span>
        <button onClick={() => setPaused(p => !p)} className="btn btn--ghost btn--sm"
          style={{ marginLeft: '0.5rem', padding: '2px 8px', fontSize: '0.68rem', color: paused ? 'var(--color-warning)' : undefined }}>
          {paused ? 'resume' : 'pause'}
        </button>
        <button onClick={fetchLogs} className="btn btn--ghost btn--sm" style={{ marginLeft: '0.25rem', padding: '2px 8px' }} disabled={loading}>
          <RefreshCw size={11} style={{ animation: loading ? 'spin 0.6s linear infinite' : 'none' }} />
        </button>
        {logs.length > 0 && (
          <button onClick={() => setLogs([])} className="btn btn--ghost btn--sm" style={{ marginLeft: '0.25rem', padding: '2px 8px' }}>
            <X size={11} />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '0.35rem', padding: '0.5rem 1rem', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
        {LEVELS.map(lv => {
          const s = LEVEL_STYLE[lv] || LEVEL_STYLE.system
          const active = filter === lv
          return (
            <button key={lv} onClick={() => setFilter(lv)} style={{ border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`, background: active ? s.bg : 'transparent', borderRadius: 'var(--radius-full, 999px)', padding: '2px 10px', fontSize: '0.62rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)', color: active ? s.color : 'var(--text-muted)', transition: 'all .15s', letterSpacing: '0.3px' }}>
              {lv.toUpperCase()}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>{filtered.length} lines</span>
      </div>

      {/* Terminal */}
      <div ref={termRef} style={{ background: 'var(--bg-code, #0d1117)', padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', lineHeight: 1.75, maxHeight: 300, overflowY: 'auto', overflowX: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}>— no logs match filter —</div>
        ) : filtered.map((l, i) => {
          const lv = (l.level || 'system').toLowerCase()
          const s  = LEVEL_STYLE[lv] || LEVEL_STYLE.system
          const ts = fmtTs(l.created_at || l.timestamp)
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 52px 1fr', gap: '8px', marginBottom: '0.1rem', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-muted)', opacity: 0.5, userSelect: 'none', fontSize: '0.68rem' }}>{ts}</span>
              <span style={{ display: 'inline-block', textAlign: 'center', borderRadius: 4, padding: '0 4px', fontSize: '0.6rem', fontWeight: 700, background: s.bg, color: s.color, lineHeight: '17px', letterSpacing: '0.3px' }}>{s.label}</span>
              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0 }}>{l.message || ''}</span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 1rem', background: 'var(--bg-surface-2)', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.25rem' }}>
        <span>pico-w-001 · 192.168.178.101:8888</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastTs && <span>last: {lastTs}</span>}
          <span style={{ display: 'inline-block', width: 6, height: 11, background: connected ? 'var(--color-success, #3fb950)' : 'var(--color-danger)', borderRadius: 1, animation: connected ? 'blink 1.1s step-end infinite' : 'none' }} />
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD NAV  (desktop)
// ─────────────────────────────────────────────────────────────────────────────
function PeriodNav({ month, year, onChangeMonth, onChangeYear }) {
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => { setPickerYear(year) }, [year])

  const prev = () => {
    if (month === 1) { onChangeMonth(12); onChangeYear(year - 1) }
    else onChangeMonth(month - 1)
  }
  const next = () => {
    if (isCurrentMonth) return
    if (month === 12) { onChangeMonth(1); onChangeYear(year + 1) }
    else onChangeMonth(month + 1)
  }
  const selectMonth = (m) => { onChangeMonth(m); onChangeYear(pickerYear); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <button onClick={prev} className="btn btn--ghost btn--sm" style={{ padding: '0.25rem 0.4rem', lineHeight: 1 }}>
        <ChevronLeft size={13} />
      </button>
      <button onClick={() => setOpen(p => !p)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 90, textAlign: 'center', padding: '0.28rem 0.6rem', background: open ? 'var(--bg-surface-2)' : 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', transition: 'background 0.15s' }}>
        {MONTHS[month - 1]} {year}
      </button>
      <button onClick={next} className="btn btn--ghost btn--sm" disabled={isCurrentMonth} style={{ padding: '0.25rem 0.4rem', lineHeight: 1, opacity: isCurrentMonth ? 0.3 : 1 }}>
        <ChevronRight size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: '0.75rem', width: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <button onClick={() => setPickerYear(p => p - 1)} className="btn btn--ghost btn--sm" style={{ padding: '0.2rem 0.35rem' }}><ChevronLeft size={12} /></button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pickerYear}</span>
            <button onClick={() => setPickerYear(p => Math.min(now.getFullYear(), p + 1))} disabled={pickerYear >= now.getFullYear()} className="btn btn--ghost btn--sm" style={{ padding: '0.2rem 0.35rem', opacity: pickerYear >= now.getFullYear() ? 0.3 : 1 }}><ChevronRight size={12} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
            {MONTHS.map((m, i) => {
              const mNum = i + 1
              const isFuture = pickerYear === now.getFullYear() && mNum > now.getMonth() + 1
              const isActive = mNum === month && pickerYear === year
              return (
                <button key={m} onClick={() => !isFuture && selectMonth(mNum)} disabled={isFuture}
                  style={{ padding: '0.35rem 0', borderRadius: 6, border: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: isActive ? 700 : 400, cursor: isFuture ? 'not-allowed' : 'pointer', background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#fff' : isFuture ? 'var(--text-muted)' : 'var(--text-primary)', opacity: isFuture ? 0.35 : 1, transition: 'background 0.12s' }}
                  onMouseEnter={e => { if (!isFuture && !isActive) e.currentTarget.style.background = 'var(--bg-muted)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 500, color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Mobile metric card (larger, hero-style) ───────────────────────────────────
function MobileMetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART CARD WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
function ChartCard({ title, icon: Icon, badge, badgeLive, children, height = 220 }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
          <Icon size={14} />
        </div>
        <span className="card-header-title">{title}</span>
        {badge && (
          <span className="badge badge--muted" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            {badgeLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', animation: 'aq-pulse 2s ease infinite', display: 'inline-block' }} />}
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: '1rem 0.5rem 0.75rem', height }}>{children}</div>
    </div>
  )
}

function LoadingBox() { return <div className="loading-box"><span className="spinner" /></div> }
function EmptyState({ icon: Icon, label }) {
  return <div className="empty-state"><Icon size={20} /><div>{label}</div></div>
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AirQualityPage() {
  const { toast, showToast } = useToast()
  const now = new Date()

  const [aqiData,     setAqiData]     = useState([])
  const [gasData,     setGasData]     = useState([])
  const [weeklyData,  setWeeklyData]  = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [latestAQI,   setLatestAQI]   = useState(null)
  const [peakAQI,     setPeakAQI]     = useState(null)
  const [minAQI,      setMinAQI]      = useState(null)
  const [monthAvg,    setMonthAvg]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [histYear,    setHistYear]    = useState(now.getFullYear())
  const [histMonth,   setHistMonth]   = useState(now.getMonth() + 1)
  const [loadingHist, setLoadingHist] = useState(false)
  const [isMobile,    setIsMobile]    = useState(false)
  const [mobileTab,   setMobileTab]   = useState('live')
  const [settingsOpen,setSettingsOpen]= useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 860)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Load today ─────────────────────────────────────────
  const loadToday = async () => {
    setLoading(true)
    try {
      const [aqi, gas] = await Promise.all([
        fetchJson('/api/air_quality_today'),
        fetchJson('/api/gas_concentration_today'),
      ])

      let aqiArr = []
      if (aqi && Array.isArray(aqi)) {
        aqiArr = aqi.map(e => ({ hour: `${e.hour}:00`, aqi: parseFloat(e.aqi) }))
      } else if (aqi && typeof aqi === 'object') {
        aqiArr = Object.keys(aqi).map(Number).filter(h => !isNaN(h)).sort((a, b) => a - b)
          .map(h => ({ hour: `${h}:00`, aqi: parseFloat(aqi[h]) || 0 }))
      }
      setAqiData(aqiArr)

      if (aqiArr.length) {
        const values = aqiArr.map(d => d.aqi)
        setLatestAQI(aqiArr[aqiArr.length - 1].aqi)
        setPeakAQI(Math.max(...values))
        setMinAQI(Math.min(...values))
      } else {
        setLatestAQI(null); setPeakAQI(null); setMinAQI(null)
      }

      if (gas && typeof gas === 'object' && !Array.isArray(gas)) {
        const gasArr = Object.keys(gas).map(Number).filter(h => !isNaN(h)).sort((a, b) => a - b).map(h => ({
          hour: `${h}:00`,
          smoke:    parseFloat(gas[h]?.avg_smoke    || 0).toFixed(2),
          lpg:      parseFloat(gas[h]?.avg_lpg      || 0).toFixed(2),
          methane:  parseFloat(gas[h]?.avg_methane  || 0).toFixed(2),
          hydrogen: parseFloat(gas[h]?.avg_hydrogen || 0).toFixed(2),
        }))
        const hasReal = gasArr.some(r => parseFloat(r.smoke) > 0 || parseFloat(r.lpg) > 0 || parseFloat(r.methane) > 0 || parseFloat(r.hydrogen) > 0)
        setGasData(hasReal ? gasArr : [])
      } else { setGasData([]) }
    } catch { showToast('Error loading data', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadToday()
    const id = setInterval(loadToday, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load history ───────────────────────────────────────
  const loadHistory = async () => {
    setLoadingHist(true)
    try {
      const daily = await fetchJson(`/api/air_quality_monthly/${histMonth}/${histYear}`)
      if (daily && typeof daily === 'object' && !Array.isArray(daily) && !daily.error) {
        setWeeklyData(
          Object.keys(daily).map(Number).filter(d => !isNaN(d)).sort((a, b) => a - b)
            .map(d => ({ day: `${d}`, aqi: parseFloat(daily[d]).toFixed(1) }))
        )
      } else { setWeeklyData([]) }

      const yearly = await fetchJson(`/api/air_quality_yearly/${histYear}`)
      if (yearly && typeof yearly === 'object' && !Array.isArray(yearly) && !yearly.error) {
        const filled = MONTHS.map((name, i) => ({
          month: name,
          aqi:   yearly[String(i + 1)] != null ? parseFloat(yearly[String(i + 1)]).toFixed(1) : null,
        }))
        setMonthlyData(filled)
        const cur = yearly[String(histMonth)]
        setMonthAvg(cur != null ? parseFloat(cur).toFixed(1) : null)
      } else { setMonthlyData([]); setMonthAvg(null) }
    } catch { showToast('Error loading historical data', 'error') }
    finally { setLoadingHist(false) }
  }

  useEffect(() => { loadHistory() }, [histYear, histMonth])

  const GAS_LINES = [
    { key: 'smoke',    label: 'Smoke',    color: 'var(--color-danger)' },
    { key: 'lpg',      label: 'LPG',      color: 'var(--card-hum-accent)' },
    { key: 'methane',  label: 'Methane',  color: 'var(--card-shop-accent)' },
    { key: 'hydrogen', label: 'Hydrogen', color: 'var(--card-temp-accent)' },
  ]

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE RENDER
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)',
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
      }}>

        {/* ── MOBILE HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--card-air-bg)', border: '1px solid var(--card-air-accent, rgba(0,0,0,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wind size={15} style={{ color: 'var(--card-air-accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Air Quality</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Real-time monitoring · 5m refresh</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Live AQI badge */}
            {latestAQI != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, background: `${aqiColor(latestAQI)}12`, border: `1px solid ${aqiColor(latestAQI)}30` }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 800, color: aqiColor(latestAQI), lineHeight: 1 }}>{latestAQI.toFixed(1)}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: aqiColor(latestAQI) }}>{aqiLabel(latestAQI)}</span>
              </div>
            )}
            {/* Gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: settingsOpen ? 'var(--card-air-bg)' : 'var(--bg-surface-2)', border: `1px solid ${settingsOpen ? 'var(--card-air-accent)' : 'var(--border)'}`, cursor: 'pointer', color: settingsOpen ? 'var(--card-air-accent)' : 'var(--text-primary)', transition: 'all 0.15s' }}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* ── TAB CONTENT ── */}
        <div>

          {/* LIVE TAB */}
          {mobileTab === 'live' && (
            <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Metric cards 2x2 */}
              {!loading && latestAQI != null && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MobileMetricCard label="Current AQI"   value={latestAQI.toFixed(1)} sub="Latest reading" color={aqiColor(latestAQI)} />
                  <MobileMetricCard label="Peak max"      value={peakAQI?.toFixed(1) ?? '—'} sub="Today" color={peakAQI != null ? aqiColor(peakAQI) : undefined} />
                  <MobileMetricCard label="Peak min"      value={minAQI?.toFixed(1) ?? '—'} sub="Today" color={minAQI  != null ? aqiColor(minAQI)  : undefined} />
                  <MobileMetricCard label="Monthly avg"   value={monthAvg ?? '—'} sub={`${MONTHS[histMonth - 1]} ${histYear}`} />
                </div>
              )}
              {loading && (
                <div style={{ borderRadius: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', height: 120 }}>
                  <LoadingBox />
                </div>
              )}

              {/* AQI chart */}
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <ChartCard title="AQI — Today" icon={Wind} badge="Live" badgeLive height={200}>
                  {loading ? <LoadingBox /> : aqiData.length === 0 ? <EmptyState icon={Wind} label="No data today" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={aqiData} margin={{ left: -16, right: 8 }}>
                        <defs>
                          <linearGradient id="gaqi_m" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                        <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
                        <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill="url(#gaqi_m)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: 'var(--card-air-accent)', strokeWidth: 0 }} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            </div>
          )}

          {/* GAS TAB */}
          {mobileTab === 'gas' && (
            <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <ChartCard title="Gas Concentrations — Today" icon={Activity} badge="Multi-gas" height={220}>
                  {loading ? <LoadingBox /> : gasData.length === 0 ? <EmptyState icon={Activity} label="No data today" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={gasData} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip {...TT} formatter={(v, name) => [`${v} ppm`, name]} />
                        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />
                        {GAS_LINES.map(g => (
                          <Line key={g.key} type="monotone" dataKey={g.key} name={g.label} stroke={g.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {mobileTab === 'history' && (
            <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Period indicator */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{MONTHS[histMonth - 1]} {histYear}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>Selected period · tap ⚙️ to change</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {monthAvg && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: aqiColor(parseFloat(monthAvg)) }}>{monthAvg}</span>}
                  <button onClick={loadHistory} disabled={loadingHist}
                    style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw size={14} style={{ animation: loadingHist ? 'spin 0.8s linear infinite' : 'none' }} />
                  </button>
                </div>
              </div>

              {/* Daily bar chart */}
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <div style={{ padding: '12px 14px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 10 }}>
                    Daily — {MONTHS[histMonth - 1]} {histYear}
                  </div>
                </div>
                <div style={{ padding: '0 4px 4px', height: 180 }}>
                  {loadingHist ? <LoadingBox /> : weeklyData.length === 0 ? <EmptyState icon={TrendingUp} label="No data available" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                        <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
                        <Bar dataKey="aqi" fill="var(--card-air-accent)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Monthly averages */}
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <div style={{ padding: '12px 14px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 10 }}>
                    Monthly averages — {histYear}
                  </div>
                </div>
                <div style={{ padding: '0 4px 4px', height: 180 }}>
                  {loadingHist ? <LoadingBox /> : monthlyData.filter(d => d.aqi != null).length === 0 ? <EmptyState icon={Calendar} label="No data available" /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyData} margin={{ left: -16, right: 8 }}>
                        <defs>
                          <linearGradient id="gairm_m" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                        <Tooltip {...TT} formatter={v => [`${v}`, 'Avg AQI']} />
                        <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill="url(#gairm_m)" strokeWidth={2} dot={false} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Range chart */}
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <AirQualityRangeChart />
              </div>
            </div>
          )}

          {/* LOGS TAB */}
          {mobileTab === 'logs' && (
            <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PicoLogsPanel />
            </div>
          )}

        </div>

        {/* ── BOTTOM NAV ── */}
        <BottomNav active={mobileTab} onChange={setMobileTab} />

        {/* ── SETTINGS SHEET ── */}
        <SettingsSheet
          open={settingsOpen} onClose={() => setSettingsOpen(false)}
          latestAQI={latestAQI}
          histMonth={histMonth} histYear={histYear}
          setHistMonth={setHistMonth} setHistYear={setHistYear}
          loadHistory={loadHistory} loadingHist={loadingHist}
          onRefresh={loadToday} loading={loading}
        />

        <Toast toast={toast} />
        <style>{`
          @keyframes spin     { to { transform: rotate(360deg) } }
          @keyframes aq-pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
          @keyframes blink    { 0%,100% { opacity:1 } 50% { opacity:0 } }
          @keyframes slideUp  { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESKTOP RENDER  (unchanged + gear icon added)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="animate-fade">

      {/* ── DESKTOP HEADER ── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">
            Air Qua<span style={{ color: 'var(--accent)' }}>lity</span>
          </h1>
          <p className="page-subtitle">Real-time monitoring and gas analysis</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem' }}>
          {latestAQI != null && (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 500, color: aqiColor(latestAQI) }}>
                {latestAQI.toFixed(1)}
              </span>
              <span className="badge" style={{ color: aqiColor(latestAQI), borderColor: aqiColor(latestAQI), background: `${aqiColor(latestAQI)}18` }}>
                <span className="dot" style={{ background: aqiColor(latestAQI) }} />
                {aqiLabel(latestAQI)}
              </span>
            </>
          )}
          {/* ── GEAR ICON ── */}
          <button
            onClick={() => setSettingsOpen(v => !v)}
            title="Settings"
            style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: settingsOpen ? 'var(--card-air-bg)' : 'var(--bg-surface-2)', border: `1px solid ${settingsOpen ? 'var(--card-air-accent)' : 'var(--border)'}`, cursor: 'pointer', color: settingsOpen ? 'var(--card-air-accent)' : 'var(--text-secondary)', transition: 'all 0.15s', flexShrink: 0 }}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* ── DESKTOP SETTINGS SHEET ── */}
      <SettingsSheet
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        latestAQI={latestAQI}
        histMonth={histMonth} histYear={histYear}
        setHistMonth={setHistMonth} setHistYear={setHistYear}
        loadHistory={loadHistory} loadingHist={loadingHist}
        onRefresh={loadToday} loading={loading}
      />

      {/* Metric cards */}
      {!loading && latestAQI != null && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.625rem', marginBottom: '1rem' }}>
          <MetricCard label="Current AQI"   value={latestAQI.toFixed(1)} sub="Latest reading" color={aqiColor(latestAQI)} />
          <MetricCard label="Peak max"      value={peakAQI?.toFixed(1) ?? '—'} sub="Today" color={peakAQI != null ? aqiColor(peakAQI) : undefined} />
          <MetricCard label="Peak min"      value={minAQI?.toFixed(1)  ?? '—'} sub="Today" color={minAQI  != null ? aqiColor(minAQI)  : undefined} />
          <MetricCard label="Monthly avg"   value={monthAvg ?? '—'} sub={`${MONTHS[histMonth - 1]} ${histYear}`} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* AQI today */}
        <ChartCard title="Air Quality Index — Today" icon={Wind} badge="Live" badgeLive>
          {loading ? <LoadingBox /> : aqiData.length === 0 ? <EmptyState icon={Wind} label="No data today" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={aqiData} margin={{ left: -16, right: 8 }}>
                <defs>
                  <linearGradient id="gaqi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
                <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill="url(#gaqi)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: 'var(--card-air-accent)', strokeWidth: 0 }} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Gas concentrations */}
        <ChartCard title="Gas Concentrations — Today" icon={Activity} badge="Multi-gas" height={220}>
          {loading ? <LoadingBox /> : gasData.length === 0 ? <EmptyState icon={Activity} label="No data today" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gasData} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip {...TT} formatter={(v, name) => [`${v} ppm`, name]} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />
                {GAS_LINES.map(g => (
                  <Line key={g.key} type="monotone" dataKey={g.key} name={g.label} stroke={g.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Historical */}
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
              <TrendingUp size={14} />
            </div>
            <span className="card-header-title">Historical Analysis</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <PeriodNav month={histMonth} year={histYear} onChangeMonth={setHistMonth} onChangeYear={setHistYear} />
              <button className="btn btn--ghost btn--sm" onClick={loadHistory} disabled={loadingHist} style={{ padding: '0.28rem 0.4rem' }}>
                <RefreshCw size={12} style={{ animation: loadingHist ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>

          <div style={{ padding: '0.75rem 0.5rem 0' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', padding: '0 0.75rem', marginBottom: '0.5rem' }}>
              Daily — {MONTHS[histMonth - 1]} {histYear}
            </div>
            <div style={{ height: 160 }}>
              {loadingHist ? <LoadingBox /> : weeklyData.length === 0 ? <EmptyState icon={TrendingUp} label="No data available" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                    <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
                    <Bar dataKey="aqi" fill="var(--card-air-accent)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div style={{ padding: '0 0.5rem 0.75rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', padding: '0 0.75rem', marginBottom: '0.5rem' }}>
              Monthly averages — {histYear}
            </div>
            <div style={{ height: 160 }}>
              {loadingHist ? <LoadingBox /> : monthlyData.filter(d => d.aqi != null).length === 0 ? <EmptyState icon={Calendar} label="No data available" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ left: -16, right: 8 }}>
                    <defs>
                      <linearGradient id="gairm" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                    <Tooltip {...TT} formatter={v => [`${v}`, 'Avg AQI']} />
                    <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill="url(#gairm)" strokeWidth={2} dot={false} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <AirQualityRangeChart />
        <PicoLogsPanel />
      </div>

      <Toast toast={toast} />
      <style>{`
        @keyframes spin     { to { transform: rotate(360deg) } }
        @keyframes aq-pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
        @keyframes blink    { 0%,100% { opacity:1 } 50% { opacity:0 } }
        @keyframes slideUp  { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  )
}