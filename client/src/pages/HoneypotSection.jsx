/**
 * HoneypotSection.jsx
 * Drop-in replacement per la sezione "threats" in SecurityPage.jsx
 *
 * Uso:
 *   import HoneypotSection from './HoneypotSection'
 *   // Dentro SecurityPage, sostituisci il blocco {tab === 'threats' && (...)}
 *   // con:
 *   {tab === 'threats' && (
 *     <HoneypotSection isMobile={isMobile} showToast={showToast} />
 *   )}
 *
 * Il componente gestisce autonomamente tutto il fetching e lo stato.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, RefreshCw, Bug, Terminal, Target, Key, Lock,
  Download, Upload, Hash, Globe, Ban, Siren, ShieldAlert,
  AlertCircle, AlertTriangle, Flame, Activity, BarChart2,
  Zap, Layers, TrendingUp, FileText, Clock, Check,
  ExternalLink, Eye, X, User, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

// ── API ───────────────────────────────────────────────────────────────────────
const api = {
  stats:             () => fetch('/api/honeypot/stats').then(r => r.json()),
  events:            (limit = 200) => fetch(`/api/honeypot/events?limit=${limit}`).then(r => r.json()),
  attackers:         () => fetch('/api/honeypot/attackers').then(r => r.json()),
  credentials:       () => fetch('/api/honeypot/credentials').then(r => r.json()),
  commands:          () => fetch('/api/honeypot/commands/top').then(r => r.json()),
  session:           (id) => fetch(`/api/honeypot/sessions/${id}`).then(r => r.json()),
  daily:             () => fetch('/api/honeypot/timeline/daily').then(r => r.json()),
  files:             () => fetch('/api/honeypot/files').then(r => r.json()),
  summary:           () => fetch('/api/honeypot/summary').then(r => r.json()),
  geoip:             (limit = 100) => fetch(`/api/honeypot/geoip?limit=${limit}`).then(r => r.json()),
  banned:            (jail = '') => fetch(`/api/honeypot/banned${jail ? `?jail=${jail}` : ''}`).then(r => r.json()),
  alerts:            (hours = 24) => fetch(`/api/honeypot/alerts?hours=${hours}`).then(r => r.json()),
  threats:           (days = 7) => fetch(`/api/honeypot/threats?days=${days}`).then(r => r.json()),
  attackerProfile:   (ip) => fetch(`/api/honeypot/attackers/${ip}`).then(r => r.json()),
  downloadsAnalysis: () => fetch('/api/honeypot/downloads/analysis').then(r => r.json()),
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ACCENT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
]

const SEVERITY_COLOR = { high: '#ef4444', medium: '#f97316', low: '#6b7280' }

const EVENT_META = {
  'cowrie.session.connect':       { label: 'Connect',   color: '#60a5fa' },
  'cowrie.session.closed':        { label: 'Closed',    color: '#6b7280' },
  'cowrie.login.failed':          { label: 'Auth Fail', color: '#f97316' },
  'cowrie.login.success':         { label: 'Login OK',  color: '#ef4444' },
  'cowrie.command.input':         { label: 'Command',   color: '#a78bfa' },
  'cowrie.direct-tcpip.request':  { label: 'TCP Fwd',  color: '#f59e0b' },
  'cowrie.session.file_download': { label: 'File DL',  color: '#ec4899' },
  'cowrie.session.file_upload':   { label: 'File UL',  color: '#f43f5e' },
}

const THREAT_COLOR = {
  cryptominer: '#facc15', backdoor: '#ef4444', botnet: '#f43f5e',
  scanner: '#a78bfa', ransomware: '#dc2626', persistence: '#f97316',
  recon: '#60a5fa', lateral_movement: '#f59e0b', other: '#6b7280',
}

const THREAT_LABEL = {
  cryptominer: '⛏ Cryptominer', backdoor: '🚪 Backdoor', botnet: '🤖 Botnet',
  scanner: '🔍 Scanner', ransomware: '💀 Ransomware', persistence: '📌 Persistence',
  recon: '👁 Recon', lateral_movement: '↔ Lateral', other: '❓ Other',
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
    color: 'var(--text-primary)',
  },
}

// ── Utility ───────────────────────────────────────────────────────────────────
function fmtTs(ts, opts = { dateStyle: 'short', timeStyle: 'short' }) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleString('en-GB', opts) } catch { return ts }
}

function fmtDuration(s) {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}m ${sec}s`
}

function fmtRemaining(seconds) {
  if (seconds <= 0) return 'expired'
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Shared micro-components ───────────────────────────────────────────────────
function StatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.9rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
    }}>
      <span style={{
        color, width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
          {typeof value === 'number' ? value.toLocaleString() : value ?? '—'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{label}</div>
        {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color, marginTop: '0.15rem' }}>{sub}</div>}
      </div>
    </div>
  )
}

function SeverityBadge({ severity }) {
  const color = SEVERITY_COLOR[severity] || '#6b7280'
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: '0.63rem', fontWeight: 700,
      color, background: `${color}18`, border: `1px solid ${color}40`,
      textTransform: 'uppercase',
    }}>{severity}</span>
  )
}

function EventBadge({ eventid }) {
  const meta = EVENT_META[eventid] || { label: (eventid || '').split('.').pop(), color: '#6b7280' }
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.42rem', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: '0.63rem', fontWeight: 600,
      color: meta.color, background: `${meta.color}1a`, border: `1px solid ${meta.color}40`,
      whiteSpace: 'nowrap',
    }}>{meta.label}</span>
  )
}

function Cmd({ cmd }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
      background: 'var(--bg-muted)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '0.25rem 0.55rem', marginBottom: '0.2rem',
      display: 'flex', alignItems: 'baseline', gap: '0.4rem',
    }}>
      <span style={{ color: '#22c55e', flexShrink: 0 }}>$</span>
      <span style={{ color: '#a78bfa', wordBreak: 'break-all' }}>{cmd}</span>
    </div>
  )
}

function CredBadge({ username, password }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
      background: 'var(--bg-muted)', border: '1px solid var(--border)',
      borderRadius: 4, padding: '0.15rem 0.45rem',
    }}>
      <span style={{ color: '#60a5fa' }}>{username || '—'}</span>
      <span style={{ color: 'var(--text-secondary)' }}> / </span>
      <span style={{ color: '#f97316' }}>{password || '—'}</span>
    </span>
  )
}

function Loading({ height = 200 }) {
  return <div className="loading-box" style={{ height }}><span className="spinner" /></div>
}

function Empty({ icon, text }) {
  return <div className="empty-state">{icon}<div>{text}</div></div>
}

// ── Sub-tab bar ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'Overview',    icon: <Shield size={12} /> },
  { id: 'attackers',   label: 'Attackers',   icon: <Target size={12} /> },
  { id: 'feed',        label: 'Live Feed',   icon: <Zap size={12} /> },
  { id: 'credentials', label: 'Credentials', icon: <Key size={12} /> },
  { id: 'commands',    label: 'Commands',    icon: <Terminal size={12} /> },
  { id: 'files',       label: 'Files',       icon: <FileText size={12} /> },
  { id: 'alerts',      label: 'Alerts',      icon: <Siren size={12} /> },
  { id: 'threats',     label: 'Threats',     icon: <ShieldAlert size={12} /> },
  { id: 'banned',      label: 'Banned',      icon: <Ban size={12} /> },
  { id: 'downloads',   label: 'Downloads',   icon: <Download size={12} /> },
  { id: 'map',         label: 'Map',         icon: <Globe size={12} /> },
]

function SubTabBar({ active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: '0.1rem', background: 'var(--bg-muted)',
      borderRadius: 8, padding: '0.25rem', marginBottom: '1.25rem',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          display: 'flex', alignItems: 'center', gap: '0.3rem',
          padding: '0.35rem 0.65rem', border: 'none', borderRadius: 6,
          fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          background: active === t.id ? 'var(--bg-surface)' : 'transparent',
          color: active === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
          boxShadow: active === t.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          transition: 'all 0.15s',
        }}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

// ── Session detail modal ──────────────────────────────────────────────────────
function SessionModal({ sessionId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.session(sessionId).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [sessionId])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Terminal size={13} /> Session {sessionId?.slice(0, 16)}…
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {loading ? <Loading /> : !data ? <Empty icon={<Bug size={24} />} text="Session not found" /> : (
            <>
              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                {[
                  { label: 'Source IP', value: data.src_ip },
                  { label: 'Duration', value: fmtDuration(data.duration_s) },
                  { label: 'Events', value: data.event_count },
                  { label: 'Login', value: data.login_success ? '✓ SUCCESS' : '✗ Failed', danger: data.login_success },
                ].map(({ label, value, danger }) => (
                  <div key={label} style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: danger ? '#ef4444' : 'var(--text-primary)', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', gap: '1rem' }}>
                {data.first_seen && <span><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />{fmtTs(data.first_seen)}</span>}
                {data.last_seen  && <span>→ {fmtTs(data.last_seen)}</span>}
              </div>

              {/* Credentials */}
              {data.credentials?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    Credentials ({data.credentials.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.75rem' }}>
                    {data.credentials.map((c, i) => <CredBadge key={i} {...c} />)}
                  </div>
                </>
              )}

              {/* Commands */}
              {data.commands?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    Commands ({data.commands.length})
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: '0.75rem' }}>
                    {data.commands.map((cmd, i) => <Cmd key={i} cmd={cmd} />)}
                  </div>
                </>
              )}

              {/* Files */}
              {data.files?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    Files ({data.files.length})
                  </div>
                  {data.files.map((f, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', background: 'var(--bg-muted)', borderRadius: 4, padding: '0.3rem 0.6rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {f.type === 'download' ? <Download size={11} style={{ color: '#ec4899' }} /> : <Upload size={11} style={{ color: '#f43f5e' }} />}
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{f.url || '—'}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Full event log */}
              <details style={{ marginTop: '0.75rem' }}>
                <summary style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Raw events ({data.event_count})
                </summary>
                <div style={{ marginTop: '0.4rem', maxHeight: 200, overflowY: 'auto' }}>
                  {data.events?.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)', minWidth: 55 }}>
                        {e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-GB') : ''}
                      </span>
                      <EventBadge eventid={e.eventid} />
                      {e.username && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa' }}>{e.username}</span>}
                      {e.password && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316' }}>{e.password}</span>}
                      {e.input    && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#a78bfa' }}>$ {e.input}</span>}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Attacker profile modal ────────────────────────────────────────────────────
function ProfileModal({ ip, onClose, onSessionClick }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.attackerProfile(ip).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [ip])

  const riskColor = data
    ? data.risk_score >= 70 ? '#ef4444' : data.risk_score >= 40 ? '#f97316' : '#22c55e'
    : '#6b7280'

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 12, width: '100%', maxWidth: 660, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={14} /> {ip}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {loading ? <Loading /> : !data || data.error ? <Empty icon={<Bug size={24} />} text="No data for this IP" /> : (
            <>
              {/* Risk + stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                {[
                  { label: 'RISK SCORE', value: data.risk_score, color: riskColor, big: true },
                  { label: 'SESSIONS', value: data.total_sessions, color: 'var(--text-primary)' },
                  { label: 'LOGINS OK', value: data.login_successes, color: data.login_successes > 0 ? '#ef4444' : 'var(--text-primary)' },
                ].map(({ label, value, color, big }) => (
                  <div key={label} style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: big ? '1.8rem' : '1.4rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                {data.first_seen && <span><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />First: {fmtTs(data.first_seen)}</span>}
                {data.last_seen  && <span><Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Last: {fmtTs(data.last_seen)}</span>}
              </div>

              {/* Dominant threat */}
              {data.dominant_threat && data.dominant_threat !== 'unknown' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Dominant threat:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: THREAT_COLOR[data.dominant_threat] || '#ef4444', background: `${THREAT_COLOR[data.dominant_threat] || '#ef4444'}18`, border: `1px solid ${THREAT_COLOR[data.dominant_threat] || '#ef4444'}40`, borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                    {THREAT_LABEL[data.dominant_threat] || data.dominant_threat}
                  </span>
                  {Object.entries(data.threat_categories || {}).map(([cat, cnt]) => (
                    <span key={cat} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: THREAT_COLOR[cat] || '#6b7280', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
                      {cat} ({cnt})
                    </span>
                  ))}
                </div>
              )}

              {/* High severity commands */}
              {data.commands?.high_severity?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertCircle size={11} /> High-severity commands
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    {data.commands.high_severity.map((cmd, i) => (
                      <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ef4444', background: '#ef444408', border: '1px solid #ef444430', borderRadius: 4, padding: '0.25rem 0.55rem', marginBottom: '0.2rem' }}>
                        <span style={{ color: '#22c55e', marginRight: '0.35rem' }}>$</span>{cmd}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* All commands */}
              {data.commands?.all?.length > 0 && (
                <details style={{ marginBottom: '0.75rem' }}>
                  <summary style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                    All commands ({data.commands.total})
                  </summary>
                  <div style={{ marginTop: '0.4rem', maxHeight: 200, overflowY: 'auto' }}>
                    {data.commands.all.map((c, i) => <Cmd key={i} cmd={c.cmd} />)}
                  </div>
                </details>
              )}

              {/* Credentials */}
              {data.credentials?.top_pairs?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    Credentials ({data.credentials.total_attempts} attempts, {data.credentials.unique_pairs} unique)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.75rem' }}>
                    {data.credentials.top_pairs.slice(0, 12).map((c, i) => <CredBadge key={i} {...c} />)}
                  </div>
                </>
              )}

              {/* Files */}
              {data.files?.list?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    Files ({data.files.total})
                  </div>
                  {data.files.list.map((f, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', background: 'var(--bg-muted)', borderRadius: 4, padding: '0.3rem 0.6rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {f.type === 'download' ? <Download size={11} style={{ color: '#ec4899' }} /> : <Upload size={11} style={{ color: '#f43f5e' }} />}
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{f.url || f.outfile || '—'}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Sessions */}
              {data.sessions?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', marginTop: '0.5rem' }}>
                    Sessions ({data.sessions.length})
                  </div>
                  {data.sessions.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', background: 'var(--bg-muted)', borderRadius: 5, marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <SeverityBadge severity={s.severity} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{fmtTs(s.first_seen)}</span>
                      {s.login_success && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444', fontWeight: 700 }}>LOGIN OK</span>}
                      <button onClick={() => { onClose(); onSessionClick(s.session_id) }} style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#a78bfa',
                        background: '#a78bfa18', border: '1px solid #a78bfa30',
                        borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer', marginLeft: 'auto',
                      }}>
                        {s.session_id?.slice(0, 10)}…
                      </button>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{s.commands} cmds · {s.files} files</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ stats, isMobile }) {
  const [daily, setDaily] = useState(null)

  useEffect(() => { api.daily().then(setDaily).catch(() => {}) }, [])

  if (!stats) return <Loading />

  const timeline = (stats.hourly_timeline || []).map(s => ({
    ...s,
    label: s.label || (s.hour ? new Date(s.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        <StatCard label="Total Events"    value={stats.total_events}   icon={<Zap size={15} />}      color="#f97316" />
        <StatCard label="Unique Attackers" value={stats.unique_ips}    icon={<Target size={15} />}   color="#ef4444" />
        <StatCard label="Login Attempts"  value={stats.login_attempts} icon={<Lock size={15} />}     color="#f59e0b"
          sub={stats.login_success > 0 ? `⚠ ${stats.login_success} succeeded` : 'none succeeded'} />
        <StatCard label="Sessions"        value={stats.total_sessions} icon={<Terminal size={15} />} color="#a78bfa" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        {/* Hourly timeline */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Activity size={15} /></div>
            <span className="card-header-title">Attack Timeline (last 24h)</span>
          </div>
          <div className="card-body" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ left: -10, right: 4, top: 4 }}>
                <defs>
                  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} interval={3} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} width={24} />
                <Tooltip {...TOOLTIP_STYLE} formatter={v => [`${v} events`, 'Attacks']} />
                <Area type="monotone" dataKey="attacks" stroke="#ef4444" strokeWidth={1.5} fill="url(#ag)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top IPs */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#ef444418', color: '#ef4444' }}><Target size={15} /></div>
            <span className="card-header-title">Top Attacking IPs</span>
          </div>
          <div style={{ padding: '0 1rem 1rem' }}>
            {(stats.top_ips || []).map((item, i) => {
              const max = stats.top_ips[0]?.count || 1
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#ef4444', minWidth: 120, flexShrink: 0 }}>{item.ip}</span>
                  <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${Math.round((item.count / max) * 100)}%`, background: '#ef4444' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>{item.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Daily history */}
      {daily && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Activity size={15} /></div>
            <span className="card-header-title">Attack History (last 30 days)</span>
            {daily.peak_day && (
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                peak: <span style={{ color: '#ef4444' }}>{daily.peak_day.date} ({daily.peak_day.attacks})</span>
              </span>
            )}
          </div>
          <div className="card-body" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily.timeline} margin={{ left: -10, right: 4, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} tickFormatter={v => v.slice(5)} interval={isMobile ? 6 : 3} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} width={24} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [v, n === 'attacks' ? 'Total events' : 'Login fails']} />
                <Bar dataKey="attacks"      fill="#ef4444" opacity={0.7} radius={[2,2,0,0]} maxBarSize={16} />
                <Bar dataKey="login_failed" fill="#f97316" opacity={0.7} radius={[2,2,0,0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Event type breakdown */}
      {stats.event_types && Object.keys(stats.event_types).length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#60a5fa18', color: '#60a5fa' }}><BarChart2 size={15} /></div>
            <span className="card-header-title">Event Type Breakdown</span>
          </div>
          <div style={{ padding: '0.75rem 1rem 1rem' }}>
            {Object.entries(stats.event_types).sort((a, b) => b[1] - a[1]).map(([eid, cnt]) => {
              const meta = EVENT_META[eid] || { label: eid.split('.').pop(), color: '#6b7280' }
              const max  = Math.max(...Object.values(stats.event_types))
              return (
                <div key={eid} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                  <EventBadge eventid={eid} />
                  <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${(cnt / max) * 100}%`, background: meta.color }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>{cnt.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent commands */}
      {stats.recent_commands?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><Terminal size={15} /></div>
            <span className="card-header-title">Recent Attacker Commands</span>
          </div>
          <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {stats.recent_commands.map((cmd, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '0.3rem 0.65rem' }}>
                <span style={{ color: '#22c55e', flexShrink: 0 }}>$</span>
                <span style={{ color: '#a78bfa', wordBreak: 'break-all' }}>{cmd.input}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.62rem', marginLeft: 'auto', flexShrink: 0 }}>{cmd.ip}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Attackers tab ─────────────────────────────────────────────────────────────
function AttackersTab({ isMobile, onSessionClick, onProfileClick }) {
  const [attackers, setAttackers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState(null)

  useEffect(() => {
    api.attackers().then(setAttackers).catch(() => setAttackers([])).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />

  const filtered = attackers.filter(a => !search || a.ip.includes(search))

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="card-header-icon" style={{ background: '#ef444418', color: '#ef4444' }}><Bug size={15} /></div>
        <span className="card-header-title">Attackers</span>
        <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{filtered.length}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter IPs…" style={{
          marginLeft: 'auto', background: 'var(--bg-muted)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '0.28rem 0.5rem', fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem', color: 'var(--text-primary)', outline: 'none', width: 130,
        }} />
      </div>

      {filtered.length === 0 ? <Empty icon={<Target size={28} />} text="No attackers found" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.75rem' }}>
          {filtered.map((a, i) => {
            const isExpanded = expanded === a.ip
            const hasDanger  = a.success > 0
            const color      = ACCENT_COLORS[i % ACCENT_COLORS.length]

            return (
              <div key={a.ip} style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${hasDanger ? '#ef444440' : 'var(--border)'}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                {/* Header row */}
                <div onClick={() => setExpanded(isExpanded ? null : a.ip)} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.75rem 0.9rem', cursor: 'pointer' }}>
                  <Target size={13} style={{ color: hasDanger ? '#ef4444' : color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: hasDanger ? '#ef4444' : 'var(--text-primary)' }}>
                      {a.ip}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                      {a.attempts} attempts · {a.sessions} sessions · last {fmtTs(a.last_seen, { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {hasDanger && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 4, padding: '0.1rem 0.35rem' }}>LOGIN OK</span>}
                    <button onClick={e => { e.stopPropagation(); onProfileClick(a.ip) }} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444', background: '#ef444418', border: '1px solid #ef444430', borderRadius: 4, padding: '0.15rem 0.4rem', cursor: 'pointer' }}>
                      profile
                    </button>
                    {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-secondary)' }} />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', padding: '0.75rem 0.9rem' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                      {/* Credentials */}
                      {a.usernames?.length > 0 && (
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Usernames tried</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {a.usernames.map((u, j) => <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa', background: '#60a5fa18', border: '1px solid #60a5fa30', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{u}</span>)}
                          </div>
                        </div>
                      )}
                      {a.passwords?.length > 0 && (
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Passwords tried</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {a.passwords.map((p, j) => <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{p}</span>)}
                          </div>
                        </div>
                      )}
                      {/* Commands */}
                      {a.commands?.length > 0 && (
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Commands run</div>
                          {a.commands.map((cmd, j) => <Cmd key={j} cmd={cmd} />)}
                        </div>
                      )}
                      {/* Files */}
                      {a.files?.length > 0 && (
                        <div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Files</div>
                          {a.files.map((f, j) => (
                            <div key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                              {f.type === 'download' ? <Download size={10} style={{ color: '#ec4899' }} /> : <Upload size={10} style={{ color: '#f43f5e' }} />}
                              <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{f.url || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Session links */}
                    {a.session_ids?.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        {a.session_ids.map((sid, j) => (
                          <button key={j} onClick={() => onSessionClick(sid)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa30', borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer' }}>
                            session {sid.slice(0, 8)}…
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Live feed tab ─────────────────────────────────────────────────────────────
function FeedTab({ events, isMobile }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><Zap size={15} /></div>
        <span className="card-header-title">Live Feed</span>
        <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{events.length}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#22c55e' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} /> live · 30s
        </span>
      </div>
      {/* Column headers (desktop) */}
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: '65px 130px 90px 90px 1fr', gap: '0.5rem', padding: '0.35rem 1rem', background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
          {['Time', 'Source IP', 'Event', 'Username', 'Password / Command'].map(h => (
            <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {events.length === 0 ? <Empty icon={<Terminal size={28} />} text="No events yet" /> : (
          events.map((e, i) => {
            const isSuccess = e.eventid === 'cowrie.login.success'
            const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
            return isMobile ? (
              <div key={i} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', background: isSuccess ? '#ef444408' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <EventBadge eventid={e.eventid} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: isSuccess ? '#ef4444' : 'var(--text-primary)', fontWeight: isSuccess ? 700 : 400 }}>{e.src_ip}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{ts}</span>
                </div>
                {(e.username || e.password || e.input) && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {e.username && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa' }}>{e.username}</span>}
                    {e.password && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316' }}>{e.password}</span>}
                    {e.input    && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#a78bfa' }}>$ {e.input}</span>}
                  </div>
                )}
              </div>
            ) : (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '65px 130px 90px 90px 1fr', gap: '0.5rem', alignItems: 'center', padding: '0.45rem 1rem', borderBottom: '1px solid var(--border)', background: isSuccess ? '#ef444408' : 'transparent' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{ts}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: isSuccess ? '#ef4444' : 'var(--text-primary)', fontWeight: isSuccess ? 700 : 400 }}>{e.src_ip || '—'}</span>
                <EventBadge eventid={e.eventid} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.username || '—'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.password || e.input || '—'}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Credentials tab ───────────────────────────────────────────────────────────
function CredentialsTab({ isMobile }) {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.credentials().then(setData).catch(() => setData(null)).finally(() => setLoading(false)) }, [])

  if (loading) return <Loading />
  if (!data)   return <Empty icon={<Key size={28} />} text="No credential data" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <StatCard label="Total Attempts"  value={data.total_attempts}  icon={<Lock size={15} />}       color="#f97316" />
        <StatCard label="Unique Pairs"    value={data.unique_pairs}    icon={<Hash size={15} />}       color="#60a5fa" />
        <StatCard label="Diversity Score" value={`${(data.diversity_score * 100).toFixed(1)}%`} icon={<TrendingUp size={15} />} color="#22c55e"
          sub={data.diversity_score > 0.8 ? 'Highly varied' : data.diversity_score > 0.4 ? 'Mixed' : 'Low variety'} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#60a5fa18', color: '#60a5fa' }}><Key size={15} /></div>
          <span className="card-header-title">Top Credential Pairs</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Username</th><th>Password</th><th>Count</th></tr></thead>
            <tbody>
              {data.top_pairs.map((p, i) => (
                <tr key={i}>
                  <td className="td-mono td-muted" style={{ fontSize: '0.72rem' }}>{i + 1}</td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#60a5fa' }}>{p.username}</span></td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#f97316' }}>{p.password}</span></td>
                  <td className="td-mono" style={{ fontSize: '0.78rem' }}>{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        {[
          { title: 'Top Usernames', items: data.top_usernames, key: 'username', color: '#60a5fa' },
          { title: 'Top Passwords', items: data.top_passwords, key: 'password', color: '#f97316' },
        ].map(({ title, items, key, color }) => (
          <div key={title} className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: `${color}18`, color }}><Key size={14} /></div>
              <span className="card-header-title">{title}</span>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              {(items || []).map((item, i) => {
                const max = items[0]?.count || 1
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color, minWidth: 100, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{item[key]}</span>
                    <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${Math.round((item.count / max) * 100)}%`, background: color }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>{item.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Commands tab ──────────────────────────────────────────────────────────────
function CommandsTab({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.commands().then(setData).catch(() => setData(null)).finally(() => setLoading(false)) }, [])

  if (loading) return <Loading />
  if (!data)   return <Empty icon={<Terminal size={28} />} text="No command data" />

  const catData = Object.entries(data.categories || {}).map(([name, value]) => ({ name, value }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        <StatCard label="Total Commands"  value={data.total_commands}  icon={<Terminal size={15} />} color="#a78bfa" />
        <StatCard label="Unique Commands" value={data.unique_commands} icon={<Hash size={15} />}    color="#60a5fa" />
        {Object.entries(data.categories || {}).slice(0, 2).map(([cat, cnt]) => (
          <StatCard key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} value={cnt} icon={<Layers size={15} />} color={THREAT_COLOR[cat] || '#6b7280'} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><BarChart2 size={15} /></div>
            <span className="card-header-title">Command Categories</span>
          </div>
          <div className="card-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} cx="50%" cy="45%" innerRadius="38%" outerRadius="62%" paddingAngle={3} dataKey="value">
                  {catData.map((entry, i) => <Cell key={i} fill={THREAT_COLOR[entry.name] || ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><Terminal size={15} /></div>
            <span className="card-header-title">Top Commands</span>
          </div>
          <div style={{ padding: '0 1rem 1rem', maxHeight: 240, overflowY: 'auto' }}>
            {(data.top_commands || []).slice(0, 20).map((cmd, i) => {
              const max = data.top_commands[0]?.count || 1
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', minWidth: 120, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{cmd.command}</span>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg-muted)', borderRadius: 99 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${Math.round((cmd.count / max) * 100)}%`, background: '#a78bfa' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: 24, textAlign: 'right' }}>{cmd.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Files tab ─────────────────────────────────────────────────────────────────
function FilesTab() {
  const [files, setFiles]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.files().then(setFiles).catch(() => setFiles([])).finally(() => setLoading(false)) }, [])

  if (loading) return <Loading />
  if (!files.length) return <Empty icon={<FileText size={28} />} text="No file activity recorded" />

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: '#ec489918', color: '#ec4899' }}><FileText size={15} /></div>
        <span className="card-header-title">File Activity</span>
        <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{files.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Source IP</th><th>URL / File</th><th>SHA256</th><th>Session</th><th>Time</th></tr></thead>
          <tbody>
            {files.map((f, i) => (
              <tr key={i}>
                <td>
                  {f.type === 'download'
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#ec4899' }}><Download size={11} />download</span>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#f43f5e' }}><Upload size={11} />upload</span>
                  }
                </td>
                <td className="td-mono" style={{ fontSize: '0.75rem' }}>{f.src_ip || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url || f.outfile || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.shasum ? (
                    <a href={`https://www.virustotal.com/gui/file/${f.shasum}`} target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'none' }}>
                      <ExternalLink size={9} />{f.shasum.slice(0, 16)}…
                    </a>
                  ) : '—'}
                </td>
                <td className="td-mono td-muted" style={{ fontSize: '0.65rem' }}>{f.session ? f.session.slice(0, 10) + '…' : '—'}</td>
                <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>{fmtTs(f.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Alerts tab ────────────────────────────────────────────────────────────────
function AlertsTab({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours]     = useState(24)

  useEffect(() => {
    setLoading(true)
    api.alerts(hours).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [hours])

  if (loading) return <Loading />
  if (!data)   return <Empty icon={<Siren size={28} />} text="No alert data" />

  const high = data.alerts?.filter(a => a.severity === 'high').length || 0
  const med  = data.alerts?.filter(a => a.severity === 'medium').length || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <StatCard label="Total Alerts"  value={data.total} icon={<Siren size={15} />}        color="#ef4444" />
        <StatCard label="High Severity" value={high}       icon={<AlertCircle size={15} />}  color="#ef4444" />
        <StatCard label="Medium"        value={med}        icon={<AlertTriangle size={15} />} color="#f97316" />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Window:</span>
        {[6, 24, 48, 168].map(h => (
          <button key={h} onClick={() => setHours(h)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.25rem 0.6rem', border: `1px solid ${hours === h ? '#ef4444' : 'var(--border)'}`, borderRadius: 6, background: hours === h ? '#ef444418' : 'var(--bg-muted)', color: hours === h ? '#ef4444' : 'var(--text-secondary)', cursor: 'pointer' }}>
            {h === 168 ? '7d' : `${h}h`}
          </button>
        ))}
      </div>
      {!data.alerts?.length
        ? <Empty icon={<Check size={28} />} text="No anomalous activity in this window" />
        : data.alerts.map((alert, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: `1px solid ${alert.severity === 'high' ? '#ef444440' : '#f9731640'}`, borderLeft: `3px solid ${alert.severity === 'high' ? '#ef4444' : '#f97316'}`, borderRadius: 8, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <SeverityBadge severity={alert.severity} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: alert.severity === 'high' ? '#ef4444' : '#f97316' }}>{alert.src_ip}</span>
              {alert.login_success && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 4, padding: '0.1rem 0.4rem' }}>⚠ LOGIN SUCCESS</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{fmtTs(alert.first_seen)}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.4rem' }}>
              {alert.reasons.map((r, j) => (
                <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: ['login_success', 'dangerous_command'].includes(r) ? '#ef4444' : '#f97316', background: ['login_success', 'dangerous_command'].includes(r) ? '#ef444418' : '#f9731618', border: `1px solid ${['login_success', 'dangerous_command'].includes(r) ? '#ef444430' : '#f9731630'}`, borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                  {r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              <span>{alert.command_count} commands</span>
              {alert.file_count > 0 && <span style={{ color: '#ec4899' }}>{alert.file_count} files</span>}
            </div>
            {alert.high_severity_commands?.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                {alert.high_severity_commands.map((cmd, j) => (
                  <div key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ef4444', background: '#ef444408', border: '1px solid #ef444420', borderRadius: 4, padding: '0.2rem 0.5rem', marginTop: '0.2rem' }}>
                    <span style={{ color: '#22c55e', marginRight: '0.3rem' }}>$</span>{cmd}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      }
    </div>
  )
}

// ── Threats tab ───────────────────────────────────────────────────────────────
function ThreatsTab({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]       = useState(7)

  useEffect(() => {
    setLoading(true)
    api.threats(days).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [days])

  if (loading) return <Loading />
  if (!data)   return <Empty icon={<ShieldAlert size={28} />} text="No threat data" />

  const catData = (data.categories || []).map(c => ({ name: c.category, value: c.total }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <StatCard label="Total Sessions" value={data.total_sessions}       icon={<Terminal size={15} />}    color="#a78bfa" />
        <StatCard label="High Severity"  value={data.severity?.high || 0}  icon={<Flame size={15} />}       color="#ef4444" />
        <StatCard label="Medium"         value={data.severity?.medium || 0} icon={<AlertTriangle size={15} />} color="#f97316" />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Period:</span>
        {[1, 7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.25rem 0.6rem', border: `1px solid ${days === d ? '#a78bfa' : 'var(--border)'}`, borderRadius: 6, background: days === d ? '#a78bfa18' : 'var(--bg-muted)', color: days === d ? '#a78bfa' : 'var(--text-secondary)', cursor: 'pointer' }}>{d}d</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><ShieldAlert size={15} /></div>
            <span className="card-header-title">Threat Categories</span>
          </div>
          <div className="card-body" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} cx="50%" cy="45%" innerRadius="35%" outerRadius="62%" paddingAngle={3} dataKey="value">
                  {catData.map((entry, i) => <Cell key={i} fill={THREAT_COLOR[entry.name] || ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} formatter={v => THREAT_LABEL[v] || v} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#ef444418', color: '#ef4444' }}><Activity size={15} /></div>
            <span className="card-header-title">Daily Threats</span>
          </div>
          <div className="card-body" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily_timeline || []} margin={{ left: -10, right: 4, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} width={24} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="total" fill="#ef4444" opacity={0.7} radius={[2,2,0,0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      {(data.categories || []).map((cat, i) => (
        <div key={i} className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: `${THREAT_COLOR[cat.category] || '#6b7280'}18`, color: THREAT_COLOR[cat.category] || '#6b7280' }}><ShieldAlert size={15} /></div>
            <span className="card-header-title">{THREAT_LABEL[cat.category] || cat.category}</span>
            <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{cat.total} sessions</span>
            {cat.high_count > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444', background: '#ef444418', border: '1px solid #ef444430', borderRadius: 4, padding: '0.1rem 0.35rem', marginLeft: '0.4rem' }}>{cat.high_count} high</span>}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{cat.unique_ips} unique IPs</span>
          </div>
          <div style={{ padding: '0.5rem 1rem', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {cat.top_ips.map((ip, j) => (
              <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: THREAT_COLOR[cat.category] || '#6b7280', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                {ip.ip} <span style={{ opacity: 0.6 }}>×{ip.count}</span>
              </span>
            ))}
          </div>
          {cat.examples?.some(e => e.example_cmds?.length > 0) && (
            <div style={{ padding: '0 1rem 0.75rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Example commands</div>
              {cat.examples.flatMap(e => e.example_cmds || []).slice(0, 3).map((cmd, j) => <Cmd key={j} cmd={cmd} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Banned tab ────────────────────────────────────────────────────────────────
function BannedTab({ isMobile }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [jail, setJail]         = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.banned(jail).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [jail])

  useEffect(() => { load() }, [load])

  if (loading) return <Loading />
  if (!data || data.error) return <Empty icon={<Ban size={28} />} text={data?.error || 'Cannot connect to Fail2ban database'} />

  const jails = Object.keys(data.by_jail || {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        <StatCard label="Banned IPs"   value={data.total}   icon={<Ban size={15} />}    color="#f97316" />
        <StatCard label="Active Jails" value={jails.length} icon={<Shield size={15} />} color="#60a5fa" />
        {jails.slice(0, 2).map(j => <StatCard key={j} label={`Jail: ${j}`} value={data.by_jail[j]} icon={<Lock size={15} />} color="#a78bfa" />)}
      </div>
      {jails.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['', ...jails].map(j => (
            <button key={j || 'all'} onClick={() => setJail(j)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '0.3rem 0.75rem', border: `1px solid ${jail === j ? '#f97316' : 'var(--border)'}`, borderRadius: 6, background: jail === j ? '#f9731618' : 'var(--bg-muted)', color: jail === j ? '#f97316' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {j || 'All'}{j ? ` (${data.by_jail[j]})` : ''}
            </button>
          ))}
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Ban size={15} /></div>
          <span className="card-header-title">Banned IPs</span>
          <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{data.banned?.length || 0}</span>
          <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><RefreshCw size={13} /></button>
        </div>
        {!data.banned?.length ? <Empty icon={<Ban size={24} />} text="No banned IPs" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>IP</th><th>Jail</th><th>Banned At</th><th>Expires</th><th>Remaining</th></tr></thead>
              <tbody>
                {data.banned.map((b, i) => (
                  <tr key={i}>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#f97316', fontWeight: 600 }}>{b.ip}</span></td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa30', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{b.jail}</span></td>
                    <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>{fmtTs(b.banned_at)}</td>
                    <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>{fmtTs(b.expires_at)}</td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600, color: b.remaining_s > 3600 ? '#ef4444' : b.remaining_s > 0 ? '#f97316' : '#6b7280' }}>{fmtRemaining(b.remaining_s)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Downloads tab ─────────────────────────────────────────────────────────────
function DownloadsTab({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.downloadsAnalysis().then(setData).catch(() => setData(null)).finally(() => setLoading(false)) }, [])

  if (loading) return <Loading />
  if (!data)   return <Empty icon={<Download size={28} />} text="No download data" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <StatCard label="Unique Files"    value={data.total_unique_files || 0}                                       icon={<Hash size={15} />}     color="#ec4899" />
        <StatCard label="With Hash"       value={(data.files || []).filter(f => f.sha256).length}                   icon={<Shield size={15} />}   color="#22c55e" />
        <StatCard label="Total Downloads" value={(data.files || []).reduce((s, f) => s + f.count, 0)} icon={<Download size={15} />} color="#f97316" />
      </div>
      {!data.files?.length ? <Empty icon={<Download size={28} />} text="No files recorded" /> : (
        data.files.map((f, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              {f.type === 'download' ? <Download size={14} style={{ color: '#ec4899', flexShrink: 0, marginTop: 2 }} /> : <Upload size={14} style={{ color: '#f43f5e', flexShrink: 0, marginTop: 2 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', wordBreak: 'break-all', marginBottom: '0.3rem' }}>{f.url || f.outfile || '—'}</div>
                {f.sha256 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                    <Hash size={10} style={{ color: 'var(--text-secondary)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{f.sha256}</span>
                    {f.virustotal_url && (
                      <a href={f.virustotal_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#22c55e', background: '#22c55e18', border: '1px solid #22c55e40', borderRadius: 4, padding: '0.1rem 0.4rem', textDecoration: 'none', flexShrink: 0 }}>
                        <ExternalLink size={9} /> VirusTotal
                      </a>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  <span>Seen <strong style={{ color: 'var(--text-primary)' }}>{f.count}</strong>×</span>
                  <span><strong style={{ color: 'var(--text-primary)' }}>{f.unique_ips}</strong> IPs</span>
                  {f.first_seen && <span>First: {fmtTs(f.first_seen)}</span>}
                  {f.last_seen  && <span>Last: {fmtTs(f.last_seen)}</span>}
                </div>
                {f.source_ips?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: '0.35rem' }}>
                    {f.source_ips.map((ip, j) => (
                      <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{ip}</span>
                    ))}
                  </div>
                )}
              </div>
              <span style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: f.count > 5 ? '#ef4444' : '#f97316', background: f.count > 5 ? '#ef444418' : '#f9731618', border: `1px solid ${f.count > 5 ? '#ef444430' : '#f9731630'}`, borderRadius: 6, padding: '0.2rem 0.55rem' }}>
                ×{f.count}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Simple geo map (SVG world) ────────────────────────────────────────────────
function MapTab({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.geoip(100).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])

  if (loading) return <Loading />
  if (!data || data.error) return <Empty icon={<Globe size={28} />} text={data?.error || 'GeoIP database not available'} />

  const attackers = data.attackers || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <StatCard label="Geolocated IPs" value={data.total_ips}     icon={<Globe size={15} />}  color="#60a5fa" />
        <StatCard label="Countries"      value={data.countries?.length || 0} icon={<Eye size={15} />}  color="#22c55e" />
        <StatCard label="Top Country"    value={data.countries?.[0]?.country || '—'} icon={<Target size={15} />} color="#ef4444" />
      </div>

      {/* Country leaderboard */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#60a5fa18', color: '#60a5fa' }}><Globe size={15} /></div>
          <span className="card-header-title">Attacks by Country</span>
        </div>
        <div style={{ padding: '0 1rem 1rem' }}>
          {(data.countries || []).slice(0, 15).map((c, i) => {
            const max = data.countries[0]?.count || 1
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)', minWidth: 130, flexShrink: 0 }}>
                  {c.countryCode !== 'XX' ? `${c.countryCode} ` : ''}{c.country || 'Unknown'}
                </span>
                <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${Math.round((c.count / max) * 100)}%`, background: '#60a5fa' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>{c.count}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', minWidth: 44 }}>{c.ips} IPs</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Attacker table with geo */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#ef444418', color: '#ef4444' }}><Target size={15} /></div>
          <span className="card-header-title">Attacker Locations</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>IP</th><th>Country</th><th>City</th><th>Events</th></tr></thead>
            <tbody>
              {attackers.slice(0, 30).map((a, i) => (
                <tr key={i}>
                  <td className="td-mono td-muted" style={{ fontSize: '0.72rem' }}>{i + 1}</td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#ef4444', fontWeight: 600 }}>{a.ip}</span></td>
                  <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)' }}>{a.countryCode !== 'XX' ? `${a.countryCode} ` : ''}{a.country || '—'}</span></td>
                  <td className="td-mono td-muted" style={{ fontSize: '0.72rem' }}>{a.city || a.region || '—'}</td>
                  <td className="td-mono" style={{ fontSize: '0.78rem' }}>{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function HoneypotSection({ isMobile, showToast }) {
  const [subTab,    setSubTab]    = useState('overview')
  const [stats,     setStats]     = useState(null)
  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [refreshing,setRefreshing]= useState(false)
  const [sessionModal, setSessionModal] = useState(null)
  const [profileModal, setProfileModal] = useState(null)

  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [s, e] = await Promise.all([
        api.stats().catch(() => null),
        api.events(200).catch(() => []),
      ])
      if (s) setStats(s)
      if (e) setEvents(e)
    } catch {
      showToast?.('Error loading honeypot data', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadCore()
    const id = setInterval(() => loadCore(true), 30000)
    return () => clearInterval(id)
  }, [loadCore])

  if (loading) return <div className="loading-box" style={{ height: 300 }}><span className="spinner" /></div>

  if (!stats) return (
    <div className="empty-state" style={{ padding: '3rem' }}>
      <Bug size={32} style={{ color: 'var(--text-secondary)' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
        No honeypot data found. Make sure Cowrie is running and JSON logs are mounted at{' '}
        <code style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--bg-muted)', padding: '0.1rem 0.3rem', borderRadius: 4 }}>/var/log/cowrie/cowrie.json</code>
      </div>
    </div>
  )

  const hasLoginSuccess = (stats.login_success || 0) > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Modals */}
      {sessionModal && <SessionModal sessionId={sessionModal} onClose={() => setSessionModal(null)} />}
      {profileModal && <ProfileModal ip={profileModal} onClose={() => setProfileModal(null)} onSessionClick={setSessionModal} />}

      {/* Header stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        <StatCard label="Total Events"     value={stats.total_events}   icon={<Zap size={15} />}      color="#f97316" />
        <StatCard label="Unique Attackers" value={stats.unique_ips}     icon={<Target size={15} />}   color="#ef4444" />
        <StatCard label="Login Attempts"   value={stats.login_attempts} icon={<Lock size={15} />}     color="#f59e0b"
          sub={hasLoginSuccess ? `⚠ ${stats.login_success} succeeded` : 'none succeeded'} />
        <StatCard label="Sessions"         value={stats.total_sessions} icon={<Terminal size={15} />} color="#a78bfa" />
      </div>

      {/* Refresh button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn--ghost btn--sm" onClick={() => loadCore(true)} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          {!isMobile && 'Refresh'}
        </button>
      </div>

      <SubTabBar active={subTab} onChange={setSubTab} />

      {subTab === 'overview'    && <OverviewTab stats={stats} isMobile={isMobile} />}
      {subTab === 'attackers'   && <AttackersTab isMobile={isMobile} onSessionClick={setSessionModal} onProfileClick={setProfileModal} />}
      {subTab === 'feed'        && <FeedTab events={events} isMobile={isMobile} />}
      {subTab === 'credentials' && <CredentialsTab isMobile={isMobile} />}
      {subTab === 'commands'    && <CommandsTab isMobile={isMobile} />}
      {subTab === 'files'       && <FilesTab />}
      {subTab === 'alerts'      && <AlertsTab isMobile={isMobile} />}
      {subTab === 'threats'     && <ThreatsTab isMobile={isMobile} />}
      {subTab === 'banned'      && <BannedTab isMobile={isMobile} />}
      {subTab === 'downloads'   && <DownloadsTab isMobile={isMobile} />}
      {subTab === 'map'         && <MapTab isMobile={isMobile} />}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  )
}