import { useState, useEffect, useRef } from 'react'
import {
  Activity, Terminal, Shield, RefreshCw, Play, X,
  Power, RotateCcw, Cpu, Wifi, FileText, Package,
  ChevronDown, ChevronUp, AlertTriangle, Check,
  HardDrive, MemoryStick, Thermometer, Clock,
  Server, Zap, Database,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Shared constants ───────────────────────────────────────
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

const n = (v) => { const x = parseFloat(v); return isNaN(x) ? null : x }

const fmt = (bytes) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// ── Stat card ──────────────────────────────────────────────
function StatCard({ label, value, icon, color, sub, unit = '' }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '0.9rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}>
      <span style={{
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34, height: 34,
        borderRadius: 8,
        background: color.startsWith('#') ? `${color}1a` : 'var(--bg-muted)',
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.3rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
        }}>
          {value != null ? `${typeof value === 'number' ? value.toFixed(value % 1 === 0 ? 0 : 1) : value}${unit}` : '—'}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.67rem',
          color: 'var(--text-secondary)',
          marginTop: '0.2rem',
        }}>
          {label}
        </div>
        {sub && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.63rem',
            color,
            marginTop: '0.15rem',
          }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Collapsible section ────────────────────────────────────
function Section({ icon: Icon, title, accent = 'var(--accent)', badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <div
        className="card-header"
        style={{ cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <div className="card-header-icon" style={{ background: 'var(--bg-muted)', color: accent }}>
          <Icon size={15} />
        </div>
        <span className="card-header-title">{title}</span>
        {badge && (
          <span className="badge badge--muted" style={{ marginLeft: '0.5rem' }}>{badge}</span>
        )}
        <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>
      {open && <div style={{ padding: '1rem' }}>{children}</div>}
    </div>
  )
}

// ── Inline metric row ──────────────────────────────────────
function MetricRow({ label, value, max = 100, color, unit = '%', warn = false }) {
  const pct = value != null ? Math.min(Math.max((value / max) * 100, 0), 100) : 0
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem',
        marginBottom: '0.35rem',
      }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: warn ? 'var(--color-danger, #ef4444)' : 'var(--text-primary)', fontWeight: 600 }}>
          {value != null ? `${typeof value === 'number' ? (value % 1 === 0 ? value : value.toFixed(1)) : value}${unit}` : '—'}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
        <div style={{
          height: '100%',
          borderRadius: 99,
          width: `${pct}%`,
          background: warn ? 'var(--color-danger, #ef4444)' : color,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ── Status dot ─────────────────────────────────────────────
function StatusDot({ active }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.3rem',
      padding: '0.15rem 0.5rem',
      borderRadius: 99,
      background: active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      color: active ? '#22c55e' : '#ef4444',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.68rem',
      fontWeight: 600,
    }}>
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: active ? '#22c55e' : '#ef4444',
        animation: active ? 'pulse 2s infinite' : 'none',
      }} />
      {active ? 'active' : 'inactive'}
    </span>
  )
}

