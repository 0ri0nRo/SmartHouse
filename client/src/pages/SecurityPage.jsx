import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Monitor, RefreshCw, Bell, BellOff, Wifi,
  Cpu, Globe, Server, Smartphone, Laptop, Router, HardDrive,
  ChevronDown, ChevronUp, Scan, Search, X, Clock, Activity,
  AlertTriangle, Check, Calendar, Eye, Bug, Terminal, User,
  Key, Zap, Target, Lock, Download, Upload, Hash, BarChart2,
  TrendingUp, Layers, FileText, Ban, AlertCircle, Siren,
  ShieldAlert, ExternalLink, Flame,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { GeoIpMap } from './GeoIpMap'
import HoneypotSection from './HoneypotSection'

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
  // Honeypot — existing
  honeypotStats:       () => fetch('/api/honeypot/stats').then(r => r.json()),
  honeypotEvents:      () => fetch('/api/honeypot/events').then(r => r.json()),
  honeypotAttackers:   () => fetch('/api/honeypot/attackers').then(r => r.json()),
  honeypotCredentials: () => fetch('/api/honeypot/credentials').then(r => r.json()),
  honeypotCommands:    () => fetch('/api/honeypot/commands/top').then(r => r.json()),
  honeypotSession:     (id) => fetch(`/api/honeypot/sessions/${id}`).then(r => r.json()),
  honeypotDaily:       () => fetch('/api/honeypot/timeline/daily').then(r => r.json()),
  honeypotFiles:       () => fetch('/api/honeypot/files').then(r => r.json()),
  honeypotSummary:     () => fetch('/api/honeypot/summary').then(r => r.json()),
  honeypotGeoip:       (limit = 50) => fetch(`/api/honeypot/geoip?limit=${limit}`).then(r => r.json()),
  // Honeypot — new
  honeypotBanned:            (jail = '') => fetch(`/api/honeypot/banned${jail ? `?jail=${jail}` : ''}`).then(r => r.json()),
  honeypotAlerts:            (hours = 24) => fetch(`/api/honeypot/alerts?hours=${hours}`).then(r => r.json()),
  honeypotThreats:           (days = 7) => fetch(`/api/honeypot/threats?days=${days}`).then(r => r.json()),
  honeypotAttackerProfile:   (ip) => fetch(`/api/honeypot/attackers/${ip}`).then(r => r.json()),
  honeypotDownloadsAnalysis: () => fetch('/api/honeypot/downloads/analysis').then(r => r.json()),
  honeypotRealIps: () => fetch('/api/honeypot/real_ips').then(r => r.json()),

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
  recon:              '#60a5fa',
  download:           '#ec4899',
  persistence:        '#f97316',
  'lateral-movement': '#f59e0b',
  cryptominer:        '#facc15',
  backdoor:           '#ef4444',
  botnet:             '#f43f5e',
  scanner:            '#a78bfa',
  ransomware:         '#dc2626',
  lateral_movement:   '#f59e0b',
  other:              '#6b7280',
}

const THREAT_LABEL = {
  cryptominer:     '⛏ Cryptominer',
  backdoor:        '🚪 Backdoor',
  botnet:          '🤖 Botnet',
  scanner:         '🔍 Scanner',
  ransomware:      '💀 Ransomware',
  persistence:     '📌 Persistence',
  recon:           '👁 Recon',
  lateral_movement:'↔ Lateral Move',
  other:           '❓ Other',
}

const SEVERITY_COLOR = {
  high:   '#ef4444',
  medium: '#f97316',
  low:    '#6b7280',
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

function fmtHourLabel(isoStr) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return isoStr }
}

