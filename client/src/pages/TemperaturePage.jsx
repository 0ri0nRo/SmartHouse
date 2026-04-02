import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Thermometer, Sun, TrendingUp, CalendarDays, LineChart as LineChartIcon,
  RefreshCw, Search, Plus, Trash2, Clock, X, Flame, Moon, Home,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { api } from '../api'

// ── Constants ──────────────────────────────────────────────
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_MAP  = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const TEMP_PRESETS = [
  { label: 'Night', icon: Moon,  value: 17 },
  { label: 'Home',  icon: Home,  value: 20 },
  { label: 'Warm',  icon: Flame, value: 22 },
]

const TT = {
  contentStyle: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow-md)',
  },
  cursor: { stroke: 'var(--border-strong)', strokeDasharray: '3 3' },
}

// ── Helpers ────────────────────────────────────────────────
function useDebounce(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

function getNextScheduleCountdown(schedules) {
  const now     = new Date()
  const todayDay = now.getDay()
  const nowMins  = now.getHours() * 60 + now.getMinutes()
  let nearest = null

  schedules.filter(j => j.enable).forEach(job => {
    const p = (job.timespec || '').split(' ')
    if (p.length < 6) return
    const [, min, hour, , , dayNums] = p
    const jobMins = parseInt(hour) * 60 + parseInt(min)
    const days    = dayNums.split(',').map(Number)
    const isOn    = job.calls?.[0]?.params?.on

    days.forEach(d => {
      let diffDays = d - todayDay
      if (diffDays < 0) diffDays += 7
      if (diffDays === 0 && jobMins <= nowMins) diffDays = 7
      const totalMins = diffDays * 24 * 60 + jobMins - nowMins
      if (nearest === null || totalMins < nearest.totalMins) {
        nearest = { totalMins, time: `${hour.padStart(2,'0')}:${min.padStart(2,'0')}`, isOn, day: DAY_ABBR[d] }
      }
    })
  })

  if (!nearest) return null
  const h = Math.floor(nearest.totalMins / 60)
  const m = nearest.totalMins % 60
  const label = h > 23 ? `${Math.floor(h/24)}d ${h%24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return { ...nearest, label }
}

// ── Divider ────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '0' }} />
}

// ── Section Row ────────────────────────────────────────────
function Row({ children, style = {} }) {
  return (
    <div style={{
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Stat Cell ──────────────────────────────────────────────
function StatCell({ label, value, unit, color, right = false }) {
  return (
    <div style={{
      flex: 1,
      padding: '1.25rem',
      borderRight: right ? '1px solid var(--border)' : 'none',
    }}>
      <div style={{
        fontSize: '0.65rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        marginBottom: '0.5rem',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '2.75rem',
        fontWeight: 400,
        lineHeight: 1,
        color: color || 'var(--text-primary)',
        display: 'flex',
        alignItems: 'baseline',
        gap: '0.2rem',
      }}>
        {value}
        <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
      </div>
    </div>
  )
}

// ── Chart Card ─────────────────────────────────────────────
function ChartCard({ title, icon: Icon, badge, controls, height = 200, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon icon-amber"><Icon size={14} /></div>
        <span className="card-header-title">{title}</span>
        {badge && (
          <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{badge}</span>
        )}
      </div>
      {controls && (
        <div style={{
          padding: '0.875rem 1rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface-2)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.6rem',
          alignItems: 'flex-end',
        }}>
          {controls}
        </div>
      )}
      <div style={{ padding: '1rem 0.5rem 0.75rem', height }}>
        {children}
      </div>
    </div>
  )
}

// ── Schedule Modal ─────────────────────────────────────────
function ScheduleModal({ onClose, onSave }) {
  const [onTime,  setOnTime]  = useState('07:00')
  const [offTime, setOffTime] = useState('22:00')
  const [days,    setDays]    = useState('Mon,Tue,Wed,Thu,Fri')

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <div className="modal-title">New Schedule</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[{ label: 'Turn On', val: onTime, set: setOnTime }, { label: 'Turn Off', val: offTime, set: setOffTime }].map(f => (
              <div key={f.label} className="field">
                <label className="field-label">{f.label}</label>
                <input type="time" className="input input--mono" value={f.val} onChange={e => f.set(e.target.value)} />
              </div>
            ))}
          </div>
          <div className="field">
            <label className="field-label">Days (comma separated)</label>
            <input className="input input--mono" value={days} onChange={e => setDays(e.target.value)} placeholder="Mon,Tue,Wed,Thu,Fri" />
          </div>
          <button className="btn btn--primary btn--full" onClick={() => onSave({ onTime, offTime, days })}>
            <Plus size={14} /> Create Schedule
          </button>
          <button className="btn btn--ghost btn--full btn--sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function TemperaturePage() {
  const { toast, showToast } = useToast()

  const [isOn,          setIsOn]          = useState(null)
  const [thermostat,    setThermostat]    = useState(false)
  const [currentTemp,   setCurrentTemp]   = useState(null)
  const [targetTemp,    setTargetTemp]    = useState(20.0)
  const [schedules,     setSchedules]     = useState([])
  const [showModal,     setShowModal]     = useState(false)

  const now = new Date()
  const [month,          setMonth]          = useState(now.getMonth() + 1)
  const [year,           setYear]           = useState(now.getFullYear())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareMonth,   setCompareMonth]   = useState(now.getMonth() + 1)
  const [compareYear,    setCompareYear]    = useState(now.getFullYear() - 1)
  const [startDate,      setStartDate]      = useState('')
  const [endDate,        setEndDate]        = useState('')
  const [todayData,      setTodayData]      = useState([])
  const [monthlyData,    setMonthlyData]    = useState([])
  const [dailyData,      setDailyData]      = useState([])
  const [compareData,    setCompareData]    = useState(null)
  const [rangeData,      setRangeData]      = useState([])
  const [loadingCharts,  setLoadingCharts]  = useState(false)
  const [loadingRange,   setLoadingRange]   = useState(false)

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 5 + i)

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadBoiler(), loadThermostatFull(), loadSensor(), loadSchedules()])
      loadCharts(month, year, false, null, null)
    }
    init()
    const t1 = setInterval(loadSensor, 10000)
    const t2 = setInterval(loadThermostatFull, 20000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [])

  const loadBoiler         = () => api.getBoilerStatus().then(d => setIsOn(d.is_on)).catch(() => {})
  const loadThermostatFull = () => api.getThermostatFull().then(d => {
    setThermostat(d.thermostat_enabled || false)
    if (d.current_temperature != null) setCurrentTemp(d.current_temperature)
    if (d.target_temperature  != null) setTargetTemp(d.target_temperature)
    if (d.boiler_on           != null) setIsOn(d.boiler_on)
  }).catch(() => {})
  const loadSensor    = () => api.getSensors().then(d => setCurrentTemp(parseFloat(d.temperature.current))).catch(() => {})
  const loadSchedules = () => api.getSchedules().then(d => setSchedules(d.result?.jobs || d.jobs || [])).catch(() => {})

  const toggleBoiler = async () => {
    if (thermostat && !window.confirm('Thermostat is active. Switch to manual?')) return
    if (thermostat) { await api.thermostatOff().catch(() => {}); setThermostat(false) }
    try {
      const n = !isOn
      await api.manualBoiler(n)
      setIsOn(n)
      showToast(`Boiler ${n ? 'ON' : 'OFF'}`)
    } catch { showToast('Error', 'error') }
  }

  const toggleThermostat = async () => {
    const n = !thermostat
    try {
      await (n ? api.thermostatOn() : api.thermostatOff())
      setThermostat(n)
      showToast(n ? 'Thermostat enabled' : 'Thermostat disabled')
    } catch { showToast('Error', 'error') }
  }

  const sendTargetTemp = useCallback(
    useDebounce((val) => { api.setTargetTemp(val).catch(() => {}) }, 600),
    []
  )

  const adjustTarget = (d) => {
    const n = Math.max(15, Math.min(30, targetTemp + d))
    setTargetTemp(n)
    sendTargetTemp(n)
  }

  const applyPreset = (val) => {
    setTargetTemp(val)
    sendTargetTemp(val)
    showToast(`Target set to ${val}°C`)
  }

  const addSchedule = async ({ onTime, offTime, days }) => {
    const td = days.split(',').map(d => d.trim()).map(d => DAY_MAP[d]).filter(d => d !== undefined)
    if (!td.length) { showToast('Invalid days', 'error'); return }
    const [onH, onM]   = onTime.split(':').map(Number)
    const [offH, offM] = offTime.split(':').map(Number)
    try {
      await api.createSchedule({ timespec: `0 ${onM} ${onH} * * ${td.join(',')}`, is_on: true })
      await api.createSchedule({ timespec: `0 ${offM} ${offH} * * ${td.join(',')}`, is_on: false })
      showToast('Schedule created')
      setShowModal(false)
      loadSchedules()
    } catch { showToast('Error', 'error') }
  }

  const deleteSchedule = async (id) => {
    if (!window.confirm('Delete?')) return
    try { await api.deleteSchedule(id); showToast('Deleted'); loadSchedules() }
    catch { showToast('Error', 'error') }
  }

  const loadCharts = useCallback(async (m, y, cmp, cm, cy) => {
    setLoadingCharts(true)
    try {
      const [today, monthly, daily] = await Promise.all([
        api.getTodayTemp().catch(() => ({})),
        api.getMonthlyTemp(y).catch(() => ({})),
        api.getDailyTemp(m, y).catch(() => ({})),
      ])
      setTodayData(Object.keys(today).map(Number).sort((a, b) => a - b).map(h => ({ hour: `${h}:00`, temp: today[h] ?? null })))
      setMonthlyData(MONTHS.map((n, i) => ({ month: n.substring(0, 3), temp: monthly[i + 1] ?? null })))
      const days = Array.from({ length: 31 }, (_, i) => i + 1)
      setDailyData(days.map(d => ({ day: `${d}`, temp: daily[d] ?? null })))
      if (cmp && cm && cy) {
        const cd = await api.getDailyTemp(cm, cy).catch(() => ({}))
        setCompareData(days.map(d => cd[d] ?? null))
      } else {
        setCompareData(null)
      }
    } catch {} finally { setLoadingCharts(false) }
  }, [])

  const fetchRange = async () => {
    if (!startDate || !endDate) { showToast('Select both dates', 'error'); return }
    if (new Date(startDate) >= new Date(endDate)) { showToast('End must be after start', 'error'); return }
    setLoadingRange(true)
    try {
      const d = await api.getRangeTemp(startDate, endDate)
      setRangeData((d || []).map(e => ({
        time: new Date(e.hour).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
        temp: e.avg_temperature,
      })))
      if (!d?.length) showToast('No data', 'warning')
    } catch { showToast('Error', 'error') } finally { setLoadingRange(false) }
  }

  // Grouped schedules
  const grouped = {}
  schedules.filter(j => j.enable).forEach(job => {
    const p = (job.timespec || '').split(' ')
    if (p.length < 6) return
    const [, min, hour, , , dayNums] = p
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    if (!grouped[dayNums]) grouped[dayNums] = { on: [], off: [] }
    const isOnJob = job.calls?.[0]?.params?.on
    ;(isOnJob ? grouped[dayNums].on : grouped[dayNums].off).push({ time, id: job.id })
  })

  const nextSchedule = getNextScheduleCountdown(schedules)

  // Derive status label
  const statusLabel = currentTemp == null
    ? 'Waiting for sensor'
    : !thermostat
      ? 'Manual mode'
      : (targetTemp - currentTemp) > 0.3
        ? `Heating · +${(targetTemp - currentTemp).toFixed(1)}° needed`
        : (targetTemp - currentTemp) < -0.3
          ? `${Math.abs(targetTemp - currentTemp).toFixed(1)}° above target`
          : 'Target reached'

  const DailyControls = (
    <>
      <div className="field" style={{ flex: 1, minWidth: 110 }}>
        <label className="field-label">Month</label>
        <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={month} onChange={e => setMonth(+e.target.value)}>
          {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
        </select>
      </div>
      <div className="field" style={{ flex: 1, minWidth: 90 }}>
        <label className="field-label">Year</label>
        <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="field" style={{ flex: 'none', justifyContent: 'flex-end' }}>
        <label className="field-label" style={{ opacity: 0 }}>-</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={compareEnabled} onChange={e => setCompareEnabled(e.target.checked)} /> Compare
        </label>
      </div>
      {compareEnabled && <>
        <div className="field" style={{ flex: 1, minWidth: 110 }}>
          <label className="field-label">Cmp Month</label>
          <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={compareMonth} onChange={e => setCompareMonth(+e.target.value)}>
            {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label className="field-label">Cmp Year</label>
          <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={compareYear} onChange={e => setCompareYear(+e.target.value)}>
            {years.map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </>}
      <button className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={() => loadCharts(month, year, compareEnabled, compareMonth, compareYear)} disabled={loadingCharts}>
        <RefreshCw size={12} style={{ animation: loadingCharts ? 'spin 0.8s linear infinite' : 'none' }} /> Update
      </button>
    </>
  )

  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Tempera<span style={{ color: 'var(--accent)' }}>ture</span></h1>
        <p className="page-subtitle">Boiler control & climate monitoring</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Boiler Card ──────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden' }}>

          {/* Header row: title + boiler toggle */}
          <Row style={{ justifyContent: 'space-between', paddingBottom: '0.875rem', paddingTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Boiler</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem', fontFamily: 'var(--font-mono)' }}>
                {statusLabel}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Next schedule pill */}
              {nextSchedule && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.68rem', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <Clock size={11} />
                  {nextSchedule.isOn ? 'ON' : 'OFF'} in {nextSchedule.label}
                </span>
              )}

              {/* Boiler ON/OFF button */}
              <button onClick={toggleBoiler} style={{
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                background: isOn === true
                  ? 'var(--color-success)'
                  : isOn === false
                    ? 'rgba(255,59,48,0.12)'
                    : 'var(--bg-surface-3)',
                color: isOn === true
                  ? '#fff'
                  : isOn === false
                    ? 'var(--color-danger)'
                    : 'var(--text-muted)',
                border: isOn === false ? '1px solid rgba(255,59,48,0.25)' : '1px solid transparent',
                fontWeight: 700,
                fontSize: '0.78rem',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: 72,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                boxShadow: isOn === true ? '0 0 16px rgba(52,199,89,0.3)' : 'none',
                animation: isOn === true ? 'boiler-pulse 2.5s ease infinite' : 'none',
              }}>
                {isOn !== null && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isOn ? '#fff' : 'var(--color-danger)',
                    flexShrink: 0,
                  }} />
                )}
                {isOn === null ? '·' : isOn ? 'ON' : 'OFF'}
              </button>
            </div>
          </Row>

          <Divider />

          {/* Current / Target temp */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <StatCell
              label="Current"
              value={currentTemp != null ? currentTemp.toFixed(1) : '—'}
              unit="°C"
              color="var(--card-temp-accent)"
              right
            />

            {/* Target with stepper */}
            <div style={{ padding: '1.25rem' }}>
              <div style={{
                fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem',
              }}>
                Target
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '2.75rem',
                  fontWeight: 400, lineHeight: 1, color: 'var(--accent)',
                  display: 'flex', alignItems: 'baseline', gap: '0.2rem',
                }}>
                  {targetTemp.toFixed(1)}
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>°C</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {[{ icon: ChevronUp, delta: 0.5 }, { icon: ChevronDown, delta: -0.5 }].map(({ icon: Icon, delta }) => (
                    <button key={delta} onClick={() => adjustTarget(delta)} style={{
                      width: 26, height: 26, borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s ease',
                    }}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Divider />

          {/* Presets */}
          <Row style={{ gap: '0.5rem', paddingTop: '0.875rem', paddingBottom: '0.875rem' }}>
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--text-muted)', marginRight: '0.125rem',
              whiteSpace: 'nowrap',
            }}>
              Presets
            </span>
            {TEMP_PRESETS.map(p => {
              const active = targetTemp === p.value
              return (
                <button key={p.value} onClick={() => applyPreset(p.value)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.875rem',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500,
                  transition: 'all 0.15s ease',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <p.icon size={12} />
                  {p.value}° {p.label}
                </button>
              )
            })}
          </Row>

          <Divider />

          {/* Thermostat toggle */}
          <Row style={{ justifyContent: 'space-between', background: 'var(--bg-surface-2)' }}>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                Automatic thermostat
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                {thermostat ? 'Controls boiler automatically' : 'Boiler in manual mode'}
              </div>
            </div>
            <button onClick={toggleThermostat} style={{
              width: 44, height: 26, borderRadius: 13, border: 'none', padding: 0,
              background: thermostat ? 'var(--color-success)' : 'var(--toggle-off)',
              position: 'relative', cursor: 'pointer', transition: 'background 0.25s ease', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 3, left: thermostat ? 20 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
              }} />
            </button>
          </Row>

          <Divider />

          {/* Sync */}
          <Row style={{ padding: '0.6rem 1.25rem' }}>
            <button
              className="btn btn--ghost btn--sm btn--full"
              onClick={() => api.thermostatSync().then(loadBoiler).then(() => showToast('Synced')).catch(() => showToast('Sync failed', 'error'))}
            >
              <RefreshCw size={12} /> Sync with Shelly
            </button>
          </Row>
        </div>

        {/* ── Schedules ────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon icon-blue"><Clock size={14} /></div>
            <span className="card-header-title">Schedules</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge--muted">{schedules.length}</span>
              <button className="btn btn--primary btn--sm" onClick={() => setShowModal(true)}>
                <Plus size={13} /> New
              </button>
            </div>
          </div>

          <div style={{ padding: '0.5rem 0.75rem' }}>
            {Object.keys(grouped).length === 0 ? (
              <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
                <Clock size={18} />
                <div>No schedules</div>
              </div>
            ) : Object.entries(grouped).map(([key, g]) => {
              const daysStr = key.split(',').map(Number).map(n => DAY_ABBR[n]).join('  ·  ')
              const firstOn = g.on[0]
              let countdown = null
              if (firstOn) {
                const fake = {
                  enable: true,
                  timespec: `0 ${firstOn.time.split(':')[1]} ${firstOn.time.split(':')[0]} * * ${key}`,
                  calls: [{ params: { on: true } }],
                  id: firstOn.id,
                }
                countdown = getNextScheduleCountdown([fake])
              }
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '0.75rem 0.625rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '0.25rem',
                  transition: 'background 0.15s',
                }}>
                  {/* Time range */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      {g.on.map(s => s.time).join(', ') || '—'}
                      <span style={{
                        width: 16, height: 1,
                        background: 'var(--border-strong)',
                        display: 'inline-block', flexShrink: 0,
                      }} />
                      {g.off.map(s => s.time).join(', ') || '—'}
                    </div>
                    <div style={{
                      fontSize: '0.65rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.2rem',
                      fontFamily: 'var(--font-mono)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}>
                      <span>{daysStr}</span>
                      {countdown && (
                        <span style={{ color: 'var(--accent)' }}>· in {countdown.label}</span>
                      )}
                    </div>
                  </div>

                  {/* Delete buttons */}
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    {[...g.on.map(s => ({ ...s, t: 'on' })), ...g.off.map(s => ({ ...s, t: 'off' }))].map(s => (
                      <button
                        key={s.id}
                        onClick={() => deleteSchedule(s.id)}
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,59,48,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,59,48,0.3)'; e.currentTarget.style.color = 'var(--color-danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Charts ───────────────────────────────────── */}
        <ChartCard title="Today's readings" icon={Sun} badge="Live">
          {todayData.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem' }}>
              <Sun size={18} />
              <div>No data yet today</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={todayData} margin={{ left: -16, right: 8 }}>
                <defs>
                  <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-temp-accent)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--card-temp-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit="°" axisLine={false} tickLine={false} width={36} />
                <Tooltip {...TT} formatter={v => [v != null ? `${v}°C` : 'N/A', 'Temperature']} />
                <Area type="monotone" dataKey="temp" stroke="var(--card-temp-accent)" fill="url(#gt)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--card-temp-accent)', strokeWidth: 0 }} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Monthly average" icon={TrendingUp} badge={`${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ left: -16, right: 8 }}>
              <defs>
                <linearGradient id="gm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit="°" axisLine={false} tickLine={false} width={36} />
              <Tooltip {...TT} formatter={v => [v != null ? `${v}°C` : 'N/A', `Avg ${year}`]} />
              <Area type="monotone" dataKey="temp" stroke="var(--accent)" fill="url(#gm)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily breakdown" icon={CalendarDays} controls={DailyControls}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dailyData.map((d, i) => ({ ...d, compare: compareData ? compareData[i] : undefined }))}
              margin={{ left: -16, right: 8 }}
              barGap={1}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit="°" axisLine={false} tickLine={false} width={36} />
              <Tooltip {...TT} />
              {compareData && <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />}
              <Bar dataKey="temp" name={`${MONTHS[month - 1].substring(0, 3)} ${year}`} fill="var(--card-temp-accent)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              {compareData && (
                <Bar dataKey="compare" name={`${MONTHS[compareMonth - 1].substring(0, 3)} ${compareYear}`} fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Custom range"
          icon={LineChartIcon}
          controls={<>
            {[{ label: 'Start', val: startDate, set: setStartDate }, { label: 'End', val: endDate, set: setEndDate }].map(f => (
              <div key={f.label} className="field" style={{ flex: 1, minWidth: 150 }}>
                <label className="field-label">{f.label}</label>
                <input
                  type="datetime-local"
                  className="input input--mono"
                  style={{ padding: '0.42rem 0.6rem', fontSize: '0.78rem' }}
                  value={f.val}
                  onChange={e => f.set(e.target.value)}
                />
              </div>
            ))}
            <button className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={fetchRange} disabled={loadingRange}>
              <Search size={12} style={{ animation: loadingRange ? 'spin 0.8s linear infinite' : 'none' }} /> Fetch
            </button>
          </>}
        >
          {rangeData.length === 0 ? (
            <div className="empty-state" style={{ padding: '1.5rem' }}>
              <LineChartIcon size={18} />
              <div>Pick a date range above</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rangeData} margin={{ left: -16, right: 8 }}>
                <defs>
                  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--color-danger)" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="time" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit="°" axisLine={false} tickLine={false} width={36} />
                <Tooltip {...TT} formatter={v => [`${v}°C`, 'Avg Temp']} />
                <Area type="monotone" dataKey="temp" stroke="var(--color-danger)" fill="url(#gr)" strokeWidth={2} dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

      {showModal && <ScheduleModal onClose={() => setShowModal(false)} onSave={addSchedule} />}
      <Toast toast={toast} />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes boiler-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(52,199,89,0.3); }
          50%       { box-shadow: 0 0 24px rgba(52,199,89,0.55); }
        }
      `}</style>
    </div>
  )
}