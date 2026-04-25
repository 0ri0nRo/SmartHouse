import { useState, useEffect, useRef } from 'react'
import {
  Activity, Terminal, Shield, RefreshCw, Play, X,
  Power, RotateCcw, Cpu, Wifi, FileText, Package,
  AlertTriangle, Server, Zap, MapPin, Plus, Move, Save, Trash2,
  ZoomIn, ZoomOut,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── CONSTANTS ─────────────────────────────────────────────────
const SENSOR_PIN_RADIUS = 4
const SENSOR_PULSE_RADIUS = 9
const MAP_ZOOM_MIN = 0.5
const MAP_ZOOM_MAX = 3.0
const MAP_ZOOM_STEP = 0.1

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow-md)',
  },
}

const FLOOR_ROOMS = [
  { id: 'camera1',   label: 'Bedroom',         area: '16.11 m²', x: 2.5,  y: 4,  w: 39, h: 38 },
  { id: 'ufficio',   label: 'Office',          area: '2.59 m²',  x: 41.5, y: 4,  w: 11, h: 14 },
  { id: 'cucina',    label: 'Kitchen',         area: '23.54 m²', x: 2.5,  y: 42, w: 39, h: 30 },
  { id: 'sala',      label: 'Dining room',     area: '21.78 m²', x: 52.5, y: 4,  w: 45, h: 54 },
  { id: 'bagno',     label: 'Bathroom',        area: '5.63 m²',  x: 52.5, y: 58, w: 29, h: 21 },
  { id: 'camera2',   label: 'Bedroom 2',       area: '6.16 m²',  x: 52.5, y: 79, w: 45, h: 18 },
          { id: 'corridoio', label: 'Hallway',          area: '',         x: 41.5, y: 18, w: 11, h: 54 },
]

const PLAN_TYPES = [
  { id: 'temp_hum', label: 'Temp + Humidity', icon: '🌡️', color: '#f59e0b' },
  { id: 'temp',     label: 'Temperature',     icon: '🌡️', color: '#ef4444' },
  { id: 'humidity', label: 'Humidity',        icon: '💧', color: '#2563eb' },
  { id: 'motion',   label: 'Motion',          icon: '👁️', color: '#8b5cf6' },
  { id: 'door',     label: 'Door',            icon: '🚪', color: '#10b981' },
  { id: 'air',      label: 'Air',             icon: '🌬️', color: '#06b6d4' },
]

const PLAN_META = Object.fromEntries(PLAN_TYPES.map(t => [t.id, t]))

const n = (v) => { const x = parseFloat(v); return isNaN(x) ? null : x }
const fmt = (bytes) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// ── GAUGE RING ────────────────────────────────────────────────
let gaugeIdCounter = 0
function GaugeRing({ value, max = 100, color, size = 110, label, unit = '%', sublabel, alertColor }) {
  const uid = useRef(`gauge_${gaugeIdCounter++}`)
  const pct = value != null ? Math.min(Math.max(value / max, 0), 1) : 0
  const r = 34, cx = 50, cy = 50
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  const gradId = uid.current
  const displayColor = alertColor || color

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="55%" stopColor={displayColor} stopOpacity="0.85" />
            <stop offset="100%" stopColor={displayColor} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-surface-3)" strokeWidth={9} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={`url(#${gradId})`} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)' }}
        />
        <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="central"
          fontFamily="'JetBrains Mono', monospace" fontSize={18} fontWeight={700}
          fill={alertColor || 'var(--text-primary)'}>
          {value != null ? (value % 1 === 0 ? value : value.toFixed(1)) : '—'}
        </text>
        <text x={cx} y={cy + 11} textAnchor="middle"
          fontFamily="'JetBrains Mono', monospace" fontSize={8} fontWeight={500}
          fill="var(--text-secondary)">
          {unit}
        </text>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: '0.62rem', color: alertColor || displayColor, marginTop: 2, fontWeight: 600 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  )
}

// ── PROGRESS ROW ──────────────────────────────────────────────
function ProgressRow({ label, value, max = 100, color, unit = '%', warn }) {
  const pct = value != null ? Math.min(Math.max((value / max) * 100, 0), 100) : 0
  const c = warn ? '#ef4444' : color
  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: warn ? '#ef4444' : 'var(--text-primary)' }}>
          {value != null ? `${value % 1 === 0 ? value : value.toFixed(1)}${unit}` : '—'}
        </span>
      </div>
      <div style={{ height: 7, background: 'var(--bg-surface-3)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99, width: `${pct}%`,
          background: `linear-gradient(90deg, #2563eb, ${c})`,
          transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}

// ── PANEL — non-collapsible card ──────────────────────────────
function Panel({ icon: Icon, title, accent = 'var(--accent)', badge, action, children, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-header">
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: `${accent}14`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${accent}20`,
        }}>
          <Icon size={15} />
        </div>
        <span className="card-header-title">{title}</span>
        {badge != null && (
          <span style={{
            marginLeft: '0.4rem', padding: '2px 8px', borderRadius: 99,
            background: `${accent}12`, color: accent,
            fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700,
            border: `1px solid ${accent}22`,
          }}>{badge}</span>
        )}
        {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
      </div>
      <div style={{ padding: '1rem' }}>{children}</div>
    </div>
  )
}

// ── STATUS PILL ───────────────────────────────────────────────
function StatusPill({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      padding: '0.15rem 0.55rem', borderRadius: 99,
      background: active ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
      color: active ? '#10b981' : '#ef4444',
      border: `1px solid ${active ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)'}`,
      fontFamily: 'var(--font-mono)', fontSize: '0.60rem', fontWeight: 700, flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%',
        background: active ? '#10b981' : '#ef4444',
        animation: active ? 'led-pulse 2s infinite' : 'none' }} />
      {active ? 'active' : 'inactive'}
    </span>
  )
}

