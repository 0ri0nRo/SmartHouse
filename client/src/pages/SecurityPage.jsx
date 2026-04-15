import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Monitor, RefreshCw, Bell, BellOff, Wifi,
  Cpu, Globe, Server, Smartphone, Laptop, Router, HardDrive,
  ChevronDown, ChevronUp, Scan, Search, X, Clock, Activity,
  AlertTriangle, Check, Calendar, Eye, Bug, Terminal, User,
  Key, Zap, Target, Lock, Download, Upload, Hash, BarChart2,
  TrendingUp, Layers, FileText,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── API ────────────────────────────────────────────────────
const api = {
  devices:     () => fetch('/api/devices').then(r => r.json()),
  stats:       () => fetch('/api/devices/stats').then(r => r.json()),
  connDays:    () => fetch('/api/devices/most_connected_days').then(r => r.json()),
  alerts:      () => fetch('/api/devices/alerts').then(r => r.json()),
  clearAlerts: () => fetch('/api/devices/alerts', { method: 'DELETE' }).then(r => r.json()),
  history:     () => fetch('/api/devices/history').then(r => r.json()),
  portScan:    (mac) => fetch(`/api/devices/${mac}/portscan`, { method: 'POST' }).then(r => r.json()),
  osScan:      (mac) => fetch(`/api/devices/${mac}/osscan`, { method: 'POST' }).then(r => r.json()),
  // Honeypot
  honeypotStats:     () => fetch('/api/honeypot/stats').then(r => r.json()),
  honeypotEvents:    () => fetch('/api/honeypot/events').then(r => r.json()),
  honeypotAttackers: () => fetch('/api/honeypot/attackers').then(r => r.json()),
  honeypotCredentials: () => fetch('/api/honeypot/credentials').then(r => r.json()),
  honeypotCommands:  () => fetch('/api/honeypot/commands/top').then(r => r.json()),
  honeypotSession:   (id) => fetch(`/api/honeypot/sessions/${id}`).then(r => r.json()),
  honeypotDaily:     () => fetch('/api/honeypot/timeline/daily').then(r => r.json()),
  honeypotFiles:     () => fetch('/api/honeypot/files').then(r => r.json()),
  honeypotSummary:   () => fetch('/api/honeypot/summary').then(r => r.json()),
}

// ── Constants ──────────────────────────────────────────────
const COLORS = [
  'var(--card-hum-accent)', 'var(--card-air-accent)', 'var(--card-shop-accent)',
  'var(--card-temp-accent)', 'var(--card-train-accent)', 'var(--card-exp-accent)',
  'var(--card-act-accent)', 'var(--card-raspi-accent)',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
  },
}

const OS_ICON = {
  Windows: <Monitor size={13} />,
  Linux:   <Server size={13} />,
  Apple:   <Laptop size={13} />,
  Android: <Smartphone size={13} />,
  Network: <Router size={13} />,
  BSD:     <HardDrive size={13} />,
  Unknown: <Cpu size={13} />,
}

const OS_COLOR = {
  Windows: 'var(--card-air-accent)',
  Linux:   'var(--card-raspi-accent)',
  Apple:   'var(--card-act-accent)',
  Android: 'var(--card-shop-accent)',
  Network: 'var(--card-hum-accent)',
  BSD:     'var(--card-train-accent)',
  Unknown: 'var(--text-secondary)',
}

const EVENT_META = {
  'cowrie.session.connect':       { label: 'Connect',   color: '#60a5fa' },
  'cowrie.session.closed':        { label: 'Closed',    color: '#6b7280' },
  'cowrie.login.failed':          { label: 'Auth Fail', color: '#f97316' },
  'cowrie.login.success':         { label: 'Login OK!', color: '#ef4444' },
  'cowrie.command.input':         { label: 'Command',   color: '#a78bfa' },
  'cowrie.direct-tcpip.request':  { label: 'TCP Fwd',  color: '#f59e0b' },
  'cowrie.session.file_download': { label: 'File DL',  color: '#ec4899' },
  'cowrie.session.file_upload':   { label: 'File UL',  color: '#f43f5e' },
}

const CMD_CATEGORY_COLOR = {
  recon:            '#60a5fa',
  download:         '#ec4899',
  persistence:      '#f97316',
  'lateral-movement': '#f59e0b',
  other:            '#6b7280',
}

function osShape(os) {
  switch (os) {
    case 'Apple':   return 'A'
    case 'Windows': return 'W'
    case 'Linux':   return 'L'
    case 'Android': return 'D'
    case 'Network': return 'N'
    case 'BSD':     return 'B'
    default:        return '?'
  }
}

// Format ISO datetime string to local time label for chart axis
function fmtHourLabel(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return isoStr }
}

// ── Shared sub-components ──────────────────────────────────

function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'devices',  label: 'Devices',   icon: <Monitor size={13} /> },
    { id: 'topology', label: 'Topology',  icon: <Globe size={13} /> },
    { id: 'stats',    label: 'Analytics', icon: <Activity size={13} /> },
    { id: 'history',  label: 'History',   icon: <Clock size={13} /> },
    { id: 'threats',  label: 'Threats',   icon: <Bug size={13} /> },
  ]
  return (
    <div style={{
      display: 'flex', gap: '0.15rem',
      borderBottom: '1px solid var(--border)',
      marginBottom: '1.5rem',
      overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.55rem 0.85rem',
          border: 'none', background: 'transparent',
          fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          color: active === t.id
            ? t.id === 'threats' ? '#ef4444' : 'var(--accent)'
            : 'var(--text-secondary)',
          borderBottom: active === t.id
            ? `2px solid ${t.id === 'threats' ? '#ef4444' : 'var(--accent)'}`
            : '2px solid transparent',
          marginBottom: '-1px', transition: 'color 0.15s',
        }}>
          {t.icon}{t.label}
        </button>
      ))}
    </div>
  )
}

