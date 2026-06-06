import { useState, useEffect, useRef, useCallback, createElement } from 'react'
import {
  Wind, Activity, TrendingUp, Calendar, RefreshCw,
  ChevronLeft, ChevronRight, Terminal, X, Settings,
  ChevronRight as CRight, GripVertical, Maximize2, Minimize2,
  Eye, EyeOff, LayoutGrid,
} from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import Toast from '../components/Toast'
import AirQualityRangeChart from '../components/AirQualityRangeChart'
import ChartCard from '../components/ChartCard'
import { useToast } from '../hooks/useToast'
import { fetchJson } from '../lib/fetchCache'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const TT = {
  contentStyle: {
    background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
    borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
    color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)',
  },
  cursor: { stroke: 'var(--border-strong)', strokeDasharray: '3 3' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const GAS_LINES = [
  { key: 'smoke',    label: 'Smoke',    color: 'var(--color-danger)' },
  { key: 'lpg',      label: 'LPG',      color: 'var(--card-hum-accent)' },
  { key: 'methane',  label: 'Methane',  color: 'var(--card-shop-accent)' },
  { key: 'hydrogen', label: 'Hydrogen', color: 'var(--card-temp-accent)' },
]

function aqiColor(v) {
  if (v >= 80) return 'var(--color-success)'
  if (v >= 60) return 'var(--color-warning)'
  if (v >= 40) return 'var(--card-temp-accent)'
  return 'var(--color-danger)'
}
function aqiLabel(v) {
  if (v >= 80) return 'Good'
  if (v >= 60) return 'Moderate'
  if (v >= 40) return 'Poor'
  return 'Hazardous'
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
// defaultSize: layout out-of-the-box.
// Paired widgets share a row in the 2-col grid when both are 'half'.
// minHeight: total widget height (header ~44px + chart area).
const WIDGET_DEFS = [
  // Row 1 — paired: AQI area chart (left) + AQI hourly bars (right)
  { id: 'aqi-live',      title: 'AQI Today',          tab: 'live',    defaultSize: 'half', minHeight: 260 },
  { id: 'aqi-sparkline', title: 'AQI 24h Trend',      tab: 'live',    defaultSize: 'half', minHeight: 260 },
  // Row 2 — gas lines need full width for the legend
  { id: 'gas-today',     title: 'Gas Concentrations', tab: 'gas',     defaultSize: 'full', minHeight: 280 },
  // Row 3 — paired: gas snapshot (left) + daily history (right)
  { id: 'gas-bars',      title: 'Gas Snapshot',       tab: 'gas',     defaultSize: 'half', minHeight: 240 },
  { id: 'daily-hist',    title: 'Daily History',      tab: 'history', defaultSize: 'half', minHeight: 240 },
  // Row 4 — monthly trend full width
  { id: 'monthly-hist',  title: 'Monthly Averages',   tab: 'history', defaultSize: 'full', minHeight: 260 },
  // Row 5 — custom range (external component, auto-height)
  { id: 'range-chart',   title: 'AQI Range',          tab: 'history', defaultSize: 'full', minHeight: 0   },
  // Row 6 — logs full width, taller
  { id: 'logs',          title: 'Pico W Logs',        tab: 'logs',    defaultSize: 'full', minHeight: 400 },
]

const DEFAULT_LAYOUT = WIDGET_DEFS.map((w, i) => ({
  id:      w.id,
  size:    w.defaultSize,
  visible: true,
  order:   i,
}))

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — unified data
// ─────────────────────────────────────────────────────────────────────────────
function useAirQualityData(histMonth, histYear) {
  const [aqiData,     setAqiData]     = useState([])
  const [gasData,     setGasData]     = useState([])
  const [weeklyData,  setWeeklyData]  = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [latestAQI,   setLatestAQI]   = useState(null)
  const [peakAQI,     setPeakAQI]     = useState(null)
  const [minAQI,      setMinAQI]      = useState(null)
  const [avgAQI,      setAvgAQI]      = useState(null)   // today average
  const [monthAvg,    setMonthAvg]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [loadingHist, setLoadingHist] = useState(false)
  const { toast, showToast }          = useToast()

  // ── Today ──────────────────────────────────────────────────────────────────
  const loadToday = useCallback(async () => {
    setLoading(true)
    try {
      const [aqi, gas] = await Promise.all([
        fetchJson('/api/air_quality_today'),
        fetchJson('/api/gas_concentration_today'),
      ])

      // AQI
      let aqiArr = []
      if (Array.isArray(aqi)) {
        aqiArr = aqi.map(e => ({ hour: `${e.hour}:00`, aqi: parseFloat(e.aqi) }))
      } else if (aqi && typeof aqi === 'object') {
        aqiArr = Object.keys(aqi).map(Number).filter(h => !isNaN(h)).sort((a, b) => a - b)
          .map(h => ({ hour: `${h}:00`, aqi: parseFloat(aqi[h]) || 0 }))
      }
      setAqiData(aqiArr)

      if (aqiArr.length) {
        const vals = aqiArr.map(d => d.aqi)
        setLatestAQI(aqiArr[aqiArr.length - 1].aqi)
        setPeakAQI(Math.max(...vals))
        setMinAQI(Math.min(...vals))
        setAvgAQI(vals.reduce((a, b) => a + b, 0) / vals.length)
      } else {
        setLatestAQI(null); setPeakAQI(null); setMinAQI(null); setAvgAQI(null)
      }

      // Gas
      if (gas && typeof gas === 'object' && !Array.isArray(gas)) {
        const gasArr = Object.keys(gas).map(Number).filter(h => !isNaN(h))
          .sort((a, b) => a - b)
          .map(h => ({
            hour:     `${h}:00`,
            smoke:    parseFloat(gas[h]?.avg_smoke    || 0).toFixed(2),
            lpg:      parseFloat(gas[h]?.avg_lpg      || 0).toFixed(2),
            methane:  parseFloat(gas[h]?.avg_methane  || 0).toFixed(2),
            hydrogen: parseFloat(gas[h]?.avg_hydrogen || 0).toFixed(2),
          }))
        const hasReal = gasArr.some(r =>
          parseFloat(r.smoke) > 0 || parseFloat(r.lpg) > 0 ||
          parseFloat(r.methane) > 0 || parseFloat(r.hydrogen) > 0
        )
        setGasData(hasReal ? gasArr : [])
      } else { setGasData([]) }
    } catch { showToast('Error loading live data', 'error') }
    finally { setLoading(false) }
  }, [])

  // ── History ────────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setLoadingHist(true)
    try {
      const [daily, yearly] = await Promise.all([
        fetchJson(`/api/air_quality_monthly/${histMonth}/${histYear}`),
        fetchJson(`/api/air_quality_yearly/${histYear}`),
      ])

      if (daily && typeof daily === 'object' && !Array.isArray(daily) && !daily.error) {
        setWeeklyData(
          Object.keys(daily).map(Number).filter(d => !isNaN(d)).sort((a, b) => a - b)
            .map(d => ({ day: `${d}`, aqi: parseFloat(daily[d]).toFixed(1) }))
        )
      } else { setWeeklyData([]) }

      if (yearly && typeof yearly === 'object' && !Array.isArray(yearly) && !yearly.error) {
        setMonthlyData(MONTHS.map((name, i) => ({
          month: name,
          aqi:   yearly[String(i + 1)] != null ? parseFloat(yearly[String(i + 1)]).toFixed(1) : null,
        })))
        const cur = yearly[String(histMonth)]
        setMonthAvg(cur != null ? parseFloat(cur).toFixed(1) : null)
      } else { setMonthlyData([]); setMonthAvg(null) }
    } catch { showToast('Error loading historical data', 'error') }
    finally { setLoadingHist(false) }
  }, [histMonth, histYear])

  // Auto-refresh
  useEffect(() => {
    loadToday()
    const id = setInterval(loadToday, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [loadToday])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return {
    aqiData, gasData, weeklyData, monthlyData,
    latestAQI, peakAQI, minAQI, avgAQI, monthAvg,
    loading, loadingHist,
    loadToday, loadHistory,
    toast,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — widget layout (persisted)
// ─────────────────────────────────────────────────────────────────────────────
function useWidgetLayout() {
  const [layout, setLayout] = useState(() => {
    try {
      const saved = localStorage.getItem('aq-widget-layout-v3')
      if (!saved) return DEFAULT_LAYOUT
      const parsed = JSON.parse(saved)
      // Merge any new widgets added since last save
      const existing = new Set(parsed.map(w => w.id))
      const merged = [
        ...parsed,
        ...DEFAULT_LAYOUT.filter(w => !existing.has(w.id)),
      ]
      return merged
    } catch { return DEFAULT_LAYOUT }
  })

  useEffect(() => {
    try { localStorage.setItem('aq-widget-layout-v3', JSON.stringify(layout)) } catch {}
  }, [layout])

  const toggleSize = useCallback((id) => {
    setLayout(prev => prev.map(w =>
      w.id === id ? { ...w, size: w.size === 'full' ? 'half' : 'full' } : w
    ))
  }, [])

  const toggleVisible = useCallback((id) => {
    setLayout(prev => prev.map(w =>
      w.id === id ? { ...w, visible: !w.visible } : w
    ))
  }, [])

  const reorder = useCallback((fromId, toId) => {
    setLayout(prev => {
      const arr  = [...prev].sort((a, b) => a.order - b.order)
      const from = arr.findIndex(w => w.id === fromId)
      const to   = arr.findIndex(w => w.id === toId)
      if (from === -1 || to === -1 || from === to) return prev
      const moved = arr.splice(from, 1)[0]
      arr.splice(to, 0, moved)
      return arr.map((w, i) => ({ ...w, order: i }))
    })
  }, [])

  const resetLayout = useCallback(() => setLayout(DEFAULT_LAYOUT), [])

  return { layout, toggleSize, toggleVisible, reorder, resetLayout }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function LoadingBox() {
  return <div className="loading-box"><span className="spinner" /></div>
}
function EmptyState({ icon: Icon, label }) {
  return <div className="empty-state"><Icon size={20} /><div>{label}</div></div>
}
function MetricPill({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))', border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)',
      borderRadius: 12, padding: '0.75rem 1rem', flex: '1 1 120px', minWidth: 0,
      boxShadow: '0 10px 22px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART COMPONENTS  (unified — used on both mobile and desktop)
// ─────────────────────────────────────────────────────────────────────────────

// ── AQI Area Chart ────────────────────────────────────────────────────────────
function AQITodayChart({ data, loading, gradientId = 'gaqi' }) {
  if (loading) return <LoadingBox />
  if (!data.length) return <EmptyState icon={Wind} label="No data today" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: -16, right: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
        <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
        <ReferenceLine y={80} stroke="var(--color-success)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <ReferenceLine y={60} stroke="var(--color-warning)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <ReferenceLine y={40} stroke="var(--card-temp-accent)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill={`url(#${gradientId})`} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: 'var(--card-air-accent)', strokeWidth: 0 }} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── AQI Sparkline (compact bar chart showing AQI health zones) ─────────────────
function AQISparklineChart({ data, loading }) {
  if (loading) return <LoadingBox />
  if (!data.length) return <EmptyState icon={Wind} label="No data" />

  // Color each bar by AQI zone
  const colored = data.map(d => ({ ...d, fill: aqiColor(d.aqi) }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={colored} margin={{ left: -16, right: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
        <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          const d = payload[0].payload
          return (
            <div style={TT.contentStyle}>
              <div style={{ color: aqiColor(d.aqi), fontWeight: 700 }}>{d.hour}</div>
              <div>AQI: <strong style={{ color: aqiColor(d.aqi) }}>{d.aqi}</strong> — {aqiLabel(d.aqi)}</div>
            </div>
          )
        }} />
        <Bar dataKey="aqi" radius={[3, 3, 0, 0]} maxBarSize={20}>
          {colored.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Gas Line Chart ─────────────────────────────────────────────────────────────
function GasTodayChart({ data, loading }) {
  if (loading) return <LoadingBox />
  if (!data.length) return <EmptyState icon={Activity} label="No data today" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip {...TT} formatter={(v, name) => [`${v} ppm`, name]} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />
        {GAS_LINES.map(g => (
          <Line key={g.key} type="monotone" dataKey={g.key} name={g.label} stroke={g.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Gas Snapshot Bar Chart (latest hour values per gas) ────────────────────────
function GasSnapshotChart({ data, loading }) {
  if (loading) return <LoadingBox />
  if (!data.length) return <EmptyState icon={Activity} label="No data today" />

  const latest = data[data.length - 1]
  const snapshot = GAS_LINES.map(g => ({
    name:  g.label,
    value: parseFloat(latest[g.key] || 0),
    color: g.color,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={snapshot} layout="vertical" margin={{ left: 4, right: 24 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={56} />
        <Tooltip {...TT} formatter={v => [`${v} ppm`]} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
          {snapshot.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Daily History Bar Chart ────────────────────────────────────────────────────
function DailyHistoryChart({ data, loading, histMonth, histYear }) {
  if (loading) return <LoadingBox />
  if (!data.length) return <EmptyState icon={TrendingUp} label="No data available" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -16, right: 8 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
        <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
        <Bar dataKey="aqi" fill="var(--card-air-accent)" radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Monthly Averages Area Chart ────────────────────────────────────────────────
function MonthlyHistoryChart({ data, loading, gradientId = 'gairm' }) {
  if (loading) return <LoadingBox />
  if (!data.filter(d => d.aqi != null).length) return <EmptyState icon={Calendar} label="No data available" />
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: -16, right: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
        <Tooltip {...TT} formatter={v => [`${v}`, 'Avg AQI']} />
        <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill={`url(#${gradientId})`} strokeWidth={2} dot={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PICO LOGS
// ─────────────────────────────────────────────────────────────────────────────
function PicoLogsPanel() {
  const [logs,      setLogs]      = useState([])
  const [filter,    setFilter]    = useState('all')
  const [paused,    setPaused]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [connected, setConnected] = useState(true)
  const termRef   = useRef(null)
  const pausedRef = useRef(false)
  pausedRef.current = paused

  const fetchLogs = async () => {
    if (pausedRef.current) return
    setLoading(true)
    try {
      const r = await fetch('/api/pico-logs?limit=100', { cache: 'no-store' })
      if (!r.ok) throw new Error(r.status)
      const d = await r.json()
      setLogs(d.logs || [])
      setConnected(true)
    } catch { setConnected(false) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchLogs()
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [logs, filter])

  const LEVEL_STYLE = {
    info:     { bg: '#0d2840', color: '#58a6ff', label: 'INFO'   },
    success:  { bg: '#0d2b1a', color: '#3fb950', label: 'OK'     },
    warning:  { bg: '#2d1e04', color: '#d29922', label: 'WARN'   },
    warn:     { bg: '#2d1e04', color: '#d29922', label: 'WARN'   },
    error:    { bg: '#2d0e0e', color: '#f85149', label: 'ERR'    },
    critical: { bg: '#3d0505', color: '#ff7b72', label: 'CRIT'   },
    sensor:   { bg: '#1a0d2d', color: '#d2a8ff', label: 'SENSOR' },
    system:   { bg: '#1c1c1e', color: '#8b949e', label: 'SYS'    },
  }
  const LEVELS = ['all', 'info', 'success', 'warning', 'error', 'sensor', 'system']

  const filtered = filter === 'all' ? logs : logs.filter(l => {
    const lv = (l.level || '').toLowerCase()
    return lv === filter || (filter === 'warning' && lv === 'warn')
  })

  const fmtTs = (raw) => {
    if (!raw) return '--:--:--'
    try {
      const d = new Date(raw)
      return isNaN(d) ? String(raw).slice(0, 8) : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return '--:--:--' }
  }

  const lastTs = logs.length ? fmtTs(logs[logs.length - 1].timestamp || logs[logs.length - 1].created_at) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '0.35rem', padding: '0.5rem 1rem', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)', flexShrink: 0 }}>
        <span className={`badge ${connected ? 'badge--success' : 'badge--danger'}`}>
          <span className={`dot ${connected ? 'dot--green dot--pulse' : 'dot--red'}`} />
          {connected ? 'online' : 'offline'}
        </span>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', flex: 1 }}>
          {LEVELS.map(lv => {
            const s = LEVEL_STYLE[lv] || LEVEL_STYLE.system
            const active = filter === lv
            return (
              <button key={lv} onClick={() => setFilter(lv)} style={{ border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`, background: active ? s.bg : 'transparent', borderRadius: 'var(--radius-full, 999px)', padding: '2px 8px', fontSize: '0.6rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)', color: active ? s.color : 'var(--text-muted)', transition: 'all .15s' }}>
                {lv.toUpperCase()}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{filtered.length} lines</span>
          <button onClick={() => setPaused(p => !p)} className="btn btn--ghost btn--sm" style={{ padding: '2px 8px', fontSize: '0.68rem', color: paused ? 'var(--color-warning)' : undefined }}>
            {paused ? 'resume' : 'pause'}
          </button>
          <button onClick={fetchLogs} className="btn btn--ghost btn--sm" style={{ padding: '2px 8px' }} disabled={loading}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.6s linear infinite' : 'none' }} />
          </button>
          {logs.length > 0 && (
            <button onClick={() => setLogs([])} className="btn btn--ghost btn--sm" style={{ padding: '2px 8px' }}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div ref={termRef} style={{ background: 'var(--bg-code, #0d1117)', padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', lineHeight: 1.75, flex: 1, overflowY: 'auto', minHeight: 0, overflowX: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', opacity: 0.5 }}>— no logs match filter —</div>
        ) : filtered.map((l, i) => {
          const lv = (l.level || 'system').toLowerCase()
          const s  = LEVEL_STYLE[lv] || LEVEL_STYLE.system
          const ts = fmtTs(l.created_at || l.timestamp)
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 52px 1fr', gap: '8px', marginBottom: '0.1rem', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-muted)', opacity: 0.5, userSelect: 'none', fontSize: '0.68rem' }}>{ts}</span>
              <span style={{ display: 'inline-block', textAlign: 'center', borderRadius: 4, padding: '0 4px', fontSize: '0.6rem', fontWeight: 700, background: s.bg, color: s.color, lineHeight: '17px', letterSpacing: '0.3px' }}>{s.label}</span>
              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', minWidth: 0 }}>{l.message || ''}</span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 1rem', background: 'var(--bg-surface-2)', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.25rem', flexShrink: 0 }}>
        <span>pico-w-001 · 192.168.178.101:8888</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastTs && <span>last: {lastTs}</span>}
          <span style={{ display: 'inline-block', width: 6, height: 11, background: connected ? 'var(--color-success, #3fb950)' : 'var(--color-danger)', borderRadius: 1, animation: connected ? 'blink 1.1s step-end infinite' : 'none' }} />
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD NAV
// ─────────────────────────────────────────────────────────────────────────────
function PeriodNav({ month, year, onChangeMonth, onChangeYear }) {
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  useEffect(() => { setPickerYear(year) }, [year])

  const prev = () => {
    if (month === 1) { onChangeMonth(12); onChangeYear(year - 1) }
    else onChangeMonth(month - 1)
  }
  const next = () => {
    if (isCurrentMonth) return
    if (month === 12) { onChangeMonth(1); onChangeYear(year + 1) }
    else onChangeMonth(month + 1)
  }
  const selectMonth = (m) => { onChangeMonth(m); onChangeYear(pickerYear); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <button onClick={prev} className="btn btn--ghost btn--sm" style={{ padding: '0.25rem 0.4rem' }}><ChevronLeft size={13} /></button>
      <button onClick={() => setOpen(p => !p)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: 90, textAlign: 'center', padding: '0.28rem 0.6rem', background: open ? 'var(--bg-surface-2)' : 'var(--bg-muted)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
        {MONTHS[month - 1]} {year}
      </button>
      <button onClick={next} className="btn btn--ghost btn--sm" disabled={isCurrentMonth} style={{ padding: '0.25rem 0.4rem', opacity: isCurrentMonth ? 0.3 : 1 }}><ChevronRight size={13} /></button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: '0.75rem', width: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <button onClick={() => setPickerYear(p => p - 1)} className="btn btn--ghost btn--sm" style={{ padding: '0.2rem 0.35rem' }}><ChevronLeft size={12} /></button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pickerYear}</span>
            <button onClick={() => setPickerYear(p => Math.min(now.getFullYear(), p + 1))} disabled={pickerYear >= now.getFullYear()} className="btn btn--ghost btn--sm" style={{ padding: '0.2rem 0.35rem', opacity: pickerYear >= now.getFullYear() ? 0.3 : 1 }}><ChevronRight size={12} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
            {MONTHS.map((m, i) => {
              const mNum = i + 1
              const isFuture = pickerYear === now.getFullYear() && mNum > now.getMonth() + 1
              const isActive = mNum === month && pickerYear === year
              return (
                <button key={m} onClick={() => !isFuture && selectMonth(mNum)} disabled={isFuture}
                  style={{ padding: '0.35rem 0', borderRadius: 6, border: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: isActive ? 700 : 400, cursor: isFuture ? 'not-allowed' : 'pointer', background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#fff' : isFuture ? 'var(--text-muted)' : 'var(--text-primary)', opacity: isFuture ? 0.35 : 1 }}
                  onMouseEnter={e => { if (!isFuture && !isActive) e.currentTarget.style.background = 'var(--bg-muted)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET SHELL  (draggable, resizable, hideable)
// ─────────────────────────────────────────────────────────────────────────────
// Header height constant so chart area gets an exact pixel height for ResponsiveContainer
const WIDGET_HEADER_H = 44

function WidgetShell({ id, title, icon: Icon, size, onToggleSize, onDragStart, onDragOver, onDrop, children, headerRight, minHeight = 240 }) {
  const [isDragOver, setIsDragOver] = useState(false)
  // minHeight 0 = auto (for external components that manage own height)
  const chartH = minHeight > 0 ? minHeight - WIDGET_HEADER_H : undefined

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(id) }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); onDragOver(id) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { e.preventDefault(); setIsDragOver(false); onDrop(id) }}
      style={{
        gridColumn: size === 'full' ? '1 / -1' : 'span 1',
        background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))',
        border: `1px solid ${isDragOver ? 'color-mix(in srgb, var(--accent) 65%, transparent)' : 'color-mix(in srgb, var(--border) 85%, transparent)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: isDragOver ? '0 0 0 2px var(--accent)20, 0 14px 28px rgba(0,0,0,0.08)' : '0 10px 24px rgba(0,0,0,0.05)',
      }}
    >
      {/* Widget header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.875rem', background: 'linear-gradient(180deg, var(--bg-surface-2), color-mix(in srgb, var(--bg-surface-2) 90%, var(--bg-surface)))', borderBottom: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', flexShrink: 0, userSelect: 'none' }}>
        {/* Drag handle */}
        <div style={{ cursor: 'grab', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.5 }}
          onMouseDown={e => e.currentTarget.style.cursor = 'grabbing'}
          onMouseUp={e => e.currentTarget.style.cursor = 'grab'}>
          <GripVertical size={13} />
        </div>

        {Icon && (
          <div style={{ width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--card-air-accent) 12%, var(--bg-surface))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={11} style={{ color: 'var(--card-air-accent)' }} />
          </div>
        )}

        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>

        {headerRight}

        {/* Size toggle */}
        <button onClick={() => onToggleSize(id)}
          title={size === 'full' ? 'Make half-width' : 'Make full-width'}
          style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)';   e.currentTarget.style.borderColor = 'var(--border)' }}>
          {size === 'full' ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
      </div>

      {/* Chart area — explicit px height (when defined) so ResponsiveContainer can measure */}
      <div style={{ height: chartH, padding: '0.5rem', boxSizing: 'border-box', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT MANAGER PANEL
// ─────────────────────────────────────────────────────────────────────────────
function LayoutManagerPanel({ layout, onToggleVisible, onReset, onClose }) {
  const defMap = Object.fromEntries(WIDGET_DEFS.map(w => [w.id, w]))
  const sorted = [...layout].sort((a, b) => a.order - b.order)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'relative', zIndex: 1, background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))', border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', borderRadius: '16px 0 0 16px', padding: '1.25rem', width: 280, maxHeight: '80vh', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.16)', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>Layout</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>Show / hide widgets</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(w => {
            const def = defMap[w.id]
            if (!def) return null
            return (
              <div key={w.id} onClick={() => onToggleVisible(w.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1px solid ${w.visible ? 'color-mix(in srgb, var(--border) 85%, transparent)' : 'color-mix(in srgb, var(--border) 70%, transparent)'}`, background: w.visible ? 'var(--bg-surface-2)' : 'transparent', cursor: 'pointer', opacity: w.visible ? 1 : 0.45, transition: 'all 0.15s' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: w.visible ? 'var(--color-success)' : 'var(--text-muted)', flexShrink: 0, transition: 'background 0.15s' }} />
                <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>{def.title}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{w.size}</span>
                {w.visible ? <Eye size={13} style={{ color: 'var(--text-secondary)' }} /> : <EyeOff size={13} style={{ color: 'var(--text-muted)' }} />}
              </div>
            )
          })}
        </div>

        <button onClick={onReset} style={{ marginTop: '1rem', width: '100%', padding: '9px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', transition: 'all 0.15s' }}>
          Reset to defaults
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET GRID
// ─────────────────────────────────────────────────────────────────────────────
function WidgetGrid({ layout, onToggleSize, onReorder, data, histMonth, histYear, setHistMonth, setHistYear, loadHistory, loadingHist }) {
  const dragFrom = useRef(null)

  const handleDragStart = (id) => { dragFrom.current = id }
  const handleDragOver  = (_id) => {}
  const handleDrop      = (toId) => {
    if (dragFrom.current && dragFrom.current !== toId) {
      onReorder(dragFrom.current, toId)
    }
    dragFrom.current = null
  }

  const sorted  = [...layout].filter(w => w.visible).sort((a, b) => a.order - b.order)
  const defMap  = Object.fromEntries(WIDGET_DEFS.map(w => [w.id, w]))

  const shellProps = (w) => ({
    id:            w.id,
    title:         defMap[w.id]?.title ?? w.id,
    size:          w.size,
    minHeight:     defMap[w.id]?.minHeight ?? 240,
    onToggleSize,
    onDragStart:   handleDragStart,
    onDragOver:    handleDragOver,
    onDrop:        handleDrop,
  })

  const histHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <PeriodNav month={histMonth} year={histYear} onChangeMonth={setHistMonth} onChangeYear={setHistYear} />
      <button className="btn btn--ghost btn--sm" onClick={loadHistory} disabled={loadingHist} style={{ padding: '0.28rem 0.4rem' }}>
        <RefreshCw size={11} style={{ animation: loadingHist ? 'spin 0.8s linear infinite' : 'none' }} />
      </button>
    </div>
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem', alignItems: 'start' }}>
      {sorted.map(w => {
        switch (w.id) {
          case 'aqi-live':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={Wind}>
                <AQITodayChart data={data.aqiData} loading={data.loading} gradientId={`gaqi_${w.id}`} />
              </WidgetShell>
            )
          case 'aqi-sparkline':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={Activity}>
                <AQISparklineChart data={data.aqiData} loading={data.loading} />
              </WidgetShell>
            )
          case 'gas-today':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={Activity}>
                <GasTodayChart data={data.gasData} loading={data.loading} />
              </WidgetShell>
            )
          case 'gas-bars':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={Activity}>
                <GasSnapshotChart data={data.gasData} loading={data.loading} />
              </WidgetShell>
            )
          case 'daily-hist':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={TrendingUp} headerRight={histHeader}>
                <DailyHistoryChart data={data.weeklyData} loading={data.loadingHist} histMonth={histMonth} histYear={histYear} />
              </WidgetShell>
            )
          case 'monthly-hist':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={Calendar}>
                <MonthlyHistoryChart data={data.monthlyData} loading={data.loadingHist} gradientId={`gairm_${w.id}`} />
              </WidgetShell>
            )
          case 'range-chart':
            // AirQualityRangeChart manages its own height — wrap without fixed chartH
            return (
              <div
                key={w.id}
                draggable
                onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; handleDragStart(w.id) }}
                onDragOver={e => { e.preventDefault(); handleDragOver(w.id) }}
                onDrop={e => { e.preventDefault(); handleDrop(w.id) }}
                style={{
                  gridColumn: w.size === 'full' ? '1 / -1' : 'span 1',
                  background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))',
                  border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                {/* Minimal header for range-chart */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.875rem', background: 'linear-gradient(180deg, var(--bg-surface-2), color-mix(in srgb, var(--bg-surface-2) 90%, var(--bg-surface)))', borderBottom: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', userSelect: 'none' }}>
                  <div style={{ cursor: 'grab', color: 'var(--text-muted)', opacity: 0.5 }}><GripVertical size={13} /></div>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'color-mix(in srgb, var(--card-air-accent) 12%, var(--bg-surface))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrendingUp size={11} style={{ color: 'var(--card-air-accent)' }} /></div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>AQI Range</span>
                  <button onClick={() => onToggleSize(w.id)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {w.size === 'full' ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                  </button>
                </div>
                <AirQualityRangeChart />
              </div>
            )
          case 'logs':
            return (
              <WidgetShell key={w.id} {...shellProps(w)} icon={Terminal}>
                <PicoLogsPanel />
              </WidgetShell>
            )
          default:
            return null
        }
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE — bottom sheet helpers
// ─────────────────────────────────────────────────────────────────────────────
function BottomSheet({ open, onClose, title, children, maxHeight = '80vh' }) {
  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight, display: 'flex', flexDirection: 'column', boxShadow: '0 -12px 40px rgba(0,0,0,0.22)', animation: 'slideUp 0.28s cubic-bezier(.32,1.1,.42,1)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.35)' }} />
        </div>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 14px', flexShrink: 0, borderBottom: '1px solid color-mix(in srgb, var(--border) 85%, transparent)' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
            <button onClick={onClose} style={{ background: 'var(--bg-surface-2)', border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', borderRadius: 8, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-secondary)', lineHeight: 1 }}><X size={14} /></button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
      </div>
    </>
  )
}

const NAV_TABS = [
  { id: 'live',    label: 'Live',    icon: Activity },
  { id: 'gas',     label: 'Gas',     icon: Wind },
  { id: 'history', label: 'History', icon: TrendingUp },
  { id: 'logs',    label: 'Logs',    icon: Terminal },
]

function BottomNav({ active, onChange }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))', borderTop: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)', backdropFilter: 'blur(18px)', boxShadow: '0 -10px 30px rgba(0,0,0,0.10)' }}>
      {NAV_TABS.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 0 8px', background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'var(--accent)' : 'var(--text-muted)', position: 'relative', transition: 'color 0.15s' }}>
            {isActive && <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, borderRadius: 1, background: 'var(--accent)' }} />}
            <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
            <span style={{ fontSize: '0.60rem', fontWeight: isActive ? 700 : 500, letterSpacing: '0.2px' }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Mobile period nav inline (for settings sheet)
function MobilePeriodNav({ month, year, onChangeMonth, onChangeYear, onApply }) {
  const now = new Date()
  const [m, setM] = useState(month)
  const [y, setY] = useState(year)
  const isFuture = (mm, yy) => yy > now.getFullYear() || (yy === now.getFullYear() && mm > now.getMonth() + 1)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => setY(p => p - 1)} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={14} /></button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{y}</span>
        <button onClick={() => setY(p => Math.min(now.getFullYear(), p + 1))} disabled={y >= now.getFullYear()} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: y >= now.getFullYear() ? 0.35 : 1 }}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
        {MONTHS.map((name, i) => {
          const mNum = i + 1
          const future = isFuture(mNum, y)
          const sel = mNum === m
          return (
            <button key={name} onClick={() => !future && setM(mNum)} disabled={future}
              style={{ padding: '8px 4px', borderRadius: 10, border: `1px solid ${sel && !future ? 'var(--accent)' : 'var(--border)'}`, background: sel && !future ? 'rgba(99,102,241,0.14)' : 'var(--bg-surface-2)', color: future ? 'var(--text-muted)' : sel ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: sel ? 700 : 400, cursor: future ? 'not-allowed' : 'pointer', opacity: future ? 0.35 : 1 }}>
              {name}
            </button>
          )
        })}
      </div>
      <button onClick={() => { onChangeMonth(m); onChangeYear(y); onApply() }} style={{ width: '100%', padding: '13px', borderRadius: 12, background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <RefreshCw size={14} /> Apply period
      </button>
    </div>
  )
}

// Mobile metric card
function MobileMetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'linear-gradient(180deg, var(--bg-surface), var(--bg-surface-2))', border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 10px 22px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// Mobile chart card wrapper
function MobileCard({ title, children, height = 200 }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>{title}</div>
      </div>
      <div style={{ height, padding: '4px' }}>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AirQualityPage() {
  const now = new Date()
  const [histYear,      setHistYear]      = useState(now.getFullYear())
  const [histMonth,     setHistMonth]     = useState(now.getMonth() + 1)
  const [isMobile,      setIsMobile]      = useState(false)
  const [mobileTab,     setMobileTab]     = useState('live')
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [layoutOpen,    setLayoutOpen]    = useState(false)

  const { layout, toggleSize, toggleVisible, reorder, resetLayout } = useWidgetLayout()
  const data = useAirQualityData(histMonth, histYear)
  const { latestAQI, peakAQI, minAQI, avgAQI, monthAvg, loading, loadingHist, loadToday, loadHistory, toast } = data

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 860)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE
  // ══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))', paddingTop: 'env(safe-area-inset-top)' }}>

        {/* Mobile header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--card-air-bg)', border: '1px solid var(--card-air-accent, rgba(0,0,0,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wind size={15} style={{ color: 'var(--card-air-accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>Air Quality</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Real-time · 5m refresh</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {latestAQI != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, background: `${aqiColor(latestAQI)}12`, border: `1px solid ${aqiColor(latestAQI)}30` }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 800, color: aqiColor(latestAQI) }}>{latestAQI.toFixed(1)}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: aqiColor(latestAQI) }}>{aqiLabel(latestAQI)}</span>
              </div>
            )}
            <button onClick={() => setSettingsOpen(true)} style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-primary)' }}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {mobileTab === 'live' && (
            <>
              {!loading && latestAQI != null && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <MobileMetricCard label="Current AQI" value={latestAQI.toFixed(1)} sub="Latest reading" color={aqiColor(latestAQI)} />
                  <MobileMetricCard label="Today avg"   value={avgAQI?.toFixed(1) ?? '—'} sub="Mean today" color={avgAQI != null ? aqiColor(avgAQI) : undefined} />
                  <MobileMetricCard label="Peak max"    value={peakAQI?.toFixed(1) ?? '—'} sub="Today" color={peakAQI != null ? aqiColor(peakAQI) : undefined} />
                  <MobileMetricCard label="Monthly avg" value={monthAvg ?? '—'} sub={`${MONTHS[histMonth - 1]} ${histYear}`} />
                </div>
              )}
              <MobileCard title="AQI — Today" height={200}>
                <AQITodayChart data={data.aqiData} loading={loading} gradientId="gaqi_mob_live" />
              </MobileCard>
              <MobileCard title="AQI 24h — by Hour" height={180}>
                <AQISparklineChart data={data.aqiData} loading={loading} />
              </MobileCard>
            </>
          )}

          {mobileTab === 'gas' && (
            <>
              <MobileCard title="Gas Concentrations — Today" height={220}>
                <GasTodayChart data={data.gasData} loading={loading} />
              </MobileCard>
              <MobileCard title="Latest Gas Snapshot" height={200}>
                <GasSnapshotChart data={data.gasData} loading={loading} />
              </MobileCard>
            </>
          )}

          {mobileTab === 'history' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{MONTHS[histMonth - 1]} {histYear}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>tap ⚙️ to change period</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {monthAvg && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: aqiColor(parseFloat(monthAvg)) }}>{monthAvg}</span>}
                  <button onClick={loadHistory} disabled={loadingHist} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw size={14} style={{ animation: loadingHist ? 'spin 0.8s linear infinite' : 'none' }} />
                  </button>
                </div>
              </div>
              <MobileCard title={`Daily — ${MONTHS[histMonth - 1]} ${histYear}`} height={180}>
                <DailyHistoryChart data={data.weeklyData} loading={loadingHist} />
              </MobileCard>
              <MobileCard title={`Monthly averages — ${histYear}`} height={180}>
                <MonthlyHistoryChart data={data.monthlyData} loading={loadingHist} gradientId="gairm_mob" />
              </MobileCard>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <AirQualityRangeChart />
              </div>
            </>
          )}

          {mobileTab === 'logs' && (
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
              <PicoLogsPanel />
            </div>
          )}

        </div>

        <BottomNav active={mobileTab} onChange={setMobileTab} />

        {/* Mobile Settings sheet */}
        <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings" maxHeight="88vh">
          {latestAQI != null && (
            <div style={{ margin: '16px 20px', padding: '14px', borderRadius: 14, background: `${aqiColor(latestAQI)}12`, border: `1px solid ${aqiColor(latestAQI)}30`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 800, color: aqiColor(latestAQI), lineHeight: 1 }}>{latestAQI.toFixed(1)}</div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{aqiLabel(latestAQI)}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>Current Air Quality Index</div>
              </div>
            </div>
          )}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>Data</div>
            <div onClick={() => { loadToday(); setSettingsOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', cursor: 'pointer' }}>
              <RefreshCw size={16} style={{ color: 'var(--card-air-accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Refresh now</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>Reload live AQI and gas data</div>
              </div>
              <CRight size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>History period</div>
            <MobilePeriodNav month={histMonth} year={histYear} onChangeMonth={setHistMonth} onChangeYear={setHistYear} onApply={() => { loadHistory(); setSettingsOpen(false) }} />
          </div>
          <div style={{ height: 24 }} />
        </BottomSheet>

        <Toast toast={toast} />
        <style>{`
          @keyframes spin     { to { transform: rotate(360deg) } }
          @keyframes blink    { 0%,100% { opacity:1 } 50% { opacity:0 } }
          @keyframes slideUp  { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DESKTOP  — widget grid
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="animate-fade">

      {/* Desktop header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">Air Qua<span style={{ color: 'var(--accent)' }}>lity</span></h1>
          <p className="page-subtitle">Real-time monitoring and gas analysis</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem' }}>
          {latestAQI != null && (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 500, color: aqiColor(latestAQI) }}>{latestAQI.toFixed(1)}</span>
              <span className="badge" style={{ color: aqiColor(latestAQI), borderColor: aqiColor(latestAQI), background: `${aqiColor(latestAQI)}18` }}>
                <span className="dot" style={{ background: aqiColor(latestAQI) }} />
                {aqiLabel(latestAQI)}
              </span>
            </>
          )}
          <button onClick={loadToday} className="btn btn--ghost btn--sm" title="Refresh" style={{ padding: '0.3rem 0.5rem' }} disabled={loading}>
            <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => setLayoutOpen(v => !v)} title="Manage layout"
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 9, border: `1px solid ${layoutOpen ? 'var(--accent)' : 'var(--border)'}`, background: layoutOpen ? 'rgba(99,102,241,0.1)' : 'var(--bg-surface-2)', cursor: 'pointer', color: layoutOpen ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.15s' }}>
            <LayoutGrid size={14} />
            Layout
          </button>
        </div>
      </div>

      {/* Metric pills */}
      {!loading && latestAQI != null && (
        <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <MetricPill label="Current AQI" value={latestAQI.toFixed(1)} sub="Latest reading" color={aqiColor(latestAQI)} />
          <MetricPill label="Today avg"   value={avgAQI?.toFixed(1) ?? '—'} sub="Mean today" color={avgAQI != null ? aqiColor(avgAQI) : undefined} />
          <MetricPill label="Peak max"    value={peakAQI?.toFixed(1) ?? '—'} sub="Today" color={peakAQI != null ? aqiColor(peakAQI) : undefined} />
          <MetricPill label="Peak min"    value={minAQI?.toFixed(1)  ?? '—'} sub="Today" color={minAQI  != null ? aqiColor(minAQI)  : undefined} />
          <MetricPill label="Monthly avg" value={monthAvg ?? '—'} sub={`${MONTHS[histMonth - 1]} ${histYear}`} />
        </div>
      )}

      {/* Widget grid */}
      <WidgetGrid
        layout={layout}
        onToggleSize={toggleSize}
        onReorder={reorder}
        data={data}
        histMonth={histMonth}
        histYear={histYear}
        setHistMonth={setHistMonth}
        setHistYear={setHistYear}
        loadHistory={loadHistory}
        loadingHist={loadingHist}
      />

      {/* Layout manager panel */}
      {layoutOpen && (
        <LayoutManagerPanel
          layout={layout}
          onToggleVisible={toggleVisible}
          onReset={() => { resetLayout(); setLayoutOpen(false) }}
          onClose={() => setLayoutOpen(false)}
        />
      )}

      <Toast toast={toast} />
      <style>{`
        @keyframes spin     { to { transform: rotate(360deg) } }
        @keyframes blink    { 0%,100% { opacity:1 } 50% { opacity:0 } }
        @keyframes slideUp  { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  )
}