// ── SSH PANEL ─────────────────────────────────────────────────
function SshPanel() {
  const { toast, showToast } = useToast()
  const [mode, setMode] = useState('server')
  const [port, setPort] = useState('2244')
  const [keyFile, setKeyFile] = useState(null)
  const [keyName, setKeyName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [command, setCommand] = useState('')
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(false)
  const termRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [lines])

  const addLine = (type, text) =>
    setLines(prev => [...prev, { type, text, ts: new Date().toLocaleTimeString('it-IT') }])

  const run = async () => {
    if (!command.trim()) { showToast('Enter a command', 'error'); return }
    const portNum = parseInt(port, 10)
    if (!portNum || portNum < 1 || portNum > 65535) { showToast('Invalid port', 'error'); return }
    setLoading(true)
    addLine('info', `$ ${command}`)
    try {
      let res
      if (mode === 'server') {
        res = await fetch('/api/ssh_exec_host', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, port: portNum }),
        })
      } else {
        const keyText = await keyFile.text()
        res = await fetch('/api/ssh_exec', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: '192.168.178.101', port: portNum, username: 'orion',
            privateKey: keyText, passphrase: passphrase || undefined, command }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'SSH error')
      addLine('output', data.output || '(no output)')
    } catch (e) { addLine('error', e.message) }
    finally { setLoading(false) }
  }

  const LINE_COLOR = { info: 'var(--accent)', output: '#7a9ac0', error: '#f87171' }
  const QUICK = ['df -h', 'free -h', 'uptime', 'who', 'top -bn1 | head -5']

  return (
    <Panel icon={Terminal} title="SSH Terminal" accent="var(--accent)"
      action={
        lines.length > 0
          ? <button onClick={() => setLines([])} className="btn btn--ghost btn--sm"
              style={{ fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <X size={10} /> Clear
            </button>
          : null
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {/* Mode + Port */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {[{ id: 'server', label: '🔑 Server key' }, { id: 'upload', label: '📂 Upload key' }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`btn btn--sm ${mode === m.id ? 'btn--primary' : 'btn--ghost'}`}
              style={{ fontSize: '0.72rem' }}>{m.label}</button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Port</span>
            <input className="input input--mono" type="number" min="1" max="65535"
              value={port} onChange={e => setPort(e.target.value)}
              style={{ width: 68, textAlign: 'center', fontSize: '0.78rem', padding: '0.25rem 0.5rem' }} />
          </div>
        </div>

        {mode === 'server' && (
          <div style={{ padding: '0.55rem 0.75rem', borderRadius: 8, background: 'var(--bg-surface-2)',
            borderLeft: '3px solid var(--accent)', fontSize: '0.72rem', color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)' }}>
            Use <span style={{ color: 'var(--accent)' }}>/run/secrets/id_rsa</span>
            {' '}· port <span style={{ color: 'var(--accent)' }}>{port}</span>
          </div>
        )}

        {mode === 'upload' && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pem,.key,*"
                onChange={e => { const f = e.target.files?.[0]; if (f) { setKeyFile(f); setKeyName(f.name) } }} />
              <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}
                style={{ fontSize: '0.72rem' }}>Choose file</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                color: keyName ? 'var(--text-secondary)' : 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {keyName || 'No file selected'}
              </span>
              {keyFile && (
                <button className="btn btn--ghost btn--sm"
                  onClick={() => { setKeyFile(null); setKeyName(''); fileRef.current.value = '' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <input type="password" className="input input--mono" value={passphrase}
              onChange={e => setPassphrase(e.target.value)} placeholder="Passphrase (optional)" />
          </>
        )}

        {/* Command input */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input className="input input--mono" value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && run()}
            placeholder="ls -la" style={{ flex: 1 }} />
          <button className="btn btn--primary" onClick={run} disabled={loading} style={{ flexShrink: 0 }}>
            {loading
              ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Play size={14} />}
          </button>
        </div>

        {/* Quick commands */}
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {['df -h', 'free -h', 'uptime', 'who', 'top -bn1 | head -5'].map(cmd => (
            <button key={cmd} onClick={() => setCommand(cmd)}
              className="btn btn--ghost btn--sm"
              style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', padding: '2px 7px' }}>{cmd}</button>
          ))}
        </div>

        {/* Terminal output */}
        <div ref={termRef} style={{
          background: '#080f24', borderRadius: 10, padding: '0.8rem 1rem',
          fontFamily: 'var(--font-mono)', fontSize: '0.73rem', lineHeight: 1.7,
          maxHeight: 220, minHeight: 72, overflowY: 'auto',
          border: '1px solid rgba(37,99,235,0.15)',
        }}>
          {lines.length === 0
            ? <span style={{ color: 'rgba(255,255,255,0.14)' }}>Ready · type a command and press ↵</span>
            : lines.map((l, i) => (
              <div key={i}>
                <span style={{ color: 'rgba(255,255,255,0.18)', marginRight: '0.5rem', userSelect: 'none' }}>{l.ts}</span>
                <span style={{ color: LINE_COLOR[l.type] || '#c8e0f8', whiteSpace: 'pre-wrap' }}>{l.text}</span>
              </div>
            ))}
        </div>
      </div>
      <Toast toast={toast} />
    </Panel>
  )
}

// ── POWER PANEL ───────────────────────────────────────────────
function PowerPanel() {
  const { toast, showToast } = useToast()
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(null)

  const execute = async (action) => {
    setLoading(action)
    try {
      const res = await fetch(`/api/system/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(null); setConfirm(null) }
  }

  return (
    <Panel icon={Power} title="Power" accent="#ef4444">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ padding: '0.45rem 0.65rem', borderRadius: 8,
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
          fontSize: '0.70rem', color: '#b45309', fontWeight: 500 }}>
          ⚠ Physical actions on the device
        </div>
        {[
          { action: 'reboot',   icon: RotateCcw, label: 'Reboot', color: '#f59e0b' },
          { action: 'shutdown', icon: Power,     label: 'Shutdown',  color: '#ef4444' },
        ].map(({ action, icon: Icon, label, color }) =>
          confirm === action ? (
            <div key={action} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.70rem', color: '#b45309', flex: 1, fontWeight: 500 }}>Confirm {label.toLowerCase()}?</span>
              <button className="btn btn--danger btn--sm" onClick={() => execute(action)} disabled={loading === action}>
                {loading === action
                  ? <RefreshCw size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
                  : 'Yes'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>No</button>
            </div>
          ) : (
            <button key={action} className="btn btn--ghost btn--full"
              style={{ color, borderColor: `${color}30`, background: `${color}07`,
                justifyContent: 'flex-start', gap: '0.5rem', fontSize: '0.78rem' }}
              onClick={() => setConfirm(action)}>
              <Icon size={13} /> {label}
            </button>
          )
        )}
      </div>
      <Toast toast={toast} />
    </Panel>
  )
}

// ── SERVICES PANEL ────────────────────────────────────────────
function ServicesPanel() {
  const { toast, showToast } = useToast()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const load = async () => {
    try {
      const data = await fetch('/api/services').then(r => r.json())
      setServices(Array.isArray(data) ? data : (data.services ?? []))
    } catch { showToast('Error loading services', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const act = async (service, action) => {
    const key = `${service}:${action}`
    setActing(key)
    try {
      const res = await fetch(`/api/services/${service}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${service} ${action}ed`, 'success')
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setActing(null) }
  }

  return (
    <Panel icon={Server} title="Services" accent="#2563eb" badge={services.length || undefined}
      action={
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
          <RefreshCw size={10} />
        </button>
      }>
      {loading ? (
        <div className="loading-box" style={{ padding: '1rem' }}><span className="spinner" /></div>
      ) : services.length === 0 ? (
        <div className="empty-state" style={{ padding: '1rem' }}><Server size={22} /><div>No services</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 280, overflowY: 'auto' }}>
          {services.map(svc => (
            <div key={svc.service} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.45rem 0.6rem', borderRadius: 10,
              background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
            }}>
              <StatusPill active={svc.isActive} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.70rem', color: 'var(--text-primary)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.service}</span>
              <div style={{ display: 'flex', gap: '0.2rem' }}>
                {['start', 'stop', 'restart'].map(action => {
                  const key = `${svc.service}:${action}`
                  return (
                    <button key={action} className="btn btn--ghost btn--sm"
                      style={{ fontSize: '0.58rem', padding: '2px 5px' }}
                      disabled={acting === key} onClick={() => act(svc.service, action)}>
                      {acting === key
                        ? <RefreshCw size={9} style={{ animation: 'spin 0.8s linear infinite' }} />
                        : action}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <Toast toast={toast} />
    </Panel>
  )
}

// ── PROCESSES PANEL ───────────────────────────────────────────
function ProcessesPanel() {
  const { toast, showToast } = useToast()
  const [procs, setProcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [killing, setKilling] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/processes').then(r => r.json())
      setProcs(Array.isArray(data) ? data : [])
    } catch { showToast('Error loading processes', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const kill = async (pid, name) => {
    if (!window.confirm(`Terminare ${name} (PID ${pid})?`)) return
    setKilling(pid)
    try {
      const res = await fetch(`/api/processes/${pid}/kill`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setKilling(null) }
  }

  const MiniBar = ({ pct, color }) => (
    <div style={{ width: 38, height: 4, background: 'var(--bg-surface-3)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )

  return (
    <Panel icon={Activity} title="Processes" accent="#8b5cf6"
      action={
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
          <RefreshCw size={10} />
        </button>
      }>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>PID</th><th>Name</th><th>CPU</th><th>RAM</th><th></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1.2rem' }}><span className="spinner" /></td></tr>
            ) : procs.slice(0, 10).map(p => (
              <tr key={p.pid}>
                <td className="td-mono td-muted" style={{ fontSize: '0.68rem' }}>{p.pid}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', maxWidth: 100,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MiniBar pct={p.cpu} color={p.cpu > 50 ? '#ef4444' : '#2563eb'} />
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
                      color: p.cpu > 50 ? '#ef4444' : 'var(--text-secondary)' }}>{p.cpu.toFixed(1)}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MiniBar pct={p.mem} color="#8b5cf6" />
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{p.mem.toFixed(1)}</span>
                  </div>
                </td>
                <td>
                  <button className="btn btn--ghost btn--sm"
                    style={{ fontSize: '0.58rem', padding: '1px 5px', color: '#ef4444' }}
                    disabled={killing === p.pid} onClick={() => kill(p.pid, p.name)}>
                    {killing === p.pid
                      ? <RefreshCw size={9} style={{ animation: 'spin 0.8s linear infinite' }} />
                      : <X size={9} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast toast={toast} />
    </Panel>
  )
}

// ── NETWORK PANEL ─────────────────────────────────────────────
function NetworkPanel() {
  const [ifaces, setIfaces] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/network').then(r => r.json())
      setIfaces(Array.isArray(data) ? data : [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <Panel icon={Wifi} title="Network" accent="#10b981" badge={ifaces.length || undefined}
      action={
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
          <RefreshCw size={10} />
        </button>
      }>
      {loading ? (
        <div className="loading-box" style={{ padding: '1rem' }}><span className="spinner" /></div>
      ) : ifaces.length === 0 ? (
        <div className="empty-state" style={{ padding: '1rem' }}><Wifi size={22} /><div>No interfaces</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {ifaces.map(iface => (
            <div key={iface.interface} style={{
              padding: '0.55rem 0.7rem', borderRadius: 10, background: 'var(--bg-surface-2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${iface.isUp ? '#10b981' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700 }}>{iface.interface}</span>
                <span style={{ fontSize: '0.60rem', color: iface.isUp ? '#10b981' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {iface.isUp ? '● UP' : '○ DOWN'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {[['IP', iface.ip || '—'], ['↑', fmt(iface.bytesSent)], ['↓', fmt(iface.bytesRecv)]].map(([k, v]) => (
                  <div key={k}>
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{k} </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ── LOGS PANEL ────────────────────────────────────────────────
function LogsPanel() {
  const [tab, setTab] = useState('system')
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  const load = async (t = tab) => {
    setLoading(true)
    try {
      const data = await fetch(t === 'auth' ? '/api/logs/auth' : '/api/logs/system?lines=60').then(r => r.json())
      setLines(data.lines || [])
      setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, 50)
    } catch { setLines(['Error loading logs']) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(tab) }, [tab])

  return (
    <Panel icon={FileText} title="System Logs" accent="#5a6a8a"
      action={
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {['system', 'auth'].map(t => (
            <button key={t} className={`btn btn--sm ${tab === t ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setTab(t)} style={{ fontSize: '0.65rem' }}>
              {t === 'auth' ? 'Auth' : 'System'}
            </button>
          ))}
          <button className="btn btn--ghost btn--sm" onClick={() => load(tab)} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
            <RefreshCw size={10} />
          </button>
        </div>
      }>
      <div ref={boxRef} style={{
        background: '#080f24', borderRadius: 10, padding: '0.75rem 0.9rem',
        fontFamily: 'var(--font-mono)', fontSize: '0.68rem', lineHeight: 1.65,
        maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(37,99,235,0.12)', color: '#7a9ac0',
      }}>
        {loading
          ? <span style={{ color: 'var(--text-secondary)' }}>Loading…</span>
          : lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </Panel>
  )
}

// ── UPGRADE PANEL ─────────────────────────────────────────────
function UpgradePanel() {
  const { toast, showToast } = useToast()
  const [state, setState] = useState(null)
  const [polling, setPolling] = useState(false)
  const boxRef = useRef(null)

  const startUpgrade = async () => {
    try {
      const res = await fetch('/api/system/upgrade/start', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPolling(true)
    } catch (e) { showToast(e.message, 'error') }
  }

  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      try {
        const data = await fetch('/api/system/upgrade/status').then(r => r.json())
        setState(data)
        setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, 50)
        if (data.done) {
          setPolling(false)
          showToast(data.error ? 'Update failed' : 'Completed', data.error ? 'error' : 'success')
        }
      } catch { setPolling(false) }
    }, 1500)
    return () => clearInterval(id)
  }, [polling])

  return (
    <Panel icon={Package} title="Updates" accent="#f59e0b">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ padding: '0.45rem 0.65rem', borderRadius: 8,
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
          fontSize: '0.70rem', color: '#b45309', fontFamily: 'var(--font-mono)' }}>
          <code style={{ background: 'var(--bg-surface-2)', padding: '1px 5px', borderRadius: 4 }}>apt update && upgrade -y</code>
        </div>
        <button className="btn btn--warning btn--full" onClick={startUpgrade} disabled={polling}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
          {polling
            ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> In progress…</>
            : <><Package size={13} /> Start upgrade</>}
        </button>
        {state && (
          <div ref={boxRef} style={{ background: '#080f24', borderRadius: 10, padding: '0.75rem 0.9rem',
            fontFamily: 'var(--font-mono)', fontSize: '0.68rem', lineHeight: 1.65,
            maxHeight: 200, overflowY: 'auto', border: '1px solid rgba(37,99,235,0.12)', color: '#7a9ac0' }}>
            {state.output.map((l, i) => <div key={i}>{l}</div>)}
            {state.done && !state.error && <div style={{ color: '#10b981', marginTop: '0.5rem' }}>✓ Completed.</div>}
            {state.error && <div style={{ color: '#f87171', marginTop: '0.5rem' }}>✗ {state.error}</div>}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </Panel>
  )
}

// ── FLOORPLAN PANEL ───────────────────────────────────────────
function FloorplanPanel() {
  const { toast, showToast } = useToast()
  const svgRef = useRef(null)
  const fileRef = useRef(null)
  const dragOffset = useRef({ x: 0, y: 0 })

  const [sensors, setSensors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [pendingPos, setPendingPos] = useState(null)
  const [form, setForm] = useState({ name: '', type: 'temp_hum', room_id: '', topic: '' })
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('raspi-floorplan-image') || '')
  const [mapZoom, setMapZoom] = useState(1)

  const selectedSensor = sensors.find(s => s.id === selectedId) || null

  const loadSensors = async () => {
    try {
      const data = await fetch('/api/sensors').then(r => r.json())
      setSensors(Array.isArray(data) ? data : [])
    } catch { showToast('Error loading sensors', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { loadSensors() }, [])

  const uploadFloorplan = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      setBgImage(dataUrl)
      localStorage.setItem('raspi-floorplan-image', dataUrl)
      showToast('Floorplan uploaded', 'success')
    }
    reader.onerror = () => showToast('Error reading image', 'error')
    reader.readAsDataURL(file)
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  const getSvgCoords = (e) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: parseFloat(clamp(x, 1.2, 98.8).toFixed(2)), y: parseFloat(clamp(y, 1.2, 98.8).toFixed(2)) }
  }

  const onSvgClick = (e) => {
    if (!addMode) { setSelectedId(null); return }
    const pos = getSvgCoords(e)
    setPendingPos(pos)
    setForm({ name: '', type: 'temp_hum', room_id: '', topic: '' })
    setAddMode(false)
  }

  const onPinMouseDown = (e, sensor) => {
    if (!editMode) return
    e.preventDefault()
    const { x, y } = getSvgCoords(e)
    dragOffset.current = { x: x - sensor.x, y: y - sensor.y }
    setDragging(sensor.id)
  }

  const handleMove = (e) => {
    if (!dragging) return
    const { x, y } = getSvgCoords(e)
    const nx = parseFloat((x - dragOffset.current.x).toFixed(2))
    const ny = parseFloat((y - dragOffset.current.y).toFixed(2))
    setSensors(prev => prev.map(s =>
      s.id === dragging ? { ...s, x: clamp(nx, 1.2, 98.8), y: clamp(ny, 1.2, 98.8) } : s
    ))
  }

  const handleUp = async () => {
    if (!dragging) return
    const s = sensors.find(item => item.id === dragging)
    setDragging(null)
    if (!s) return
    try {
      await fetch(`/api/sensors/${s.id}/position`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: s.x, y: s.y }),
      })
    } catch { showToast('Error saving position', 'error') }
  }

  useEffect(() => {
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, sensors])

  const saveNewSensor = async () => {
    if (!pendingPos || !form.name.trim()) { showToast('Sensor name is required', 'error'); return }
    try {
      const res = await fetch('/api/sensors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...pendingPos, name: form.name.trim() }),
      })
      if (!res.ok) throw new Error()
      showToast('Sensor added', 'success')
      setPendingPos(null)
      await loadSensors()
    } catch { showToast('Error adding sensor', 'error') }
  }

  const deleteSensor = async () => {
    if (!selectedSensor || !window.confirm(`Delete ${selectedSensor.name}?`)) return
    try {
      const res = await fetch(`/api/sensors/${selectedSensor.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setSelectedId(null)
      showToast('Sensor deleted', 'success')
      await loadSensors()
    } catch { showToast('Error deleting sensor', 'error') }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="card-header">
        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(37,99,235,0.10)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(37,99,235,0.18)' }}>
          <MapPin size={15} />
        </div>
        <span className="card-header-title">Home Map</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
          {sensors.length} sensors
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          <button className={`btn btn--sm ${addMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => { setAddMode(v => !v); setEditMode(false); setPendingPos(null) }}
            style={{ fontSize: '0.65rem' }}>
            <Plus size={11} /> {addMode ? 'Click…' : 'Add'}
          </button>
          <button className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => { setEditMode(v => !v); setAddMode(false); setPendingPos(null) }}
            style={{ fontSize: '0.65rem' }}>
            <Move size={11} /> Move
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => uploadFloorplan(e.target.files?.[0])} />
          <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}
            style={{ fontSize: '0.65rem' }} title="Upload floorplan">
            <MapPin size={11} />
          </button>
          {bgImage && (
            <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.65rem', color: '#ef4444' }}
              onClick={() => { setBgImage(''); localStorage.removeItem('raspi-floorplan-image') }}>
              <X size={11} />
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={loadSensors} style={{ fontSize: '0.65rem' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Zoom + mode banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between',
        padding: '0.35rem 0.875rem', background: 'var(--bg-surface-2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600,
          color: addMode ? 'var(--accent)' : editMode ? '#f59e0b' : 'transparent',
          transition: 'color 0.15s' }}>
          {addMode ? '📍 Click to add' : editMode ? '✋ Drag to move' : '·'}
        </div>
        <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
          <button className="btn btn--ghost btn--sm" style={{ padding: '2px 6px' }}
            onClick={() => setMapZoom(p => Math.max(MAP_ZOOM_MIN, p - 0.2))}><ZoomOut size={11} /></button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', minWidth: '2.2rem', textAlign: 'center' }}>
            {Math.round(mapZoom * 100)}%
          </span>
          <button className="btn btn--ghost btn--sm" style={{ padding: '2px 6px' }}
            onClick={() => setMapZoom(p => Math.min(MAP_ZOOM_MAX, p + 0.2))}><ZoomIn size={11} /></button>
          <button className="btn btn--ghost btn--sm" style={{ fontSize: '0.60rem', padding: '2px 6px' }}
            onClick={() => setMapZoom(1)}>Reset</button>
        </div>
      </div>

      {/* SVG floorplan */}
      <svg ref={svgRef} viewBox="0 0 100 100"
        style={{ width: '100%', aspectRatio: '1.06/1', display: 'block',
          cursor: addMode ? 'crosshair' : 'default', userSelect: 'none', background: '#f7f9ff', flex: 1 }}
        onClick={onSvgClick}
        onWheel={e => {
          e.preventDefault()
          setMapZoom(p => Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, p + (e.deltaY > 0 ? -1 : 1) * MAP_ZOOM_STEP)))
        }}>
        <g transform={`scale(${mapZoom})`} style={{ transformOrigin: '50px 50px', transformBox: 'fill-box' }}>
          <rect x={0} y={0} width={100} height={100} fill="#f7f9ff" />
          {bgImage && (
            <image href={bgImage} x={0} y={0} width={100} height={100}
              preserveAspectRatio="xMidYMid meet" opacity={0.7} />
          )}
          {FLOOR_ROOMS.map(room => (
            <g key={room.id}>
              <rect x={room.x} y={room.y} width={room.w} height={room.h}
                fill={bgImage ? 'transparent' : '#ffffff'} stroke="#c0d0ee" strokeWidth={0.5} rx={0.8} />
              {room.area ? (
                <>
                  <text x={room.x + room.w / 2} y={room.y + room.h / 2 - 1.8}
                    textAnchor="middle" fontSize={2.4} fill="#0d1b3e"
                    fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="700">{room.label}</text>
                  <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 2.7}
                    textAnchor="middle" fontSize={1.6} fill="#7a8faa"
                    fontFamily="'Plus Jakarta Sans', sans-serif">{room.area}</text>
                </>
              ) : (
                <text x={room.x + room.w / 2} y={room.y + room.h / 2}
                  textAnchor="middle" dominantBaseline="central" fontSize={1.8}
                  fill="#9ab0cc" fontFamily="'Plus Jakarta Sans', sans-serif"
                  transform={`rotate(-90, ${room.x + room.w / 2}, ${room.y + room.h / 2})`}>
                  Hallway
                </text>
              )}
            </g>
          ))}
          <rect x={2.5} y={4} width={94.5} height={93} fill="none" stroke="#8096b8" strokeWidth={0.8} rx={1} />
          {sensors.map(sensor => {
            const meta = PLAN_META[sensor.type] || PLAN_META.temp_hum
            const selected = selectedId === sensor.id
            return (
              <g key={sensor.id} transform={`translate(${sensor.x}, ${sensor.y})`}
                style={{ cursor: editMode ? 'grab' : 'pointer' }}
                onMouseDown={e => onPinMouseDown(e, sensor)}
                onClick={e => { e.stopPropagation(); if (!editMode) setSelectedId(sensor.id) }}>
                {!editMode && (
                  <circle r={SENSOR_PULSE_RADIUS} fill={meta.color} opacity={0.10}>
                    <animate attributeName="r" values={`${SENSOR_PIN_RADIUS};${SENSOR_PULSE_RADIUS};${SENSOR_PIN_RADIUS}`} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle r={SENSOR_PIN_RADIUS} fill={selected ? meta.color : '#fff'}
                  stroke={meta.color} strokeWidth={selected ? 0 : 1} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={5.5}>{meta.icon}</text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Add form */}
      {pendingPos && (
        <div style={{ padding: '0.65rem 0.875rem', borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface-2)', display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '0.45rem', alignItems: 'center' }}>
          <input className="input" placeholder="Sensor name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {PLAN_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select className="input" value={form.room_id} onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}>
            <option value="">Room</option>
            {FLOOR_ROOMS.filter(r => r.area).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button className="btn btn--primary btn--sm" onClick={saveNewSensor}><Save size={12} /></button>
            <button className="btn btn--ghost btn--sm" onClick={() => setPendingPos(null)}><X size={12} /></button>
          </div>
        </div>
      )}

      {/* Selected sensor */}
      {selectedSensor && (
        <div style={{ padding: '0.65rem 0.875rem', borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '1rem' }}>{(PLAN_META[selectedSensor.type] || PLAN_META.temp_hum).icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{selectedSensor.name}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {selectedSensor.room_name || '—'}
              {selectedSensor.temperature != null ? ` · ${selectedSensor.temperature.toFixed(1)}°C` : ''}
              {selectedSensor.humidity != null ? ` · ${selectedSensor.humidity.toFixed(0)}%` : ''}
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}><X size={12} /></button>
          <button className="btn btn--ghost btn--sm" onClick={deleteSensor}
            style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)' }}><Trash2 size={12} /></button>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────
export default function RaspiPage() {
  const { toast, showToast } = useToast()
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [backing, setBacking] = useState(false)

  const loadStats = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const d = await fetch('/api_raspberry_pi_stats').then(r => r.json())
      setStats(d)
      setHistory(prev => [...prev.slice(-39), {
        ts: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        cpu: n(d.cpuUsage) ?? 0,
        temp: n(d.temperature) ?? 0,
      }])
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(() => loadStats(true), 5000)
    return () => clearInterval(id)
  }, [])

  const cpu     = stats ? n(stats.cpuUsage)    : null
  const temp    = stats ? n(stats.temperature) : null
  const diskUsed  = stats ? n(stats.diskUsed)  : null
  const diskFree  = stats ? n(stats.diskFree)  : null
  const diskTotal = stats ? (n(stats.diskTotal) ?? (diskUsed != null && diskFree != null ? diskUsed + diskFree : null)) : null
  const diskPct   = diskTotal && diskUsed != null ? (diskUsed / diskTotal) * 100 : null
  const memUsed   = stats ? n(stats.memoryUsed)  : null
  const memTotal  = stats ? n(stats.memoryTotal) : null
  const memPct    = memTotal && memUsed != null ? (memUsed / memTotal) * 100 : null
  const cpuHigh   = cpu  != null && cpu  > 80
  const tempHigh  = temp != null && temp > 70

  const backup = async () => {
    setBacking(true)
    try {
      await fetch('/api_run_backup', { method: 'POST' })
      showToast('Backup started', 'success')
    } catch { showToast('Backup error', 'error') }
    finally { setBacking(false) }
  }

  const GAUGES = [
    { value: cpu,      max: 100, color: '#2563eb', label: 'CPU',         unit: '%',  sublabel: cpuHigh  ? '⚠ High' : 'Normal', alertColor: cpuHigh  ? '#ef4444' : undefined },
    { value: temp,     max: 85,  color: '#f59e0b', label: 'Temperature', unit: '°C', sublabel: tempHigh ? '⚠ Risk' : 'OK',     alertColor: tempHigh ? '#ef4444' : undefined },
    { value: diskPct != null ? parseFloat(diskPct.toFixed(1)) : null, max: 100, color: '#10b981', label: 'Disk',    unit: '%',  sublabel: diskUsed != null ? `${diskUsed.toFixed(1)} GB` : null },
    { value: memPct  != null ? parseFloat(memPct.toFixed(1))  : null, max: 100, color: '#8b5cf6', label: 'Memory',  unit: '%',  sublabel: memUsed  != null ? `${memUsed.toFixed(1)} GB`  : null },
  ]

  const DEVICE_ROWS = [
    ['IP',     '192.168.178.101'],
    ['Host',   'raspberrypi'],
    ['SSH',    '2244'],
    ['Disk',   diskTotal ? `${(diskTotal / 1024).toFixed(0)} GB` : '—'],
    ['RAM',    memTotal  ? `${(memTotal / 1024).toFixed(1)} GB`  : '—'],
    ['Load',   stats?.loadAvg ? `${stats.loadAvg['1m']} / ${stats.loadAvg['5m']} / ${stats.loadAvg['15m']}` : '—'],
    ['Uptime', stats?.uptime || '—'],
  ]

  return (
    <div className="page animate-fade rp">

      {/* ── Header ── */}
      <div className="rp-header">
        <div>
          <h1 className="page-title">
            Raspberry <span style={{ color: 'var(--accent)', fontWeight: 400 }}>Pi</span>
          </h1>
          <p className="page-subtitle">System monitoring · Remote control</p>
        </div>
        <div className="rp-badges">
          {tempHigh && <span className="badge badge--danger"><AlertTriangle size={10} /> High temp</span>}
          {cpuHigh  && <span className="badge badge--warning"><Zap size={10} /> High CPU</span>}
          <span className="rp-online-pill">
            <span className="rp-online-dot" />
            Online
          </span>
          {stats?.uptime && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              ↑ {stats.uptime}
            </span>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => loadStats(true)} disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            5s
          </button>
        </div>
      </div>

      {/* ══ BENTO GRID ══ */}
      <div className="rp-bento">

        {/* ── Row 1: Gauges ── */}
        <div className="rp-gauges">
          {GAUGES.map((g, i) => (
            <div key={i} className="card rp-gauge-card" style={{
              borderColor: g.alertColor ? 'rgba(239,68,68,0.28)' : undefined,
              boxShadow: g.alertColor ? '0 0 0 3px rgba(239,68,68,0.07), var(--shadow-sm)' : undefined,
            }}>
              <div style={{ padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <GaugeRing {...g} size={112} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Row 2: Chart + Device Info ── */}
        <div className="rp-row2">

          {/* Live chart */}
          <div className="card rp-chart">
            <div className="card-header">
              <div style={{ width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(245,158,11,0.10)', color: '#f59e0b',
                display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid rgba(245,158,11,0.18)' }}>
                <Activity size={15} />
              </div>
              <span className="card-header-title">Live Trends</span>
              <div style={{ display: 'flex', gap: '0.875rem', marginLeft: '0.75rem' }}>
                {[{ label: 'CPU %', color: '#2563eb' }, { label: 'Temp °C', color: '#f59e0b' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <div style={{ width: 16, height: 3, borderRadius: 2, background: l.color }} />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#10b981', fontWeight: 700 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'led-pulse 2s infinite' }} />5s
              </span>
            </div>
            <div style={{ padding: '0.5rem 0.25rem 0.75rem 0', height: 185 }}>
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ left: -16, right: 8 }}>
                    <defs>
                      <linearGradient id="gcpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gtemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 5" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="ts" tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-muted)' }}
                      axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false} tickLine={false} width={30} domain={[0, 'auto']} />
                    <Tooltip {...TOOLTIP_STYLE}
                      formatter={(v, name) => [`${parseFloat(v).toFixed(1)}${name === 'cpu' ? '%' : '°C'}`, name === 'cpu' ? 'CPU' : 'Temp']} />
                    <Area type="monotone" dataKey="cpu"  stroke="#2563eb" fill="url(#gcpu)"  strokeWidth={2.5} dot={false} />
                    <Area type="monotone" dataKey="temp" stroke="#f59e0b" fill="url(#gtemp)" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="loading-box"><span className="spinner" /></div>
              )}
            </div>
          </div>

          {/* Right: Device info + Progress bars */}
          <div className="rp-info-col">
            <div className="card" style={{ padding: '0.875rem 1rem' }}>
              <div style={{ fontSize: '0.60rem', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.9px', fontFamily: 'var(--font-mono)', marginBottom: '0.6rem' }}>
                Device Info
              </div>
              {DEVICE_ROWS.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'baseline', padding: '0.22rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.70rem',
                    color: 'var(--text-primary)', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: '0.875rem 1rem', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <Cpu size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Live resources</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.60rem', fontFamily: 'var(--font-mono)', color: '#10b981', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#10b981', animation: 'led-pulse 2s infinite' }} />live
                </span>
              </div>
              {loading ? <div className="loading-box" style={{ padding: '0.5rem' }}><span className="spinner" /></div> : (
                <>
                  <ProgressRow label="CPU"     value={cpu}     max={100} color="#2563eb" unit="%" warn={cpuHigh} />
                  <ProgressRow label="Temperature" value={temp} max={85}  color="#f59e0b" unit="°C" warn={tempHigh} />
                  <ProgressRow label="Disk"    value={diskPct} max={100} color="#10b981" unit="%" warn={diskPct != null && diskPct > 85} />
                  <ProgressRow label="Memory"  value={memPct}  max={100} color="#8b5cf6" unit="%" warn={memPct  != null && memPct  > 90} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Floorplan + Control panels ── */}
        <div className="rp-main">
          <div className="rp-floorplan">
            <FloorplanPanel />
          </div>
          <div className="rp-panels-stack">
            <div className="rp-2col">
              <PowerPanel />
              <ServicesPanel />
            </div>
            <div className="rp-2col">
              <ProcessesPanel />
            </div>
            <SshPanel />
          </div>
        </div>

        {/* ── Row 4: Logs + Upgrade + Backup ── */}
        <div className="rp-bottom">
          <LogsPanel />
          <div className="rp-actions-col">
            <UpgradePanel />
            <Panel icon={Shield} title="Backup" accent="#10b981">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ padding: '0.45rem 0.65rem', borderRadius: 8,
                  background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
                  fontSize: '0.70rem', color: '#b45309', lineHeight: 1.5 }}>
                  Snapshot of configuration, user data, packages, and settings.
                </div>
                <button className="btn btn--success btn--full" onClick={backup} disabled={backing}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
                  {backing
                    ? <><RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> In progress…</>
                    : <><Shield size={13} /> Start backup</>}
                </button>
              </div>
            </Panel>
          </div>
        </div>

      </div>

      <Toast toast={toast} />

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes led-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        /* ─ Header ─ */
        .rp-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem;
        }
        .rp-badges {
          display: flex; align-items: center; gap: 0.5rem;
          flex-wrap: wrap; margin-top: 0.4rem;
        }
        .rp-online-pill {
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.22rem 0.7rem; border-radius: 99px;
          background: rgba(16,185,129,0.10); border: 1px solid rgba(16,185,129,0.22);
          color: #10b981; font-family: var(--font-mono); font-size: 0.65rem; font-weight: 700;
        }
        .rp-online-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #10b981; animation: led-pulse 2s infinite;
        }

        /* ─ Bento ─ */
        .rp-bento { display: flex; flex-direction: column; gap: 1rem; }

        /* ─ Row 1: Gauges ─ */
        .rp-gauges { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }

        /* ─ Row 2: Chart + Info ─ */
        .rp-row2 { display: flex; gap: 1rem; align-items: stretch; }
        .rp-chart { flex: 3; min-width: 0; }
        .rp-info-col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 1rem; }

        /* ─ Row 3: Floorplan + Panels ─ */
        .rp-main { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
        .rp-floorplan { height: 100%; }
        .rp-panels-stack { display: flex; flex-direction: column; gap: 1rem; }
        .rp-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

        /* ─ Row 4: Logs + Actions ─ */
        .rp-bottom { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; align-items: start; }
        .rp-actions-col { display: flex; flex-direction: column; gap: 1rem; }

        /* ─ Table ─ */
        .rp .table-wrap { overflow-x: auto; }
        .rp table { min-width: 360px; }

        /* ─ Tablet ─ */
        @media (max-width: 1100px) {
          .rp-gauges { grid-template-columns: repeat(2, 1fr); }
          .rp-main   { grid-template-columns: 1fr; }
          .rp-bottom { grid-template-columns: 1fr; }
          .rp-row2   { flex-direction: column; }
          .rp-info-col { flex-direction: row; flex-wrap: wrap; }
          .rp-info-col > .card { flex: 1; min-width: 200px; }
        }

        /* ─ Mobile ─ */
        @media (max-width: 600px) {
          .rp-header { margin-bottom: 1rem; }
          .rp-2col   { grid-template-columns: 1fr; }
          .rp-info-col { flex-direction: column; }
          .rp-bottom { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}