// Sub-tabs within Threats
function ThreatTabBar({ active, onChange }) {
  const tabs = [
    { id: 'overview',     label: 'Overview',     icon: <Shield size={12} /> },
    { id: 'attackers',    label: 'Attackers',    icon: <Target size={12} /> },
    { id: 'credentials',  label: 'Credentials',  icon: <Key size={12} /> },
    { id: 'commands',     label: 'Commands',     icon: <Terminal size={12} /> },
    { id: 'files',        label: 'Files',        icon: <FileText size={12} /> },
    { id: 'feed',         label: 'Live Feed',    icon: <Zap size={12} /> },
  ]
  return (
    <div style={{
      display: 'flex', gap: '0.1rem',
      background: 'var(--bg-muted)', borderRadius: 8,
      padding: '0.25rem', marginBottom: '1.25rem',
      overflowX: 'auto', scrollbarWidth: 'none',
    }}>
      {tabs.map(t => (
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

function OnlineBadge({ status }) {
  const online = status === 'up'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.15rem 0.5rem', borderRadius: 99,
      background: online ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: online ? '#22c55e' : '#ef4444',
      fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: online ? '#22c55e' : '#ef4444',
        animation: online ? 'pulse 2s infinite' : 'none',
      }} />
      {online ? 'online' : 'offline'}
    </span>
  )
}

function OsBadge({ os }) {
  if (!os) return <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>—</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.15rem 0.5rem', borderRadius: 99,
      background: 'var(--bg-muted)', color: OS_COLOR[os] || 'var(--text-secondary)',
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
    }}>
      {OS_ICON[os] || <Cpu size={12} />} {os}
    </span>
  )
}

function PortBadge({ port }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.35rem', borderRadius: 4,
      background: 'var(--bg-muted)', border: '1px solid var(--border)',
      fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)',
      margin: '1px',
    }}>
      {port.port}<span style={{ opacity: 0.5 }}>/{port.service}</span>
    </span>
  )
}

// ── Honeypot-specific components ───────────────────────────

