import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Monitor, RefreshCw, Bell, BellOff, Wifi, WifiOff,
  Cpu, Globe, Server, Smartphone, Laptop, Router, HardDrive,
  ChevronDown, ChevronUp, Scan, Search, X, Clock, Activity,
  AlertTriangle, Check,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── API ────────────────────────────────────────────────────
const api = {
  devices:      () => fetch('/api/devices').then(r => r.json()),
  stats:        () => fetch('/api/devices/stats').then(r => r.json()),
  connDays:     () => fetch('/api/devices/most_connected_days').then(r => r.json()),
  alerts:       () => fetch('/api/devices/alerts').then(r => r.json()),
  clearAlerts:  () => fetch('/api/devices/alerts', { method: 'DELETE' }).then(r => r.json()),
  history:      () => fetch('/api/devices/history').then(r => r.json()),
  portScan:     (mac) => fetch(`/api/devices/${mac}/portscan`, { method: 'POST' }).then(r => r.json()),
  osScan:       (mac) => fetch(`/api/devices/${mac}/osscan`,  { method: 'POST' }).then(r => r.json()),
}

// ── Constants ──────────────────────────────────────────────
const COLORS = [
  'var(--card-hum-accent)', 'var(--card-air-accent)', 'var(--card-shop-accent)',
  'var(--card-temp-accent)', 'var(--card-train-accent)', 'var(--card-exp-accent)',
  'var(--card-act-accent)', 'var(--card-raspi-accent)',
]
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

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
  Windows: <Monitor size={13}/>,
  Linux:   <Server size={13}/>,
  Apple:   <Laptop size={13}/>,
  Android: <Smartphone size={13}/>,
  Network: <Router size={13}/>,
  BSD:     <HardDrive size={13}/>,
  Unknown: <Cpu size={13}/>,
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

// ── Sub-components ─────────────────────────────────────────

