import { useState, useEffect } from 'react'
import { Wind, Activity, TrendingUp, Calendar, RefreshCw } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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

function ChartCard({ title, icon: Icon, badge, children, height=220 }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background:'var(--card-air-bg)', color:'var(--card-air-accent)' }}>
          <Icon size={14}/>
        </div>
        <span className="card-header-title">{title}</span>
        {badge && <span className="badge badge--muted" style={{ marginLeft:'auto' }}>{badge}</span>}
      </div>
      <div style={{ padding:'1rem 0.5rem 0.75rem', height }}>{children}</div>
    </div>
  )
}

export default function AirQualityPage() {
  const { toast, showToast } = useToast()
  const now = new Date()

  const [aqiData,     setAqiData]     = useState([])
  const [gasData,     setGasData]     = useState([])
  const [weeklyData,  setWeeklyData]  = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [latestAQI,   setLatestAQI]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [histYear,    setHistYear]    = useState(now.getFullYear())
  const [histMonth,   setHistMonth]   = useState(now.getMonth()+1)
  const [loadingHist, setLoadingHist] = useState(false)

  const years = Array.from({length:3},(_,i)=>now.getFullYear()-i)

  // Load today's data
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [aqi, gas] = await Promise.all([
          fetch('/api/air_quality_today').then(r=>r.json()).catch(()=>({})),
          fetch('/api/gas_concentration_today').then(r=>r.json()).catch(()=>({})),
        ])

        // AQI today
        let aqiArr = []
        if (Array.isArray(aqi)) {
          aqiArr = aqi.map(e=>({ hour:`${e.hour}:00`, aqi:parseFloat(e.aqi) }))
        } else if (typeof aqi==='object') {
          aqiArr = Object.keys(aqi).map(Number).sort((a,b)=>a-b)
            .map(h=>({ hour:`${h}:00`, aqi:parseFloat(aqi[h])||0 }))
        }
        setAqiData(aqiArr)
        if (aqiArr.length) setLatestAQI(aqiArr[aqiArr.length-1].aqi)

        // Gas today
        if (typeof gas==='object'&&!Array.isArray(gas)) {
          setGasData(Object.keys(gas).map(Number).sort((a,b)=>a-b).map(h=>({
            hour:`${h}:00`,
            smoke:    parseFloat(gas[h]?.avg_smoke||0).toFixed(2),
            lpg:      parseFloat(gas[h]?.avg_lpg||0).toFixed(2),
            methane:  parseFloat(gas[h]?.avg_methane||0).toFixed(2),
            hydrogen: parseFloat(gas[h]?.avg_hydrogen||0).toFixed(2),
          })))
        }
      } catch { showToast('Error loading data','error') }
      finally { setLoading(false) }
    }
    load()
    const id = setInterval(load, 5*60*1000)
    return ()=>clearInterval(id)
  }, [])

  // Load historical data when month/year changes
  useEffect(() => { loadHistory() }, [histYear, histMonth])

  const loadHistory = async () => {
    setLoadingHist(true)
    try {
      // Weekly average for selected month
      const weekly = await fetch(`/api/air_quality_monthly/${histMonth}/${histYear}`)
        .then(r=>r.json()).catch(()=>({}))

      if (typeof weekly==='object'&&!Array.isArray(weekly)) {
        const days = Array.from({length:31},(_,i)=>i+1)
        setWeeklyData(days.map(d=>({
          day: `${d}`,
          aqi: weekly[d]!=null ? parseFloat(weekly[d]).toFixed(1) : null,
        })).filter(d=>d.aqi!=null))
      }

      // Monthly averages for selected year
      const monthly = await fetch(`/api/air_quality_yearly/${histYear}`)
        .then(r=>r.json()).catch(()=>({}))

      if (typeof monthly==='object'&&!Array.isArray(monthly)) {
        setMonthlyData(MONTHS.map((name,i)=>({
          month: name,
          aqi: monthly[i+1]!=null ? parseFloat(monthly[i+1]).toFixed(1) : null,
        })))
      }
    } catch {}
    finally { setLoadingHist(false) }
  }

  return (
    <div className="animate-fade">
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start',
        justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <h1 className="page-title">Air Quality</h1>
          <p className="page-subtitle">Real-time monitoring and gas analysis</p>
        </div>
        {latestAQI!=null && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.35rem' }}>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'1.5rem', fontWeight:500,
              color:aqiColor(latestAQI) }}>{latestAQI.toFixed(1)}</span>
            <span className="badge" style={{
              color:aqiColor(latestAQI),
              borderColor:aqiColor(latestAQI),
              background:`${aqiColor(latestAQI)}18`,
            }}>
              <span className="dot" style={{ background:aqiColor(latestAQI) }}/>
              {aqiLabel(latestAQI)}
            </span>
          </div>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

        {/* AQI today */}
        <ChartCard title="Air Quality Index — Today" icon={Wind} badge="Live">
          {loading ? <div className="loading-box"><span className="spinner"/></div>
          : aqiData.length===0 ? <div className="empty-state"><Wind size={20}/><div>No data today</div></div>
          : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={aqiData} margin={{left:-16,right:8}}>
                <defs><linearGradient id="gaqi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0}/>
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="hour" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} width={32}/>
                <Tooltip {...TT} formatter={v=>[`${v}`,'AQI']}/>
                <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)"
                  fill="url(#gaqi)" strokeWidth={2.5} dot={false}
                  activeDot={{r:4,fill:'var(--card-air-accent)',strokeWidth:0}} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Gas concentrations */}
        <ChartCard title="Gas Concentrations — Today" icon={Activity} badge="Multi-gas" height={220}>
          {loading ? <div className="loading-box"><span className="spinner"/></div>
          : gasData.length===0 ? <div className="empty-state"><Activity size={20}/><div>No data today</div></div>
          : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gasData} margin={{left:-16,right:8}}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="hour" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} width={32}/>
                <Tooltip {...TT} formatter={(v,name)=>[`${v} ppm`,name]}/>
                <Legend wrapperStyle={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-secondary)'}}/>
                {[
                  {key:'smoke',    label:'Smoke',    color:'var(--color-danger)'},
                  {key:'lpg',      label:'LPG',      color:'var(--card-hum-accent)'},
                  {key:'methane',  label:'Methane',  color:'var(--card-shop-accent)'},
                  {key:'hydrogen', label:'Hydrogen', color:'var(--card-temp-accent)'},
                ].map(g=>(
                  <Line key={g.key} type="monotone" dataKey={g.key} name={g.label}
                    stroke={g.color} strokeWidth={2}
                    dot={false} activeDot={{r:4}} connectNulls/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Historical section */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background:'var(--card-air-bg)', color:'var(--card-air-accent)' }}>
              <TrendingUp size={14}/>
            </div>
            <span className="card-header-title">Historical Analysis</span>
            <div style={{ marginLeft:'auto', display:'flex', gap:'0.5rem', alignItems:'center' }}>
              <select className="select" style={{ padding:'0.38rem 0.6rem', fontSize:'0.78rem' }}
                value={histMonth} onChange={e=>setHistMonth(+e.target.value)}>
                {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="select" style={{ padding:'0.38rem 0.6rem', fontSize:'0.78rem' }}
                value={histYear} onChange={e=>setHistYear(+e.target.value)}>
                {years.map(y=><option key={y}>{y}</option>)}
              </select>
              <button className="btn btn--ghost btn--sm" onClick={loadHistory} disabled={loadingHist}>
                <RefreshCw size={12} style={{ animation:loadingHist?'spin 0.8s linear infinite':'none' }}/>
              </button>
            </div>
          </div>

          {/* Daily breakdown */}
          <div style={{ padding:'0.75rem 0.5rem 0' }}>
            <div style={{ fontSize:'0.68rem', fontWeight:600, textTransform:'uppercase',
              letterSpacing:'0.5px', color:'var(--text-muted)', padding:'0 0.75rem', marginBottom:'0.5rem' }}>
              Daily — {MONTHS[histMonth-1]} {histYear}
            </div>
            <div style={{ height:160 }}>
              {loadingHist ? <div className="loading-box"><span className="spinner"/></div>
              : weeklyData.length===0 ? <div className="empty-state" style={{ padding:'1rem' }}><TrendingUp size={18}/><div>No data available</div></div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{left:-16,right:8}}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="day" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} width={32}/>
                    <Tooltip {...TT} formatter={v=>[`${v}`,'AQI']}/>
                    <Bar dataKey="aqi" fill="var(--card-air-accent)" radius={[3,3,0,0]} maxBarSize={16}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Monthly averages */}
          <div style={{ padding:'0 0.5rem 0.75rem' }}>
            <div style={{ fontSize:'0.68rem', fontWeight:600, textTransform:'uppercase',
              letterSpacing:'0.5px', color:'var(--text-muted)', padding:'0 0.75rem', marginBottom:'0.5rem' }}>
              Monthly averages — {histYear}
            </div>
            <div style={{ height:160 }}>
              {loadingHist ? <div className="loading-box"><span className="spinner"/></div>
              : monthlyData.length===0 ? <div className="empty-state" style={{ padding:'1rem' }}><Calendar size={18}/><div>No data available</div></div>
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{left:-16,right:8}}>
                    <defs><linearGradient id="gairm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0}/>
                    </linearGradient></defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} width={32}/>
                    <Tooltip {...TT} formatter={v=>[`${v}`,'Avg AQI']}/>
                    <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)"
                      fill="url(#gairm)" strokeWidth={2} dot={false} connectNulls/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

      </div>

      <Toast toast={toast}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}