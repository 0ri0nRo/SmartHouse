import { useState, useEffect } from 'react'
import { Shield, Monitor, RefreshCw } from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── API ────────────────────────────────────────────────────
async function fetchDevices()      { return fetch('/api/devices').then(r => r.json()) }
async function fetchDeviceStats()  { return fetch('/api/devices/stats').then(r => r.json()) }
async function fetchConnectedDays(){ return fetch('/api/devices/most_connected_days').then(r => r.json()) }

// ── Shared tooltip style ───────────────────────────────────
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

// ── Colors for charts ──────────────────────────────────────
const COLORS = [
  'var(--card-hum-accent)',
  'var(--card-air-accent)',
  'var(--card-shop-accent)',
  'var(--card-temp-accent)',
  'var(--card-train-accent)',
  'var(--card-exp-accent)',
  'var(--card-act-accent)',
  'var(--card-raspi-accent)',
]

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// ── Main page ──────────────────────────────────────────────
export default function SecurityPage() {
  const { toast, showToast } = useToast()

  const [devices,    setDevices]    = useState([])
  const [stats,      setStats]      = useState([])
  const [weekData,   setWeekData]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [devs, st, days] = await Promise.all([
        fetchDevices().catch(() => []),
        fetchDeviceStats().catch(() => []),
        fetchConnectedDays().catch(() => ({})),
      ])
      setDevices(devs)
      setStats(st)

      // Transform days data into recharts format
      // days = { "192.x.x.x": [sun, mon, tue, wed, thu, fri, sat], ... }
      const transformed = DAYS.map((day, i) => {
        const entry = { day: day.substring(0,3) }
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
  }

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 30000)
    return () => clearInterval(id)
  }, [])

  // Pie chart data
  const pieData = stats.map((s, i) => ({
    name: s.ip_address || 'Unknown',
    value: s.connection_count || 0,
    color: COLORS[i % COLORS.length],
  }))

  // Bar chart IP keys
  const ipKeys = Object.keys(weekData[0] || {}).filter(k => k !== 'day')

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 className="page-title">Secu<span style={{ color:'var(--accent)' }}>rity</span></h1>
          <p className="page-subtitle">Network device monitoring and analytics</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.5rem' }}>
          <span className="badge badge--success">
            <span className="dot dot--green dot--pulse"/> {devices.length} devices
          </span>
          <button className="btn btn--ghost btn--sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation:refreshing?'spin 0.8s linear infinite':'none' }}/>
            Refresh
          </button>
        </div>
      </div>

      {/* Devices table */}
      <div className="card mb-lg">
        <div className="card-header">
          <div className="card-header-icon" style={{ background:'var(--card-sec-bg)', color:'var(--card-sec-accent)' }}>
            <Monitor size={15}/>
          </div>
          <span className="card-header-title">Connected Devices</span>
          <span className="badge badge--muted" style={{ marginLeft:'auto' }}>{devices.length}</span>
        </div>
        {loading ? (
          <div className="loading-box"><span className="spinner"/></div>
        ) : devices.length === 0 ? (
          <div className="empty-state"><Monitor size={28}/><div>No devices found</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Hostname</th><th>Last Seen</th></tr>
              </thead>
              <tbody>
                {devices.map((d, i) => (
                  <tr key={i}>
                    <td style={{ color:'var(--accent)', fontFamily:'var(--font-mono)', fontSize:'0.85rem' }}>
                      {d.hostname || 'Unknown Device'}
                    </td>
                    <td className="td-mono td-muted">
                      {d.last_seen ? new Date(d.last_seen).toLocaleString('en-GB', {
                        year:'numeric', month:'short', day:'numeric',
                        hour:'2-digit', minute:'2-digit',
                      }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts — 2 columns on desktop */}
      <div className="grid-2" style={{ gap:'1.5rem' }}>

        {/* Connection distribution donut */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background:'var(--card-sec-bg)', color:'var(--card-sec-accent)' }}>
              <Shield size={15}/>
            </div>
            <span className="card-header-title">Connection Distribution</span>
          </div>
          <div className="card-body" style={{ height:320 }}>
            {loading ? (
              <div className="loading-box"><span className="spinner"/></div>
            ) : pieData.length === 0 ? (
              <div className="empty-state"><Shield size={28}/><div>No data</div></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="45%" innerRadius="45%" outerRadius="70%"
                    paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color}/>
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP} formatter={(v, name) => [`${v} connections`, name]}/>
                  <Legend
                    wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-secondary)' }}
                    formatter={(value, entry) => {
                      const total = pieData.reduce((s,d)=>s+d.value,0)
                      const pct = total ? ((entry.payload.value/total)*100).toFixed(1) : 0
                      return `${value} (${pct}%)`
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Weekly activity bar chart */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background:'var(--card-sec-bg)', color:'var(--card-sec-accent)' }}>
              <Shield size={15}/>
            </div>
            <span className="card-header-title">Weekly Activity Patterns</span>
          </div>
          <div className="card-body" style={{ height:320 }}>
            {loading ? (
              <div className="loading-box"><span className="spinner"/></div>
            ) : weekData.length === 0 ? (
              <div className="empty-state"><Shield size={28}/><div>No data</div></div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="day" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                  <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                  <Tooltip {...TOOLTIP} formatter={(v, name) => [`${v} connections`, name]}/>
                  {ipKeys.length > 1 && (
                    <Legend wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-secondary)' }}/>
                  )}
                  {ipKeys.map((ip, i) => (
                    <Bar key={ip} dataKey={ip} fill={COLORS[i % COLORS.length]} radius={[3,3,0,0]} maxBarSize={24}/>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}