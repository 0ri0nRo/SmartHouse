import { createElement, useState, useEffect, useCallback, useRef } from 'react'
import {
  Shield, Monitor, RefreshCw, Bell, BellOff, Wifi,
  Cpu, Globe, Server, Smartphone, Laptop, Router, HardDrive,
  ChevronDown, ChevronUp, Scan, Search, X, Clock, Activity,
  AlertTriangle, Check, Calendar, Eye, Bug, Network,
  Zap, BarChart2, History, LineChart, ShieldAlert, Home,
  Settings, LayoutGrid, RotateCcw, Filter,
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

// ── Tab definitions ────────────────────────────────────────
const MAIN_TABS = [
  { id: 'overview',  label: 'Overview',  icon: LayoutGrid   },
  { id: 'topology',  label: 'Topology',  icon: Network       },
  { id: 'threats',   label: 'Threats',   icon: ShieldAlert   },
  { id: 'history',   label: 'History',   icon: History       },
]

// ── Bottom Nav (mobile) ────────────────────────────────────
function BottomNav({ active, onChange, alertCount }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 110,
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
      backdropFilter: 'blur(20px)',
    }}>
      {MAIN_TABS.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        const isThreat = tab.id === 'threats'
        const activeColor = isThreat ? '#ef4444' : 'var(--accent)'

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, padding: '10px 0 8px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: isActive ? activeColor : 'var(--text-muted)',
              position: 'relative', transition: 'color 0.15s',
            }}
          >
            {isActive && (
              <div style={{
                position: 'absolute', top: 0,
                left: '20%', right: '20%',
                height: 2, borderRadius: 1,
                background: activeColor,
              }} />
            )}
            <div style={{ position: 'relative' }}>
              <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
              {tab.id === 'threats' && alertCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -6,
                  width: 14, height: 14, borderRadius: '50%',
                  background: '#ef4444', color: '#fff',
                  fontSize: '0.46rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid var(--bg-surface)',
                }}>{alertCount}</span>
              )}
            </div>
            <span style={{
              fontSize: '0.60rem',
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.2px',
            }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Desktop Tab Bar ────────────────────────────────────────
function DesktopTabBar({ active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: '0.15rem',
      borderBottom: '1px solid var(--border)',
      marginBottom: '1.5rem',
      overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
    }}>
      {MAIN_TABS.map(t => {
        const Icon = t.icon
        const isActive = active === t.id
        const isThreat = t.id === 'threats'
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.55rem 0.75rem',
            border: 'none', background: 'transparent',
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            color: isActive
              ? isThreat ? '#ef4444' : 'var(--accent)'
              : 'var(--text-secondary)',
            position: 'relative', transition: 'color 0.15s',
          }}>
            {isActive && (
              <span style={{
                position: 'absolute', bottom: 0, left: '15%', right: '15%',
                height: 2, borderRadius: 1,
                background: isThreat ? '#ef4444' : 'var(--accent)',
              }} />
            )}
            <Icon size={13} />{t.label}
          </button>
        )
      })}
    </div>
  )
}

function SettingsSection({ label, children }) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{
        fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.8px', color: 'var(--text-muted)',
        marginBottom: 10, fontFamily: 'var(--font-mono)',
      }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function SettingsToggleRow({ icon: Icon, label, desc, active, onToggle, accentColor }) {
  const tone = accentColor || 'var(--accent)'
  const IconNode = Icon
  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
      background: active ? `color-mix(in srgb, ${tone} 10%, transparent)` : 'var(--bg-surface-2)',
      border: `1px solid ${active ? `color-mix(in srgb, ${tone} 35%, transparent)` : 'var(--border)'}`,
      transition: 'all 0.15s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: active ? `color-mix(in srgb, ${tone} 15%, transparent)` : 'rgba(148,163,184,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {createElement(IconNode, { size: 16, style: { color: active ? tone : 'var(--text-muted)' } })}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>{desc}</div>}
      </div>
      <div style={{
        width: 42, height: 24, borderRadius: 999,
        background: active ? tone : 'rgba(148,163,184,0.25)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          left: active ? 21 : 3, transition: 'left 0.2s',
        }} />
      </div>
    </div>
  )
}