// Tab bar — orizzontale con scroll su mobile
function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'devices',  label: 'Devices',   icon: <Monitor size={13}/> },
    { id: 'topology', label: 'Topology',  icon: <Globe size={13}/> },
    { id: 'stats',    label: 'Analytics', icon: <Activity size={13}/> },
    { id: 'history',  label: 'History',   icon: <Clock size={13}/> },
  ]
  return (
    <div style={{
      display: 'flex',
      gap: '0.15rem',
      borderBottom: '1px solid var(--border)',
      marginBottom: '1.5rem',
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.55rem 0.85rem',
            border: 'none', background: 'transparent',
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            color: active === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'color 0.15s',
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
      }}/>
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
      {OS_ICON[os] || <Cpu size={12}/>} {os}
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

// ── Device card (mobile) ───────────────────────────────────
function DeviceCard({ device, onPortScan, onOsScan, scanningPort, scanningOs, colorIdx }) {
  const [expanded, setExpanded] = useState(false)
  const accent = COLORS[colorIdx % COLORS.length]

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: '0.6rem',
    }}>
      {/* Card header — sempre visibile */}
      <div
        onClick={() => setExpanded(p => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.65rem',
          padding: '0.75rem 0.9rem', cursor: 'pointer',
        }}
      >
        <span style={{
          width: 9, height: 9, borderRadius: '50%',
          background: accent, flexShrink: 0,
        }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
            color: 'var(--text-primary)', fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {device.hostname !== 'unknown' ? device.hostname : device.ip}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
            color: 'var(--text-secondary)', marginTop: '0.1rem',
          }}>
            {device.ip}
            {device.vendor ? ` · ${device.vendor.substring(0, 20)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <OnlineBadge status={device.status}/>
          {expanded
            ? <ChevronUp size={13} style={{ color: 'var(--text-secondary)' }}/>
            : <ChevronDown size={13} style={{ color: 'var(--text-secondary)' }}/>}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-muted)',
          padding: '0.75rem 0.9rem',
        }}>
          {/* OS + MAC row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
            <OsBadge os={device.os}/>
            {device.mac !== 'unknown' && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                color: 'var(--text-secondary)',
              }}>{device.mac}</span>
            )}
          </div>

          {/* Meta */}
          {device.os_detail && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              🖥 {device.os_detail}
            </div>
          )}
          {device.last_seen && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
              🕐 {new Date(device.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          {device.first_seen && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              📅 First seen {new Date(device.first_seen).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
            </div>
          )}

          {/* Open ports */}
          <div style={{
            fontSize: '0.65rem', color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: '0.3rem',
          }}>
            Open Ports {device.open_ports?.length > 0 && `(${device.open_ports.length})`}
          </div>
          {device.open_ports?.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: '0.65rem' }}>
              {device.open_ports.map((p, i) => <PortBadge key={i} port={p}/>)}
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
              Not scanned yet
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn--ghost btn--sm"
              disabled={scanningPort === device.mac}
              onClick={() => onPortScan(device.mac)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'center' }}>
              <Scan size={12} style={{ animation: scanningPort === device.mac ? 'spin 1s linear infinite' : 'none' }}/>
              {scanningPort === device.mac ? 'Scanning…' : 'Port Scan'}
            </button>
            <button className="btn btn--ghost btn--sm"
              disabled={scanningOs === device.mac}
              onClick={() => onOsScan(device.mac)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, justifyContent: 'center' }}>
              <Cpu size={12} style={{ animation: scanningOs === device.mac ? 'spin 1s linear infinite' : 'none' }}/>
              {scanningOs === device.mac ? 'Detecting…' : 'OS Detect'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Device row (desktop) — invariato ──────────────────────
function DeviceRow({ device, onPortScan, onOsScan, scanningPort, scanningOs, colorIdx }) {
  const [expanded, setExpanded] = useState(false)
  const accent = COLORS[colorIdx % COLORS.length]

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(p => !p)}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0 }}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.83rem', color: 'var(--text-primary)' }}>
              {device.hostname !== 'unknown' ? device.hostname : '—'}
            </span>
          </span>
        </td>
        <td className="td-mono" style={{ fontSize: '0.78rem' }}>{device.ip}</td>
        <td className="td-mono td-muted" style={{ fontSize: '0.7rem' }}>
          {device.mac !== 'unknown' ? device.mac : '—'}
        </td>
        <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {device.vendor ? device.vendor.substring(0, 22) : '—'}
        </td>
        <td><OsBadge os={device.os}/></td>
        <td><OnlineBadge status={device.status}/></td>
        <td style={{ textAlign: 'right' }}>
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: 'var(--bg-muted)' }}>
          <td colSpan={7} style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</div>
                {device.os_detail && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
                    🖥 {device.os_detail}
                  </div>
                )}
                {device.last_seen && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
                    🕐 {new Date(device.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                )}
                {device.first_seen && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    📅 First seen {new Date(device.first_seen).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Open Ports {device.open_ports?.length > 0 && `(${device.open_ports.length})`}
                </div>
                {device.open_ports?.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {device.open_ports.map((p, i) => <PortBadge key={i} port={p}/>)}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Not scanned yet</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <button className="btn btn--ghost btn--sm"
                  disabled={scanningPort === device.mac}
                  onClick={e => { e.stopPropagation(); onPortScan(device.mac) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Scan size={12} style={{ animation: scanningPort === device.mac ? 'spin 1s linear infinite' : 'none' }}/>
                  {scanningPort === device.mac ? 'Scanning…' : 'Port Scan'}
                </button>
                <button className="btn btn--ghost btn--sm"
                  disabled={scanningOs === device.mac}
                  onClick={e => { e.stopPropagation(); onOsScan(device.mac) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Cpu size={12} style={{ animation: scanningOs === device.mac ? 'spin 1s linear infinite' : 'none' }}/>
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
  const WIDTH  = 700
  const HEIGHT = 420
  const CX     = WIDTH  / 2
  const CY     = HEIGHT / 2
  const R      = 155
  const placed = devices.slice(0, 16)

  return (
    <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', maxWidth: 700, display: 'block', margin: '0 auto', minWidth: 320 }}>
        <defs>
          <radialGradient id="routerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx={CX} cy={CY} r={R + 18} fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 6"/>
        <circle cx={CX} cy={CY} r={R - 18} fill="none" stroke="var(--border)" strokeWidth={0.5} opacity={0.4}/>
        <circle cx={CX} cy={CY} r={48} fill="url(#routerGlow)"/>
        {placed.map((d, i) => {
          const angle = (2 * Math.PI * i) / placed.length - Math.PI / 2
          const x = CX + R * Math.cos(angle)
          const y = CY + R * Math.sin(angle)
          const online = d.status === 'up'
          return (
            <line key={d.mac} x1={CX} y1={CY} x2={x} y2={y}
              stroke={online ? COLORS[i % COLORS.length] : 'var(--border)'}
              strokeWidth={online ? 1.2 : 0.6}
              strokeOpacity={online ? 0.5 : 0.3}
              strokeDasharray={online ? 'none' : '4 4'}/>
          )
        })}
        <circle cx={CX} cy={CY} r={26} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={1.5} filter="url(#glow)"/>
        <text x={CX} y={CY - 4} textAnchor="middle" fill="var(--accent)" fontFamily="var(--font-mono)" fontSize={8} fontWeight={700}>FritzBox</text>
        <text x={CX} y={CY + 7} textAnchor="middle" fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={6.5}>192.168.178.1</text>
        {placed.map((d, i) => {
          const angle  = (2 * Math.PI * i) / placed.length - Math.PI / 2
          const x      = CX + R * Math.cos(angle)
          const y      = CY + R * Math.sin(angle)
          const color  = COLORS[i % COLORS.length]
          const online = d.status === 'up'
          const label  = d.hostname !== 'unknown' ? d.hostname : d.ip
          const lx = CX + (R + 36) * Math.cos(angle)
          const ly = CY + (R + 36) * Math.sin(angle)
          const anchor = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle'
          return (
            <g key={d.mac}>
              <circle cx={x} cy={y} r={13} fill="var(--bg-surface)" stroke={online ? color : 'var(--border)'}
                strokeWidth={online ? 1.5 : 1} opacity={online ? 1 : 0.5} filter={online ? 'url(#glow)' : 'none'}/>
              {online && <circle cx={x + 8} cy={y - 8} r={3.5} fill="#22c55e" stroke="var(--bg-surface)" strokeWidth={1}/>}
              <text x={x} y={y + 4} textAnchor="middle" fill={online ? color : 'var(--text-secondary)'} fontFamily="var(--font-mono)" fontSize={8}>
                {d.os === 'Apple' ? '🍎' : d.os === 'Windows' ? '🪟' : d.os === 'Linux' ? '🐧' : d.os === 'Android' ? '📱' : '💻'}
              </text>
              <text x={lx} y={ly + 3} textAnchor={anchor} fill={online ? 'var(--text-primary)' : 'var(--text-secondary)'} fontFamily="var(--font-mono)" fontSize={7} fontWeight={online ? 600 : 400}>
                {label.length > 18 ? label.substring(0, 17) + '…' : label}
              </text>
              <text x={lx} y={ly + 11} textAnchor={anchor} fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={6}>
                {d.ip}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Alert panel ────────────────────────────────────────────
function AlertPanel({ alerts, onClear, onClose }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0, right: 0, bottom: 0,
      width: '100%',
      maxWidth: 360,
      zIndex: 200,
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>New Devices</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {alerts.length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={onClear} style={{ fontSize: '0.65rem' }}>
              <Check size={10}/> Clear all
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={14}/></button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            No new devices in the last 24h
          </div>
        ) : alerts.map((a, i) => (
          <div key={i} style={{
            padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
          }}>
            <AlertTriangle size={14} style={{ color: 'var(--card-temp-accent)', flexShrink: 0, marginTop: 2 }}/>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {a.hostname || a.ip}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {a.vendor || 'Unknown vendor'} · {a.ip}
              </div>
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

// Alert backdrop
function AlertBackdrop({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 199,
        background: 'rgba(0,0,0,0.4)',
      }}
    />
  )
}

// ── History view ───────────────────────────────────────────
function HistoryView({ history, devices }) {
  const [filter, setFilter] = useState('')
  const deviceByMac = Object.fromEntries(devices.map(d => [d.mac, d]))
  const filteredMacs = Object.keys(history).filter(mac => {
    const dev = deviceByMac[mac]
    const label = dev ? `${dev.hostname} ${dev.ip} ${mac}` : mac
    return label.toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
          <Clock size={15}/>
        </div>
        <span className="card-header-title">Connection History</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={12} style={{ color: 'var(--text-secondary)' }}/>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter devices…"
            style={{
              background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '0.3rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              color: 'var(--text-primary)', outline: 'none', width: 150,
            }}/>
        </div>
      </div>
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {filteredMacs.length === 0 ? (
          <div className="empty-state"><Clock size={28}/><div>No history available</div></div>
        ) : filteredMacs.map(mac => {
          const dev = deviceByMac[mac]
          const label = dev ? (dev.hostname !== 'unknown' ? dev.hostname : dev.ip) : mac
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
                  <span key={i} style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                    color: 'var(--text-secondary)', padding: '0.1rem 0.4rem',
                    background: 'var(--bg-muted)', borderRadius: 4,
                  }}>
                    {new Date(e.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                ))}
                {entries.length > 12 && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                    +{entries.length - 12} more
                  </span>
                )}
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

  // Rilevazione mobile
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

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 30000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (tab === 'history' && Object.keys(history).length === 0) {
      api.history().then(setHistory).catch(() => {})
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

  const pieData = stats.map((s, i) => ({
    name: s.hostname && s.hostname !== 'unknown' ? s.hostname : (s.ip_address || 'Unknown'),
    value: s.connection_count || 0,
    color: COLORS[i % COLORS.length],
  }))
  const ipKeys = Object.keys(weekData[0] || {}).filter(k => k !== 'day')
  const onlineCount = devices.filter(d => d.status === 'up').length

  return (
    <div className="page animate-fade">
      {/* ── Header ── */}
      <div className="page-header" style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <h1 className="page-title">Secu<span style={{ color: 'var(--accent)' }}>rity</span></h1>
          <p className="page-subtitle">Network device monitoring</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge--success">
            <span className="dot dot--green dot--pulse"/> {onlineCount}/{devices.length} online
          </span>

          {/* Bell */}
          <div style={{ position: 'relative' }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowAlerts(p => !p)} style={{ position: 'relative' }}>
              {alerts.length > 0
                ? <Bell size={14} style={{ color: 'var(--card-temp-accent)' }}/>
                : <BellOff size={14}/>}
              {alerts.length > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: 'var(--card-temp-accent)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>
                  {alerts.length}
                </span>
              )}
            </button>
          </div>

          <button className="btn btn--ghost btn--sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
            {!isMobile && 'Refresh'}
          </button>
        </div>
      </div>

      {/* Alert panel a tutto schermo su mobile */}
      {showAlerts && (
        <>
          <AlertBackdrop onClose={() => setShowAlerts(false)}/>
          <AlertPanel alerts={alerts} onClear={handleClearAlerts} onClose={() => setShowAlerts(false)}/>
        </>
      )}

      <TabBar active={tab} onChange={setTab}/>

      {/* ── DEVICES TAB ── */}
      {tab === 'devices' && (
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
              <Monitor size={15}/>
            </div>
            <span className="card-header-title">Connected Devices</span>
            <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{filteredDevices.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Search size={12} style={{ color: 'var(--text-secondary)' }}/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{
                  background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '0.28rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                  color: 'var(--text-primary)', outline: 'none',
                  width: isMobile ? 110 : 140,
                }}/>
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={12}/>
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="loading-box"><span className="spinner"/></div>
          ) : filteredDevices.length === 0 ? (
            <div className="empty-state"><Monitor size={28}/><div>No devices found</div></div>
          ) : isMobile ? (
            // ── Vista card su mobile ──
            <div style={{ padding: '0.75rem' }}>
              {filteredDevices.map((d, i) => (
                <DeviceCard
                  key={d.mac || i} device={d} colorIdx={i}
                  onPortScan={handlePortScan} onOsScan={handleOsScan}
                  scanningPort={scanningPort} scanningOs={scanningOs}
                />
              ))}
            </div>
          ) : (
            // ── Vista tabella su desktop ──
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hostname</th>
                    <th>IP</th>
                    <th>MAC</th>
                    <th>Vendor</th>
                    <th>OS</th>
                    <th>Status</th>
                    <th/>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d, i) => (
                    <DeviceRow key={d.mac || i} device={d} colorIdx={i}
                      onPortScan={handlePortScan} onOsScan={handleOsScan}
                      scanningPort={scanningPort} scanningOs={scanningOs}/>
                  ))}
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
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
              <Globe size={15}/>
            </div>
            <span className="card-header-title">Network Topology</span>
            <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{devices.length} nodes</span>
          </div>
          <div style={{ padding: '1rem' }}>
            {loading ? (
              <div className="loading-box"><span className="spinner"/></div>
            ) : devices.length === 0 ? (
              <div className="empty-state"><Globe size={28}/><div>No devices</div></div>
            ) : (
              <TopologyMap devices={devices}/>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', padding: '0 1rem 1rem', flexWrap: 'wrap' }}>
            {[
              { icon: '🍎', label: 'Apple' }, { icon: '🪟', label: 'Windows' },
              { icon: '🐧', label: 'Linux' }, { icon: '📱', label: 'Android' },
              { icon: '💻', label: 'Other' },
            ].map(({ icon, label }) => (
              <span key={label} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {icon} {label}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}/> Online
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)', display: 'inline-block', marginLeft: 6 }}/> Offline
            </span>
          </div>
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {tab === 'stats' && (
        // Su mobile stack verticale, su desktop grid 2 colonne
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: '1.25rem',
        }}>
          {/* Donut */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
                <Shield size={15}/>
              </div>
              <span className="card-header-title">Connection Distribution</span>
            </div>
            <div className="card-body" style={{ height: 300 }}>
              {loading ? (
                <div className="loading-box"><span className="spinner"/></div>
              ) : pieData.length === 0 ? (
                <div className="empty-state"><Shield size={28}/><div>No data</div></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="45%" innerRadius="42%" outerRadius="65%"
                      paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color}/>
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v} connections`, name]}/>
                    <Legend
                      wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-secondary)' }}
                      formatter={(value, entry) => {
                        const total = pieData.reduce((s, d) => s + d.value, 0)
                        const pct   = total ? ((entry.payload.value / total) * 100).toFixed(1) : 0
                        return `${value} (${pct}%)`
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bar chart */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
                <Activity size={15}/>
              </div>
              <span className="card-header-title">Weekly Activity</span>
            </div>
            <div className="card-body" style={{ height: 300 }}>
              {loading ? (
                <div className="loading-box"><span className="spinner"/></div>
              ) : weekData.length === 0 ? (
                <div className="empty-state"><Activity size={28}/><div>No data</div></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekData} barGap={2} margin={{ left: -10, right: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }}/>
                    <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }} width={28}/>
                    <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v} connections`, name]}/>
                    {ipKeys.length > 1 && (
                      <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-secondary)' }}/>
                    )}
                    {ipKeys.map((ip, i) => (
                      <Bar key={ip} dataKey={ip} fill={COLORS[i % COLORS.length]} radius={[3,3,0,0]} maxBarSize={20}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* OS breakdown */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
                <Cpu size={15}/>
              </div>
              <span className="card-header-title">OS Breakdown</span>
            </div>
            <div style={{ padding: '1rem' }}>
              {Object.entries(
                devices.reduce((acc, d) => {
                  const os = d.os || 'Unknown'
                  acc[os] = (acc[os] || 0) + 1
                  return acc
                }, {})
              ).sort((a, b) => b[1] - a[1]).map(([os, count]) => (
                <div key={os} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                  <span style={{
                    color: OS_COLOR[os] || 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontFamily: 'var(--font-mono)', fontSize: '0.78rem', minWidth: 80,
                  }}>
                    {OS_ICON[os] || <Cpu size={12}/>} {os}
                  </span>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg-muted)', borderRadius: 99 }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      width: `${(count / devices.length) * 100}%`,
                      background: OS_COLOR[os] || 'var(--text-secondary)',
                      transition: 'width 0.4s ease',
                    }}/>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 20, textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
              ))}
              {devices.every(d => !d.os) && (
                <div className="empty-state" style={{ minHeight: 80 }}>
                  <Cpu size={20}/><div>Run OS Detect on devices first</div>
                </div>
              )}
            </div>
          </div>

          {/* Uptime summary */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}>
                <Wifi size={15}/>
              </div>
              <span className="card-header-title">Device Uptime</span>
            </div>
            {isMobile ? (
              // Su mobile: lista compatta invece di tabella
              <div style={{ padding: '0.5rem 0.75rem' }}>
                {devices.slice(0, 10).map((d, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.55rem 0', borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.hostname !== 'unknown' ? d.hostname : d.ip}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                        {d.ip} · {d.connection_count || 0} conn
                      </div>
                    </div>
                    <OnlineBadge status={d.status}/>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Device</th><th>IP</th><th>Connections</th><th>Status</th></tr></thead>
                  <tbody>
                    {devices.slice(0, 10).map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent)' }}>
                          {d.hostname !== 'unknown' ? d.hostname : '—'}
                        </td>
                        <td className="td-mono" style={{ fontSize: '0.75rem' }}>{d.ip}</td>
                        <td className="td-mono td-muted" style={{ fontSize: '0.75rem' }}>{d.connection_count || 0}</td>
                        <td><OnlineBadge status={d.status}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <HistoryView history={history} devices={devices}/>
      )}

      <Toast toast={toast}/>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        /* Nasconde la scrollbar del tab bar su webkit */
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}