import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Droplets, TrendingUp, CalendarDays, LineChart as LineChartIcon, RefreshCw, Search } from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { api } from '../api'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const TT = {
  contentStyle: {
    background:'var(--bg-surface)', border:'1px solid var(--border-strong)',
    borderRadius:8, fontFamily:'var(--font-mono)', fontSize:'0.72rem',
    color:'var(--text-primary)', boxShadow:'var(--shadow-md)',
  },
  cursor: { stroke:'var(--border-strong)', strokeDasharray:'3 3' },
}

function ChartCard({ title, icon: Icon, badge, controls, height=200, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon icon-blue"><Icon size={14}/></div>
        <span className="card-header-title">{title}</span>
        {badge && <span className="badge badge--muted" style={{marginLeft:'auto'}}>{badge}</span>}
      </div>
      {controls && (
        <div style={{padding:'0.875rem 1rem',borderBottom:'1px solid var(--border)',background:'var(--bg-surface-2)',display:'flex',flexWrap:'wrap',gap:'0.6rem',alignItems:'flex-end'}}>
          {controls}
        </div>
      )}
      <div style={{padding:'1rem 0.5rem 0.75rem',height}}>
        {children}
      </div>
    </div>
  )
}

export default function HumidityPage() {
  const { toast, showToast } = useToast()
  const now = new Date()

  // Current sensor value
  const [currentHum, setCurrentHum] = useState(null)
  const [humMM,       setHumMM]      = useState(null)

  const [month,          setMonth]          = useState(now.getMonth()+1)
  const [year,           setYear]           = useState(now.getFullYear())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareMonth,   setCompareMonth]   = useState(now.getMonth()+1)
  const [compareYear,    setCompareYear]    = useState(now.getFullYear()-1)
  const [startDate,      setStartDate]      = useState('')
  const [endDate,        setEndDate]        = useState('')

  const [todayData,     setTodayData]     = useState([])
  const [monthlyData,   setMonthlyData]   = useState([])
  const [dailyData,     setDailyData]     = useState([])
  const [compareData,   setCompareData]   = useState(null)
  const [rangeData,     setRangeData]     = useState([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [loadingRange,  setLoadingRange]  = useState(false)

  const years = Array.from({length:6},(_,i)=>now.getFullYear()-5+i)

  // Load sensor + charts on mount
  useEffect(() => {
    api.getSensors().then(d=>{
      setCurrentHum(parseFloat(d.humidity.current).toFixed(0))
      const mm = d.humidity.minMaxLast24Hours
      setHumMM(`${parseFloat(mm[0]).toFixed(0)} – ${parseFloat(mm[1]).toFixed(0)}`)
    }).catch(()=>{})
    loadCharts(month, year, false, null, null)

    const id = setInterval(()=>{
      api.getSensors().then(d=>setCurrentHum(parseFloat(d.humidity.current).toFixed(0))).catch(()=>{})
    }, 30000)
    return ()=>clearInterval(id)
  }, [])

  const loadCharts = useCallback(async (m,y,cmp,cm,cy) => {
    setLoadingCharts(true)
    try {
      const [today,monthly,daily] = await Promise.all([
        api.getTodayHum().catch(()=>({})),
        api.getMonthlyHum(y).catch(()=>({})),
        api.getDailyHum(m,y).catch(()=>({})),
      ])
      setTodayData(Object.keys(today).map(Number).sort((a,b)=>a-b).map(h=>({hour:`${h}:00`,hum:today[h]??null})))
      setMonthlyData(MONTHS.map((n,i)=>({month:n.substring(0,3),hum:monthly[i+1]??null})))
      const days=Array.from({length:31},(_,i)=>i+1)
      setDailyData(days.map(d=>({day:`${d}`,hum:daily[d]??null})))
      if(cmp&&cm&&cy){const cd=await api.getDailyHum(cm,cy).catch(()=>({}));setCompareData(days.map(d=>cd[d]??null))}
      else setCompareData(null)
    } catch {} finally { setLoadingCharts(false) }
  }, [])

  const fetchRange = async () => {
    if(!startDate||!endDate){showToast('Select both dates','error');return}
    if(new Date(startDate)>=new Date(endDate)){showToast('End must be after start','error');return}
    setLoadingRange(true)
    try {
      const d = await api.getRangeHum(startDate,endDate)
      setRangeData((d||[]).map(e=>({time:new Date(e.hour).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit'}),hum:e.avg_humidity})))
      if(!d?.length) showToast('No data','warning')
    } catch { showToast('Error','error') } finally { setLoadingRange(false) }
  }

  // Humidity comfort level
  const humN = parseFloat(currentHum)
  const comfort = !currentHum ? null
    : humN < 30 ? { label:'Too dry',    color:'var(--color-warning)' }
    : humN > 60 ? { label:'Too humid',  color:'var(--color-danger)'  }
    :             { label:'Comfortable',color:'var(--color-success)'  }

  const DailyControls = (
    <>
      <div className="field" style={{flex:1,minWidth:110}}>
        <label className="field-label">Month</label>
        <select className="select" style={{padding:'0.42rem 0.6rem',fontSize:'0.8rem'}} value={month} onChange={e=>setMonth(+e.target.value)}>
          {MONTHS.map((n,i)=><option key={i} value={i+1}>{n}</option>)}
        </select>
      </div>
      <div className="field" style={{flex:1,minWidth:90}}>
        <label className="field-label">Year</label>
        <select className="select" style={{padding:'0.42rem 0.6rem',fontSize:'0.8rem'}} value={year} onChange={e=>setYear(+e.target.value)}>
          {years.map(y=><option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="field" style={{flex:'none',justifyContent:'flex-end'}}>
        <label className="field-label" style={{opacity:0}}>-</label>
        <label style={{display:'flex',alignItems:'center',gap:'0.4rem',cursor:'pointer',fontSize:'0.78rem',color:'var(--text-secondary)'}}>
          <input type="checkbox" checked={compareEnabled} onChange={e=>setCompareEnabled(e.target.checked)}/> Compare
        </label>
      </div>
      {compareEnabled && <>
        <div className="field" style={{flex:1,minWidth:110}}>
          <label className="field-label">Cmp Month</label>
          <select className="select" style={{padding:'0.42rem 0.6rem',fontSize:'0.8rem'}} value={compareMonth} onChange={e=>setCompareMonth(+e.target.value)}>
            {MONTHS.map((n,i)=><option key={i} value={i+1}>{n}</option>)}
          </select>
        </div>
        <div className="field" style={{flex:1,minWidth:90}}>
          <label className="field-label">Cmp Year</label>
          <select className="select" style={{padding:'0.42rem 0.6rem',fontSize:'0.8rem'}} value={compareYear} onChange={e=>setCompareYear(+e.target.value)}>
            {years.map(y=><option key={y}>{y}</option>)}
          </select>
        </div>
      </>}
      <button className="btn btn--primary btn--sm" style={{alignSelf:'flex-end'}} onClick={()=>loadCharts(month,year,compareEnabled,compareMonth,compareYear)} disabled={loadingCharts}>
        <RefreshCw size={12} style={{animation:loadingCharts?'spin 0.8s linear infinite':'none'}}/> Update
      </button>
    </>
  )

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Humidity</h1>
        <p className="page-subtitle">Real-time monitoring & historical data</p>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>

        {/* ── Current reading ── */}
        <div className="card">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',borderBottom:'1px solid var(--border)'}}>
            {/* Big number */}
            <div style={{padding:'1.5rem',borderRight:'1px solid var(--border)'}}>
              <div style={{fontSize:'0.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-muted)',marginBottom:'0.5rem'}}>Current humidity</div>
              <div style={{fontFamily:'var(--font-mono)',fontSize:'3rem',fontWeight:500,color:'var(--card-hum-accent)',lineHeight:1}}>
                {currentHum ?? '—'}
                <span style={{fontSize:'1.25rem',color:'var(--text-muted)',fontWeight:400}}>%</span>
              </div>
              {comfort && (
                <div style={{marginTop:'0.75rem',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                  <span className="dot" style={{background:comfort.color}}/>
                  <span style={{fontSize:'0.75rem',color:comfort.color,fontWeight:500}}>{comfort.label}</span>
                </div>
              )}
            </div>
            {/* 24h stats */}
            <div style={{padding:'1.5rem'}}>
              <div style={{fontSize:'0.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-muted)',marginBottom:'0.5rem'}}>Last 24 hours</div>
              {humMM ? (
                <div style={{fontFamily:'var(--font-mono)',fontSize:'1.5rem',fontWeight:500,color:'var(--text-primary)',lineHeight:1.3}}>
                  {humMM}
                  <span style={{fontSize:'0.9rem',color:'var(--text-muted)',fontWeight:400}}>%</span>
                </div>
              ) : (
                <div style={{fontFamily:'var(--font-mono)',fontSize:'1.5rem',color:'var(--text-muted)'}}>—</div>
              )}
              <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:'0.4rem'}}>min – max</div>
            </div>
          </div>
          {/* Comfort band indicator */}
          <div style={{padding:'0.75rem 1.25rem',background:'var(--bg-surface-2)'}}>
            <div style={{fontSize:'0.68rem',color:'var(--text-muted)',marginBottom:'0.5rem',fontFamily:'var(--font-mono)'}}>Comfort range: 30–60%</div>
            <div style={{height:6,borderRadius:3,background:'var(--border)',position:'relative',overflow:'hidden'}}>
              <div style={{
                position:'absolute',left:'30%',width:'30%',height:'100%',
                background:'var(--color-success)',opacity:0.5,borderRadius:3,
              }}/>
              {currentHum && (
                <div style={{
                  position:'absolute',top:-1,
                  left:`${Math.min(Math.max(humN,0),100)}%`,
                  transform:'translateX(-50%)',
                  width:8,height:8,borderRadius:'50%',
                  background: comfort?.color || 'var(--text-muted)',
                  border:'2px solid var(--bg-surface)',
                  transition:'left 0.5s ease',
                }}/>
              )}
            </div>
          </div>
        </div>

        {/* ── Charts ── */}
        <ChartCard title="Today's readings" icon={Droplets} badge="Live">
          {todayData.length===0 ? <div className="empty-state" style={{padding:'1.5rem'}}><Droplets size={20}/><div>No data yet today</div></div> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={todayData} margin={{left:-16,right:8}}>
                <defs><linearGradient id="ght" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--card-hum-accent)" stopOpacity={0.18}/><stop offset="95%" stopColor="var(--card-hum-accent)" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="hour" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} unit="%" axisLine={false} tickLine={false} width={36}/>
                <Tooltip {...TT} formatter={v=>[v!=null?`${v}%`:'N/A','Humidity']}/>
                <Area type="monotone" dataKey="hum" stroke="var(--card-hum-accent)" fill="url(#ght)" strokeWidth={2} dot={false} activeDot={{r:4,fill:'var(--card-hum-accent)',strokeWidth:0}} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly average" icon={TrendingUp} badge={`${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{left:-16,right:8}}>
              <defs><linearGradient id="ghm" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--card-hum-accent)" stopOpacity={0.12}/><stop offset="95%" stopColor="var(--card-hum-accent)" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="month" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} unit="%" axisLine={false} tickLine={false} width={36}/>
              <Tooltip {...TT} formatter={v=>[v!=null?`${v}%`:'N/A',`Avg ${year}`]}/>
              <Area type="monotone" dataKey="hum" stroke="var(--card-hum-accent)" fill="url(#ghm)" strokeWidth={2} dot={false} activeDot={{r:4}} connectNulls/>
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily breakdown" icon={CalendarDays} controls={DailyControls}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData.map((d,i)=>({...d,compare:compareData?compareData[i]:undefined}))} margin={{left:-16,right:8}} barGap={1}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
              <XAxis dataKey="day" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} unit="%" axisLine={false} tickLine={false} width={36}/>
              <Tooltip {...TT}/>
              {compareData && <Legend wrapperStyle={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-secondary)'}}/>}
              <Bar dataKey="hum" name={`${MONTHS[month-1].substring(0,3)} ${year}`} fill="var(--card-hum-accent)" radius={[3,3,0,0]} maxBarSize={14}/>
              {compareData && <Bar dataKey="compare" name={`${MONTHS[compareMonth-1].substring(0,3)} ${compareYear}`} fill="var(--card-shop-accent)" radius={[3,3,0,0]} maxBarSize={14}/>}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Custom range" icon={LineChartIcon}
          controls={<>
            {[{label:'Start',val:startDate,set:setStartDate},{label:'End',val:endDate,set:setEndDate}].map(f=>(
              <div key={f.label} className="field" style={{flex:1,minWidth:150}}>
                <label className="field-label">{f.label}</label>
                <input type="datetime-local" className="input input--mono" style={{padding:'0.42rem 0.6rem',fontSize:'0.78rem'}} value={f.val} onChange={e=>f.set(e.target.value)}/>
              </div>
            ))}
            <button className="btn btn--primary btn--sm" style={{alignSelf:'flex-end'}} onClick={fetchRange} disabled={loadingRange}>
              <Search size={12} style={{animation:loadingRange?'spin 0.8s linear infinite':'none'}}/> Fetch
            </button>
          </>}
        >
          {rangeData.length===0 ? (
            <div className="empty-state" style={{padding:'1.5rem'}}><LineChartIcon size={20}/><div>Pick a date range above</div></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rangeData} margin={{left:-16,right:8}}>
                <defs><linearGradient id="ghr" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--card-hum-accent)" stopOpacity={0.15}/><stop offset="95%" stopColor="var(--card-hum-accent)" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="time" tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={{fontFamily:'var(--font-mono)',fontSize:9,fill:'var(--text-muted)'}} unit="%" axisLine={false} tickLine={false} width={36}/>
                <Tooltip {...TT} formatter={v=>[`${v}%`,'Avg Humidity']}/>
                <Area type="monotone" dataKey="hum" stroke="var(--card-hum-accent)" fill="url(#ghr)" strokeWidth={2} dot={false} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

      <Toast toast={toast}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}