// ── SSH Terminal ───────────────────────────────────────────
function SshPanel() {
  const { toast, showToast } = useToast()
  const [mode, setMode]             = useState('server') // 'server' | 'upload'
  const [port, setPort]             = useState('2244')   // ← porta configurabile
  const [keyFile, setKeyFile]       = useState(null)
  const [keyName, setKeyName]       = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [command, setCommand]       = useState('')
  const [lines, setLines]           = useState([])
  const [loading, setLoading]       = useState(false)
  const termRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [lines])

  const addLine = (type, text) =>
    setLines(prev => [...prev, {
      type, text,
      ts: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }])

  const run = async () => {
    if (!command.trim()) { showToast('Enter command', 'error'); return }
    if (mode === 'upload' && !keyFile) { showToast('Select a private key file', 'error'); return }
    const portNum = parseInt(port, 10)
    if (!portNum || portNum < 1 || portNum > 65535) { showToast('Invalid port number', 'error'); return }
    setLoading(true)
    addLine('info', `$ ${command}`)
    try {
      let res, data
      if (mode === 'server') {
        res = await fetch('/api/ssh_exec_host', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, port: portNum }),
        })
      } else {
        const keyText = await keyFile.text()
        res = await fetch('/api/ssh_exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip: '192.168.178.101',
            port: portNum,
            username: 'orion',
            privateKey: keyText,
            passphrase: passphrase || undefined,
            command,
          }),
        })
      }
      data = await res.json()
      if (!res.ok) throw new Error(data.error || 'SSH error')
      addLine('output', data.output || '(no output)')
    } catch (e) {
      addLine('error', e.message)
    } finally { setLoading(false) }
  }

  const LINE_COLOR = {
    info: 'var(--accent)',
    output: 'var(--text-secondary)',
    error: '#ef4444',
  }

  const QUICK_CMDS = ['df -h', 'free -h', 'uptime', 'who', 'top -bn1 | head -5']

  return (
    <Section icon={Terminal} title="SSH Terminal" accent="var(--accent)" defaultOpen={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

        {/* Mode selector + Port field */}
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            { id: 'server', label: '🔑 Server key' },
            { id: 'upload', label: '📂 Upload key' },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`btn btn--sm ${mode === m.id ? 'btn--primary' : 'btn--ghost'}`}
              style={{ fontSize: '0.72rem' }}
            >
              {m.label}
            </button>
          ))}

          {/* Port input */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}>
              Port
            </span>
            <input
              className="input input--mono"
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={e => setPort(e.target.value)}
              style={{ width: 72, textAlign: 'center', fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
            />
          </div>
        </div>

        {/* Server key info */}
        {mode === 'server' && (
          <div style={{
            padding: '0.6rem 0.75rem',
            borderRadius: 8,
            background: 'var(--bg-muted)',
            borderLeft: '3px solid var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
          }}>
            Using <span style={{ color: 'var(--accent)' }}>/run/secrets/id_rsa</span> — key already loaded on server
            {' · '}port <span style={{ color: 'var(--accent)' }}>{port || '2244'}</span>
          </div>
        )}

        {/* Upload key fields */}
        {mode === 'upload' && (
          <>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: '0.3rem',
              }}>
                Private Key File
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, textTransform: 'none', marginLeft: '0.4rem' }}>
                  (.pem / id_rsa / id_ed25519)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  ref={fileRef} type="file" style={{ display: 'none' }}
                  accept=".pem,.key,*"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setKeyFile(f)
                    setKeyName(f.name)
                  }}
                />
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => fileRef.current?.click()}
                  style={{ fontSize: '0.72rem', flexShrink: 0 }}
                >
                  Choose file
                </button>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                  color: keyName ? 'var(--text-secondary)' : 'var(--text-muted, var(--text-secondary))',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>
                  {keyName || 'No file selected'}
                </span>
                {keyFile && (
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => { setKeyFile(null); setKeyName(''); fileRef.current.value = '' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                color: 'var(--text-secondary)', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: '0.3rem',
              }}>
                Passphrase
                <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '0.4rem' }}>(optional)</span>
              </div>
              <input
                type="password"
                className="input input--mono"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                placeholder="Leave empty if key has no passphrase"
              />
            </div>
          </>
        )}

        {/* Command */}
        <div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
            color: 'var(--text-secondary)', textTransform: 'uppercase',
            letterSpacing: '0.05em', marginBottom: '0.3rem',
          }}>Command</div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="input input--mono"
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && run()}
              placeholder="ls -la"
              style={{ flex: 1 }}
            />
            <button className="btn btn--primary" onClick={run} disabled={loading} style={{ flexShrink: 0 }}>
              {loading
                ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Play size={14} />}
            </button>
          </div>
        </div>

        {/* Quick commands */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {QUICK_CMDS.map(cmd => (
            <button key={cmd} onClick={() => setCommand(cmd)}
              className="btn btn--ghost btn--sm"
              style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', padding: '3px 8px' }}>
              {cmd}
            </button>
          ))}
        </div>

        {/* Terminal output */}
        {lines.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setLines([])} className="btn btn--ghost btn--sm"
                style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <X size={11} /> Clear
              </button>
            </div>
            <div ref={termRef} style={{
              background: '#0d1117', borderRadius: 8,
              padding: '0.875rem 1rem', fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem', lineHeight: 1.7, maxHeight: 220,
              overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {lines.map((l, i) => (
                <div key={i} style={{ marginBottom: '0.1rem' }}>
                  <span style={{ color: '#48484a', marginRight: '0.5rem', userSelect: 'none' }}>{l.ts}</span>
                  <span style={{ color: LINE_COLOR[l.type] || '#e2e8f0', whiteSpace: 'pre-wrap' }}>{l.text}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Toast toast={toast} />
    </Section>
  )
}

// ── Power Controls ─────────────────────────────────────────
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
    } catch (e) {
      showToast(e.message, 'error')
    } finally { setLoading(null); setConfirm(null) }
  }

  return (
    <Section icon={Power} title="Power Control" accent="#ef4444">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: 'var(--bg-muted)',
          borderLeft: '3px solid #f59e0b',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          ⚠ These actions affect the physical device. Make sure no critical operations are running.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {[
            { action: 'reboot', icon: RotateCcw, label: 'Reboot', color: '#f59e0b' },
            { action: 'shutdown', icon: Power, label: 'Shutdown', color: '#ef4444' },
          ].map(({ action, icon: Icon, label, color }) => (
            confirm === action ? (
              <div key={action} style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: '#f59e0b', flex: 1, fontFamily: 'var(--font-mono)' }}>
                  Confirm {label.toLowerCase()}?
                </span>
                <button
                  className="btn btn--danger btn--sm"
                  onClick={() => execute(action)}
                  disabled={loading === action}
                >
                  {loading === action
                    ? <RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                    : 'Yes'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>No</button>
              </div>
            ) : (
              <button
                key={action}
                className="btn btn--ghost"
                style={{ flex: 1, color, borderColor: color }}
                onClick={() => setConfirm(action)}
              >
                <Icon size={14} /> {label}
              </button>
            )
          ))}
        </div>
      </div>
      <Toast toast={toast} />
    </Section>
  )
}

