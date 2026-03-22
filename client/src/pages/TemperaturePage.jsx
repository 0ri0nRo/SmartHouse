import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Zap, Thermometer, Sun, TrendingUp, CalendarDays,
  LineChart as LineChartIcon, ChevronUp, ChevronDown,
  Plus, Trash2, Clock, RefreshCw, Power, Search, X,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Constants ──────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_MAP   = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

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

// ── Power button ───────────────────────────────────────────
function PowerButton({ isOn, onClick }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem', padding:'1.5rem' }}>
      <div style={{ position:'relative', width:110, height:110 }}>
        {isOn && (
          <svg viewBox="0 0 110 110" style={{ position:'absolute', inset:0, width:'100%', height:'100%', animation:'spin 8s linear infinite' }}>
            <circle cx="55" cy="55" r="51" stroke="var(--card-temp-accent)" strokeWidth="1.5"
              strokeDasharray="6 4" strokeLinecap="round" fill="none" opacity="0.6"/>
          </svg>
        )}
        <button onClick={onClick} style={{
          position:'absolute', inset:10, borderRadius:'50%',
          border:`2px solid ${isOn ? 'var(--card-temp-accent)' : 'var(--border)'}`,
          background: isOn ? 'var(--card-temp-bg)' : 'var(--bg-surface-2)',
          color: isOn ? 'var(--card-temp-accent)' : 'var(--text-secondary)',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all 0.3s',
        }}>
          <Power size={28} strokeWidth={1.5}/>
        </button>
      </div>
      <div style={{
        fontFamily:'var(--font-mono)', fontSize:'1.25rem', fontWeight:500,
        letterSpacing:3, color: isOn ? 'var(--card-temp-accent)' : 'var(--text-muted)',
      }}>
        {isOn ? 'ON' : 'OFF'}
      </div>
      <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>
        Click to toggle manually
      </div>
    </div>
  )
}

// ── Schedule modal ─────────────────────────────────────────
function ScheduleModal({ onClose, onSave }) {
  const [onTime,  setOnTime]  = useState('07:00')
  const [offTime, setOffTime] = useState('22:00')
  const [days,    setDays]    = useState('Mon,Tue,Wed,Thu,Fri')

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}><X size={18}/></button>
        <div className="modal-title">New Schedule</div>

        {[
          { label:'Turn On Time',  val:onTime,  set:setOnTime,  type:'time' },
          { label:'Turn Off Time', val:offTime, set:setOffTime, type:'time' },
        ].map(f => (
          <div key={f.label} className="field mb">
            <label className="field-label">{f.label}</label>
            <input type={f.type} className="input input--mono" value={f.val}
              onChange={e => f.set(e.target.value)}/>
          </div>
        ))}

        <div className="field mb">
          <label className="field-label">Days (Mon,Tue,Wed,Thu,Fri,Sat,Sun)</label>
          <input type="text" className="input input--mono" value={days}
            onChange={e => setDays(e.target.value)} placeholder="Mon,Tue,Wed,Thu,Fri"/>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <button className="btn btn--primary btn--full"
            onClick={() => onSave({ onTime, offTime, days })}>
            <Plus size={15}/> Create Schedule
          </button>
          <button className="btn btn--ghost btn--full" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Chart wrapper ──────────────────────────────────────────