function SettingsActionRow({ icon: Icon, label, desc, onClick, danger }) {
  const IconNode = Icon
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 14px', borderRadius: 12,
      background: danger ? 'rgba(239,68,68,0.06)' : 'var(--bg-surface-2)',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: danger ? 'rgba(239,68,68,0.10)' : 'rgba(148,163,184,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {createElement(IconNode, { size: 16, style: { color: danger ? '#f87171' : 'var(--text-secondary)' } })}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: danger ? '#f87171' : 'var(--text-primary)' }}>{label}</div>
        {desc && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>{desc}</div>}
      </div>
    </div>
  )
}

function SettingsContent({
  onlyOnline,
  setOnlyOnline,
  autoRefresh,
  setAutoRefresh,
  onClearAlerts,
  alertCount,
  onRescan,
  onClose,
}) {
  return (
    <>
      <SettingsSection label="View">
        <SettingsToggleRow
          icon={Wifi} label="Online only"
          desc="Hide offline devices from the list"
          active={onlyOnline}
          onToggle={() => setOnlyOnline(v => !v)}
          accentColor="var(--card-hum-accent)"
        />
        <SettingsToggleRow
          icon={RefreshCw} label="Auto-refresh"
          desc="Update every 30 seconds automatically"
          active={autoRefresh}
          onToggle={() => setAutoRefresh(v => !v)}
        />
      </SettingsSection>

      <SettingsSection label="Actions">
        <SettingsActionRow
          icon={Scan} label="Rescan network"
          desc="Force a full device refresh"
          onClick={() => { onRescan(); onClose() }}
        />
        {alertCount > 0 && (
          <SettingsActionRow
            icon={Check} label={`Mark ${alertCount} alert${alertCount !== 1 ? 's' : ''} as read`}
            desc="Clear new-device notifications"
            onClick={() => { onClearAlerts(); onClose() }}
          />
        )}
      </SettingsSection>

      <div style={{ height: 20 }} />
    </>
  )
}

// ── Settings Sheet ─────────────────────────────────────────
function SettingsSheet({
  open, onClose,
  onlyOnline, setOnlyOnline,
  autoRefresh, setAutoRefresh,
  onClearAlerts, alertCount,
  onRescan,
  isMobile,
}) {
  if (!open) return null

  if (isMobile) {
    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          }}
        />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          background: 'var(--bg-surface)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.35)',
          animation: 'slideUp 0.28s cubic-bezier(.32,1.1,.42,1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.35)' }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px 14px', flexShrink: 0,
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Settings</span>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 7px', cursor: 'pointer',
                color: 'var(--text-secondary)', lineHeight: 1,
              }}
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <SettingsContent
              onlyOnline={onlyOnline}
              setOnlyOnline={setOnlyOnline}
              autoRefresh={autoRefresh}
              setAutoRefresh={setAutoRefresh}
              onClearAlerts={onClearAlerts}
              alertCount={alertCount}
              onRescan={onRescan}
              onClose={onClose}
            />
          </div>
        </div>
      </>
    )
  }

  // Desktop: centered modal
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 18, width: '100%', maxWidth: 420,
            maxHeight: '88vh', overflowY: 'auto',
            boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10,
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Settings</span>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 7px', cursor: 'pointer',
                color: 'var(--text-secondary)', lineHeight: 1,
              }}
            >
              <X size={13} />
            </button>
          </div>
          <SettingsContent
            onlyOnline={onlyOnline}
            setOnlyOnline={setOnlyOnline}
            autoRefresh={autoRefresh}
            setAutoRefresh={setAutoRefresh}
            onClearAlerts={onClearAlerts}
            alertCount={alertCount}
            onRescan={onRescan}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  )
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

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Open ports {device.open_ports?.length > 0 && `(${device.open_ports.length})`}
          </div>
          {device.open_ports?.length > 0
            ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>{device.open_ports.map((p, i) => <PortBadge key={i} port={p} />)}</div>
            : <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Not yet scanned</span>
          }
        </div>

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
          <circle cx={CX} cy={CY} r={29} fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth={1.5} />
          <text x={CX} y={CY - 5} textAnchor="middle" fill="var(--accent)" fontFamily="var(--font-mono)" fontSize={7} fontWeight={700}>GATEWAY</text>
          <text x={CX} y={CY + 7} textAnchor="middle" fill="var(--text-secondary)" fontFamily="var(--font-mono)" fontSize={5.5}>192.168.178.1</text>
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total devices',     value: devices.length, icon: <Monitor size={15} />, color: 'var(--card-air-accent)' },
          { label: 'Online now',        value: online,         icon: <Wifi size={15} />,    color: '#22c55e', sub: `${devices.length - online} offline` },
          { label: 'Total connections', value: stats.reduce((s, d) => s + (d.connection_count || 0), 0), icon: <Activity size={15} />, color: 'var(--card-hum-accent)' },
          { label: 'OS types',          value: osBreakdown.length, icon: <Cpu size={15} />, color: 'var(--card-shop-accent)' },
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