// ── Services ───────────────────────────────────────────────
function ServicesPanel() {
  const { toast, showToast } = useToast()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const load = async () => {
    try {
      const data = await fetch('/api/services').then(r => r.json())
      const list = Array.isArray(data) ? data : (data.services ?? [])
      setServices(list)
    } catch { showToast('Failed to load services', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const act = async (service, action) => {
    const key = `${service}:${action}`
    setActing(key)
    try {
      const res = await fetch(`/api/services/${service}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${service} ${action}ed`, 'success')
      await load()
    } catch (e) {
      showToast(e.message, 'error')
    } finally { setActing(null) }
  }

  return (
    <Section icon={Server} title="System Services" accent="var(--card-hum-accent, #60a5fa)" badge={services.length > 0 ? services.length : undefined}>
      {loading ? (
        <div className="loading-box"><span className="spinner" /></div>
      ) : services.length === 0 ? (
        <div className="empty-state"><Server size={28} /><div>No services found</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {services.map(svc => (
            <div key={svc.service} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.6rem 0.75rem',
              borderRadius: 8,
              background: 'var(--bg-muted)',
            }}>
              <StatusDot active={svc.isActive} />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: 'var(--text-primary)',
                flex: 1,
              }}>{svc.service}</span>
              <span style={{
                fontSize: '0.65rem',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}>{svc.active}</span>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {['start', 'stop', 'restart'].map(action => {
                  const key = `${svc.service}:${action}`
                  return (
                    <button
                      key={action}
                      className="btn btn--ghost btn--sm"
                      style={{ fontSize: '0.65rem', padding: '2px 7px' }}
                      disabled={acting === key}
                      onClick={() => act(svc.service, action)}
                    >
                      {acting === key
                        ? <RefreshCw size={10} style={{ animation: 'spin 0.8s linear infinite' }} />
                        : action}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button
            className="btn btn--ghost btn--sm"
            onClick={load}
            style={{ alignSelf: 'flex-end', fontSize: '0.68rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      )}
      <Toast toast={toast} />
    </Section>
  )
}

// ── Processes ──────────────────────────────────────────────
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
    } catch { showToast('Failed to load processes', 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const kill = async (pid, name) => {
    if (!window.confirm(`Kill ${name} (PID ${pid})?`)) return
    setKilling(pid)
    try {
      const res = await fetch(`/api/processes/${pid}/kill`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
      await load()
    } catch (e) {
      showToast(e.message, 'error')
    } finally { setKilling(null) }
  }

  const MiniBar = ({ pct, color }) => (
    <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`,
        height: '100%',
        background: color,
        borderRadius: 2,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )

  return (
    <Section icon={Activity} title="Top Processes" accent="var(--card-shop-accent, #a78bfa)" defaultOpen={false}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <button
          className="btn btn--ghost btn--sm"
          onClick={load}
          style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>PID</th>
              <th>Name</th>
              <th>CPU %</th>
              <th></th>
              <th>RAM %</th>
              <th></th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem' }}><span className="spinner" /></td></tr>
            ) : procs.map(p => (
              <tr key={p.pid}>
                <td className="td-mono td-muted" style={{ fontSize: '0.72rem' }}>{p.pid}</td>
                <td style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: 'var(--text-primary)',
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{p.name}</td>
                <td className="td-mono" style={{
                  fontSize: '0.78rem',
                  color: p.cpu > 50 ? '#ef4444' : 'var(--text-secondary)',
                }}>{p.cpu.toFixed(1)}</td>
                <td style={{ padding: '0.45rem 0.5rem' }}>
                  <MiniBar pct={p.cpu} color={p.cpu > 50 ? '#ef4444' : 'var(--card-hum-accent, #60a5fa)'} />
                </td>
                <td className="td-mono" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{p.mem.toFixed(1)}</td>
                <td style={{ padding: '0.45rem 0.5rem' }}>
                  <MiniBar pct={p.mem} color="var(--card-shop-accent, #a78bfa)" />
                </td>
                <td style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  color: p.status === 'running' ? '#22c55e' : 'var(--text-secondary)',
                }}>{p.status}</td>
                <td>
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ fontSize: '0.62rem', padding: '1px 6px', color: '#ef4444' }}
                    disabled={killing === p.pid}
                    onClick={() => kill(p.pid, p.name)}
                  >
                    {killing === p.pid
                      ? <RefreshCw size={10} style={{ animation: 'spin 0.8s linear infinite' }} />
                      : <X size={10} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast toast={toast} />
    </Section>
  )
}

// ── Network ────────────────────────────────────────────────
function NetworkPanel() {
  const [ifaces, setIfaces] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/network').then(r => r.json())
      setIfaces(Array.isArray(data) ? data : [])
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  return (
    <Section icon={Wifi} title="Network Interfaces" accent="var(--card-air-accent, #34d399)" badge={ifaces.length > 0 ? ifaces.length : undefined}>
      {loading ? (
        <div className="loading-box"><span className="spinner" /></div>
      ) : ifaces.length === 0 ? (
        <div className="empty-state"><Wifi size={28} /><div>No interfaces found</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ifaces.map(iface => (
            <div key={iface.interface} style={{
              padding: '0.75rem',
              borderRadius: 8,
              background: 'var(--bg-muted)',
              borderLeft: `3px solid ${iface.isUp ? '#22c55e' : 'var(--border)'}`,
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.35rem',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}>{iface.interface}</span>
                <span style={{
                  fontSize: '0.65rem',
                  color: iface.isUp ? '#22c55e' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {iface.isUp ? '● UP' : '○ DOWN'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {[
                  ['IP', iface.ip || '—'],
                  ['↑ Sent', fmt(iface.bytesSent)],
                  ['↓ Recv', fmt(iface.bytesRecv)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span style={{
                      fontSize: '0.62rem',
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontFamily: 'var(--font-mono)',
                    }}>{k} </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      color: 'var(--text-primary)',
                    }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button
            className="btn btn--ghost btn--sm"
            onClick={load}
            style={{ alignSelf: 'flex-end', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      )}
    </Section>
  )
}

// ── Logs ───────────────────────────────────────────────────
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
    <Section icon={FileText} title="Logs" accent="var(--text-secondary)" defaultOpen={false}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {['system', 'auth'].map(t => (
          <button
            key={t}
            className={`btn btn--sm ${tab === t ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setTab(t)}
            style={{ fontSize: '0.72rem' }}
          >
            {t === 'auth' ? 'Auth / SSH' : 'System Journal'}
          </button>
        ))}
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => load(tab)}
          style={{ marginLeft: 'auto', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      <div ref={boxRef} style={{
        background: '#0d1117',
        borderRadius: 8,
        padding: '0.875rem 1rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.68rem',
        lineHeight: 1.65,
        maxHeight: 280,
        overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.06)',
        color: '#a0aec0',
      }}>
        {loading
          ? <span style={{ color: 'var(--text-secondary)' }}>Loading…</span>
          : lines.map((l, i) => <div key={i}>{l}</div>)
        }
      </div>
    </Section>
  )
}

// ── APT Upgrade ────────────────────────────────────────────
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
          showToast(data.error ? 'Upgrade failed' : 'Upgrade complete', data.error ? 'error' : 'success')
        }
      } catch { setPolling(false) }
    }, 1500)
    return () => clearInterval(id)
  }, [polling])

  return (
    <Section icon={Package} title="Package Upgrade" accent="var(--card-temp-accent, #fb923c)" defaultOpen={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: 8,
          background: 'var(--bg-muted)',
          borderLeft: '3px solid #f59e0b',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}>
          Runs <code style={{ color: 'var(--accent)', background: 'var(--bg-surface)', padding: '0.1rem 0.3rem', borderRadius: 4, fontSize: '0.72rem' }}>apt-get update && apt-get upgrade -y</code>. This may take several minutes.
        </div>
        <button
          className="btn btn--warning btn--full"
          onClick={startUpgrade}
          disabled={polling}
          style={{ gap: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {polling
            ? <><RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Upgrading…</>
            : <><Package size={14} /> Start Upgrade</>}
        </button>
        {state && (
          <div ref={boxRef} style={{
            background: '#0d1117',
            borderRadius: 8,
            padding: '0.875rem 1rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            lineHeight: 1.65,
            maxHeight: 240,
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#a0aec0',
          }}>
            {state.output.map((l, i) => <div key={i}>{l}</div>)}
            {state.done && !state.error && (
              <div style={{ color: '#22c55e', marginTop: '0.5rem' }}>✓ Done.</div>
            )}
            {state.error && (
              <div style={{ color: '#ef4444', marginTop: '0.5rem' }}>✗ {state.error}</div>
            )}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </Section>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function RaspiPage() {
  const { toast, showToast } = useToast()
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [backing, setBacking] = useState(false)

  const loadStats = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const d = await fetch('/api_raspberry_pi_stats').then(r => r.json())
      setStats(d)
      setHistory(prev => [
        ...prev.slice(-39),
        {
          ts: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cpu: n(d.cpuUsage) ?? 0,
          temp: n(d.temperature) ?? 0,
        },
      ])
    } catch { }
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(() => loadStats(true), 5000)
    return () => clearInterval(id)
  }, [])

  const backup = async () => {
    setBacking(true)
    try {
      await fetch('/api_run_backup', { method: 'POST' })
      showToast('Backup initiated', 'success')
    } catch { showToast('Backup failed', 'error') }
    finally { setBacking(false) }
  }

  const cpu = stats ? n(stats.cpuUsage) : null
  const temp = stats ? n(stats.temperature) : null
  const diskUsed = stats ? n(stats.diskUsed) : null
  const diskFree = stats ? n(stats.diskFree) : null
  const diskTotal = stats ? (n(stats.diskTotal) ?? (diskUsed != null && diskFree != null ? diskUsed + diskFree : null)) : null
  const diskPct = diskTotal && diskUsed != null ? (diskUsed / diskTotal) * 100 : null
  const memUsed = stats ? n(stats.memoryUsed) : null
  const memTotal = stats ? (n(stats.memoryTotal) ?? null) : null
  const memPct = memTotal && memUsed != null ? (memUsed / memTotal) * 100 : null

  const cpuHigh = cpu != null && cpu > 80
  const tempHigh = temp != null && temp > 70

  return (
    <div className="page animate-fade">
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 className="page-title">
            Rasp<span style={{ color: 'var(--accent)' }}>berry Pi</span>
          </h1>
          <p className="page-subtitle">System monitoring &amp; remote control</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
          {tempHigh && (
            <span className="badge" style={{ background: '#ef444418', color: '#ef4444', border: '1px solid #ef444440' }}>
              <AlertTriangle size={10} /> High temp
            </span>
          )}
          {cpuHigh && (
            <span className="badge" style={{ background: '#f9731618', color: '#f97316', border: '1px solid #f9731640' }}>
              <Zap size={10} /> High CPU
            </span>
          )}
          <span className="badge badge--success">
            <span className="dot dot--green dot--pulse" /> Online
          </span>
          {stats?.uptime && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              ↑ {stats.uptime}
            </span>
          )}
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => loadStats(true)}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            5s
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Stat cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          <StatCard label="CPU Usage" value={cpu} unit="%" icon={<Cpu size={15} />}
            color={cpuHigh ? '#ef4444' : '#60a5fa'} sub={cpuHigh ? '⚠ High load' : 'Real-time'} />
          <StatCard label="Temperature" value={temp} unit="°C" icon={<Thermometer size={15} />}
            color={tempHigh ? '#ef4444' : '#f97316'} sub={tempHigh ? '⚠ Thermal risk' : 'Normal'} />
          <StatCard label="Disk Used" value={diskPct != null ? diskPct.toFixed(1) : null} unit="%"
            icon={<HardDrive size={15} />} color="#34d399"
            sub={diskUsed != null ? `${diskUsed.toFixed(1)} GB used` : null} />
          <StatCard label="Memory Used" value={memPct != null ? memPct.toFixed(1) : null} unit="%"
            icon={<Database size={15} />} color="#a78bfa"
            sub={memUsed != null ? `${memUsed.toFixed(1)} GB used` : null} />
        </div>

        {/* ── Device info bar ── */}
        <div className="card">
          <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', overflowX: 'auto' }}>
            {[
              ['IP', '192.168.178.101'],
              ['Host', 'raspberrypi'],
              ['SSH Port', '2244'],
              ['Disk', diskTotal != null ? `${(diskTotal / 1024).toFixed(0)} GB total` : '—'],
              ['RAM', memTotal != null ? `${(memTotal / 1024).toFixed(1)} GB total` : '—'],
              ['Load', stats?.loadAvg ? `${stats.loadAvg['1m']} / ${stats.loadAvg['5m']} / ${stats.loadAvg['15m']}` : '—'],
              ['Uptime', stats?.uptime || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                <span style={{
                  fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)',
                }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Metric bars ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#60a5fa18', color: '#60a5fa' }}>
              <Cpu size={15} />
            </div>
            <span className="card-header-title">Resource Usage</span>
            <span style={{
              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#22c55e',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
              live · 5s
            </span>
          </div>
          <div style={{ padding: '0 1rem 1rem' }}>
            {loading ? (
              <div className="loading-box"><span className="spinner" /></div>
            ) : (
              <>
                <MetricRow label="CPU" value={cpu} max={100} color="#60a5fa" unit="%" warn={cpuHigh} />
                <MetricRow label="Temperature" value={temp} max={85} color="#f97316" unit="°C" warn={tempHigh} />
                <MetricRow label="Disk" value={diskPct} max={100} color="#34d399" unit="%" warn={diskPct != null && diskPct > 85} />
                <MetricRow label="Memory" value={memPct} max={100} color="#a78bfa" unit="%" warn={memPct != null && memPct > 90} />
              </>
            )}
          </div>
        </div>

        {/* ── Live chart ── */}
        {history.length > 1 && (
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}>
                <Activity size={15} />
              </div>
              <span className="card-header-title">Live Performance</span>
              <div style={{ marginLeft: '0.75rem', display: 'flex', gap: '1rem' }}>
                {[{ label: 'CPU %', color: '#60a5fa' }, { label: 'Temp °C', color: '#f97316' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div style={{ width: 18, height: 2, borderRadius: 1, background: l.color }} />
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <span style={{
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#22c55e',
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
                5s
              </span>
            </div>
            <div style={{ padding: '0.5rem 0.25rem 0.75rem 0', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ left: -16, right: 8 }}>
                  <defs>
                    <linearGradient id="gcpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gtemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="ts"
                    tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-secondary)' }}
                    axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-secondary)' }}
                    axisLine={false} tickLine={false} width={30} domain={[0, 'auto']} />
                  <Tooltip {...TOOLTIP_STYLE}
                    formatter={(v, name) => [
                      `${parseFloat(v).toFixed(1)}${name === 'cpu' ? '%' : '°C'}`,
                      name === 'cpu' ? 'CPU' : 'Temp',
                    ]} />
                  <Area type="monotone" dataKey="cpu" name="cpu" stroke="#60a5fa" fill="url(#gcpu)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="temp" name="temp" stroke="#f97316" fill="url(#gtemp)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Sectioned panels ── */}
        <PowerPanel />
        <ServicesPanel />
        <NetworkPanel />
        <ProcessesPanel />
        <SshPanel />
        <LogsPanel />
        <UpgradePanel />

        {/* ── Backup ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#22c55e18', color: '#22c55e' }}>
              <Shield size={15} />
            </div>
            <span className="card-header-title">System Backup</span>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <div style={{
              padding: '0.75rem 1rem', borderRadius: 8, background: 'var(--bg-muted)',
              borderLeft: '3px solid #f59e0b', fontSize: '0.78rem',
              color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6,
            }}>
              Creates a snapshot of system config, user data, installed packages, and app settings.
            </div>
            <button
              className="btn btn--success btn--full"
              onClick={backup}
              disabled={backing}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {backing
                ? <><RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Running…</>
                : <><Shield size={14} /> Start Backup</>}
            </button>
            <div className="table-wrap" style={{ margin: 0 }}>
              <table>
                <tbody>
                  {[
                    ['IP', '192.168.178.101'],
                    ['SSH Port', '2244'],
                    ['CPU', cpu != null ? `${cpu.toFixed(1)}%` : '—'],
                    ['Temp', temp != null ? `${temp.toFixed(1)}°C` : '—'],
                    ['Disk', diskPct != null ? `${diskPct.toFixed(0)}% used` : '—'],
                    ['Memory', memPct != null ? `${memPct.toFixed(0)}% used` : '—'],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="td-mono td-muted" style={{ fontSize: '0.72rem', width: '40%' }}>{k}</td>
                      <td className="td-mono" style={{ fontSize: '0.72rem' }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      <Toast toast={toast} />
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}