import { useState, useEffect, useRef } from 'react'
import { Wind, Activity, TrendingUp, Calendar, RefreshCw } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

const TT = {
  contentStyle: {
    background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
    borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
    color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)',
  },
  cursor: { stroke: 'var(--border-strong)', strokeDasharray: '3 3' },
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

// ── Metric summary card ──────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '0.875rem 1rem',
    }}>
      <div style={{
        fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 500,
        color: color || 'var(--text-primary)',
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  )
}

// ── Chart card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, icon: Icon, badge, badgeLive, children, height = 220 }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
          <Icon size={14} />
        </div>
        <span className="card-header-title">{title}</span>
        {badge && (
          <span className="badge badge--muted" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            {badgeLive && <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--color-success)',
              animation: 'aq-pulse 2s ease infinite',
              display: 'inline-block',
            }} />}
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: '1rem 0.5rem 0.75rem', height }}>{children}</div>
    </div>
  )
}

// ── Loading / empty states ───────────────────────────────────────────────────
function LoadingBox() {
  return <div className="loading-box"><span className="spinner" /></div>
}
function EmptyState({ icon: Icon, label }) {
  return (
    <div className="empty-state">
      <Icon size={20} />
      <div>{label}</div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AirQualityPage() {
  const { toast, showToast } = useToast()
  const now = new Date()

  const [aqiData,     setAqiData]     = useState([])
  const [gasData,     setGasData]     = useState([])
  const [weeklyData,  setWeeklyData]  = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [latestAQI,   setLatestAQI]   = useState(null)
  const [peakAQI,     setPeakAQI]     = useState(null)
  const [minAQI,      setMinAQI]      = useState(null)
  const [monthAvg,    setMonthAvg]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [histYear,    setHistYear]    = useState(now.getFullYear())
  const [histMonth,   setHistMonth]   = useState(now.getMonth() + 1)
  const [loadingHist, setLoadingHist] = useState(false)

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  // ── Load today's data ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [aqi, gas] = await Promise.all([
          fetch('/api/air_quality_today').then(r => r.json()).catch(() => ({})),
          fetch('/api/gas_concentration_today').then(r => r.json()).catch(() => ({})),
        ])

        // AQI today
        let aqiArr = []
        if (Array.isArray(aqi)) {
          aqiArr = aqi.map(e => ({ hour: `${e.hour}:00`, aqi: parseFloat(e.aqi) }))
        } else if (typeof aqi === 'object') {
          aqiArr = Object.keys(aqi).map(Number).sort((a, b) => a - b)
            .map(h => ({ hour: `${h}:00`, aqi: parseFloat(aqi[h]) || 0 }))
        }
        setAqiData(aqiArr)

        if (aqiArr.length) {
          const values = aqiArr.map(d => d.aqi)
          setLatestAQI(aqiArr[aqiArr.length - 1].aqi)
          setPeakAQI(Math.max(...values))
          setMinAQI(Math.min(...values))
        }

        // Gas today
        if (typeof gas === 'object' && !Array.isArray(gas)) {
          setGasData(
            Object.keys(gas).map(Number).sort((a, b) => a - b).map(h => ({
              hour:     `${h}:00`,
              smoke:    parseFloat(gas[h]?.avg_smoke    || 0).toFixed(2),
              lpg:      parseFloat(gas[h]?.avg_lpg      || 0).toFixed(2),
              methane:  parseFloat(gas[h]?.avg_methane  || 0).toFixed(2),
              hydrogen: parseFloat(gas[h]?.avg_hydrogen || 0).toFixed(2),
            }))
          )
        }
      } catch {
        showToast('Error loading data', 'error')
      } finally {
        setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load historical data ───────────────────────────────────────────────────
  useEffect(() => { loadHistory() }, [histYear, histMonth])

  const loadHistory = async () => {
    setLoadingHist(true)
    try {
      // Daily averages for the selected month — endpoint now exists in Flask
      const daily = await fetch(`/api/air_quality_monthly/${histMonth}/${histYear}`)
        .then(r => r.json()).catch(() => ({}))

      if (typeof daily === 'object' && !Array.isArray(daily) && !daily.error) {
        setWeeklyData(
          Object.keys(daily).map(Number).sort((a, b) => a - b).map(d => ({
            day: `${d}`,
            aqi: parseFloat(daily[d]).toFixed(1),
          }))
        )
      } else {
        setWeeklyData([])
      }

      // Monthly averages for the selected year — endpoint now exists in Flask
      const yearly = await fetch(`/api/air_quality_yearly/${histYear}`)
        .then(r => r.json()).catch(() => ({}))

      if (typeof yearly === 'object' && !Array.isArray(yearly) && !yearly.error) {
        const filled = MONTHS.map((name, i) => ({
          month: name,
          aqi:   yearly[String(i + 1)] != null ? parseFloat(yearly[String(i + 1)]).toFixed(1) : null,
        }))
        setMonthlyData(filled)

        // Month average for the metric card
        const cur = yearly[String(histMonth)]
        setMonthAvg(cur != null ? parseFloat(cur).toFixed(1) : null)
      } else {
        setMonthlyData([])
        setMonthAvg(null)
      }
    } catch {
      showToast('Error loading historical data', 'error')
    } finally {
      setLoadingHist(false)
    }
  }

  const GAS_LINES = [
    { key: 'smoke',    label: 'Smoke',    color: 'var(--color-danger)' },
    { key: 'lpg',      label: 'LPG',      color: 'var(--card-hum-accent)' },
    { key: 'methane',  label: 'Methane',  color: 'var(--card-shop-accent)' },
    { key: 'hydrogen', label: 'Hydrogen', color: 'var(--card-temp-accent)' },
  ]

  return (
    <div className="animate-fade">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="page-header" style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div>
          <h1 className="page-title">
            Air Qua<span style={{ color: 'var(--accent)' }}>lity</span>
          </h1>
          <p className="page-subtitle">Real-time monitoring and gas analysis</p>
        </div>
        {latestAQI != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 500,
              color: aqiColor(latestAQI),
            }}>
              {latestAQI.toFixed(1)}
            </span>
            <span className="badge" style={{
              color: aqiColor(latestAQI),
              borderColor: aqiColor(latestAQI),
              background: `${aqiColor(latestAQI)}18`,
            }}>
              <span className="dot" style={{ background: aqiColor(latestAQI) }} />
              {aqiLabel(latestAQI)}
            </span>
          </div>
        )}
      </div>

      {/* ── Metric summary row ─────────────────────────────────────────── */}
      {!loading && latestAQI != null && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.625rem',
          marginBottom: '1rem',
        }}>
          <MetricCard
            label="AQI attuale"
            value={latestAQI.toFixed(1)}
            sub="Ultima rilevazione"
            color={aqiColor(latestAQI)}
          />
          <MetricCard
            label="Picco max"
            value={peakAQI?.toFixed(1) ?? '—'}
            sub="Oggi"
            color={peakAQI != null ? aqiColor(peakAQI) : undefined}
          />
          <MetricCard
            label="Picco min"
            value={minAQI?.toFixed(1) ?? '—'}
            sub="Oggi"
            color={minAQI != null ? aqiColor(minAQI) : undefined}
          />
          <MetricCard
            label="Media mensile"
            value={monthAvg ?? '—'}
            sub={`${MONTHS[histMonth - 1]} ${histYear}`}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── AQI today ────────────────────────────────────────────────── */}
        <ChartCard title="Air Quality Index — Today" icon={Wind} badge="Live" badgeLive>
          {loading
            ? <LoadingBox />
            : aqiData.length === 0
              ? <EmptyState icon={Wind} label="No data today" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aqiData} margin={{ left: -16, right: 8 }}>
                    <defs>
                      <linearGradient id="gaqi" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="hour"
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                    <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
                    <Area type="monotone" dataKey="aqi"
                      stroke="var(--card-air-accent)" fill="url(#gaqi)"
                      strokeWidth={2.5} dot={false}
                      activeDot={{ r: 4, fill: 'var(--card-air-accent)', strokeWidth: 0 }}
                      connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              )
          }
        </ChartCard>

        {/* ── Gas concentrations ───────────────────────────────────────── */}
        <ChartCard title="Gas Concentrations — Today" icon={Activity} badge="Multi-gas" height={220}>
          {loading
            ? <LoadingBox />
            : gasData.length === 0
              ? <EmptyState icon={Activity} label="No data today" />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={gasData} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="hour"
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false} tickLine={false} width={32} />
                    <Tooltip {...TT} formatter={(v, name) => [`${v} ppm`, name]} />
                    <Legend wrapperStyle={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                      color: 'var(--text-secondary)',
                    }} />
                    {GAS_LINES.map(g => (
                      <Line key={g.key} type="monotone" dataKey={g.key} name={g.label}
                        stroke={g.color} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )
          }
        </ChartCard>

        {/* ── Historical section ───────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
              <TrendingUp size={14} />
            </div>
            <span className="card-header-title">Historical Analysis</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select className="select" style={{ padding: '0.38rem 0.6rem', fontSize: '0.78rem' }}
                value={histMonth} onChange={e => setHistMonth(+e.target.value)}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select className="select" style={{ padding: '0.38rem 0.6rem', fontSize: '0.78rem' }}
                value={histYear} onChange={e => setHistYear(+e.target.value)}>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
              <button className="btn btn--ghost btn--sm" onClick={loadHistory} disabled={loadingHist}>
                <RefreshCw size={12} style={{ animation: loadingHist ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            </div>
          </div>

          {/* Daily breakdown */}
          <div style={{ padding: '0.75rem 0.5rem 0' }}>
            <div style={{
              fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--text-muted)',
              padding: '0 0.75rem', marginBottom: '0.5rem',
            }}>
              Daily — {MONTHS[histMonth - 1]} {histYear}
            </div>
            <div style={{ height: 160 }}>
              {loadingHist
                ? <LoadingBox />
                : weeklyData.length === 0
                  ? <EmptyState icon={TrendingUp} label="No data available" />
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData} margin={{ left: -16, right: 8 }}>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="day"
                          tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                          axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                          axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                        <Tooltip {...TT} formatter={v => [`${v}`, 'AQI']} />
                        <Bar dataKey="aqi" fill="var(--card-air-accent)"
                          radius={[3, 3, 0, 0]} maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
              }
            </div>
          </div>

          {/* Monthly averages */}
          <div style={{ padding: '0 0.5rem 0.75rem' }}>
            <div style={{
              fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--text-muted)',
              padding: '0 0.75rem', marginBottom: '0.5rem',
            }}>
              Monthly averages — {histYear}
            </div>
            <div style={{ height: 160 }}>
              {loadingHist
                ? <LoadingBox />
                : monthlyData.filter(d => d.aqi != null).length === 0
                  ? <EmptyState icon={Calendar} label="No data available" />
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyData} margin={{ left: -16, right: 8 }}>
                        <defs>
                          <linearGradient id="gairm" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="month"
                          tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                          axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                          axisLine={false} tickLine={false} width={32} domain={[0, 100]} />
                        <Tooltip {...TT} formatter={v => [`${v}`, 'Avg AQI']} />
                        <Area type="monotone" dataKey="aqi"
                          stroke="var(--card-air-accent)" fill="url(#gairm)"
                          strokeWidth={2} dot={false} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  )
              }
            </div>
          </div>
        </div>

      </div>

      <Toast toast={toast} />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes aq-pulse { 0%,100% { opacity:1 } 50% { opacity:.35 } }
      `}</style>
    </div>
  )
}