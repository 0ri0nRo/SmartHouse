import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Monitor, RefreshCw, Bell, BellOff, Wifi,
  Cpu, Globe, Server, Smartphone, Laptop, Router, HardDrive,
  ChevronDown, ChevronUp, Scan, Search, X, Clock, Activity,
  AlertTriangle, Check, Calendar, Eye, Bug, Network,
  Zap, BarChart2, History, LineChart, ShieldAlert, Home,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
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

// ── Shared atoms ───────────────────────────────────────────
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

// ── Tab bars ───────────────────────────────────────────────
const MAIN_TABS = [
  { id: 'overview',  label: 'Overview',    icon: <Home size={13} /> },
  { id: 'topology',  label: 'Topology',   icon: <Network size={13} /> },
  { id: 'threats',   label: 'Threats',     icon: <Bug size={13} /> },
  { id: 'history',   label: 'History',  icon: <History size={13} /> },
]

function TabBar({ active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: '0.15rem',
      borderBottom: '1px solid var(--border)',
      marginBottom: '1.5rem',
      overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {MAIN_TABS.map(t => (
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

// ── Alert panel ────────────────────────────────────────────
function AlertPanel({ alerts, onClear, onClose }) {
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 360,
      zIndex: 200, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600 }}>New Devices</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {alerts.length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={onClear} style={{ fontSize: '0.65rem' }}>
              <Check size={10} /> Mark all as read
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={14} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
            No new devices in the last 24h
          </div>
        ) : alerts.map((a, i) => (
          <div key={i} style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <AlertTriangle size={14} style={{ color: 'var(--card-temp-accent)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{a.hostname || a.ip}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{a.vendor || 'Unknown vendor'} · {a.ip}</div>
              {a.first_seen && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {new Date(a.first_seen).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Device components ──────────────────────────────────────
function DeviceExpandedDetail({ device, onPortScan, onOsScan, scanningPort, scanningOs }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)', padding: '0.75rem 0.9rem' }}>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Meta */}
        <div style={{ minWidth: 170 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <OsBadge os={device.os} />
            {device.mac !== 'unknown' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{device.mac}</span>}
            {device.vendor && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{device.vendor}</span>}
            {device.os_detail && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{device.os_detail}</span>}
            {device.last_seen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                <Clock size={10} /> {new Date(device.last_seen).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}
            {device.first_seen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                <Calendar size={10} /> First seen: {new Date(device.first_seen).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
              </div>
            )}
          </div>
        </div>

        {/* Ports */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Open ports {device.open_ports?.length > 0 && `(${device.open_ports.length})`}
          </div>
          {device.open_ports?.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{device.open_ports.map((p, i) => <PortBadge key={i} port={p} />)}</div>
            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Not yet scanned</span>
          }
        </div>

        {/* Scan actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <button
            className="btn btn--ghost btn--sm"
            disabled={scanningPort === device.mac}
            onClick={() => onPortScan(device.mac)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Scan size={12} style={{ animation: scanningPort === device.mac ? 'spin 1s linear infinite' : 'none' }} />
            {scanningPort === device.mac ? 'Scanning…' : 'Port Scan'}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            disabled={scanningOs === device.mac}
            onClick={() => onOsScan(device.mac)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Cpu size={12} style={{ animation: scanningOs === device.mac ? 'spin 1s linear infinite' : 'none' }} />
            {scanningOs === device.mac ? 'Detecting…' : 'OS Detect'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeviceCard({ device, colorIdx, onPortScan, onOsScan, scanningPort, scanningOs }) {
  const [expanded, setExpanded] = useState(false)
  const accent = COLORS[colorIdx % COLORS.length]

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: '0.6rem' }}>
      <div onClick={() => setExpanded(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.75rem 0.9rem', cursor: 'pointer' }}>
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
        <DeviceExpandedDetail
          device={device}
          onPortScan={onPortScan} onOsScan={onOsScan}
          scanningPort={scanningPort} scanningOs={scanningOs}
        />
      )}
    </div>
  )
}

function DeviceRow({ device, colorIdx, onPortScan, onOsScan, scanningPort, scanningOs }) {
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
        <td style={{ textAlign: 'right' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--bg-muted)' }}>
          <td colSpan={7} style={{ padding: 0 }}>
            <DeviceExpandedDetail
              device={device}
              onPortScan={onPortScan} onOsScan={onOsScan}
              scanningPort={scanningPort} scanningOs={scanningOs}
            />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Topology map ───────────────────────────────────────────
function TopologyMap({ devices }) {
  const svgRef   = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [selected, setSelected]   = useState(null)
  const dragging  = useRef(false)
  const lastPos   = useRef({ x: 0, y: 0 })

  const placed = devices.slice(0, 18)
  const W = 700, H = 420, CX = W / 2, CY = H / 2, R = 155
  const clamp = t => ({ ...t, scale: Math.min(3, Math.max(0.35, t.scale)) })

  const onWheel = e => {
    e.preventDefault()
    const d = e.deltaY > 0 ? 0.88 : 1.12
    const rect = svgRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setTransform(prev => {
      const ns = Math.min(3, Math.max(0.35, prev.scale * d))
      const r  = ns / prev.scale
      return clamp({ scale: ns, x: mx - r * (mx - prev.x), y: my - r * (my - prev.y) })
    })
  }
  const onMD = e => { if (e.target.closest('.topo-node')) return; dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }
  const onMM = e => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x, dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }
  const onMU = () => { dragging.current = false }

  const osLetter = os => ({ Windows: 'W', Linux: 'L', Apple: 'A', Android: 'D', Network: 'N', BSD: 'B' })[os] || '?'

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {[
          { label: '+', fn: () => setTransform(p => clamp({ ...p, scale: p.scale * 1.2 })) },
          { label: '−', fn: () => setTransform(p => clamp({ ...p, scale: p.scale * 0.8 })) },
          { label: <Eye size={12} />, fn: () => setTransform({ x: 0, y: 0, scale: 1 }) },
        ].map(({ label, fn }) => (
          <button key={String(label)} onClick={fn} style={{
            width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--bg-surface)', color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{label}</button>
        ))}
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block', margin: '0 auto', minWidth: 280, cursor: 'grab', touchAction: 'none' }}
        onWheel={onWheel} onMouseDown={onMD} onMouseMove={onMM} onMouseUp={onMU} onMouseLeave={onMU}
      >
        <defs>
          <radialGradient id="gw" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          <circle cx={CX} cy={CY} r={R + 22} fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 8" />
          <circle cx={CX} cy={CY} r={54} fill="url(#gw)" />

          {placed.map((d, i) => {
            const angle = (2 * Math.PI * i) / placed.length - Math.PI / 2
            const x = CX + R * Math.cos(angle), y = CY + R * Math.sin(angle)
            const on = d.status === 'up'
            return (
              <line key={d.mac + '-edge'} x1={CX} y1={CY} x2={x} y2={y}
                stroke={on ? COLORS[i % COLORS.length] : 'var(--border)'}
                strokeWidth={on ? 1 : 0.5}
                strokeOpacity={on ? 0.4 : 0.2}
                strokeDasharray={on ? 'none' : '3 5'}
              />
            )
          })}

          {/* Gateway */}
          <circle cx={CX} cy={CY} r={29} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={1.5} />
          <text x={CX} y={CY - 5} textAnchor="middle" fill="var(--accent)" fontFamily="var(--font-mono)" fontSize={7} fontWeight={700}>GATEWAY</text>
          <text x={CX} y={CY + 7} textAnchor="middle" fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={5.5}>192.168.178.1</text>

          {/* Device nodes */}
          {placed.map((d, i) => {
            const angle = (2 * Math.PI * i) / placed.length - Math.PI / 2
            const x = CX + R * Math.cos(angle), y = CY + R * Math.sin(angle)
            const lx = CX + (R + 40) * Math.cos(angle), ly = CY + (R + 40) * Math.sin(angle)
            const anchor = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle'
            const color  = COLORS[i % COLORS.length]
            const on     = d.status === 'up'
            const isSel  = selected?.mac === d.mac
            const label  = d.hostname !== 'unknown' ? d.hostname : d.ip

            return (
              <g key={d.mac} className="topo-node" style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); setSelected(isSel ? null : d) }}>
                {isSel && <circle cx={x} cy={y} r={19} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.8} />}
                <circle cx={x} cy={y} r={13} fill="var(--bg-surface)" stroke={on ? color : 'var(--border)'} strokeWidth={on ? 1.5 : 1} opacity={on ? 1 : 0.45} />
                {on && <circle cx={x + 8} cy={y - 8} r={3.5} fill="#22c55e" stroke="var(--bg-surface)" strokeWidth={1} />}
                <text x={x} y={y + 4} textAnchor="middle" fill={on ? color : 'var(--text-secondary)'} fontFamily="var(--font-mono)" fontSize={8} fontWeight={700}>{osLetter(d.os)}</text>
                <text x={lx} y={ly + 3} textAnchor={anchor} fill={on ? 'var(--text-primary)' : 'var(--text-secondary)'} fontFamily="var(--font-mono)" fontSize={7} fontWeight={on ? 600 : 400}>
                  {label.length > 17 ? label.slice(0, 16) + '…' : label}
                </text>
                <text x={lx} y={ly + 12} textAnchor={anchor} fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={5.5}>{d.ip}</text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Selected popup */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.65rem 0.9rem', minWidth: 200, maxWidth: 280, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: 20, fontFamily: 'var(--font-mono)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{selected.hostname !== 'unknown' ? selected.hostname : selected.ip}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, display: 'flex' }}><X size={12} /></button>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span>{selected.ip}</span>
            {selected.mac !== 'unknown' && <span>{selected.mac}</span>}
            {selected.vendor && <span>{selected.vendor}</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
              <OsBadge os={selected.os} />
              <OnlineBadge status={selected.status} />
            </div>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: '0.4rem', opacity: 0.6 }}>
        scroll / pinch to zoom · drag · click a node for details
      </div>
    </div>
  )
}

// ── Overview section ───────────────────────────────────────
function OverviewSection({ devices, stats, weekData, isMobile }) {
  const online = devices.filter(d => d.status === 'up').length
  const osBreakdown = Object.entries(
    devices.reduce((acc, d) => { const os = d.os || 'Unknown'; acc[os] = (acc[os] || 0) + 1; return acc }, {})
  ).sort((a, b) => b[1] - a[1])

  const pieData = stats.map((s, i) => ({
    name: s.hostname && s.hostname !== 'unknown' ? s.hostname : (s.ip_address || '?'),
    value: s.connection_count || 0,
    color: COLORS[i % COLORS.length],
  }))

  const ipKeys = Object.keys(weekData[0] || {}).filter(k => k !== 'day')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total devices', value: devices.length, icon: <Monitor size={15} />, color: 'var(--card-air-accent)' },
          { label: 'Online now', value: online, icon: <Wifi size={15} />, color: '#22c55e', sub: `${devices.length - online} offline` },
          { label: 'Total connections', value: stats.reduce((s, d) => s + (d.connection_count || 0), 0), icon: <Activity size={15} />, color: 'var(--card-hum-accent)' },
          { label: 'OS types', value: osBreakdown.length, icon: <Cpu size={15} />, color: 'var(--card-shop-accent)' },
        ].map(({ label, value, icon, color, sub }) => (
          <div key={label} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1rem' }}>
            <span style={{ color, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: `${color}18`, flexShrink: 0 }}>{icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{label}</div>
              {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color, marginTop: '0.1rem' }}>{sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        {/* Pie */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><BarChart2 size={15} /></div>
            <span className="card-header-title">Connection distribution</span>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            {pieData.length === 0 ? (
              <div className="empty-state"><Monitor size={28} /><div>No data</div></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius="42%" outerRadius="65%" paddingAngle={3} dataKey="value">
                    {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v} conn.`, name]} />
                  <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}
                    formatter={(value, entry) => {
                      const tot = pieData.reduce((s, d) => s + d.value, 0)
                      return `${value} (${tot ? ((entry.payload.value / tot) * 100).toFixed(1) : 0}%)`
                    }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* OS breakdown */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Cpu size={15} /></div>
            <span className="card-header-title">Operating systems</span>
          </div>
          <div style={{ padding: '1rem' }}>
            {osBreakdown.map(([os, count]) => (
              <div key={os} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.65rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: OS_COLOR[os] || 'var(--text-secondary)', minWidth: 82 }}>
                  {OS_ICON[os] || <Cpu size={12} />} {os}
                </span>
                <div style={{ flex: 1, height: 6, background: 'var(--bg-muted)', borderRadius: 99 }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${(count / devices.length) * 100}%`, background: OS_COLOR[os] || 'var(--text-secondary)', transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 18, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly activity */}
      {weekData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Activity size={15} /></div>
            <span className="card-header-title">Weekly activity</span>
          </div>
          <div className="card-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData} barGap={2} margin={{ left: -10, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }} width={28} />
                <Tooltip {...TOOLTIP_STYLE} />
                {ipKeys.length > 1 && <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />}
                {ipKeys.map((ip, i) => <Bar key={ip} dataKey={ip} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={22} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Uptime table */}
      <div className="card">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Wifi size={15} /></div>
          <span className="card-header-title">Device status</span>
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
  )
}

// ── History view ───────────────────────────────────────────
function HistoryView({ history, devices }) {
  const [filter, setFilter] = useState('')
  const byMac = Object.fromEntries(devices.map(d => [d.mac, d]))
  const macs  = Object.keys(history).filter(mac => {
    const d = byMac[mac]
    return `${d?.hostname ?? ''} ${d?.ip ?? ''} ${mac}`.toLowerCase().includes(filter.toLowerCase())
  })

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Clock size={15} /></div>
        <span className="card-header-title">Connection history</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={12} style={{ color: 'var(--text-secondary)' }} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter devices…"
            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.3rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', outline: 'none', width: 150 }} />
        </div>
      </div>
      <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {macs.length === 0 ? (
          <div className="empty-state"><Clock size={28} /><div>No data available</div></div>
        ) : macs.map(mac => {
          const d       = byMac[mac]
          const label   = d ? (d.hostname !== 'unknown' ? d.hostname : d.ip) : mac
          const entries = history[mac] || []
          return (
            <div key={mac} style={{ borderBottom: '1px solid var(--border)', padding: '0.75rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent)' }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{mac}</span>
                <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{entries.length} events</span>
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

// ── Main ───────────────────────────────────────────────────
export default function SecurityPage() {
  const [tab,          setTab]          = useState('overview')
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
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 640)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [devs, st, days, al] = await Promise.all([
        api.devices().catch(() => []),
        api.stats().catch(() => []),
        api.connDays().catch(() => ({})),
        api.alerts().catch(() => []),
      ])
      setDevices(devs)
      setStats(st)
      setAlerts(al)
      const transformed = DAYS.map((day, i) => {
        const entry = { day }
        Object.entries(days).forEach(([ip, counts]) => {
          entry[ip] = Array.isArray(counts) ? (counts[i] || 0) : 0
        })
        return entry
      })
      setWeekData(transformed)
    } finally {
      setLoading(false)
      setRefreshing(false)
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
  }, [tab])

  const handlePortScan = async mac => {
    setScanningPort(mac)
    try {
      const r = await api.portScan(mac)
      setDevices(prev => prev.map(d => d.mac === mac ? { ...d, open_ports: r.ports } : d))
    } finally { setScanningPort(null) }
  }

  const handleOsScan = async mac => {
    setScanningOs(mac)
    try {
      const r = await api.osScan(mac)
      setDevices(prev => prev.map(d => d.mac === mac ? { ...d, os: r.os, os_detail: r.os_detail } : d))
    } finally { setScanningOs(null) }
  }

  const filtered = devices.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return [(d.hostname || ''), d.ip, (d.mac || ''), (d.vendor || ''), (d.os || '')].join(' ').toLowerCase().includes(q)
  })

  const online = devices.filter(d => d.status === 'up').length

  return (
    <div className="page animate-fade">
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">Secu<span style={{ color: 'var(--accent)' }}>rity</span></h1>
          <p className="page-subtitle">Network and security monitoring</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge--success">
            <span className="dot dot--green dot--pulse" /> {online}/{devices.length} online
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
          <button className="btn btn--ghost btn--sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            {!isMobile && 'Refresh'}
          </button>
        </div>
      </div>

      {showAlerts && (
        <>
          <div onClick={() => setShowAlerts(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.4)' }} />
          <AlertPanel
            alerts={alerts}
            onClear={async () => { await api.clearAlerts(); setAlerts([]); setShowAlerts(false) }}
            onClose={() => setShowAlerts(false)}
          />
        </>
      )}

      <TabBar active={tab} onChange={setTab} />

      {loading && tab !== 'threats' ? (
        <div className="loading-box" style={{ height: 300 }}><span className="spinner" /></div>
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewSection devices={devices} stats={stats} weekData={weekData} isMobile={isMobile} />
          )}

          {tab === 'devices' && (
            <div className="card">
              <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Monitor size={15} /></div>
                <span className="card-header-title">Connected devices</span>
                <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{filtered.length}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                    style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.28rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)', outline: 'none', width: isMobile ? 110 : 140 }} />
                  {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={12} /></button>}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="empty-state"><Monitor size={28} /><div>No devices found</div></div>
              ) : isMobile ? (
                <div style={{ padding: '0.75rem' }}>
                  {filtered.map((d, i) => (
                    <DeviceCard key={d.mac || i} device={d} colorIdx={i}
                      onPortScan={handlePortScan} onOsScan={handleOsScan}
                      scanningPort={scanningPort} scanningOs={scanningOs} />
                  ))}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Hostname</th><th>IP</th><th>MAC</th><th>Vendor</th><th>OS</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {filtered.map((d, i) => (
                        <DeviceRow key={d.mac || i} device={d} colorIdx={i}
                          onPortScan={handlePortScan} onOsScan={handleOsScan}
                          scanningPort={scanningPort} scanningOs={scanningOs} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'topology' && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-icon" style={{ background: 'var(--card-sec-bg)', color: 'var(--card-sec-accent)' }}><Globe size={15} /></div>
                <span className="card-header-title">Network topology</span>
                <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{devices.length} nodes</span>
              </div>
              <div style={{ padding: '1rem' }}>
                {devices.length === 0
                  ? <div className="empty-state"><Globe size={28} /><div>No devices</div></div>
                  : <TopologyMap devices={devices} />
                }
              </div>
            </div>
          )}

          {tab === 'history' && (
            <HistoryView history={history} devices={devices} />
          )}

          {tab === 'threats' && (
            <HoneypotSection isMobile={isMobile} />
          )}
        </>
      )}
    </div>
  )
}