function fmtRemaining(seconds) {
  if (seconds <= 0) return 'expired'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
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

function ThreatTabBar({ active, onChange }) {
  const tabs = [
    { id: 'overview',    label: 'Overview',    icon: <Shield size={12} /> },
    { id: 'attackers',   label: 'Attackers',   icon: <Target size={12} /> },
    { id: 'credentials', label: 'Credentials', icon: <Key size={12} /> },
    { id: 'commands',    label: 'Commands',    icon: <Terminal size={12} /> },
    { id: 'files',       label: 'Files',       icon: <FileText size={12} /> },
    { id: 'feed',        label: 'Live Feed',   icon: <Zap size={12} /> },
    { id: 'map',         label: 'Map',         icon: <Globe size={12} /> },
    { id: 'banned',      label: 'Banned',      icon: <Ban size={12} /> },
    { id: 'honeypot_alerts', label: 'Alerts',  icon: <Siren size={12} /> },
    { id: 'threat_class',    label: 'Threats', icon: <ShieldAlert size={12} /> },
    { id: 'downloads',   label: 'Downloads',   icon: <Download size={12} /> },
    { id: 'real_ips', label: 'Real IPs', icon: <Eye size={12} /> },
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
          color: active === t.id
            ? (t.id === 'honeypot_alerts' ? '#ef4444' : t.id === 'banned' ? '#f97316' : 'var(--text-primary)')
            : 'var(--text-secondary)',
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

function SeverityBadge({ severity }) {
  const color = SEVERITY_COLOR[severity] || '#6b7280'
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: 4,
      fontFamily: 'var(--font-mono)', fontSize: '0.63rem', fontWeight: 700,
      color, background: `${color}18`, border: `1px solid ${color}40`,
      textTransform: 'uppercase',
    }}>
      {severity}
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

// ── Attacker Profile Modal ─────────────────────────────────
function AttackerProfileModal({ ip, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotAttackerProfile(ip)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [ip])

  const riskColor = data
    ? data.risk_score >= 70 ? '#ef4444' : data.risk_score >= 40 ? '#f97316' : '#22c55e'
    : '#6b7280'

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: '100%', maxWidth: 660, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={14} /> {ip}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={14} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {loading ? (
            <div className="loading-box"><span className="spinner" /></div>
          ) : !data || data.error ? (
            <div className="empty-state"><Bug size={24} /><div>No data for this IP</div></div>
          ) : (
            <>
              {/* Risk score + stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '0.75rem', textAlign: 'center', border: `1px solid ${riskColor}40` }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 800, color: riskColor, lineHeight: 1 }}>{data.risk_score}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>RISK SCORE</div>
                </div>
                <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{data.total_sessions}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>SESSIONS</div>
                </div>
                <div style={{ background: 'var(--bg-muted)', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: data.login_successes > 0 ? '#ef4444' : 'var(--text-primary)', lineHeight: 1 }}>{data.login_successes}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>LOGINS OK</div>
                </div>
              </div>

              {/* Dominant threat + categories */}
              {data.dominant_threat && data.dominant_threat !== 'unknown' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Dominant threat:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: CMD_CATEGORY_COLOR[data.dominant_threat] || '#ef4444', background: `${CMD_CATEGORY_COLOR[data.dominant_threat] || '#ef4444'}18`, border: `1px solid ${CMD_CATEGORY_COLOR[data.dominant_threat] || '#ef4444'}40`, borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                    {THREAT_LABEL[data.dominant_threat] || data.dominant_threat}
                  </span>
                  {Object.entries(data.threat_categories || {}).map(([cat, cnt]) => (
                    <span key={cat} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: CMD_CATEGORY_COLOR[cat] || '#6b7280', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
                      {cat} ({cnt})
                    </span>
                  ))}
                </div>
              )}

              {/* Timeline */}
              {(data.first_seen || data.last_seen) && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  {data.first_seen && <span><Clock size={10} style={{ display: 'inline', marginRight: 4 }} />First: {new Date(data.first_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                  {data.last_seen  && <span><Clock size={10} style={{ display: 'inline', marginRight: 4 }} />Last: {new Date(data.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
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

              {/* Top credentials */}
              {data.credentials?.top_pairs?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                    Credentials tried ({data.credentials.total_attempts} attempts, {data.credentials.unique_pairs} unique)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.75rem' }}>
                    {data.credentials.top_pairs.slice(0, 8).map((c, i) => (
                      <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.15rem 0.45rem' }}>
                        <span style={{ color: '#60a5fa' }}>{c.username}</span>
                        <span style={{ color: 'var(--text-secondary)' }}> / </span>
                        <span style={{ color: '#f97316' }}>{c.password}</span>
                      </span>
                    ))}
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

              {/* Sessions list */}
              {data.sessions?.length > 0 && (
                <>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', marginTop: '0.5rem' }}>
                    Sessions ({data.sessions.length})
                  </div>
                  {data.sessions.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', background: 'var(--bg-muted)', borderRadius: 5, marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <SeverityBadge severity={s.severity} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{s.first_seen ? new Date(s.first_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
                      {s.login_success && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444', fontWeight: 700 }}>LOGIN OK</span>}
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{s.commands} cmds · {s.files} files</span>
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

// ── Attacker card (mobile) ─────────────────────────────────
function AttackerCard({ attacker, idx, onSessionClick, onProfileClick }) {
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
            }}>LOGIN OK</span>
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
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {attacker.session_ids?.map((sid, i) => (
              <button key={i} onClick={() => onSessionClick(sid)} style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#a78bfa',
                background: '#a78bfa18', border: '1px solid #a78bfa30',
                borderRadius: 4, padding: '0.1rem 0.35rem', cursor: 'pointer',
              }}>session {sid.slice(0, 8)}…</button>
            ))}
            <button onClick={() => onProfileClick(attacker.ip)} style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444',
              background: '#ef444418', border: '1px solid #ef444430',
              borderRadius: 4, padding: '0.1rem 0.4rem', cursor: 'pointer',
              marginLeft: 'auto',
            }}>
              <Target size={9} style={{ display: 'inline', marginRight: 3 }} />Full profile
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Attacker row (desktop)
function AttackerRow({ attacker, idx, onSessionClick, onProfileClick }) {
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
          <button onClick={e => { e.stopPropagation(); onProfileClick(attacker.ip) }} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444',
            background: '#ef444418', border: '1px solid #ef444430',
            borderRadius: 4, padding: '0.15rem 0.4rem', cursor: 'pointer', marginRight: '0.4rem',
          }}>
            profile
          </button>
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
  const [data, setData]       = useState(null)
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
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotCredentials().then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data)   return <div className="empty-state"><Key size={28} /><div>No credential data</div></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Total Attempts"  value={data.total_attempts}  icon={<Lock size={15} />}      color="#f97316" />
        <ThreatStatCard label="Unique Pairs"    value={data.unique_pairs}    icon={<Hash size={15} />}      color="#60a5fa" />
        <ThreatStatCard label="Diversity Score" value={`${(data.diversity_score * 100).toFixed(1)}%`} icon={<TrendingUp size={15} />} color="#22c55e"
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
        <TopList title="Top Usernames" icon={<User size={14} />} items={data.top_usernames} valueKey="count" labelKey="username" color="#60a5fa" />
        <TopList title="Top Passwords" icon={<Key size={14} />}  items={data.top_passwords} valueKey="count" labelKey="password" color="#f97316" />
      </div>
    </div>
  )
}

// ── Commands view ──────────────────────────────────────────
function CommandsView({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotCommands().then(setData).catch(() => setData(null)).finally(() => setLoading(false))
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
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', minWidth: 120, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>{cmd.command}</span>
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
  const [files, setFiles]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotFiles().then(setFiles).catch(() => setFiles([])).finally(() => setLoading(false))
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
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url || f.outfile || '—'}</td>
                <td className="td-mono td-muted" style={{ fontSize: '0.65rem' }}>{f.session ? f.session.slice(0, 10) + '…' : '—'}</td>
                <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>{f.timestamp ? new Date(f.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
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
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotDaily().then(setData).catch(() => setData(null)).finally(() => setLoading(false))
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
              <XAxis dataKey="date" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }} tickFormatter={v => v.slice(5)} interval={isMobile ? 6 : 3} />
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

// ── NEW: Banned IPs view ───────────────────────────────────
function BannedView({ isMobile }) {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [jailFilter, setJailFilter] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.honeypotBanned(jailFilter)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [jailFilter])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data || data.error) return (
    <div className="empty-state">
      <Ban size={28} style={{ color: '#f97316' }} />
      <div>{data?.error || 'Cannot connect to Fail2ban database'}</div>
    </div>
  )

  const jails = Object.keys(data.by_jail || {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Banned IPs"    value={data.total}                    icon={<Ban size={15} />}       color="#f97316" />
        <ThreatStatCard label="Active Jails"  value={jails.length}                  icon={<Shield size={15} />}    color="#60a5fa" />
        {jails.slice(0, 2).map(j => (
          <ThreatStatCard key={j} label={`Jail: ${j}`} value={data.by_jail[j]} icon={<Lock size={15} />} color="#a78bfa" />
        ))}
      </div>

      {/* Jail filter */}
      {jails.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button onClick={() => setJailFilter('')} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '0.3rem 0.75rem',
            border: `1px solid ${jailFilter === '' ? '#f97316' : 'var(--border)'}`,
            borderRadius: 6, background: jailFilter === '' ? '#f9731618' : 'var(--bg-muted)',
            color: jailFilter === '' ? '#f97316' : 'var(--text-secondary)', cursor: 'pointer',
          }}>All</button>
          {jails.map(j => (
            <button key={j} onClick={() => setJailFilter(j)} style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '0.3rem 0.75rem',
              border: `1px solid ${jailFilter === j ? '#f97316' : 'var(--border)'}`,
              borderRadius: 6, background: jailFilter === j ? '#f9731618' : 'var(--bg-muted)',
              color: jailFilter === j ? '#f97316' : 'var(--text-secondary)', cursor: 'pointer',
            }}>{j} ({data.by_jail[j]})</button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Ban size={15} /></div>
          <span className="card-header-title">Banned IPs</span>
          <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{data.banned?.length || 0}</span>
          <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <RefreshCw size={13} />
          </button>
        </div>
        {!data.banned?.length ? (
          <div className="empty-state"><Ban size={24} /><div>No banned IPs</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>IP</th><th>Jail</th><th>Banned At</th><th>Expires</th><th>Remaining</th></tr>
              </thead>
              <tbody>
                {data.banned.map((b, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#f97316', fontWeight: 600 }}>{b.ip}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa30', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{b.jail}</span>
                    </td>
                    <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>
                      {new Date(b.banned_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>
                      {new Date(b.expires_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
                        color: b.remaining_s > 3600 ? '#ef4444' : b.remaining_s > 0 ? '#f97316' : '#6b7280',
                      }}>
                        {fmtRemaining(b.remaining_s)}
                      </span>
                    </td>
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

// ── NEW: Honeypot Alerts view ──────────────────────────────
function HoneypotAlertsView({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [hours, setHours]     = useState(24)

  useEffect(() => {
    setLoading(true)
    api.honeypotAlerts(hours)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [hours])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data)   return <div className="empty-state"><Siren size={28} /><div>No alert data</div></div>

  const highCount   = data.alerts?.filter(a => a.severity === 'high').length || 0
  const medCount    = data.alerts?.filter(a => a.severity === 'medium').length || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Total Alerts"  value={data.total}  icon={<Siren size={15} />}       color="#ef4444" />
        <ThreatStatCard label="High Severity" value={highCount}   icon={<AlertCircle size={15} />} color="#ef4444" />
        <ThreatStatCard label="Medium"        value={medCount}    icon={<AlertTriangle size={15} />} color="#f97316" />
      </div>

      {/* Time window selector */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Window:</span>
        {[6, 24, 48, 168].map(h => (
          <button key={h} onClick={() => setHours(h)} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.25rem 0.6rem',
            border: `1px solid ${hours === h ? '#ef4444' : 'var(--border)'}`,
            borderRadius: 6, background: hours === h ? '#ef444418' : 'var(--bg-muted)',
            color: hours === h ? '#ef4444' : 'var(--text-secondary)', cursor: 'pointer',
          }}>{h === 168 ? '7d' : `${h}h`}</button>
        ))}
      </div>

      {/* Alert list */}
      {!data.alerts?.length ? (
        <div className="empty-state"><Check size={28} style={{ color: '#22c55e' }} /><div>No anomalous activity in the selected window</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {data.alerts.map((alert, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${alert.severity === 'high' ? '#ef444440' : '#f9731640'}`,
              borderLeft: `3px solid ${alert.severity === 'high' ? '#ef4444' : '#f97316'}`,
              borderRadius: 8, padding: '0.85rem 1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <SeverityBadge severity={alert.severity} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: alert.severity === 'high' ? '#ef4444' : '#f97316' }}>{alert.src_ip}</span>
                {alert.login_success && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                    ⚠ LOGIN SUCCESS
                  </span>
                )}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  {alert.first_seen ? new Date(alert.first_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </span>
              </div>

              {/* Reasons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.4rem' }}>
                {alert.reasons.map((r, j) => (
                  <span key={j} style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                    color: r === 'login_success' || r === 'dangerous_command' ? '#ef4444' : '#f97316',
                    background: r === 'login_success' || r === 'dangerous_command' ? '#ef444418' : '#f9731618',
                    border: `1px solid ${r === 'login_success' || r === 'dangerous_command' ? '#ef444430' : '#f9731630'}`,
                    borderRadius: 4, padding: '0.1rem 0.4rem',
                  }}>
                    {r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                <span>{alert.command_count} commands</span>
                {alert.file_count > 0 && <span style={{ color: '#ec4899' }}>{alert.file_count} files</span>}
              </div>

              {/* High severity commands */}
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
          ))}
        </div>
      )}
    </div>
  )
}

// ── NEW: Threat Classification view ───────────────────────
function ThreatClassView({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]       = useState(7)

  useEffect(() => {
    setLoading(true)
    api.honeypotThreats(days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data)   return <div className="empty-state"><ShieldAlert size={28} /><div>No threat data</div></div>

  const catChartData = (data.categories || []).map(c => ({ name: c.category, value: c.total }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Total Sessions" value={data.total_sessions}         icon={<Terminal size={15} />} color="#a78bfa" />
        <ThreatStatCard label="High Severity"  value={data.severity?.high || 0}   icon={<Flame size={15} />}    color="#ef4444" />
        <ThreatStatCard label="Medium"         value={data.severity?.medium || 0} icon={<AlertTriangle size={15} />} color="#f97316" />
      </div>

      {/* Days selector */}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Period:</span>
        {[1, 7, 14, 30].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.25rem 0.6rem',
            border: `1px solid ${days === d ? '#a78bfa' : 'var(--border)'}`,
            borderRadius: 6, background: days === d ? '#a78bfa18' : 'var(--bg-muted)',
            color: days === d ? '#a78bfa' : 'var(--text-secondary)', cursor: 'pointer',
          }}>{d}d</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        {/* Category pie */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#a78bfa18', color: '#a78bfa' }}><ShieldAlert size={15} /></div>
            <span className="card-header-title">Threat Categories</span>
          </div>
          <div className="card-body" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catChartData} cx="50%" cy="45%" innerRadius="35%" outerRadius="62%" paddingAngle={3} dataKey="value">
                  {catChartData.map((entry, i) => <Cell key={i} fill={CMD_CATEGORY_COLOR[entry.name] || COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}
                  formatter={v => THREAT_LABEL[v] || v} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily timeline */}
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
                <Bar dataKey="total" fill="#ef4444" opacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Per-category breakdown */}
      {(data.categories || []).map((cat, i) => (
        <div key={i} className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: `${CMD_CATEGORY_COLOR[cat.category] || '#6b7280'}18`, color: CMD_CATEGORY_COLOR[cat.category] || '#6b7280' }}>
              <ShieldAlert size={15} />
            </div>
            <span className="card-header-title">{THREAT_LABEL[cat.category] || cat.category}</span>
            <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{cat.total} sessions</span>
            {cat.high_count > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ef4444', background: '#ef444418', border: '1px solid #ef444430', borderRadius: 4, padding: '0.1rem 0.35rem', marginLeft: '0.4rem' }}>
                {cat.high_count} high
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              {cat.unique_ips} unique IPs
            </span>
          </div>

          {/* Top IPs for this category */}
          <div style={{ padding: '0.5rem 1rem 0.75rem', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {cat.top_ips.map((ip, j) => (
              <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: CMD_CATEGORY_COLOR[cat.category] || '#6b7280', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.4rem' }}>
                {ip.ip} <span style={{ opacity: 0.6 }}>×{ip.count}</span>
              </span>
            ))}
          </div>

          {/* Example commands */}
          {cat.examples?.some(e => e.example_cmds?.length > 0) && (
            <div style={{ padding: '0 1rem 0.75rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Example commands</div>
              {cat.examples.flatMap(e => e.example_cmds || []).slice(0, 3).map((cmd, j) => (
                <div key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#a78bfa', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.2rem 0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ color: '#22c55e', marginRight: '0.3rem' }}>$</span>{cmd}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── NEW: Downloads Analysis view ───────────────────────────
function DownloadsAnalysisView({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotDownloadsAnalysis()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data)   return <div className="empty-state"><Download size={28} /><div>No download data</div></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Unique Files"   value={data.total_unique_files || 0} icon={<Hash size={15} />}     color="#ec4899" />
        <ThreatStatCard label="With Hash"      value={(data.files || []).filter(f => f.sha256).length} icon={<Shield size={15} />} color="#22c55e" />
        <ThreatStatCard label="Total Downloads" value={(data.files || []).reduce((s, f) => s + f.count, 0)} icon={<Download size={15} />} color="#f97316" />
      </div>

      {/* File list */}
      {!data.files?.length ? (
        <div className="empty-state"><Download size={28} /><div>No files recorded</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {data.files.map((f, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.85rem 1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                {/* Type icon */}
                <span style={{ flexShrink: 0, marginTop: 2 }}>
                  {f.type === 'download'
                    ? <Download size={14} style={{ color: '#ec4899' }} />
                    : <Upload size={14} style={{ color: '#f43f5e' }} />
                  }
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* URL */}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', wordBreak: 'break-all', marginBottom: '0.3rem' }}>
                    {f.url || f.outfile || '—'}
                  </div>

                  {/* SHA256 */}
                  {f.sha256 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                      <Hash size={10} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.63rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                        {f.sha256}
                      </span>
                      {f.virustotal_url && (
                        <a href={f.virustotal_url} target="_blank" rel="noopener noreferrer" style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
                          color: '#22c55e', background: '#22c55e18', border: '1px solid #22c55e40',
                          borderRadius: 4, padding: '0.1rem 0.4rem', textDecoration: 'none',
                          flexShrink: 0,
                        }}>
                          <ExternalLink size={9} /> VirusTotal
                        </a>
                      )}
                    </div>
                  )}

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    <span>Seen <strong style={{ color: 'var(--text-primary)' }}>{f.count}</strong>×</span>
                    <span><strong style={{ color: 'var(--text-primary)' }}>{f.unique_ips}</strong> IPs</span>
                    {f.first_seen && <span>First: {new Date(f.first_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {f.last_seen  && <span>Last: {new Date(f.last_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                  </div>

                  {/* Source IPs */}
                  {f.source_ips?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: '0.35rem' }}>
                      {f.source_ips.map((ip, j) => (
                        <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#f97316', background: '#f9731618', border: '1px solid #f9731630', borderRadius: 4, padding: '0.1rem 0.35rem' }}>{ip}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Count badge */}
                <span style={{
                  flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700,
                  color: f.count > 5 ? '#ef4444' : '#f97316',
                  background: f.count > 5 ? '#ef444418' : '#f9731618',
                  border: `1px solid ${f.count > 5 ? '#ef444430' : '#f9731630'}`,
                  borderRadius: 6, padding: '0.2rem 0.55rem',
                }}>
                  ×{f.count}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
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
            <button className="btn btn--ghost btn--sm" disabled={scanningPort === device.mac} onClick={() => onPortScan(device.mac)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'center' }}>
              <Scan size={12} style={{ animation: scanningPort === device.mac ? 'spin 1s linear infinite' : 'none' }} />
              {scanningPort === device.mac ? 'Scanning…' : 'Port Scan'}
            </button>
            <button className="btn btn--ghost btn--sm" disabled={scanningOs === device.mac} onClick={() => onOsScan(device.mac)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'center' }}>
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
                {device.os_detail  && <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}><Monitor size={11} /> {device.os_detail}</div>}
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
  const svgRef    = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [selectedDevice, setSelectedDevice] = useState(null)
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })

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
            const color  = COLORS[i % COLORS.length]
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

function RealIpsView({ isMobile }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.honeypotRealIps()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-box" style={{ height: 200 }}><span className="spinner" /></div>
  if (!data || data.error) return (
    <div className="empty-state">
      <Eye size={28} />
      <div>{data?.error || 'No data — ensure iptables LOG rule is active'}</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '0.75rem' }}>
        <ThreatStatCard label="Real Connections" value={data.total} icon={<Eye size={15} />} color="#22c55e" />
        <ThreatStatCard label="Correlated Sessions"
          value={(data.connections || []).filter(c => c.session_id).length}
          icon={<Terminal size={15} />} color="#a78bfa" />
        <ThreatStatCard label="Login Success"
          value={(data.connections || []).filter(c => c.login_success).length}
          icon={<Lock size={15} />} color="#ef4444" />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#22c55e18', color: '#22c55e' }}><Eye size={15} /></div>
          <span className="card-header-title">Real Attacker IPs (last 24h)</span>
          <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{data.total}</span>
        </div>
        {!data.connections?.length ? (
          <div className="empty-state"><Eye size={24} /><div>No connections logged</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Real IP</th>
                  <th>Time</th>
                  <th>Session</th>
                  <th>Login</th>
                  <th>Credentials</th>
                  <th>Commands</th>
                </tr>
              </thead>
              <tbody>
                {data.connections.map((c, i) => (
                  <tr key={i} style={{ background: c.login_success ? '#ef444408' : 'transparent' }}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: c.login_success ? '#ef4444' : '#22c55e' }}>
                        {c.real_ip}
                      </span>
                    </td>
                    <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>
                      {c.timestamp ? new Date(c.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td>
                      {c.session_id
                        ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#a78bfa', background: '#a78bfa18', border: '1px solid #a78bfa30', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
                            {c.session_id.slice(0, 10)}…
                          </span>
                        : <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>—</span>
                      }
                    </td>
                    <td>
                      {c.login_success
                        ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', background: '#ef444418', border: '1px solid #ef444440', borderRadius: 4, padding: '0.1rem 0.35rem' }}>SUCCESS</span>
                        : <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>failed</span>
                      }
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {(c.credentials || []).map((cr, j) => (
                          <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.1rem 0.35rem' }}>
                            <span style={{ color: '#60a5fa' }}>{cr.username}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>/</span>
                            <span style={{ color: '#f97316' }}>{cr.password}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(c.commands || []).map((cmd, j) => (
                          <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#a78bfa' }}>
                            <span style={{ color: '#22c55e' }}>$ </span>{cmd}
                          </span>
                        ))}
                      </div>
                    </td>
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
  const [profileModal,      setProfileModal]      = useState(null)   // NEW: attacker profile
  const [geoData,           setGeoData]           = useState(null)
  const [geoLoading,        setGeoLoading]        = useState(false)

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Load geo data when map tab is opened
  useEffect(() => {
    if (threatTab === 'map' && !geoData) {
      setGeoLoading(true)
      api.honeypotGeoip(100).then(setGeoData).finally(() => setGeoLoading(false))
    }
  }, [threatTab])

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
      {profileModal && <AttackerProfileModal ip={profileModal} onClose={() => setProfileModal(null)} />}

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
        <HoneypotSection isMobile={isMobile} showToast={showToast} />
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