function ChartCard({ title, icon: Icon, badge, children, controls }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon">
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
export default function TemperaturePage() {
  const { toast, showToast } = useToast()

  // Boiler / thermostat state
  const [isOn,              setIsOn]              = useState(false)
  const [thermostatEnabled, setThermostatEnabled] = useState(false)
  const [currentTemp,       setCurrentTemp]       = useState(null)
  const [targetTemp,        setTargetTemp]        = useState(20.0)
  const [tempStatus,        setTempStatus]        = useState('Waiting for sensor data...')

  // Schedules
  const [schedules,      setSchedules]      = useState([])
  const [showSchedModal, setShowSchedModal] = useState(false)

  // Chart selectors
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

  // ── Init & polling ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      await Promise.all([
        loadBoilerStatus(), loadTargetTemp(),
        loadThermostatFull(), fetchCurrentTemp(), loadSchedules(),
      ])
      loadCharts(month, year, false, null, null)
    }
    init()
    const t1 = setInterval(fetchCurrentTemp,     10000)
    const t2 = setInterval(loadThermostatFull,   15000)
    const t3 = setInterval(syncBoiler,           30000)
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3) }
  }, [])

  // Update temp status string
  useEffect(() => {
    if (currentTemp === null) return setTempStatus('Waiting for sensor data...')
    if (!thermostatEnabled)  return setTempStatus('Sensor connected')
    const diff = targetTemp - currentTemp
    if      (diff >  0.3) setTempStatus(`Heating needed (+${diff.toFixed(1)}°C)`)
    else if (diff < -0.3) setTempStatus(`Temperature above target (${diff.toFixed(1)}°C)`)
    else                  setTempStatus('Target temperature reached ✓')
  }, [currentTemp, targetTemp, thermostatEnabled])

  // ── API helpers ───────────────────────────────────────────
  const loadBoilerStatus = () =>
    fetch('/api/boiler/status', { cache:'no-cache' })
      .then(r => r.json()).then(d => setIsOn(d.is_on)).catch(() => {})

  const loadTargetTemp = () =>
    fetch('/api/target_temperature').then(r => r.json())
      .then(d => { if (d.target_temperature != null) setTargetTemp(parseFloat(d.target_temperature)) })
      .catch(() => {})

  const loadThermostatFull = () =>
    fetch('/api/thermostat/status/full').then(r => r.json()).then(d => {
      setThermostatEnabled(d.thermostat_enabled || false)
      if (d.current_temperature != null) setCurrentTemp(d.current_temperature)
      if (d.target_temperature  != null) setTargetTemp(d.target_temperature)
      if (d.boiler_on           != null) setIsOn(d.boiler_on)
    }).catch(() => {})

  const fetchCurrentTemp = () =>
    fetch('/api_sensors', { cache:'no-cache' }).then(r => r.json())
      .then(d => setCurrentTemp(parseFloat(d.temperature.current))).catch(() => {})

  const syncBoiler = () =>
    fetch('/api/thermostat/sync', { method:'POST', cache:'no-cache' })
      .then(() => loadBoilerStatus()).catch(() => {})

  // ── Boiler toggle ─────────────────────────────────────────
  const handleToggleBoiler = async () => {
    if (thermostatEnabled && !window.confirm('Thermostat is active. Toggling manually will disable it. Continue?')) return
    if (thermostatEnabled) {
      await fetch('/api/thermostat/off', { method:'POST' }).catch(() => {})
      setThermostatEnabled(false)
    }
    try {
      const newState = !isOn
      const res = await fetch('/api/boiler/manual', {
        method:'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ turn_on: newState }),
      })
      if (!res.ok) throw new Error()
      setIsOn(newState)
      showToast(newState ? 'Boiler turned ON manually' : 'Boiler turned OFF manually')
    } catch { showToast('Error toggling boiler', 'error') }
  }

  // ── Thermostat ────────────────────────────────────────────
  const handleAdjustTemp = async (change) => {
    const next = Math.max(15, Math.min(30, targetTemp + change))
    setTargetTemp(next)
    fetch('/api/target_temperature', {
      method:'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ target_temperature: next }),
    }).catch(() => showToast('Error updating target temperature', 'error'))
  }

  const handleToggleThermostat = async () => {
    const newState = !thermostatEnabled
    try {
      const res = await fetch(`/api/thermostat/${newState ? 'on' : 'off'}`, { method:'POST' })
      if (!res.ok) throw new Error()
      setThermostatEnabled(newState)
      showToast(newState ? 'Thermostat enabled' : 'Thermostat disabled')
    } catch { showToast('Error toggling thermostat', 'error') }
  }

  const handleSync = async () => {
    try {
      await syncBoiler()
      showToast('Synchronized with Shelly')
    } catch { showToast('Sync failed', 'error') }
  }

  // ── Schedules ─────────────────────────────────────────────
  const loadSchedules = () =>
    fetch('/api/shelly/schedules').then(r => r.json())
      .then(d => setSchedules(d.result?.jobs || d.jobs || []))
      .catch(() => showToast('Failed to load schedules', 'error'))

  const handleAddSchedule = async ({ onTime, offTime, days }) => {
    const selectedDays = days.split(',').map(d => d.trim())
    const timespecDays = selectedDays.map(d => DAY_MAP[d]).filter(d => d !== undefined)
    if (!timespecDays.length) { showToast('Invalid days format', 'error'); return }
    const [onH, onM]   = onTime.split(':').map(Number)
    const [offH, offM] = offTime.split(':').map(Number)
    try {
      await fetch('/api/shelly/schedule/create', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ timespec:`0 ${onM} ${onH} * * ${timespecDays.join(',')}`, is_on:true }),
      })
      await fetch('/api/shelly/schedule/create', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ timespec:`0 ${offM} ${offH} * * ${timespecDays.join(',')}`, is_on:false }),
      })
      showToast('Schedule created')
      setShowSchedModal(false)
      loadSchedules()
    } catch { showToast('Failed to create schedule', 'error') }
  }

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Delete this schedule?')) return
    try {
      await fetch('/api/shelly/schedule/delete', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ id }),
      })
      showToast('Schedule deleted')
      loadSchedules()
    } catch { showToast('Failed to delete', 'error') }
  }

  // Group schedules for display
  const groupedSchedules = (() => {
    const g = {}
    schedules.forEach(job => {
      if (!job.enable) return
      const parts = (job.timespec || '').split(' ')
      if (parts.length < 6) return
      const [, min, hour, , , dayNums] = parts
      const time = `${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
      if (!g[dayNums]) g[dayNums] = { on:[], off:[] }
      const isOn = job.calls?.[0]?.params?.on
      ;(isOn ? g[dayNums].on : g[dayNums].off).push({ time, id: job.id })
    })
    return g
  })()

  // ── Charts ────────────────────────────────────────────────
  const loadCharts = useCallback(async (m, y, cmp, cm, cy) => {
    setLoadingCharts(true)
    try {
      const [today, monthly, daily] = await Promise.all([
        fetch('/api/today_temperature').then(r => r.json()).catch(() => ({})),
        fetch(`/api/monthly_average_temperature/${y}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/monthly_average_temperature/${m}/${y}`).then(r => r.json()).catch(() => ({})),
      ])

      // Today chart — { hour: temp }
      setTodayData(
        Object.keys(today).map(Number).sort((a,b)=>a-b)
          .map(h => ({ hour:`${h}:00`, temp: today[h] ?? null }))
      )

      // Monthly chart — { 1..12: avgTemp }
      setMonthlyData(
        MONTHS.map((n,i) => ({ month:n.substring(0,3), temp: monthly[i+1] ?? null }))
      )

      // Daily chart — { 1..31: avgTemp }
      const days = Array.from({length:31},(_,i)=>i+1)
      setDailyData(days.map(d => ({ day:`${d}`, temp: daily[d] ?? null })))

      if (cmp && cm && cy) {
        const cd = await fetch(`/api/monthly_average_temperature/${cm}/${cy}`)
          .then(r => r.json()).catch(() => ({}))
        setCompareData(days.map(d => cd[d] ?? null))
      } else {
        setCompareData(null)
      }
    } catch { showToast('Error loading charts', 'error') }
    finally { setLoadingCharts(false) }
  }, [])

  const handleFetchRange = async () => {
    if (!startDate || !endDate) { showToast('Select both dates', 'error'); return }
    if (new Date(startDate) >= new Date(endDate)) { showToast('End must be after start', 'error'); return }
    setLoadingRange(true)
    try {
      const d = await fetch(`/api/temperature_average/${startDate}/${endDate}`).then(r => r.json())
      setRangeData((d || []).map(e => ({
        time: new Date(e.hour).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit'}),
        temp: e.avg_temperature,
      })))
      if (!d?.length) showToast('No data for this range', 'warning')
    } catch { showToast('Failed to fetch range data', 'error') }
    finally { setLoadingRange(false) }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Tempera<span style={{color:'var(--accent)'}}>ture</span></h1>
        <p className="page-subtitle">Boiler control & temperature monitoring</p>
      </div>

      {/* Two-column layout on desktop, single on mobile */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(0,340px) minmax(0,1fr)', gap:'1.5rem', alignItems:'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>

          {/* Boiler card */}
          <div className="card section-card--temp" style={{ border:'1px solid var(--card-temp-border)' }}>
            <div className="card-header">
              <div className="card-header-icon" style={{ background:'var(--card-temp-bg)', color:'var(--card-temp-accent)' }}>
                <Zap size={15}/>
              </div>
              <span className="card-header-title">Boiler Control</span>
              <span className={`badge ${thermostatEnabled ? 'badge--success' : isOn ? 'badge--warning' : 'badge--muted'}`}
                style={{ marginLeft:'auto' }}>
                {thermostatEnabled ? 'Auto' : isOn ? 'Manual ON' : 'Standby'}
              </span>
            </div>

            <PowerButton isOn={isOn} onClick={handleToggleBoiler}/>

            {/* Current / Target */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', padding:'0 1.25rem 1rem' }}>
              {[
                { label:'Current', val: currentTemp != null ? `${currentTemp.toFixed(1)}°C` : '--°C',
                  bg:'var(--card-temp-bg)', color:'var(--card-temp-accent)' },
                { label:'Target',  val:`${targetTemp.toFixed(1)}°C`,
                  bg:'var(--accent-light)', color:'var(--accent)' },
              ].map(b => (
                <div key={b.label} style={{ textAlign:'center', background:b.bg, borderRadius:'var(--radius-md)', padding:'0.75rem' }}>
                  <div className="stat-label" style={{ color:b.color }}>{b.label}</div>
                  <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.5rem', fontWeight:500, color:b.color, margin:'0.25rem 0' }}>
                    {b.val}
                  </div>
                </div>
              ))}
            </div>

            {/* Adjust buttons */}
            <div style={{ display:'flex', gap:'0.5rem', padding:'0 1.25rem 1rem' }}>
              {[[-0.5,'−0.5°C'],[0.5,'+0.5°C']].map(([val,label]) => (
                <button key={val} className="btn btn--ghost" style={{ flex:1 }}
                  onClick={() => handleAdjustTemp(val)}>
                  {val < 0 ? <ChevronDown size={14}/> : <ChevronUp size={14}/>} {label}
                </button>
              ))}
            </div>

            {/* Status row */}
            <div style={{ margin:'0 1.25rem 1rem', padding:'0.65rem 0.9rem',
              border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
              background:'var(--bg-surface-2)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:'0.72rem', color: thermostatEnabled ? 'var(--color-success)' : 'var(--text-secondary)', marginBottom:2 }}>
                  {thermostatEnabled ? 'Thermostat active' : 'Thermostat disabled'}
                </div>
                <div style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>{tempStatus}</div>
              </div>
              <span className={`badge ${thermostatEnabled ? 'badge--success' : 'badge--muted'}`}>
                {thermostatEnabled ? 'Active' : 'Off'}
              </span>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', padding:'0 1.25rem 1.25rem' }}>
              <button
                className={`btn ${thermostatEnabled ? 'btn--danger' : 'btn--primary'} btn--full`}
                onClick={handleToggleThermostat}>
                <Thermometer size={15}/>
                {thermostatEnabled ? 'Disable Thermostat' : 'Enable Thermostat'}
              </button>
              <button className="btn btn--ghost btn--full" onClick={handleSync}>
                <RefreshCw size={13}/> Sync with Shelly
              </button>
            </div>
          </div>

          {/* Schedules card */}
          <div className="card">
            <div style={{ padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.75rem', fontWeight:500,
                  color:'var(--accent)', lineHeight:1 }}>
                  {schedules.length}
                </div>
                <div style={{ fontSize:'0.65rem', letterSpacing:1, textTransform:'uppercase',
                  color:'var(--text-muted)', marginTop:2 }}>
                  Schedules
                </div>
              </div>
              <button className="btn btn--primary btn--sm" onClick={() => setShowSchedModal(true)}>
                <Plus size={14}/> New
              </button>
            </div>

            <div style={{ padding:'0.75rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.6rem' }}>
              {Object.keys(groupedSchedules).length === 0 ? (
                <div className="empty-state">
                  <Clock size={24}/><div>No schedules configured</div>
                </div>
              ) : Object.entries(groupedSchedules).map(([key, g]) => {
                const daysStr = key.split(',').map(Number).map(n => DAY_NAMES[n]).join(', ')
                return (
                  <div key={key} style={{ background:'var(--bg-surface-2)', border:'1px solid var(--border)',
                    borderRadius:'var(--radius-md)', padding:'0.85rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem',
                      fontFamily:'var(--font-mono)', fontSize:'0.85rem', fontWeight:500, marginBottom:2 }}>
                      <Clock size={12} style={{ color:'var(--accent)' }}/>
                      {g.on.map(s=>s.time).join(', ')||'--:--'}
                      <span style={{ color:'var(--text-muted)', margin:'0 2px' }}>→</span>
                      {g.off.map(s=>s.time).join(', ')||'--:--'}
                    </div>
                    <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginBottom:'0.6rem' }}>{daysStr}</div>
                    <div style={{ display:'flex', gap:'0.4rem' }}>
                      {g.on.map(s => (
                        <button key={s.id} className="btn btn--danger btn--sm"
                          style={{ flex:1, fontSize:'0.65rem' }}
                          onClick={() => handleDeleteSchedule(s.id)}>
                          <Trash2 size={11}/> ON
                        </button>
                      ))}
                      {g.off.map(s => (
                        <button key={s.id} className="btn btn--danger btn--sm"
                          style={{ flex:1, fontSize:'0.65rem' }}
                          onClick={() => handleDeleteSchedule(s.id)}>
                          <Trash2 size={11}/> OFF
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>

          {/* Today */}
          <ChartCard title="Today's Temperature" icon={Sun} badge="Real-time">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={todayData}>
                <defs>
                  <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-temp-accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--card-temp-accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="hour" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="°"/>
                <Tooltip {...TOOLTIP_STYLE} formatter={v => [v != null ? `${v}°C` : 'N/A', 'Temp']}/>
                <Area type="monotone" dataKey="temp" stroke="var(--card-temp-accent)"
                  fill="url(#gt)" strokeWidth={2} dot={{ r:3, fill:'var(--card-temp-accent)', strokeWidth:0 }} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Monthly average */}
          <ChartCard title="Monthly Average" icon={TrendingUp} badge={`${year}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="gm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="month" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="°"/>
                <Tooltip {...TOOLTIP_STYLE} formatter={v => [v != null ? `${v}°C` : 'N/A', `Avg ${year}`]}/>
                <Area type="monotone" dataKey="temp" stroke="var(--card-air-accent)"
                  fill="url(#gm)" strokeWidth={2} dot={{ r:3, fill:'var(--card-air-accent)', strokeWidth:0 }} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Daily analysis */}
          <ChartCard
            title="Daily Analysis"
            icon={CalendarDays}
            controls={
              <>
                {[
                  { label:'Month', el:
                    <select className="select" style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
                      value={month} onChange={e => setMonth(+e.target.value)}>
                      {MONTHS.map((n,i) => <option key={i} value={i+1}>{n}</option>)}
                    </select>
                  },
                  { label:'Year', el:
                    <select className="select" style={{ padding:'0.45rem 0.6rem', fontSize:'0.8rem' }}
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
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData.map((d, i) => ({
                ...d,
                compare: compareData ? compareData[i] : undefined,
              }))} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="day" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="°"/>
                <Tooltip {...TOOLTIP_STYLE}/>
                <Legend wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-secondary)' }}/>
                <Bar dataKey="temp" name={`${MONTHS[month-1].substring(0,3)} ${year}`}
                  fill="var(--accent)" radius={[3,3,0,0]} maxBarSize={18}/>
                {compareData && (
                  <Bar dataKey="compare" name={`${MONTHS[compareMonth-1].substring(0,3)} ${compareYear}`}
                    fill="var(--card-air-accent)" radius={[3,3,0,0]} maxBarSize={18}/>
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
                    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--color-danger)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="time" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}
                    interval="preserveStartEnd"/>
                  <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }} unit="°"/>
                  <Tooltip {...TOOLTIP_STYLE} formatter={v => [`${v}°C`, 'Avg Temp']}/>
                  <Area type="monotone" dataKey="temp" stroke="var(--color-danger)"
                    fill="url(#gr)" strokeWidth={2} dot={false} connectNulls/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

        </div>{/* end right column */}
      </div>{/* end grid */}

      {showSchedModal && (
        <ScheduleModal
          onClose={() => setShowSchedModal(false)}
          onSave={handleAddSchedule}
        />
      )}

      <Toast toast={toast}/>

      {/* Spin animation for loading icons */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}