function EventBadge({ eventid }) {
  const meta = EVENT_META[eventid] || {
    label: (eventid || '').split('.').pop() || 'event',
    color: 'var(--text-secondary)',
  }
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.42rem', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: '0.63rem', fontWeight: 600,
      color: meta.color,
      background: meta.color.startsWith('#') ? `${meta.color}1a` : 'var(--bg-muted)',
      border: `1px solid ${meta.color.startsWith('#') ? `${meta.color}40` : 'var(--border)'}`,
      whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

function ThreatStatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.9rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
    }}>
      <span style={{
        color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        background: color.startsWith('#') ? `${color}1a` : 'var(--bg-muted)',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700,
          color: 'var(--text-primary)', lineHeight: 1,
        }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color, marginTop: '0.15rem' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function TopList({ title, icon, items, valueKey, labelKey, color, maxBar }) {
  if (!items || items.length === 0) return null
  const max = maxBar || Math.max(...items.map(i => i[valueKey] || 0)) || 1
  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div className="card-header">
        <div className="card-header-icon" style={{ background: 'var(--bg-muted)', color }}>
          {icon}
        </div>
        <span className="card-header-title">{title}</span>
      </div>
      <div style={{ padding: '0 1rem 1rem' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right',
            }}>
              {i + 1}
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.73rem',
              color: 'var(--text-primary)', minWidth: 110, maxWidth: 160,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0,
            }}>
              {item[labelKey]}
            </span>
            <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${Math.round((item[valueKey] / max) * 100)}%`,
                background: color, transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
              color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right',
            }}>
              {item[valueKey]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Attacker card (mobile) ─────────────────────────────────
function AttackerCard({ attacker, idx, onSessionClick }) {
  const [expanded, setExpanded] = useState(false)
  const color = COLORS[idx % COLORS.length]
  const hasDanger = attacker.success > 0

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${hasDanger ? '#ef444440' : 'var(--border)'}`,
      borderRadius: 10, overflow: 'hidden', marginBottom: '0.6rem',
    }}>
      <div onClick={() => setExpanded(p => !p)} style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem',
        padding: '0.75rem 0.9rem', cursor: 'pointer',
      }}>
        <Target size={13} style={{ color: hasDanger ? '#ef4444' : color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
            color: hasDanger ? '#ef4444' : 'var(--text-primary)', fontWeight: 600,
          }}>
            {attacker.ip}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
            {attacker.attempts} attempts · {attacker.sessions} sessions
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {hasDanger && (
            <span style={{
              fontSize: '0.62rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
              color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440',
              borderRadius: 4, padding: '0.1rem 0.35rem',
            }}>
              LOGIN OK
            </span>
          )}
          {expanded ? <ChevronUp size={13} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-secondary)' }} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', padding: '0.75rem 0.9rem' }}>
          {attacker.last_seen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              <Clock size={10} />
              Last seen {new Date(attacker.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          {attacker.usernames.length > 0 && (
            <>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Usernames tried</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: '0.5rem' }}>
                {attacker.usernames.map((u, i) => (
                  <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa', background: '#60a5fa18', border: '1px solid #60a5fa30', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{u}</span>
                ))}
              </div>
            </>
          )}
          {attacker.passwords.length > 0 && (
            <>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Passwords tried</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: '0.5rem' }}>
                {attacker.passwords.map((p, i) => (
                  <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{p}</span>
                ))}
              </div>
            </>
          )}
          {attacker.commands.length > 0 && (
            <>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Commands run</div>
              {attacker.commands.map((cmd, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.25rem 0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ color: '#22c55e', marginRight: '0.3rem' }}>$</span>{cmd}
                </div>
              ))}
            </>
          )}
          {attacker.session_ids?.length > 0 && (
            <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {attacker.session_ids.map((sid, i) => (
                <button key={i} onClick={() => onSessionClick(sid)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#a78bfa',
                  background: '#a78bfa18', border: '1px solid #a78bfa30',
                  borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer',
                }}>
                  session {sid.slice(0, 8)}…
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Attacker row (desktop)
function AttackerRow({ attacker, idx, onSessionClick }) {
  const [expanded, setExpanded] = useState(false)
  const color = COLORS[idx % COLORS.length]
  const hasDanger = attacker.success > 0

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <Target size={11} style={{ color: hasDanger ? '#ef4444' : color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: hasDanger ? '#ef4444' : 'var(--text-primary)' }}>
              {attacker.ip}
            </span>
          </span>
        </td>
        <td className="td-mono" style={{ fontSize: '0.78rem' }}>{attacker.attempts.toLocaleString()}</td>
        <td className="td-mono" style={{ fontSize: '0.78rem' }}>{attacker.sessions}</td>
        <td>
          {hasDanger
            ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 4, padding: '0.1rem 0.4rem' }}>SUCCESS</span>
            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>—</span>
          }
        </td>
        <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>
          {attacker.last_seen ? new Date(attacker.last_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
        </td>
        <td style={{ textAlign: 'right' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: 'var(--bg-muted)' }}>
          <td colSpan={6} style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              {attacker.usernames.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usernames</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {attacker.usernames.map((u, i) => (
                      <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa', background: '#60a5fa18', border: '1px solid #60a5fa30', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{u}</span>
                    ))}
                  </div>
                </div>
              )}
              {attacker.passwords.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Passwords</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {attacker.passwords.map((p, i) => (
                      <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
              {attacker.commands.length > 0 && (
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Commands</div>
                  {attacker.commands.map((cmd, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.2rem 0.45rem', marginBottom: '0.2rem' }}>
                      <span style={{ color: '#22c55e', marginRight: '0.3rem' }}>$</span>{cmd}
                    </div>
                  ))}
                </div>
              )}
              {attacker.session_ids?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sessions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {attacker.session_ids.map((sid, i) => (
                      <button key={i} onClick={e => { e.stopPropagation(); onSessionClick(sid) }} style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: '#a78bfa',
                        background: '#a78bfa18', border: '1px solid #a78bfa30',
                        borderRadius: 4, padding: '0.1rem 0.4rem', cursor: 'pointer',
                      }}>
                        {sid.slice(0, 10)}…
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {attacker.first_seen && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', alignSelf: 'flex-end' }}>
                  First seen {new Date(attacker.first_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Live event feed row
function EventFeedRow({ event }) {
  const ts = event.timestamp ? new Date(event.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
  const isSuccess = event.eventid === 'cowrie.login.success'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '60px 1fr 90px 80px 80px',
      gap: '0.5rem', alignItems: 'center',
      padding: '0.45rem 1rem',
      borderBottom: '1px solid var(--border)',
      background: isSuccess ? '#ef444408' : 'transparent',
      transition: 'background 0.15s',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{ts}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: isSuccess ? '#ef4444' : 'var(--text-primary)', fontWeight: isSuccess ? 700 : 400 }}>
        {event.src_ip || '—'}
      </span>
      <EventBadge eventid={event.eventid} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.username || '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.password || event.input || '—'}
      </span>
    </div>
  )
}

// Session detail modal
function SessionModal({ sessionId, onClose }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotSession(sessionId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [sessionId])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: '100%', maxWidth: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: '#a78bfa' }}>
            <Terminal size={13} style={{ display: 'inline', marginRight: '0.4rem' }} />
            Session {sessionId?.slice(0, 16)}…
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {loading ? (
            <div className="loading-box"><span className="spinner" /></div>
          ) : !data ? (
            <div className="empty-state"><Bug size={24} /><div>Session not found</div></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                {[
                  { label: 'Source IP', value: data.src_ip },
                  { label: 'Duration', value: data.duration_s != null ? `${data.duration_s}s` : '—' },
                  { label: 'Events', value: data.event_count },
                  { label: 'Login', value: data.login_success ? '✓ SUCCESS' : '✗ Failed', danger: data.login_success },
                ].map(({ label, value, danger }) => (
                  <div key={label} style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: danger ? '#ef4444' : 'var(--text-primary)', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>

              {data.commands.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Commands ({data.commands.length})</div>
                  <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '0.6rem 0.75rem', marginBottom: '1rem', maxHeight: 200, overflowY: 'auto' }}>
                    {data.commands.map((cmd, i) => (
                      <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a78bfa', marginBottom: '0.2rem' }}>
                        <span style={{ color: '#22c55e' }}>$ </span>{cmd}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {data.credentials.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Credentials tried</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '1rem' }}>
                    {data.credentials.map((c, i) => (
                      <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.15rem 0.45rem' }}>
                        <span style={{ color: '#60a5fa' }}>{c.username}</span>
                        <span style={{ color: 'var(--text-secondary)' }}> / </span>
                        <span style={{ color: '#f97316' }}>{c.password}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              {data.files.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Files</div>
                  {data.files.map((f, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', background: 'var(--bg-muted)', borderRadius: 4, padding: '0.3rem 0.6rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {f.type === 'download' ? <Download size={11} style={{ color: '#ec4899' }} /> : <Upload size={11} style={{ color: '#f43f5e' }} />}
                      <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{f.url || '—'}</span>
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

// ── Credentials view ───────────────────────────────────────
function CredentialsView({ isMobile }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotCredentials()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data)   return <div className="empty-state"><Key size={28} /><div>No credential data</div></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Total Attempts"  value={data.total_attempts}  icon={<Lock size={15} />}    color="#f97316" />
        <ThreatStatCard label="Unique Pairs"    value={data.unique_pairs}    icon={<Hash size={15} />}    color="#60a5fa" />
        <ThreatStatCard label="Diversity Score" value={`${(data.diversity_score * 100).toFixed(1)}%`} icon={<TrendingUp size={15} />} color="#22c55e"
          sub={data.diversity_score > 0.8 ? 'Highly varied' : data.diversity_score > 0.4 ? 'Mixed' : 'Low variety'}
        />
      </div>

      {/* Top pairs */}
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

      {/* Username + password columns */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        <TopList title="Top Usernames" icon={<User size={14} />} items={data.top_usernames} valueKey="count" labelKey="username" color="#60a5fa" />
        <TopList title="Top Passwords" icon={<Key size={14} />}  items={data.top_passwords} valueKey="count" labelKey="password" color="#f97316" />
      </div>
    </div>
  )
}

// ── Commands view ──────────────────────────────────────────
function CommandsView({ isMobile }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotCommands()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data)   return <div className="empty-state"><Terminal size={28} /><div>No command data</div></div>

  const catData = Object.entries(data.categories || {}).map(([name, value]) => ({ name, value }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Total Commands"  value={data.total_commands}  icon={<Terminal size={15} />} color="#a78bfa" />
        <ThreatStatCard label="Unique Commands" value={data.unique_commands} icon={<Hash size={15} />}    color="#60a5fa" />
        {Object.entries(data.categories || {}).slice(0, 2).map(([cat, cnt]) => (
          <ThreatStatCard key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} value={cnt} icon={<Layers size={15} />} color={CMD_CATEGORY_COLOR[cat] || '#6b7280'} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        {/* Category pie */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><BarChart2 size={15} /></div>
            <span className="card-header-title">Command Categories</span>
          </div>
          <div className="card-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} cx="50%" cy="45%" innerRadius="38%" outerRadius="62%" paddingAngle={3} dataKey="value">
                  {catData.map((entry, i) => <Cell key={i} fill={CMD_CATEGORY_COLOR[entry.name] || COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top commands bar */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><Terminal size={15} /></div>
            <span className="card-header-title">Top Commands</span>
          </div>
          <div style={{ padding: '0 1rem 1rem', maxHeight: 240, overflowY: 'auto' }}>
            {(data.top_commands || []).slice(0, 15).map((cmd, i) => {
              const max = data.top_commands[0]?.count || 1
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', minWidth: 120, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                    {cmd.command}
                  </span>
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

// ── Files view ─────────────────────────────────────────────
function FilesView({ isMobile }) {
  const [files, setFiles]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotFiles()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (files.length === 0) return <div className="empty-state"><FileText size={28} /><div>No file activity recorded</div></div>

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: '#ec489918', color: '#ec4899' }}><FileText size={15} /></div>
        <span className="card-header-title">File Activity</span>
        <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{files.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Source IP</th><th>URL / File</th><th>Session</th><th>Time</th></tr></thead>
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
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.url || f.outfile || '—'}
                </td>
                <td className="td-mono td-muted" style={{ fontSize: '0.65rem' }}>{f.session ? f.session.slice(0, 10) + '…' : '—'}</td>
                <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>
                  {f.timestamp ? new Date(f.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Daily timeline bar chart ───────────────────────────────
function DailyTimelineCard({ isMobile }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotDaily()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Calendar size={15} /></div>
        <span className="card-header-title">Attack History (last 30 days)</span>
        {data?.peak_day && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
            peak: <span style={{ color: '#ef4444' }}>{data.peak_day.date} ({data.peak_day.attacks})</span>
          </span>
        )}
      </div>
      <div className="card-body" style={{ height: 180 }}>
        {loading ? <div className="loading-box"><span className="spinner" /></div> : !data ? null : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.timeline} margin={{ left: -10, right: 4, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }}
                tickFormatter={v => v.slice(5)} interval={isMobile ? 6 : 3} />
              <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} width={24} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [v, name === 'attacks' ? 'Total events' : 'Login fails']} />
              <Bar dataKey="attacks"      fill="#ef4444" opacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={16} />
              <Bar dataKey="login_failed" fill="#f97316" opacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ── Device card / row ──────────────────────────────────────
function DeviceCard({ device, onPortScan, onOsScan, scanningPort, scanningOs, colorIdx }) {
  const [expanded, setExpanded] = useState(false)
  const accent = COLORS[colorIdx % COLORS.length]

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden', marginBottom: '0.6rem',
    }}>
      <div onClick={() => setExpanded(p => !p)} style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem',
        padding: '0.75rem 0.9rem', cursor: 'pointer',
      }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {device.hostname !== 'unknown' ? device.hostname : device.ip}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
            {device.ip}{device.vendor ? ` · ${device.vendor.substring(0, 20)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <OnlineBadge status={device.status} />
          {expanded ? <ChevronUp size={13} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-secondary)' }} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', padding: '0.75rem 0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <OsBadge os={device.os} />
            {device.mac !== 'unknown' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{device.mac}</span>}
          </div>
          {device.last_seen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <Clock size={11} /> {new Date(device.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
            Open Ports {device.open_ports?.length > 0 && `(${device.open_ports.length})`}
          </div>
          {device.open_ports?.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: '0.65rem' }}>{device.open_ports.map((p, i) => <PortBadge key={i} port={p} />)}</div>
            : <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>Not scanned yet</div>
          }
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--ghost btn--sm" disabled={scanningPort === device.mac} onClick={() => onPortScan(device.mac)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'center' }}>
              <Scan size={12} style={{ animation: scanningPort === device.mac ? 'spin 1s linear infinite' : 'none' }} />
              {scanningPort === device.mac ? 'Scanning…' : 'Port Scan'}
            </button>
            <button className="btn btn--ghost btn--sm" disabled={scanningOs === device.mac} onClick={() => onOsScan(device.mac)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'center' }}>
              <Cpu size={12} style={{ animation: scanningOs === device.mac ? 'spin 1s linear infinite' : 'none' }} />
              {scanningOs === device.mac ? 'Detecting…' : 'OS Detect'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DeviceRow({ device, onPortScan, onOsScan, scanningPort, scanningOs, colorIdx }) {
  const [expanded, setExpanded] = useState(false)
  const accent = COLORS[colorIdx % COLORS.length]

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
              {device.hostname !== 'unknown' ? device.hostname : '—'}
            </span>
          </span>
        </td>
        <td className="td-mono" style={{ fontSize: '0.78rem' }}>{device.ip}</td>
        <td className="td-mono td-muted" style={{ fontSize: '0.7rem' }}>{device.mac !== 'unknown' ? device.mac : '—'}</td>
        <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{device.vendor ? device.vendor.substring(0, 22) : '—'}</td>
        <td><OsBadge os={device.os} /></td>
        <td><OnlineBadge status={device.status} /></td>
        <td style={{ textAlign: 'right' }}>{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</td>
      </tr>

      {expanded && (
        <tr style={{ background: 'var(--bg-muted)' }}>
          <td colSpan={7} style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</div>
                {device.os_detail && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}><Monitor size={11} /> {device.os_detail}</div>}
                {device.last_seen  && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}><Clock size={11} /> {new Date(device.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
                {device.first_seen && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}><Calendar size={11} /> First seen {new Date(device.first_seen).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open Ports {device.open_ports?.length > 0 && `(${device.open_ports.length})`}</div>
                {device.open_ports?.length > 0
                  ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{device.open_ports.map((p, i) => <PortBadge key={i} port={p} />)}</div>
                  : <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Not scanned yet</span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <button className="btn btn--ghost btn--sm" disabled={scanningPort === device.mac} onClick={e => { e.stopPropagation(); onPortScan(device.mac) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Scan size={12} style={{ animation: scanningPort === device.mac ? 'spin 1s linear infinite' : 'none' }} />
                  {scanningPort === device.mac ? 'Scanning…' : 'Port Scan'}
                </button>
                <button className="btn btn--ghost btn--sm" disabled={scanningOs === device.mac} onClick={e => { e.stopPropagation(); onOsScan(device.mac) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Cpu size={12} style={{ animation: scanningOs === device.mac ? 'spin 1s linear infinite' : 'none' }} />
                  {scanningOs === device.mac ? 'Detecting…' : 'OS Detect'}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Topology map ───────────────────────────────────────────
function TopologyMap({ devices }) {
  const svgRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [selectedDevice, setSelectedDevice] = useState(null)
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })
  const pinchDist = useRef(null)

  const placed = devices.slice(0, 16)
  const WIDTH = 700, HEIGHT = 420, CX = WIDTH / 2, CY = HEIGHT / 2, R = 150

  const clampTransform = t => ({ ...t, scale: Math.min(3, Math.max(0.4, t.scale)) })

  const onWheel = e => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const rect  = svgRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setTransform(prev => {
      const newScale = Math.min(3, Math.max(0.4, prev.scale * delta))
      const ratio = newScale / prev.scale
      return clampTransform({ scale: newScale, x: mx - ratio * (mx - prev.x), y: my - ratio * (my - prev.y) })
    })
  }
  const onMouseDown = e => { if (e.target.closest('.topo-node')) return; dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }
  const onMouseMove = e => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x, dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }
  const onMouseUp = () => { dragging.current = false }

  return (
    <div style={{ width: '100%', position: 'relative', userSelect: 'none' }}>
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {[
          { label: '+', action: () => setTransform(p => clampTransform({ ...p, scale: p.scale * 1.25 })) },
          { label: '−', action: () => setTransform(p => clampTransform({ ...p, scale: p.scale * 0.8 })) },
        ].map(({ label, action }) => (
          <button key={label} onClick={action} style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{label}</button>
        ))}
        <button onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Eye size={13} />
        </button>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: '100%', maxWidth: WIDTH, display: 'block', margin: '0 auto', minWidth: 280, cursor: dragging.current ? 'grabbing' : 'grab', touchAction: 'none' }}
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <defs>
          <radialGradient id="routerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          <circle cx={CX} cy={CY} r={R + 20} fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 6" />
          <circle cx={CX} cy={CY} r={52} fill="url(#routerGlow)" />
          {placed.map((d, i) => {
            const angle = (2 * Math.PI * i) / placed.length - Math.PI / 2
            const x = CX + R * Math.cos(angle), y = CY + R * Math.sin(angle)
            const online = d.status === 'up'
            return <line key={d.mac + '-edge'} x1={CX} y1={CY} x2={x} y2={y} stroke={online ? COLORS[i % COLORS.length] : 'var(--border)'} strokeWidth={online ? 1 : 0.5} strokeOpacity={online ? 0.45 : 0.25} strokeDasharray={online ? 'none' : '3 4'} />
          })}
          <circle cx={CX} cy={CY} r={28} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={1.5} />
          <text x={CX} y={CY - 5} textAnchor="middle" fill="var(--accent)" fontFamily="var(--font-mono)" fontSize={8} fontWeight={700}>FritzBox</text>
          <text x={CX} y={CY + 7} textAnchor="middle" fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={6}>192.168.178.1</text>
          {placed.map((d, i) => {
            const angle = (2 * Math.PI * i) / placed.length - Math.PI / 2
            const x = CX + R * Math.cos(angle), y = CY + R * Math.sin(angle)
            const lx = CX + (R + 38) * Math.cos(angle), ly = CY + (R + 38) * Math.sin(angle)
            const anchor = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle'
            const color = COLORS[i % COLORS.length]
            const online = d.status === 'up'
            const label  = d.hostname !== 'unknown' ? d.hostname : d.ip
            const isSelected = selectedDevice?.mac === d.mac
            return (
              <g key={d.mac} className="topo-node" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setSelectedDevice(isSelected ? null : d) }}>
                {isSelected && <circle cx={x} cy={y} r={18} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.8} />}
                <circle cx={x} cy={y} r={13} fill="var(--bg-surface)" stroke={online ? color : 'var(--border)'} strokeWidth={online ? 1.5 : 1} opacity={online ? 1 : 0.5} />
                {online && <circle cx={x + 8} cy={y - 8} r={3.5} fill="#22c55e" stroke="var(--bg-surface)" strokeWidth={1} />}
                <text x={x} y={y + 4} textAnchor="middle" fill={online ? color : 'var(--text-secondary)'} fontFamily="var(--font-mono)" fontSize={8} fontWeight={700}>{osShape(d.os)}</text>
                <text x={lx} y={ly + 3} textAnchor={anchor} fill={online ? 'var(--text-primary)' : 'var(--text-secondary)'} fontFamily="var(--font-mono)" fontSize={7} fontWeight={online ? 600 : 400}>{label.length > 18 ? label.substring(0, 17) + '…' : label}</text>
                <text x={lx} y={ly + 12} textAnchor={anchor} fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={6}>{d.ip}</text>
              </g>
            )
          })}
        </g>
      </svg>
      {selectedDevice && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.9rem', minWidth: 200, maxWidth: 280, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 20, fontFamily: 'var(--font-mono)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedDevice.hostname !== 'unknown' ? selectedDevice.hostname : selectedDevice.ip}</span>
            <button onClick={() => setSelectedDevice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, lineHeight: 1 }}><X size={12} /></button>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span>{selectedDevice.ip}</span>
            {selectedDevice.mac !== 'unknown' && <span>{selectedDevice.mac}</span>}
            {selectedDevice.vendor && <span>{selectedDevice.vendor}</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
              <OsBadge os={selectedDevice.os} />
              <OnlineBadge status={selectedDevice.status} />
            </div>
          </div>
        </div>
      )}
      <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '0.4rem', opacity: 0.7 }}>
        scroll / pinch to zoom · drag to pan · tap node for details
      </div>
    </div>
  )
}

// ── Alert panel ────────────────────────────────────────────
function AlertPanel({ alerts, onClear, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 360, zIndex: 200, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>New Devices</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {alerts.length > 0 && <button className="btn btn--ghost btn--sm" onClick={onClear} style={{ fontSize: '0.65rem' }}><Check size={10} /> Clear all</button>}
          <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={14} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>No new devices in the last 24h</div>
        ) : alerts.map((a, i) => (
          <div key={i} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={14} style={{ color: 'var(--card-temp-accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{a.hostname || a.ip}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{a.vendor || 'Unknown vendor'} · {a.ip}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                {a.first_seen && new Date(a.first_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── History view ───────────────────────────────────────────
function HistoryView({ history, devices }) {
  const [filter, setFilter] = useState('')
  const deviceByMac = Object.fromEntries(devices.map(d => [d.mac, d]))
  const filteredMacs = Object.keys(history).filter(mac => {
    const dev   = deviceByMac[mac]
    const label = dev ? `${dev.hostname} ${dev.ip} ${mac}` : mac
    return label.toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Clock size={15} /></div>
        <span className="card-header-title">Connection History</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={12} style={{ color: 'var(--text-secondary)' }} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter devices…"
            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', outline: 'none', width: 150 }} />
        </div>
      </div>
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {filteredMacs.length === 0 ? (
          <div className="empty-state"><Clock size={28} /><div>No history available</div></div>
        ) : filteredMacs.map(mac => {
          const dev     = deviceByMac[mac]
          const label   = dev ? (dev.hostname !== 'unknown' ? dev.hostname : dev.ip) : mac
          const entries = history[mac] || []
          return (
            <div key={mac} style={{ borderBottom: '1px solid var(--border)', padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{mac}</span>
                <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{entries.length} entries</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {entries.slice(0, 12).map((e, i) => (
                  <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', padding: '0.1rem 0.4rem', background: 'var(--bg-muted)', borderRadius: 4 }}>
                    {new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                ))}
                {entries.length > 12 && <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>+{entries.length - 12} more</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function SecurityPage() {
  const { toast, showToast } = useToast()

  const [tab,          setTab]          = useState('devices')
  const [threatTab,    setThreatTab]    = useState('overview')
  const [devices,      setDevices]      = useState([])
  const [stats,        setStats]        = useState([])
  const [weekData,     setWeekData]     = useState([])
  const [alerts,       setAlerts]       = useState([])
  const [history,      setHistory]      = useState({})
  const [loading,      setLoading]      = useState(true)
  const [refreshing,   setRefreshing]   = useState(false)
  const [scanningPort, setScanningPort] = useState(null)
  const [scanningOs,   setScanningOs]   = useState(null)
  const [showAlerts,   setShowAlerts]   = useState(false)
  const [search,       setSearch]       = useState('')

  // Honeypot state
  const [honeypotStats,     setHoneypotStats]     = useState(null)
  const [honeypotEvents,    setHoneypotEvents]    = useState([])
  const [honeypotAttackers, setHoneypotAttackers] = useState([])
  const [honeypotLoading,   setHoneypotLoading]   = useState(false)
  const [attackerSearch,    setAttackerSearch]    = useState('')
  const [sessionModal,      setSessionModal]      = useState(null)

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [devs, st, days, al, hist] = await Promise.all([
        api.devices().catch(() => []),
        api.stats().catch(() => []),
        api.connDays().catch(() => ({})),
        api.alerts().catch(() => []),
        tab === 'history' ? api.history().catch(() => ({})) : Promise.resolve(null),
      ])
      setDevices(devs)
      setStats(st)
      setAlerts(al)
      if (hist !== null) setHistory(hist)
      const transformed = DAYS.map((day, i) => {
        const entry = { day }
        Object.entries(days).forEach(([ip, counts]) => {
          entry[ip] = Array.isArray(counts) ? (counts[i] || 0) : 0
        })
        return entry
      })
      setWeekData(transformed)
    } catch {
      showToast('Error loading security data', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [tab])

  const loadHoneypot = useCallback(async (silent = false) => {
    if (!silent) setHoneypotLoading(true)
    try {
      const [hStats, hEvents, hAttackers] = await Promise.all([
        api.honeypotStats().catch(() => null),
        api.honeypotEvents().catch(() => []),
        api.honeypotAttackers().catch(() => []),
      ])
      if (hStats)     setHoneypotStats(hStats)
      if (hEvents)    setHoneypotEvents(hEvents)
      if (hAttackers) setHoneypotAttackers(hAttackers)
    } catch {
      showToast('Error loading honeypot data', 'error')
    } finally {
      setHoneypotLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 30000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (tab === 'history' && Object.keys(history).length === 0) {
      api.history().then(setHistory).catch(() => {})
    }
    if (tab === 'threats') {
      loadHoneypot()
      const id = setInterval(() => loadHoneypot(true), 30000)
      return () => clearInterval(id)
    }
  }, [tab])

  const handlePortScan = async (mac) => {
    setScanningPort(mac)
    try {
      const result = await api.portScan(mac)
      setDevices(prev => prev.map(d => d.mac === mac ? { ...d, open_ports: result.ports } : d))
      showToast(`Found ${result.ports.length} open ports`, 'success')
    } catch {
      showToast('Port scan failed', 'error')
    } finally {
      setScanningPort(null)
    }
  }

  const handleOsScan = async (mac) => {
    setScanningOs(mac)
    try {
      const result = await api.osScan(mac)
      setDevices(prev => prev.map(d => d.mac === mac ? { ...d, os: result.os, os_detail: result.os_detail } : d))
      showToast(result.os ? `Detected: ${result.os_detail || result.os}` : 'OS not detected', 'success')
    } catch {
      showToast('OS scan failed', 'error')
    } finally {
      setScanningOs(null)
    }
  }

  const handleClearAlerts = async () => {
    await api.clearAlerts()
    setAlerts([])
    setShowAlerts(false)
  }

  const filteredDevices = devices.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (d.hostname || '').toLowerCase().includes(q) ||
      (d.ip || '').toLowerCase().includes(q) ||
      (d.mac || '').toLowerCase().includes(q) ||
      (d.vendor || '').toLowerCase().includes(q) ||
      (d.os || '').toLowerCase().includes(q)
    )
  })

  const filteredAttackers = honeypotAttackers.filter(a =>
    !attackerSearch || a.ip.toLowerCase().includes(attackerSearch.toLowerCase())
  )

  const pieData = stats.map((s, i) => ({
    name: s.hostname && s.hostname !== 'unknown' ? s.hostname : (s.ip_address || 'Unknown'),
    value: s.connection_count || 0,
    color: COLORS[i % COLORS.length],
  }))
  const ipKeys      = Object.keys(weekData[0] || {}).filter(k => k !== 'day')
  const onlineCount = devices.filter(d => d.status === 'up').length

  // Fixed timeline: use ISO string label for proper local timezone rendering
  const fixedTimeline = (honeypotStats?.hourly_timeline || []).map(slot => ({
    ...slot,
    label: slot.label || fmtHourLabel(slot.hour),
  }))

  const totalHoneypotEvents = honeypotStats?.total_events || 0
  const hasLoginSuccess     = (honeypotStats?.login_success || 0) > 0

  return (
    <div className="page animate-fade">
      {/* ── Header ── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">Secu<span style={{ color: 'var(--accent)' }}>rity</span></h1>
          <p className="page-subtitle">Network device monitoring</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {totalHoneypotEvents > 0 && (
            <span className="badge" style={{
              background: hasLoginSuccess ? '#ef444418' : '#f9731618',
              color: hasLoginSuccess ? '#ef4444' : '#f97316',
              border: `1px solid ${hasLoginSuccess ? '#ef444440' : '#f9731640'}`,
            }}>
              <Bug size={10} />
              {totalHoneypotEvents.toLocaleString()} attacks
              {hasLoginSuccess && ' · ⚠ login ok'}
            </span>
          )}
          <span className="badge badge--success">
            <span className="dot dot--green dot--pulse" /> {onlineCount}/{devices.length} online
          </span>
          <div style={{ position: 'relative' }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowAlerts(p => !p)}>
              {alerts.length > 0 ? <Bell size={14} style={{ color: 'var(--card-temp-accent)' }} /> : <BellOff size={14} />}
              {alerts.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 99, background: 'var(--card-temp-accent)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {alerts.length}
                </span>
              )}
            </button>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => { load(true); if (tab === 'threats') loadHoneypot(true) }} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            {!isMobile && 'Refresh'}
          </button>
        </div>
      </div>

      {showAlerts && (
        <>
          <div onClick={() => setShowAlerts(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.4)' }} />
          <AlertPanel alerts={alerts} onClear={handleClearAlerts} onClose={() => setShowAlerts(false)} />
        </>
      )}

      {sessionModal && <SessionModal sessionId={sessionModal} onClose={() => setSessionModal(null)} />}

      <TabBar active={tab} onChange={setTab} />

      {/* ── DEVICES TAB ── */}
      {tab === 'devices' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Monitor size={15} /></div>
            <span className="card-header-title">Connected Devices</span>
            <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{filteredDevices.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Search size={12} style={{ color: 'var(--text-secondary)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.28rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', outline: 'none', width: isMobile ? 110 : 140 }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={12} /></button>}
            </div>
          </div>
          {loading ? (
            <div className="loading-box"><span className="spinner" /></div>
          ) : filteredDevices.length === 0 ? (
            <div className="empty-state"><Monitor size={28} /><div>No devices found</div></div>
          ) : isMobile ? (
            <div style={{ padding: '0.75rem' }}>
              {filteredDevices.map((d, i) => <DeviceCard key={d.mac || i} device={d} colorIdx={i} onPortScan={handlePortScan} onOsScan={handleOsScan} scanningPort={scanningPort} scanningOs={scanningOs} />)}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Hostname</th><th>IP</th><th>MAC</th><th>Vendor</th><th>OS</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredDevices.map((d, i) => <DeviceRow key={d.mac || i} device={d} colorIdx={i} onPortScan={handlePortScan} onOsScan={handleOsScan} scanningPort={scanningPort} scanningOs={scanningOs} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TOPOLOGY TAB ── */}
      {tab === 'topology' && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Globe size={15} /></div>
            <span className="card-header-title">Network Topology</span>
            <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{devices.length} nodes</span>
          </div>
          <div style={{ padding: '1rem' }}>
            {loading ? <div className="loading-box"><span className="spinner" /></div>
              : devices.length === 0 ? <div className="empty-state"><Globe size={28} /><div>No devices</div></div>
              : <TopologyMap devices={devices} />}
          </div>
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {tab === 'stats' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1.25rem' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Shield size={15} /></div>
              <span className="card-header-title">Connection Distribution</span>
            </div>
            <div className="card-body" style={{ height: 300 }}>
              {loading ? <div className="loading-box"><span className="spinner" /></div>
                : pieData.length === 0 ? <div className="empty-state"><Shield size={28} /><div>No data</div></div>
                : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="45%" innerRadius="42%" outerRadius="65%" paddingAngle={3} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v} connections`, name]} />
                      <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-secondary)' }}
                        formatter={(value, entry) => {
                          const total = pieData.reduce((s, d) => s + d.value, 0)
                          const pct   = total ? ((entry.payload.value / total) * 100).toFixed(1) : 0
                          return `${value} (${pct}%)`
                        }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Activity size={15} /></div>
              <span className="card-header-title">Weekly Activity</span>
            </div>
            <div className="card-body" style={{ height: 300 }}>
              {loading ? <div className="loading-box"><span className="spinner" /></div>
                : weekData.length === 0 ? <div className="empty-state"><Activity size={28} /><div>No data</div></div>
                : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekData} barGap={2} margin={{ left: -10, right: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }} />
                      <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }} width={28} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      {ipKeys.length > 1 && <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-secondary)' }} />}
                      {ipKeys.map((ip, i) => <Bar key={ip} dataKey={ip} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={20} />)}
                    </BarChart>
                  </ResponsiveContainer>
                )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Cpu size={15} /></div>
              <span className="card-header-title">OS Breakdown</span>
            </div>
            <div style={{ padding: '1rem' }}>
              {Object.entries(devices.reduce((acc, d) => { const os = d.os || 'Unknown'; acc[os] = (acc[os] || 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1]).map(([os, count]) => (
                <div key={os} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                  <span style={{ color: OS_COLOR[os] || 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', minWidth: 80 }}>
                    {OS_ICON[os] || <Cpu size={12} />} {os}
                  </span>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg-muted)', borderRadius: 99 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${(count / devices.length) * 100}%`, background: OS_COLOR[os] || 'var(--text-secondary)', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Wifi size={15} /></div>
              <span className="card-header-title">Device Uptime</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Device</th><th>IP</th><th>Connections</th><th>Status</th></tr></thead>
                <tbody>
                  {devices.slice(0, 10).map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent)' }}>{d.hostname !== 'unknown' ? d.hostname : '—'}</td>
                      <td className="td-mono" style={{ fontSize: '0.75rem' }}>{d.ip}</td>
                      <td className="td-mono td-muted" style={{ fontSize: '0.75rem' }}>{d.connection_count || 0}</td>
                      <td><OnlineBadge status={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && <HistoryView history={history} devices={devices} />}

      {/* ── THREATS TAB ── */}
      {tab === 'threats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {honeypotLoading ? (
            <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
          ) : !honeypotStats ? (
            <div className="empty-state" style={{ padding: '3rem' }}>
              <Bug size={32} style={{ color: 'var(--text-secondary)' }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
                No honeypot data found. Make sure Cowrie is running and JSON logs are mounted at{' '}
                <code style={{ fontSize: '0.75rem', color: 'var(--accent)', background: 'var(--bg-muted)', padding: '0.1rem 0.3rem', borderRadius: 4 }}>/var/log/cowrie/cowrie.json</code>
              </div>
            </div>
          ) : (
            <>
              {/* Stat cards — always visible */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
                <ThreatStatCard label="Total Events"     value={honeypotStats.total_events || 0}   icon={<Zap size={15} />}     color="#f97316" />
                <ThreatStatCard label="Unique Attackers" value={honeypotStats.unique_ips || 0}      icon={<Target size={15} />}  color="#ef4444" />
                <ThreatStatCard label="Login Attempts"   value={honeypotStats.login_attempts || 0}  icon={<Lock size={15} />}    color="#f59e0b"
                  sub={honeypotStats.login_success > 0 ? `⚠ ${honeypotStats.login_success} succeeded` : 'none succeeded'} />
                <ThreatStatCard label="Sessions"         value={honeypotStats.total_sessions || 0}  icon={<Terminal size={15} />} color="#a78bfa" />
              </div>

              {/* Sub-navigation */}
              <ThreatTabBar active={threatTab} onChange={setThreatTab} />

              {/* ── OVERVIEW sub-tab ── */}
              {threatTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
                    {/* FIXED: Hourly timeline with proper local time labels */}
                    <div className="card">
                      <div className="card-header">
                        <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Activity size={15} /></div>
                        <span className="card-header-title">Attack Timeline (last 24h)</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)' }}>local time</span>
                      </div>
                      <div className="card-body" style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={fixedTimeline} margin={{ left: -10, right: 4, top: 4 }}>
                            <defs>
                              <linearGradient id="attackGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis
                              dataKey="hour"
                              tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }}
                              interval={3}
                              tickFormatter={fmtHourLabel}
                            />
                            <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} width={24} />
                            <Tooltip
                              {...TOOLTIP_STYLE}
                              labelFormatter={v => {
                                try { return new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return v }
                              }}
                              formatter={(v) => [`${v} events`, 'Attacks']}
                            />
                            <Area type="monotone" dataKey="attacks" stroke="#ef4444" strokeWidth={1.5} fill="url(#attackGrad)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <TopList title="Top Attacking IPs" icon={<Target size={14} />} items={honeypotStats.top_ips || []} valueKey="count" labelKey="ip" color="#ef4444" />
                  </div>

                  <DailyTimelineCard isMobile={isMobile} />

                  {/* Event type breakdown */}
                  {honeypotStats.event_types && Object.keys(honeypotStats.event_types).length > 0 && (
                    <div className="card">
                      <div className="card-header">
                        <div className="card-header-icon" style={{ background: '#60a5fa18', color: '#60a5fa' }}><BarChart2 size={15} /></div>
                        <span className="card-header-title">Event Type Breakdown</span>
                      </div>
                      <div style={{ padding: '0.75rem 1rem 1rem' }}>
                        {Object.entries(honeypotStats.event_types)
                          .sort((a, b) => b[1] - a[1])
                          .map(([eid, cnt]) => {
                            const meta = EVENT_META[eid] || { label: eid.split('.').pop(), color: '#6b7280' }
                            const max = Math.max(...Object.values(honeypotStats.event_types))
                            return (
                              <div key={eid} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                                <EventBadge eventid={eid} />
                                <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
                                  <div style={{ height: '100%', borderRadius: 99, width: `${(cnt / max) * 100}%`, background: meta.color }} />
                                </div>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: 36, textAlign: 'right' }}>{cnt.toLocaleString()}</span>
                              </div>
                            )
                          })
                        }
                      </div>
                    </div>
                  )}

                  {/* Recent commands */}
                  {(honeypotStats.recent_commands || []).length > 0 && (
                    <div className="card">
                      <div className="card-header">
                        <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><Terminal size={15} /></div>
                        <span className="card-header-title">Recent Attacker Commands</span>
                      </div>
                      <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {honeypotStats.recent_commands.map((cmd, i) => (
                          <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '0.3rem 0.65rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                            <span style={{ color: '#22c55e', flexShrink: 0 }}>$</span>
                            <span style={{ color: '#a78bfa', wordBreak: 'break-all' }}>{cmd.input}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.62rem', marginLeft: 'auto', flexShrink: 0 }}>{cmd.ip}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── ATTACKERS sub-tab ── */}
              {threatTab === 'attackers' && (
                <div className="card">
                  <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div className="card-header-icon" style={{ background: '#ef444418', color: '#ef4444' }}><Bug size={15} /></div>
                    <span className="card-header-title">Attackers</span>
                    <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{filteredAttackers.length}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                      <input value={attackerSearch} onChange={e => setAttackerSearch(e.target.value)} placeholder="Filter IPs…"
                        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.28rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', outline: 'none', width: 130 }} />
                      {attackerSearch && <button onClick={() => setAttackerSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={12} /></button>}
                    </div>
                  </div>
                  {filteredAttackers.length === 0 ? (
                    <div className="empty-state"><Target size={28} /><div>No attackers found</div></div>
                  ) : isMobile ? (
                    <div style={{ padding: '0.75rem' }}>
                      {filteredAttackers.map((a, i) => <AttackerCard key={a.ip} attacker={a} idx={i} onSessionClick={setSessionModal} />)}
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>IP Address</th><th>Attempts</th><th>Sessions</th><th>Login</th><th>Last Seen</th><th /></tr></thead>
                        <tbody>
                          {filteredAttackers.map((a, i) => <AttackerRow key={a.ip} attacker={a} idx={i} onSessionClick={setSessionModal} />)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── CREDENTIALS sub-tab ── */}
              {threatTab === 'credentials' && <CredentialsView isMobile={isMobile} />}

              {/* ── COMMANDS sub-tab ── */}
              {threatTab === 'commands' && <CommandsView isMobile={isMobile} />}

              {/* ── FILES sub-tab ── */}
              {threatTab === 'files' && <FilesView isMobile={isMobile} />}

              {/* ── LIVE FEED sub-tab ── */}
              {threatTab === 'feed' && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><Terminal size={15} /></div>
                    <span className="card-header-title">Live Feed</span>
                    <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{honeypotEvents.length} events</span>
                    {/* Live indicator */}
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#22c55e' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                      live · 30s
                    </span>
                  </div>
                  {!isMobile && (
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 80px 80px', gap: '0.5rem', padding: '0.35rem 1rem', background: 'var(--bg-muted)', borderBottom: '1px solid var(--border)' }}>
                      {['Time', 'Source IP', 'Event', 'Username', 'Password / Cmd'].map(h => (
                        <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                    {honeypotEvents.length === 0 ? (
                      <div className="empty-state"><Terminal size={28} /><div>No events yet</div></div>
                    ) : isMobile ? (
                      <div style={{ padding: '0.5rem' }}>
                        {honeypotEvents.map((e, i) => (
                          <div key={i} style={{ padding: '0.5rem 0.65rem', marginBottom: '0.3rem', background: 'var(--bg-muted)', borderRadius: 6, border: `1px solid ${e.eventid === 'cowrie.login.success' ? '#ef444440' : 'transparent'}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <EventBadge eventid={e.eventid} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 600 }}>{e.src_ip}</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString('en-GB') : ''}
                              </span>
                            </div>
                            {(e.username || e.password || e.input) && (
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {e.username && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#60a5fa' }}>{e.username}</span>}
                                {e.password && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#f97316' }}>{e.password}</span>}
                                {e.input    && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#a78bfa' }}>$ {e.input}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      honeypotEvents.map((e, i) => <EventFeedRow key={i} event={e} />)
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Toast toast={toast} />
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}