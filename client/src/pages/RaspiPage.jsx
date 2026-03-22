import { useState, useEffect, useRef } from 'react'
import { Cpu, HardDrive, Thermometer, Activity, Terminal, Shield, RefreshCw, Play, X } from 'lucide-react'
import { PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Tooltip style ──────────────────────────────────────────
const TOOLTIP = {
  contentStyle: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
  },
}

// ── Donut chart component ──────────────────────────────────
function DonutStat({ used, total, label, color, unit = 'GB' }) {
  const pct = total ? Math.round((used / total) * 100) : 0
  const usedGB  = (used  / 1024).toFixed(1)
  const totalGB = (total / 1024).toFixed(1)

  const data = [
    { name:'Used', value: used   || 0 },
    { name:'Free', value: Math.max(0, (total||0) - (used||0)) },
  ]

  return (
    <div className="card" style={{ padding:'1.25rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' }}>
      <div className="stat-label">{label}</div>
      <div style={{ width:140, height:140, position:'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
              startAngle={90} endAngle={-270} paddingAngle={2} dataKey="value">
              <Cell fill={color}/>
              <Cell fill="var(--border)"/>
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'1.25rem', fontWeight:500,
            color:'var(--text-primary)', lineHeight:1 }}>{pct}%</span>
          <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>used</span>
        </div>
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color:'var(--text-muted)' }}>
        {usedGB} / {totalGB} {unit}
      </div>
    </div>
  )
}