// ── Devices list (shared between mobile/desktop) ───────────
function DevicesSection({ filtered, isMobile, search, setSearch, onPortScan, onOsScan, scanningPort, scanningOs }) {
  return (
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
              onPortScan={onPortScan} onOsScan={onOsScan}
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
                  onPortScan={onPortScan} onOsScan={onOsScan}
                  scanningPort={scanningPort} scanningOs={scanningOs} />
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  const [showAlerts,   setShowAlerts]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [search]                    = useState('')
  const [isMobile,     setIsMobile]     = useState(() => window.innerWidth < 640)

  // Settings state
  const [onlyOnline,   setOnlyOnline]   = useState(false)
  const [autoRefresh,  setAutoRefresh]  = useState(true)
  const autoRefreshRef = useRef(autoRefresh)
  useEffect(() => { autoRefreshRef.current = autoRefresh }, [autoRefresh])

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
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) load()
    })
    const id = setInterval(() => {
      if (autoRefreshRef.current) load(true)
    }, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [load])

  useEffect(() => {
    if (tab === 'history' && Object.keys(history).length === 0) {
      api.history().then(setHistory).catch(() => {})
    }
  }, [tab, history])

  const handleClearAlerts = async () => {
    await api.clearAlerts()
    setAlerts([])
    setShowAlerts(false)
  }

  const filtered = devices
    .filter(d => !onlyOnline || d.status === 'up')
    .filter(d => {
      if (!search) return true
      const q = search.toLowerCase()
      return [(d.hostname || ''), d.ip, (d.mac || ''), (d.vendor || ''), (d.os || '')].join(' ').toLowerCase().includes(q)
    })

  const online = devices.filter(d => d.status === 'up').length

  const renderTabContent = () => {
    if (loading && tab !== 'threats') {
      return <div className="loading-box" style={{ height: 300 }}><span className="spinner" /></div>
    }
    switch (tab) {
      case 'overview':
        return <OverviewSection devices={filtered} stats={stats} weekData={weekData} isMobile={isMobile} />
      case 'topology':
        return (
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
        )
      case 'threats':
        return <HoneypotSection isMobile={isMobile} />
      case 'history':
        return <HistoryView history={history} devices={devices} />
      default:
        return null
    }
  }

  // ── MOBILE ──────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-page)',
        color: 'var(--text-primary)',
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
      }}>
        <style>{`
          @keyframes spin    { to { transform: rotate(360deg); } }
          @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:.4; } }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          div::-webkit-scrollbar { display: none; }
        `}</style>

        {/* ── MOBILE HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Shield size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                Secu<span style={{ color: 'var(--accent)' }}>rity</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite', display: 'inline-block' }} />
                {online}/{devices.length} online · 30s
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Alert bell */}
            <button
              onClick={() => setShowAlerts(p => !p)}
              style={{
                width: 36, height: 36, borderRadius: 10, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                cursor: 'pointer', color: alerts.length > 0 ? 'var(--card-temp-accent)' : 'var(--text-secondary)',
              }}
            >
              {alerts.length > 0 ? <Bell size={16} /> : <BellOff size={16} />}
              {alerts.length > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: 'var(--card-temp-accent)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>{alerts.length}</span>
              )}
            </button>

            {/* Refresh */}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              style={{
                width: 36, height: 36, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>

            {/* Gear icon */}
            <button
              onClick={() => setShowSettings(v => !v)}
              style={{
                width: 40, height: 40, borderRadius: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showSettings
                  ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                  : 'var(--bg-surface-2)',
                border: `1px solid ${showSettings
                  ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
                  : 'var(--border)'}`,
                cursor: 'pointer',
                color: showSettings ? 'var(--accent)' : 'var(--text-primary)',
                transition: 'all 0.15s',
              }}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Filter chip if onlyOnline is active */}
        {onlyOnline && (
          <div style={{ padding: '8px 12px 0', display: 'flex', gap: 6 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 600,
              background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
            }}>
              <Wifi size={11} /> Online only
              <button
                onClick={() => setOnlyOnline(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 0, display: 'flex', marginLeft: 2 }}
              ><X size={10} /></button>
            </span>
          </div>
        )}

        {/* Tab content */}
        <div style={{ padding: '12px 12px 0' }}>
          {renderTabContent()}
        </div>

        {/* Alert panel overlay */}
        {showAlerts && (
          <>
            <div onClick={() => setShowAlerts(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.4)' }} />
            <AlertPanel
              alerts={alerts}
              onClear={handleClearAlerts}
              onClose={() => setShowAlerts(false)}
            />
          </>
        )}

        {/* Bottom nav */}
        <BottomNav active={tab} onChange={setTab} alertCount={alerts.length} />

        {/* Settings sheet */}
        <SettingsSheet
          open={showSettings} onClose={() => setShowSettings(false)}
          onlyOnline={onlyOnline} setOnlyOnline={setOnlyOnline}
          autoRefresh={autoRefresh} setAutoRefresh={setAutoRefresh}
          onClearAlerts={handleClearAlerts} alertCount={alerts.length}
          onRescan={() => load(false)} refreshing={refreshing}
          isMobile={true}
        />
      </div>
    )
  }

  // ── DESKTOP ──────────────────────────────────────────────
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
          {onlyOnline && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 600,
              background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
            }}>
              <Filter size={10} /> Online only
              <button onClick={() => setOnlyOnline(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 0, display: 'flex', marginLeft: 1 }}><X size={9} /></button>
            </span>
          )}
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
            Refresh
          </button>

          {/* ── GEAR ICON ── */}
          <button
            onClick={() => setShowSettings(v => !v)}
            title="Settings"
            style={{
              width: 34, height: 34, borderRadius: 9,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: showSettings
                ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                : 'var(--bg-surface-2)',
              border: `1px solid ${showSettings
                ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
                : 'var(--border)'}`,
              cursor: 'pointer',
              color: showSettings ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all 0.15s', flexShrink: 0,
            }}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {showAlerts && (
        <>
          <div onClick={() => setShowAlerts(false)} style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.4)' }} />
          <AlertPanel
            alerts={alerts}
            onClear={handleClearAlerts}
            onClose={() => setShowAlerts(false)}
          />
        </>
      )}

      {/* Settings modal (desktop) */}
      <SettingsSheet
        open={showSettings} onClose={() => setShowSettings(false)}
        onlyOnline={onlyOnline} setOnlyOnline={setOnlyOnline}
        autoRefresh={autoRefresh} setAutoRefresh={setAutoRefresh}
        onClearAlerts={handleClearAlerts} alertCount={alerts.length}
        onRescan={() => load(false)} refreshing={refreshing}
        isMobile={false}
      />

      <DesktopTabBar active={tab} onChange={setTab} />

      {renderTabContent()}
    </div>
  )
}