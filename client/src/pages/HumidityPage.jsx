import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Droplets, TrendingUp, CalendarDays,
  LineChart as LineChartIcon, RefreshCw, Search,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Constants ──────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

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

// ── Shared chart card ──────────────────────────────────────
function ChartCard({ title, icon: Icon, badge, children, controls }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background:'var(--card-hum-bg)', color:'var(--card-hum-accent)' }}>
          <Icon size={15}/>
        </div>
        <span className="card-header-title">{title}</span>
        {badge && (
          <span className="badge badge--accent" style={{ marginLeft:'auto' }}>{badge}</span>
        )}
      </div>
      {controls && (
        <div style={{ padding:'0.75rem 1.25rem', borderBottom:'1px solid var(--border)',
          background:'var(--bg-surface-2)', display:'flex', flexWrap:'wrap', gap:'0.75rem', alignItems:'flex-end' }}>
          {controls}
        </div>
      )}
      <div className="card-body" style={{ height:280 }}>
        {children}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function HumidityPage() {
  const { toast, showToast } = useToast()

  const now = new Date()
  const [month,          setMonth]          = useState(now.getMonth() + 1)
  const [year,           setYear]           = useState(now.getFullYear())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareMonth,   setCompareMonth]   = useState(now.getMonth() + 1)
  const [compareYear,    setCompareYear]    = useState(now.getFullYear() - 1)
  const [startDate,      setStartDate]      = useState('')
  const [endDate,        setEndDate]        = useState('')

  // Chart data
  const [todayData,   setTodayData]   = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [dailyData,   setDailyData]   = useState([])
  const [compareData, setCompareData] = useState(null)
  const [rangeData,   setRangeData]   = useState([])

  const [loadingCharts, setLoadingCharts] = useState(false)
  const [loadingRange,  setLoadingRange]  = useState(false)

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 5 + i)

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    loadCharts(month, year, false, null, null)
  }, [])

  // ── Chart loader ──────────────────────────────────────────
  const loadCharts = useCallback(async (m, y, cmp, cm, cy) => {
    setLoadingCharts(true)
    try {
      const [today, monthly, daily] = await Promise.all([
        fetch('/api/today_humidity').then(r => r.json()).catch(() => ({})),
        fetch(`/api/monthly_average_humidity/${y}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/monthly_average_humidity/${m}/${y}`).then(r => r.json()).catch(() => ({})),
      ])

      // Today chart — { hour: humidity }
      setTodayData(
        Object.keys(today).map(Number).sort((a,b) => a-b)
          .map(h => ({ hour:`${h}:00`, hum: today[h] ?? null }))
      )

      // Monthly chart — { 1..12: avgHumidity }
      setMonthlyData(
        MONTHS.map((n,i) => ({ month:n.substring(0,3), hum: monthly[i+1] ?? null }))
      )

      // Daily chart — { 1..31: avgHumidity }
      const days = Array.from({ length:31 }, (_,i) => i+1)
      setDailyData(days.map(d => ({ day:`${d}`, hum: daily[d] ?? null })))

      if (cmp && cm && cy) {
        const cd = await fetch(`/api/monthly_average_humidity/${cm}/${cy}`)
          .then(r => r.json()).catch(() => ({}))
        setCompareData(days.map(d => cd[d] ?? null))
      } else {
        setCompareData(null)
      }
    } catch {
      showToast('Error loading charts', 'error')
    } finally {
      setLoadingCharts(false)
    }
  }, [])

  const handleFetchRange = async () => {
    if (!startDate || !endDate) { showToast('Select both dates', 'error'); return }
    if (new Date(startDate) >= new Date(endDate)) { showToast('End must be after start', 'error'); return }
    setLoadingRange(true)
    try {
      const d = await fetch(`/api/humidity_average/${startDate}/${endDate}`).then(r => r.json())
      setRangeData((d || []).map(e => ({
        time: new Date(e.hour).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit' }),
        hum: e.avg_humidity,
      })))
      if (!d?.length) showToast('No data for this range', 'warning')
    } catch {
      showToast('Failed to fetch range data', 'error')
    } finally {
      setLoadingRange(false)
    }
  }

  // ── Daily chart controls ───────────────────────────────────
  const DailyControls = (
    <>
      {[
        { label:'Month', val:month, set:setMonth,
          el: <select className="select" style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
                value={month} onChange={e => setMonth(+e.target.value)}>
                {MONTHS.map((n,i) => <option key={i} value={i+1}>{n}</option>)}
              </select>
        },
        { label:'Year', val:year, set:setYear,
          el: <select className="select" style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
                value={year} onChange={e => setYear(+e.target.value)}>
                {years.map(y => <option key={y}>{y}</option>)}
              </select>
        },
      ].map(f => (
        <div key={f.label} className="field" style={{ flex:1, minWidth:110 }}>
          <label className="field-label">{f.label}</label>
          {f.el}
        </div>
      ))}

      <div className="field" style={{ flex:'none', justifyContent:'flex-end' }}>
        <label className="field-label" style={{ opacity:0 }}>-</label>
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          <input type="checkbox" id="cmp" checked={compareEnabled}
            onChange={e => setCompareEnabled(e.target.checked)}/>
          <label htmlFor="cmp" style={{ fontSize:'0.75rem', color:'var(--text-secondary)', cursor:'pointer' }}>
            Compare
          </label>
        </div>
      </div>

      {compareEnabled && <>
        <div className="field" style={{ flex:1, minWidth:110 }}>
          <label className="field-label">Cmp Month</label>
          <select className="select" style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
            value={compareMonth} onChange={e => setCompareMonth(+e.target.value)}>
            {MONTHS.map((n,i) => <option key={i} value={i+1}>{n}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex:1, minWidth:90 }}>
          <label className="field-label">Cmp Year</label>
          <select className="select" style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
            value={compareYear} onChange={e => setCompareYear(+e.target.value)}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </>}

      <button className="btn btn--primary btn--sm"
        style={{ alignSelf:'flex-end', whiteSpace:'nowrap' }}
        onClick={() => loadCharts(month, year, compareEnabled, compareMonth, compareYear)}
        disabled={loadingCharts}>
        <RefreshCw size={13} style={{ animation: loadingCharts ? 'spin 0.8s linear infinite' : 'none' }}/>
        Update
      </button>
    </>
  )

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Humi<span style={{ color:'var(--accent)' }}>dity</span></h1>
        <p className="page-subtitle">Real-time humidity monitoring and historical data visualization</p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>

        {/* Today */}
        <ChartCard title="Today's Humidity" icon={Droplets} badge="Real-time">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={todayData}>
              <defs>
                <linearGradient id="gh-today" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--card-hum-accent)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--card-hum-accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="hour" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
              <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="%"/>
              <Tooltip {...TOOLTIP_STYLE} formatter={v => [v != null ? `${v}%` : 'N/A', 'Humidity']}/>
              <Area type="monotone" dataKey="hum" stroke="var(--card-hum-accent)"
                fill="url(#gh-today)" strokeWidth={2}
                dot={{ r:3, fill:'var(--card-hum-accent)', strokeWidth:0 }} connectNulls/>
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Monthly average */}
        <ChartCard title="Monthly Average" icon={TrendingUp} badge={`${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="gh-monthly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--card-hum-tag)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--card-hum-tag)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="month" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
              <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="%"/>
              <Tooltip {...TOOLTIP_STYLE} formatter={v => [v != null ? `${v}%` : 'N/A', `Avg ${year}`]}/>
              <Area type="monotone" dataKey="hum" stroke="var(--card-hum-tag)"
                fill="url(#gh-monthly)" strokeWidth={2}
                dot={{ r:3, fill:'var(--card-hum-tag)', strokeWidth:0 }} connectNulls/>
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Daily analysis */}
        <ChartCard title="Daily Analysis" icon={CalendarDays} controls={DailyControls}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyData.map((d,i) => ({ ...d, compare: compareData ? compareData[i] : undefined }))}
              barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="day" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
              <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="%"/>
              <Tooltip {...TOOLTIP_STYLE}/>
              <Legend wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-secondary)' }}/>
              <Bar dataKey="hum" name={`${MONTHS[month-1].substring(0,3)} ${year}`}
                fill="var(--card-hum-accent)" radius={[3,3,0,0]} maxBarSize={18}/>
              {compareData && (
                <Bar dataKey="compare" name={`${MONTHS[compareMonth-1].substring(0,3)} ${compareYear}`}
                  fill="var(--card-shop-accent)" radius={[3,3,0,0]} maxBarSize={18}/>
              )}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Custom range */}
        <ChartCard
          title="Custom Date Range"
          icon={LineChartIcon}
          controls={
            <>
              {[
                { label:'Start Date', val:startDate, set:setStartDate },
                { label:'End Date',   val:endDate,   set:setEndDate },
              ].map(f => (
                <div key={f.label} className="field" style={{ flex:1, minWidth:160 }}>
                  <label className="field-label">{f.label}</label>
                  <input type="datetime-local" className="input input--mono"
                    style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
                    value={f.val} onChange={e => f.set(e.target.value)}/>
                </div>
              ))}
              <button className="btn btn--primary btn--sm"
                style={{ alignSelf:'flex-end', whiteSpace:'nowrap' }}
                onClick={handleFetchRange} disabled={loadingRange}>
                <Search size={13} style={{ animation: loadingRange ? 'spin 0.8s linear infinite' : 'none' }}/>
                Fetch
              </button>
            </>
          }
        >
          {rangeData.length === 0 ? (
            <div className="empty-state">
              <LineChartIcon size={28}/><div>Select a date range and fetch data</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rangeData}>
                <defs>
                  <linearGradient id="gh-range" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-hum-accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--card-hum-accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="time" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}
                  interval="preserveStartEnd"/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="%"/>
                <Tooltip {...TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Avg Humidity']}/>
                <Area type="monotone" dataKey="hum" stroke="var(--card-hum-accent)"
                  fill="url(#gh-range)" strokeWidth={2} dot={false} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}