import { useState, useEffect, useRef } from 'react'
import { Activity, Terminal, Shield, RefreshCw, Play, X } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

const TT = {
  contentStyle: {
    background:'var(--bg-surface)', border:'1px solid var(--border-strong)',
    borderRadius:8, fontFamily:'var(--font-mono)', fontSize:'0.72rem',
    color:'var(--text-primary)', boxShadow:'var(--shadow-md)',
  },
  cursor: { stroke:'var(--border-strong)', strokeDasharray:'3 3' },
}

// ── Safe number parse ──────────────────────────────────────
const n = (v) => { const x = parseFloat(v); return isNaN(x) ? null : x }

// ── Circular progress ring ─────────────────────────────────
function RingMetric({ value, label, color, unit = '%', sublabel }) {
  const pct    = value != null ? Math.min(Math.max(value, 0), 100) : 0
  const radius = 36
  const circ   = 2 * Math.PI * radius
  const dash   = (pct / 100) * circ

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      gap:'0.4rem', padding:'1.1rem 0.5rem' }}>
      <svg width={84} height={84} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={radius} fill="none"
          stroke="var(--border-strong)" strokeWidth={6}/>
        <circle cx={44} cy={44} r={radius} fill="none"
          stroke={value != null ? color : 'var(--border)'}
          strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          style={{ transition:'stroke-dasharray 0.6s ease' }}/>
        <text x={44} y={40} textAnchor="middle" dominantBaseline="middle"
          style={{ fontFamily:'var(--font-mono)', fontSize:14, fontWeight:600,
            fill:'var(--text-primary)' }}>
          {value != null ? (value % 1 === 0 ? value : value.toFixed(1)) : '—'}
        </text>
        <text x={44} y={56} textAnchor="middle"
          style={{ fontFamily:'var(--font-mono)', fontSize:10, fill:'var(--text-muted)' }}>
          {unit}
        </text>
      </svg>
      <div style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--text-secondary)',
        textAlign:'center' }}>{label}</div>
      {sublabel && (
        <div style={{ fontSize:'0.62rem', color:'var(--text-muted)',
          textAlign:'center', fontFamily:'var(--font-mono)' }}>{sublabel}</div>
      )}
    </div>
  )
}