// ── SSH terminal ───────────────────────────────────────────
function SshTerminal() {
  const { toast, showToast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [command,  setCommand]  = useState('')
  const [output,   setOutput]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const termRef = useRef(null)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [output])

  const addLine = (type, text) => {
    setOutput(prev => [...prev, { type, text, time: new Date().toLocaleTimeString() }])
  }

  const run = async () => {
    if (!username) { showToast('Enter a username', 'error'); return }
    if (!password) { showToast('Enter a password', 'error'); return }
    if (!command.trim()) { showToast('Enter a command', 'error'); return }

    setLoading(true)
    addLine('status', `Connecting to 192.168.178.101...`)
    try {
      const res = await fetch('/api/ssh_exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: '192.168.178.101', username, password, command,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'SSH error')
      addLine('success', `Connected`)
      addLine('cmd', `$ ${command}`)
      addLine('output', data.output || '(no output)')
    } catch (e) {
      addLine('error', e.message)
    } finally {
      setLoading(false)
    }
  }

  const LINE_COLOR = { status:'var(--card-hum-accent)', success:'var(--color-success)', cmd:'var(--accent)', output:'var(--text-secondary)', error:'var(--color-danger)' }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background:'var(--surface2,#1a1928)', color:'var(--card-act-accent)' }}>
          <Terminal size={15}/>
        </div>
        <span className="card-header-title">Remote Command Execution</span>
      </div>
      <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
          <div className="field">
            <label className="field-label">Username</label>
            <input className="input input--mono" value={username} onChange={e=>setUsername(e.target.value)} placeholder="pi"/>
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="input input--mono" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••"/>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Command</label>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <input className="input input--mono" value={command} onChange={e=>setCommand(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && run()} placeholder="ls -la"/>
            <button className="btn btn--primary" onClick={run} disabled={loading} style={{ whiteSpace:'nowrap' }}>
              {loading ? <RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/> : <Play size={14}/>}
              {loading ? 'Running...' : 'Execute'}
            </button>
          </div>
        </div>

        {/* Terminal output */}
        <div ref={termRef} style={{
          background:'#0d1117', borderRadius:'var(--radius-md)', padding:'1rem',
          fontFamily:'var(--font-mono)', fontSize:'0.78rem', lineHeight:1.6,
          maxHeight:280, overflowY:'auto', border:'1px solid var(--border)',
          minHeight:100,
        }}>
          {output.length === 0 ? (
            <span style={{ color:'#4b5563', fontStyle:'italic' }}>
              Ready to execute SSH commands... (Ctrl+Enter)
            </span>
          ) : output.map((line, i) => (
            <div key={i} style={{ marginBottom:'0.25rem' }}>
              <span style={{ color:'#4b5563', marginRight:'0.5rem', fontSize:'0.65rem' }}>{line.time}</span>
              <span style={{ color: LINE_COLOR[line.type] || '#e2e8f0' }}>{line.text}</span>
            </div>
          ))}
        </div>

        {output.length > 0 && (
          <button className="btn btn--ghost btn--sm" style={{ alignSelf:'flex-end' }}
            onClick={() => setOutput([])}>
            <X size={12}/> Clear
          </button>
        )}

        {/* Quick commands hint */}
        <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', lineHeight:1.8,
          background:'var(--bg-surface-2)', borderRadius:'var(--radius-sm)', padding:'0.65rem 0.875rem',
          fontFamily:'var(--font-mono)' }}>
          <strong style={{ color:'var(--text-secondary)' }}>Quick commands:</strong>{' '}
          {['df -h', 'free -h', 'uptime', 'ls -la', 'systemctl status ssh'].map((cmd, i) => (
            <span key={i}>
              <button onClick={() => setCommand(cmd)} style={{ background:'none', border:'none',
                color:'var(--accent)', cursor:'pointer', fontFamily:'var(--font-mono)',
                fontSize:'0.65rem', textDecoration:'underline', padding:0 }}>
                {cmd}
              </button>
              {i < 4 && <span style={{ color:'var(--text-muted)' }}> · </span>}
            </span>
          ))}
        </div>
      </div>
      <Toast toast={toast}/>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function RaspiPage() {
  const { toast, showToast } = useToast()

  const [stats,      setStats]      = useState(null)
  const [cpuHistory, setCpuHistory] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [backing,    setBacking]    = useState(false)

  const loadStats = async () => {
    try {
      const data = await fetch('/api_raspberry_pi_stats').then(r => r.json())
      setStats(data)
      setCpuHistory(prev => [
        ...prev.slice(-29),
        { time: new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
          cpu: parseFloat(data.cpuUsage || 0).toFixed(1),
          temp: parseFloat(data.temperature || 0).toFixed(1) }
      ])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(loadStats, 5000)
    return () => clearInterval(id)
  }, [])

  const handleBackup = async () => {
    setBacking(true)
    try {
      await fetch('/api_run_backup', { method:'POST' })
      showToast('Backup initiated successfully')
    } catch { showToast('Backup failed', 'error') }
    finally { setBacking(false) }
  }

  const cpu  = stats ? parseFloat(stats.cpuUsage || 0).toFixed(1) : '--'
  const temp = stats ? parseFloat(stats.temperature || 0).toFixed(1) : '--'

  return (
    <div className="page animate-fade">
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 className="page-title">Rasp<span style={{ color:'var(--accent)' }}>berry Pi</span></h1>
          <p className="page-subtitle">System monitoring & control center</p>
        </div>
        <span className="badge badge--success" style={{ marginTop:'0.5rem' }}>
          <span className="dot dot--green dot--pulse"/> System Online
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'1rem', marginBottom:'1.5rem' }}>

        {/* CPU */}
        <div className="card" style={{ padding:'1.25rem', textAlign:'center' }}>
          <div className="card-header-icon icon-blue" style={{ width:32, height:32, margin:'0 auto 0.5rem' }}>
            <Cpu size={16}/>
          </div>
          <div className="stat-label">CPU Usage</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.75rem', fontWeight:500,
            color: loading ? 'var(--text-muted)' : parseFloat(cpu) > 80 ? 'var(--color-danger)' : 'var(--card-hum-accent)',
            lineHeight:1, margin:'0.35rem 0' }}>
            {loading ? '…' : `${cpu}%`}
          </div>
          <div className="stat-sub">Real-time</div>
        </div>

        {/* Temperature */}
        <div className="card" style={{ padding:'1.25rem', textAlign:'center' }}>
          <div className="card-header-icon icon-amber" style={{ width:32, height:32, margin:'0 auto 0.5rem' }}>
            <Thermometer size={16}/>
          </div>
          <div className="stat-label">CPU Temp</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.75rem', fontWeight:500,
            color: loading ? 'var(--text-muted)' : parseFloat(temp) > 70 ? 'var(--color-danger)' : 'var(--card-temp-accent)',
            lineHeight:1, margin:'0.35rem 0' }}>
            {loading ? '…' : `${temp}°C`}
          </div>
          <div className="stat-sub">{parseFloat(temp) > 70 ? '⚠ High' : 'OK'}</div>
        </div>

        {/* Disk donut */}
        <DonutStat
          label="Disk Usage"
          used={stats?.diskUsed  || 0}
          total={stats?.diskTotal || 0}
          color="var(--card-air-accent)"
          unit="GB"
        />

        {/* Memory donut */}
        <DonutStat
          label="Memory"
          used={stats?.memoryUsed  || 0}
          total={stats?.memoryTotal || 0}
          color="var(--card-shop-accent)"
          unit="GB"
        />
      </div>

      {/* CPU + Temp history chart */}
      {cpuHistory.length > 1 && (
        <div className="card mb-lg">
          <div className="card-header">
            <div className="card-header-icon icon-blue"><Activity size={15}/></div>
            <span className="card-header-title">CPU & Temperature (live)</span>
            <span className="badge badge--accent" style={{ marginLeft:'auto' }}>5s interval</span>
          </div>
          <div className="card-body" style={{ height:220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpuHistory}>
                <defs>
                  <linearGradient id="gcpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-hum-accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--card-hum-accent)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gtemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-temp-accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--card-temp-accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="time" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <Tooltip {...TOOLTIP} formatter={(v, name) => [name === 'cpu' ? `${v}%` : `${v}°C`, name === 'cpu' ? 'CPU' : 'Temp']}/>
                <Area type="monotone" dataKey="cpu"  stroke="var(--card-hum-accent)"  fill="url(#gcpu)"  strokeWidth={2} dot={false} name="cpu"/>
                <Area type="monotone" dataKey="temp" stroke="var(--card-temp-accent)" fill="url(#gtemp)" strokeWidth={2} dot={false} name="temp"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Two-column: SSH + Backup */}
      <div className="grid-2" style={{ gap:'1.5rem', alignItems:'start' }}>
        <SshTerminal/>

        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background:'var(--card-air-bg)', color:'var(--card-air-accent)' }}>
              <Shield size={15}/>
            </div>
            <span className="card-header-title">System Backup</span>
          </div>
          <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div style={{ background:'var(--bg-surface-2)', padding:'0.875rem 1rem',
              borderRadius:'var(--radius-md)', borderLeft:'3px solid var(--color-warning)',
              fontSize:'0.825rem', color:'var(--text-secondary)', lineHeight:1.6 }}>
              <strong style={{ color:'var(--text-primary)' }}>Backup includes:</strong> System configurations,
              user data, installed packages, and application settings.
            </div>
            <button className="btn btn--success btn--full" onClick={handleBackup} disabled={backing}>
              {backing
                ? <><RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/> Running...</>
                : <><Shield size={14}/> Start Backup Process</>}
            </button>

            {/* System info */}
            <div style={{ marginTop:'0.5rem' }}>
              <div className="stat-label" style={{ marginBottom:'0.5rem' }}>System Info</div>
              {[
                ['IP Address',   '192.168.178.101'],
                ['Hostname',     'raspberrypi'],
                ['Disk Used',    stats?.diskUsed  ? `${(stats.diskUsed /1024).toFixed(1)} GB` : '—'],
                ['Disk Free',    stats?.diskFree  ? `${(stats.diskFree /1024).toFixed(1)} GB` : '—'],
                ['Memory Total', stats?.memoryTotal ? `${(stats.memoryTotal/1024).toFixed(1)} GB` : '—'],
                ['CPU Usage',    cpu !== '--' ? `${cpu}%` : '—'],
                ['Temperature',  temp !== '--' ? `${temp}°C` : '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'0.4rem 0',
                  borderBottom:'1px solid var(--border)', fontSize:'0.8rem' }}>
                  <span style={{ color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{k}</span>
                  <span style={{ color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}