// ── SSH Terminal ───────────────────────────────────────────
function SshPanel() {
  const { toast, showToast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [command,  setCommand]  = useState('')
  const [lines,    setLines]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const termRef = useRef(null)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [lines])

  const addLine = (type, text) =>
    setLines(prev => [...prev, {
      type, text,
      ts: new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    }])

  const run = async () => {
    if (!username.trim()) { showToast('Enter username', 'error'); return }
    if (!password.trim()) { showToast('Enter password', 'error'); return }
    if (!command.trim())  { showToast('Enter command',  'error'); return }
    setLoading(true)
    addLine('info', `$ ${command}`)
    try {
      const res  = await fetch('/api/ssh_exec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip:'192.168.178.101', username, password, command }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'SSH error')
      addLine('output', data.output || '(no output)')
    } catch (e) {
      addLine('error', e.message)
    } finally { setLoading(false) }
  }

  const LINE_COLOR = {
    info:   'var(--accent)',
    output: 'var(--text-secondary)',
    error:  'var(--color-danger)',
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon"
          style={{ background:'var(--bg-surface-3)', color:'var(--card-act-accent)' }}>
          <Terminal size={14}/>
        </div>
        <span className="card-header-title">SSH Terminal</span>
        {lines.length > 0 && (
          <button onClick={() => setLines([])} className="btn btn--ghost btn--sm"
            style={{ marginLeft:'auto', padding:'2px 8px', fontSize:'0.68rem' }}>
            <X size={11}/> Clear
          </button>
        )}
      </div>

      <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
        {/* Username + Password */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
          <div className="field">
            <label className="field-label">Username</label>
            <input className="input input--mono" value={username}
              onChange={e => setUsername(e.target.value)} placeholder="pi"/>
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input type="password" className="input input--mono" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••"/>
          </div>
        </div>

        {/* Command */}
        <div className="field">
          <label className="field-label">Command</label>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <input className="input input--mono" value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && run()}
              placeholder="ls -la"/>
            <button className="btn btn--primary" onClick={run}
              disabled={loading} style={{ flexShrink:0 }}>
              {loading
                ? <RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/>
                : <Play size={14}/>}
            </button>
          </div>
        </div>

        {/* Quick commands */}
        <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
          {['df -h', 'free -h', 'uptime', 'top -bn1 | head -5'].map(cmd => (
            <button key={cmd} onClick={() => setCommand(cmd)}
              className="btn btn--ghost btn--sm"
              style={{ fontSize:'0.68rem', fontFamily:'var(--font-mono)', padding:'3px 8px' }}>
              {cmd}
            </button>
          ))}
        </div>

        {/* Terminal output */}
        {lines.length > 0 && (
          <div ref={termRef} style={{
            background:'#0d1117', borderRadius:'var(--radius-md)',
            padding:'0.875rem 1rem', fontFamily:'var(--font-mono)',
            fontSize:'0.75rem', lineHeight:1.7, maxHeight:220,
            overflowY:'auto', border:'1px solid rgba(255,255,255,0.06)',
          }}>
            {lines.map((l, i) => (
              <div key={i} style={{ marginBottom:'0.1rem' }}>
                <span style={{ color:'#48484a', marginRight:'0.5rem', userSelect:'none' }}>
                  {l.ts}
                </span>
                <span style={{ color: LINE_COLOR[l.type] || '#e2e8f0', whiteSpace:'pre-wrap' }}>
                  {l.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function RaspiPage() {
  const { toast, showToast } = useToast()

  const [stats,   setStats]   = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [backing, setBacking] = useState(false)

  const loadStats = async () => {
    try {
      const d = await fetch('/api_raspberry_pi_stats').then(r => r.json())
      setStats(d)
      setHistory(prev => [
        ...prev.slice(-39),
        {
          ts:   new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
          cpu:  n(d.cpuUsage)   ?? 0,
          temp: n(d.temperature) ?? 0,
        }
      ])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 5000)
    return () => clearInterval(id)
  }, [])

  const backup = async () => {
    setBacking(true)
    try { await fetch('/api_run_backup', { method:'POST' }); showToast('Backup initiated') }
    catch { showToast('Backup failed', 'error') }
    finally { setBacking(false) }
  }

  // ── Compute metrics — parseFloat everything to avoid NaN ──
  const cpu  = stats ? n(stats.cpuUsage)    : null
  const temp = stats ? n(stats.temperature) : null

  const diskUsed  = stats ? n(stats.diskUsed)  : null
  const diskFree  = stats ? n(stats.diskFree)  : null
  const diskTotal = stats ? (n(stats.diskTotal) ?? (diskUsed != null && diskFree != null ? diskUsed + diskFree : null)) : null
  const diskPct   = diskTotal && diskUsed != null ? (diskUsed / diskTotal) * 100 : null

  const memUsed   = stats ? n(stats.memoryUsed)  : null
  const memFree   = stats ? n(stats.memoryFree)  : null
  const memTotal  = stats ? (n(stats.memoryTotal) ?? (memUsed != null && memFree != null ? memUsed + memFree : null)) : null
  const memPct    = memTotal && memUsed != null ? (memUsed / memTotal) * 100 : null

  const cpuColor  = cpu  != null && cpu  > 80 ? 'var(--color-danger)' : 'var(--card-hum-accent)'
  const tempColor = temp != null && temp > 70 ? 'var(--color-danger)' : 'var(--card-temp-accent)'

  const rings = [
    { label:'CPU',    value: cpu,     color: cpuColor,                       unit:'%',  sublabel: loading ? '…' : 'Real-time' },
    { label:'Temp',   value: temp,    color: tempColor,                      unit:'°C', sublabel: temp != null && temp > 70 ? '⚠ High' : 'OK' },
    { label:'Disk',   value: diskPct, color:'var(--card-air-accent)',        unit:'%',  sublabel: diskUsed != null ? `${(diskUsed/1024).toFixed(1)} GB` : null },
    { label:'Memory', value: memPct,  color:'var(--card-shop-accent)',       unit:'%',  sublabel: memUsed  != null ? `${(memUsed /1024).toFixed(1)} GB` : null },
  ]

  const infoRows = [
    ['IP',    '192.168.178.101'],
    ['Host',  'raspberrypi'],
    ['CPU',   cpu  != null ? `${cpu.toFixed(1)}%`       : '—'],
    ['Temp',  temp != null ? `${temp.toFixed(1)}°C`     : '—'],
    ['Disk',  diskPct  != null ? `${diskPct.toFixed(0)}% used`  : '—'],
    ['RAM',   memPct   != null ? `${memPct.toFixed(0)}% used`   : '—'],
    ['Disk',  diskTotal != null ? `${(diskTotal/1024).toFixed(0)} GB total` : '—'],
    ['RAM',   memTotal  != null ? `${(memTotal /1024).toFixed(1)} GB total` : '—'],
  ]

  return (
    <div className="page animate-fade">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
        flexWrap:'wrap', gap:'0.75rem', marginBottom:'1.5rem' }}>
        <div>
          <h1 className="page-title">Raspberry Pi</h1>
          <p className="page-subtitle">System monitoring & remote control</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'0.35rem' }}>
          <span className="badge badge--success">
            <span className="dot dot--green dot--pulse"/> Online
          </span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-muted)' }}>
            5s refresh
          </span>
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

        {/* ── Ring metrics — 2×2 on mobile, 4×1 on desktop ── */}
        <div className="card">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',   /* 2 col on mobile */
            borderBottom: '1px solid var(--border)',
          }}>
            {rings.map((m, i) => (
              <div key={i} style={{
                borderRight:  (i % 2 === 0) ? '1px solid var(--border)' : 'none',
                borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
              }}>
                {loading && m.value == null ? (
                  <div style={{ display:'flex', alignItems:'center',
                    justifyContent:'center', padding:'2rem' }}>
                    <span className="spinner"/>
                  </div>
                ) : (
                  <RingMetric {...m}/>
                )}
              </div>
            ))}
          </div>

          {/* System info strip */}
          <div style={{ padding:'0.75rem 1rem', background:'var(--bg-surface-2)',
            display:'flex', gap:'1rem', flexWrap:'wrap', overflowX:'auto' }}>
            {[
              ['IP',   '192.168.178.101'],
              ['Host', 'raspberrypi'],
              ['Disk', diskTotal != null ? `${(diskTotal/1024).toFixed(0)} GB` : '—'],
              ['RAM',  memTotal  != null ? `${(memTotal /1024).toFixed(1)} GB` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display:'flex', gap:'0.35rem', alignItems:'center',
                flexShrink:0 }}>
                <span style={{ fontSize:'0.62rem', fontWeight:600,
                  color:'var(--text-muted)', textTransform:'uppercase',
                  letterSpacing:'0.5px' }}>{k}</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem',
                  color:'var(--text-secondary)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live chart ── */}
        {history.length > 1 && (
          <div className="card">
            <div className="card-header">
              <div className="card-header-icon icon-blue"><Activity size={14}/></div>
              <span className="card-header-title">Live performance</span>
              <span className="badge badge--success" style={{ marginLeft:'auto' }}>
                <span className="dot dot--green dot--pulse"/> 5s
              </span>
            </div>
            <div style={{ padding:'0.5rem 1rem 0', display:'flex', gap:'1rem' }}>
              {[
                { label:'CPU %',   color:'var(--card-hum-accent)'  },
                { label:'Temp °C', color:'var(--card-temp-accent)' },
              ].map(l => (
                <div key={l.label} style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
                  <div style={{ width:18, height:2, borderRadius:1, background:l.color }}/>
                  <span style={{ fontSize:'0.68rem', color:'var(--text-muted)',
                    fontFamily:'var(--font-mono)' }}>{l.label}</span>
                </div>
              ))}
            </div>
            <div style={{ padding:'0.5rem 0.25rem 0.75rem 0', height:180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ left:-16, right:8 }}>
                  <defs>
                    <linearGradient id="gcpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--card-hum-accent)"  stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--card-hum-accent)"  stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gtemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--card-temp-accent)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--card-temp-accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="ts" tick={{ fontFamily:'var(--font-mono)', fontSize:8,
                    fill:'var(--text-muted)' }} axisLine={false} tickLine={false}
                    interval="preserveStartEnd"/>
                  <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9,
                    fill:'var(--text-muted)' }} axisLine={false} tickLine={false}
                    width={30} domain={[0, 'auto']}/>
                  <Tooltip {...TT} formatter={(v, name) => [
                    `${parseFloat(v).toFixed(1)}${name === 'cpu' ? '%' : '°C'}`,
                    name === 'cpu' ? 'CPU' : 'Temp',
                  ]}/>
                  <Area type="monotone" dataKey="cpu"  name="cpu"
                    stroke="var(--card-hum-accent)"  fill="url(#gcpu)"
                    strokeWidth={2} dot={false}/>
                  <Area type="monotone" dataKey="temp" name="temp"
                    stroke="var(--card-temp-accent)" fill="url(#gtemp)"
                    strokeWidth={2} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── SSH + Backup — stacked on mobile, side by side on desktop ── */}
        <SshPanel/>

        <div className="card">
          <div className="card-header">
            <div className="card-header-icon"
              style={{ background:'var(--card-air-bg)', color:'var(--card-air-accent)' }}>
              <Shield size={14}/>
            </div>
            <span className="card-header-title">System Backup</span>
          </div>
          <div style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.875rem' }}>
            <div style={{ padding:'0.875rem 1rem', borderRadius:'var(--radius-md)',
              background:'var(--bg-surface-2)', borderLeft:'3px solid var(--color-warning)',
              fontSize:'0.8rem', color:'var(--text-secondary)', lineHeight:1.6 }}>
              Creates a snapshot of system config, user data, installed packages, and app settings.
            </div>
            <button className="btn btn--success btn--full" onClick={backup} disabled={backing}>
              {backing
                ? <><RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/> Running...</>
                : <><Shield size={14}/> Start Backup</>}
            </button>

            {/* Key stats */}
            <div>
              {[
                ['IP',     '192.168.178.101'],
                ['CPU',    cpu  != null ? `${cpu.toFixed(1)}%`   : '—'],
                ['Temp',   temp != null ? `${temp.toFixed(1)}°C` : '—'],
                ['Disk',   diskPct  != null ? `${diskPct.toFixed(0)}% used`  : '—'],
                ['Memory', memPct   != null ? `${memPct.toFixed(0)}% used`   : '—'],
              ].map(([k, v], i, arr) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between',
                  padding:'0.5rem 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize:'0.75rem', color:'var(--text-muted)',
                    fontFamily:'var(--font-mono)' }}>{k}</span>
                  <span style={{ fontSize:'0.75rem', color:'var(--text-primary)',
                    fontFamily:'var(--font-mono)', fontWeight:500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      <Toast toast={toast}/>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (min-width: 768px) {
          .raspi-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
        }
      `}</style>
    </div>
  )
}