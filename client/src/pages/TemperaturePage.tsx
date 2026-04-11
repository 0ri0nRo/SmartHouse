import { useState, useEffect, useCallback, useRef } from 'react'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Thermometer, Sun, TrendingUp, CalendarDays, LineChart as LineChartIcon,
  RefreshCw, Search, Plus, Trash2, Clock, X, Flame, Moon, Home,
  ChevronUp, ChevronDown, Ban, AlertTriangle, CheckCircle2, Save,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { api } from '../api'

// ── Constants ──────────────────────────────────────────────
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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

// ── Days per month helper ──────────────────────────────────
function daysInMonth(month: number): number {
  // Use a non-leap year for simplicity; day 31 is shown for months that have it
  return new Date(2001, month, 0).getDate()
}

// ── Helpers ────────────────────────────────────────────────
function useDebounce(fn: (...args: any[]) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return useCallback((...args: any[]) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

function getNextScheduleCountdown(schedules: any[]) {
  const now      = new Date()
  const todayDay = now.getDay()
  const nowMins  = now.getHours() * 60 + now.getMinutes()
  let nearest: any = null

  schedules.filter((j: any) => j.enable).forEach((job: any) => {
    const p = (job.timespec || '').split(' ')
    if (p.length < 6) return
    const [, min, hour, , , dayNums] = p
    const jobMins = parseInt(hour) * 60 + parseInt(min)
    const days    = dayNums.split(',').map(Number)
    const isOn    = job.calls?.[0]?.params?.on

    days.forEach((d: number) => {
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
function Row({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
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
function StatCell({ label, value, unit, color, right = false }: {
  label: string; value: string; unit: string; color?: string; right?: boolean
}) {
  return (
    <div style={{
      flex: 1,
      padding: '1.25rem',
      borderRight: right ? '1px solid var(--border)' : 'none',
    }}>
      <div style={{
        fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem',
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '2.75rem', fontWeight: 400,
        lineHeight: 1, color: color || 'var(--text-primary)',
        display: 'flex', alignItems: 'baseline', gap: '0.2rem',
      }}>
        {value}
        <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
      </div>
    </div>
  )
}

// ── Chart Card ─────────────────────────────────────────────
function ChartCard({ title, icon: Icon, badge, controls, height = 200, children }: any) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon icon-amber"><Icon size={14} /></div>
        <span className="card-header-title">{title}</span>
        {badge && <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{badge}</span>}
      </div>
      {controls && (
        <div style={{
          padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface-2)',
          display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end',
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
function ScheduleModal({ onClose, onSave }: { onClose: () => void; onSave: (v: any) => void }) {
  const [onTime,  setOnTime]  = useState('07:00')
  const [offTime, setOffTime] = useState('22:00')
  const [days,    setDays]    = useState('Mon,Tue,Wed,Thu,Fri')

  return (
    <div className="modal-overlay" onClick={(e: any) => e.target === e.currentTarget && onClose()}>
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

// ══════════════════════════════════════════════════════════════════════════════
// BLACKOUT BANNER — shown inline when trying to turn on during blocked period
// ══════════════════════════════════════════════════════════════════════════════
function BlackoutBanner({ reason, onDismiss }: { reason: string; onDismiss: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
      padding: '0.875rem 1rem',
      background: 'rgba(255,59,48,0.07)',
      border: '1px solid rgba(255,59,48,0.3)',
      borderRadius: 'var(--radius-md)',
      marginBottom: '0.75rem',
    }}>
      <AlertTriangle size={16} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-danger)', marginBottom: '0.2rem' }}>
          Boiler blocked
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          {reason}
        </div>
      </div>
      <button onClick={onDismiss} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-muted)', padding: 0, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// BLACKOUT CONFIG CARD
// ══════════════════════════════════════════════════════════════════════════════
interface BlackoutConfig {
  enabled: boolean
  start_month: number
  start_day: number
  end_month: number
  end_day: number
  reason: string
  currently_blocked: boolean
  updated_at: string | null
}

function BlackoutCard({ showToast }: { showToast: (msg: string, type?: string) => void }) {
  const [cfg,     setCfg]     = useState<BlackoutConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  // Local editable state (only committed on Save)
  const [enabled,     setEnabled]     = useState(false)
  const [startMonth,  setStartMonth]  = useState(4)
  const [startDay,    setStartDay]    = useState(1)
  const [endMonth,    setEndMonth]    = useState(9)
  const [endDay,      setEndDay]      = useState(30)
  const [reason,      setReason]      = useState('Boiler disabled during warm season')

  const loadCfg = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/boiler/blackout')
      const data = await res.json() as BlackoutConfig
      setCfg(data)
      setEnabled(data.enabled)
      setStartMonth(data.start_month)
      setStartDay(data.start_day)
      setEndMonth(data.end_month)
      setEndDay(data.end_day)
      setReason(data.reason)
    } catch {
      showToast('Failed to load blackout config', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCfg() }, [])

  // Clamp day when month changes
  const handleStartMonthChange = (m: number) => {
    setStartMonth(m)
    if (startDay > daysInMonth(m)) setStartDay(daysInMonth(m))
  }
  const handleEndMonthChange = (m: number) => {
    setEndMonth(m)
    if (endDay > daysInMonth(m)) setEndDay(daysInMonth(m))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/boiler/blackout', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          start_month: startMonth,
          start_day:   startDay,
          end_month:   endMonth,
          end_day:     endDay,
          reason:      reason.trim() || 'Boiler disabled during this period',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }
      const data = await res.json()
      setCfg(data.config)
      showToast('Blackout settings saved')
    } catch (e: any) {
      showToast(e.message || 'Error saving', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Is the wrap-around scenario (e.g. Nov→Feb)?
  const isWrapAround = startMonth * 100 + startDay > endMonth * 100 + endDay

  const selectStyle: React.CSSProperties = {
    padding: '0.42rem 0.6rem',
    fontSize: '0.8rem',
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>

      {/* Header */}
      <div className="card-header">
        <div className="card-header-icon" style={{
          background: enabled && cfg?.currently_blocked
            ? 'rgba(255,59,48,0.12)'
            : enabled
              ? 'rgba(255,149,0,0.12)'
              : 'var(--bg-surface-3)',
          color: enabled && cfg?.currently_blocked
            ? 'var(--color-danger)'
            : enabled
              ? 'var(--color-warning)'
              : 'var(--text-muted)',
        }}>
          <Ban size={14} />
        </div>
        <span className="card-header-title">Boiler Blackout Period</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {cfg?.currently_blocked && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
              padding: '0.2rem 0.55rem', borderRadius: 99,
              background: 'rgba(255,59,48,0.12)',
              color: 'var(--color-danger)',
              border: '1px solid rgba(255,59,48,0.25)',
              letterSpacing: '0.05em',
            }}>
              ACTIVE NOW
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading...
        </div>
      ) : (
        <>
          {/* Enable toggle row */}
          <Row style={{ justifyContent: 'space-between', background: enabled ? 'rgba(255,149,0,0.04)' : 'transparent' }}>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                Enable blackout period
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                {enabled
                  ? `Boiler blocked from ${MONTHS_SHORT[startMonth - 1]} ${startDay} to ${MONTHS_SHORT[endMonth - 1]} ${endDay}`
                  : 'No restriction active — boiler can always be turned on'}
              </div>
            </div>
            <button onClick={() => setEnabled(v => !v)} style={{
              width: 44, height: 26, borderRadius: 13, border: 'none', padding: 0,
              background: enabled ? 'var(--color-warning)' : 'var(--toggle-off)',
              position: 'relative', cursor: 'pointer',
              transition: 'background 0.25s ease', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 3, left: enabled ? 20 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
              }} />
            </button>
          </Row>

          <Divider />

          {/* Date range pickers */}
          <div style={{
            padding: '1rem 1.25rem',
            opacity: enabled ? 1 : 0.45,
            pointerEvents: enabled ? 'auto' : 'none',
            transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

              {/* Start */}
              <div>
                <div style={{
                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--color-success)',
                  marginBottom: '0.6rem', fontFamily: 'var(--font-mono)',
                }}>
                  Block starts
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <select style={selectStyle} value={startMonth} onChange={e => handleStartMonthChange(+e.target.value)}>
                    {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                  </select>
                  <select style={{ ...selectStyle, minWidth: 56 }} value={startDay} onChange={e => setStartDay(+e.target.value)}>
                    {Array.from({ length: daysInMonth(startMonth) }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* End */}
              <div>
                <div style={{
                  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--color-danger)',
                  marginBottom: '0.6rem', fontFamily: 'var(--font-mono)',
                }}>
                  Block ends
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <select style={selectStyle} value={endMonth} onChange={e => handleEndMonthChange(+e.target.value)}>
                    {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
                  </select>
                  <select style={{ ...selectStyle, minWidth: 56 }} value={endDay} onChange={e => setEndDay(+e.target.value)}>
                    {Array.from({ length: daysInMonth(endMonth) }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Wrap-around notice */}
            {enabled && isWrapAround && (
              <div style={{
                marginTop: '0.75rem', fontSize: '0.72rem',
                color: 'var(--color-warning)', fontFamily: 'var(--font-mono)',
                display: 'flex', alignItems: 'center', gap: '0.35rem',
              }}>
                <AlertTriangle size={12} />
                Wrap-around period: blocks from {MONTHS_SHORT[startMonth - 1]} {startDay} through
                year-end and then through {MONTHS_SHORT[endMonth - 1]} {endDay}
              </div>
            )}

            {/* Visual timeline */}
            {enabled && (
              <div style={{ marginTop: '0.875rem' }}>
                <div style={{
                  fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--text-muted)',
                  marginBottom: '0.4rem', fontFamily: 'var(--font-mono)',
                }}>
                  Year overview
                </div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'stretch', height: 18 }}>
                  {MONTHS_SHORT.map((m, i) => {
                    const monthNum = i + 1
                    // Simplified: highlight if month falls within the block
                    let blocked = false
                    if (!isWrapAround) {
                      blocked = monthNum >= startMonth && monthNum <= endMonth
                    } else {
                      blocked = monthNum >= startMonth || monthNum <= endMonth
                    }
                    const isCurrentMonth = monthNum === new Date().getMonth() + 1
                    return (
                      <div key={m} style={{
                        flex: 1,
                        borderRadius: 2,
                        background: blocked
                          ? 'rgba(255,59,48,0.35)'
                          : 'var(--bg-surface-2)',
                        border: isCurrentMonth
                          ? '1.5px solid var(--accent)'
                          : '1px solid transparent',
                        position: 'relative',
                        cursor: 'default',
                        transition: 'background 0.15s',
                      }}
                        title={`${m}: ${blocked ? 'blocked' : 'allowed'}`}
                      />
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
                  {MONTHS_SHORT.map(m => (
                    <div key={m} style={{
                      flex: 1, textAlign: 'center',
                      fontSize: '0.48rem', color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)', lineHeight: 1,
                    }}>
                      {m[0]}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reason text */}
            <div style={{ marginTop: '0.875rem' }} className="field">
              <label className="field-label">Message shown when blocked</label>
              <input
                className="input input--mono"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Boiler disabled during warm season (Apr–Sep)"
                style={{ fontSize: '0.78rem' }}
              />
            </div>
          </div>

          <Divider />

          {/* Save + status row */}
          <Row style={{ justifyContent: 'space-between', padding: '0.75rem 1.25rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {cfg?.updated_at
                ? `Last saved: ${new Date(cfg.updated_at).toLocaleString()}`
                : 'Not saved yet'}
            </div>
            <button
              className="btn btn--primary btn--sm"
              onClick={save}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              {saving
                ? <><RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
                : <><Save size={12} /> Save</>}
            </button>
          </Row>
        </>
      )}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────
export default function TemperaturePage() {
  const { toast, showToast } = useToast()

  const [isOn,          setIsOn]          = useState<boolean | null>(null)
  const [thermostat,    setThermostat]    = useState(false)
  const [currentTemp,   setCurrentTemp]   = useState<number | null>(null)
  const [targetTemp,    setTargetTemp]    = useState(20.0)
  const [schedules,     setSchedules]     = useState<any[]>([])
  const [showModal,     setShowModal]     = useState(false)

  // Blackout state
  const [blackoutBanner, setBlackoutBanner] = useState<string | null>(null)

  const now = new Date()
  const [month,          setMonth]          = useState(now.getMonth() + 1)
  const [year,           setYear]           = useState(now.getFullYear())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareMonth,   setCompareMonth]   = useState(now.getMonth() + 1)
  const [compareYear,    setCompareYear]    = useState(now.getFullYear() - 1)
  const [startDate,      setStartDate]      = useState('')
  const [endDate,        setEndDate]        = useState('')
  const [todayData,      setTodayData]      = useState<any[]>([])
  const [monthlyData,    setMonthlyData]    = useState<any[]>([])
  const [dailyData,      setDailyData]      = useState<any[]>([])
  const [compareData,    setCompareData]    = useState<any[] | null>(null)
  const [rangeData,      setRangeData]      = useState<any[]>([])
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

  const loadBoiler         = () => api.getBoilerStatus().then((d: any) => setIsOn(d.is_on)).catch(() => {})
  const loadThermostatFull = () => api.getThermostatFull().then((d: any) => {
    setThermostat(d.thermostat_enabled || false)
    if (d.current_temperature != null) setCurrentTemp(d.current_temperature)
    if (d.target_temperature  != null) setTargetTemp(d.target_temperature)
    if (d.boiler_on           != null) setIsOn(d.boiler_on)
  }).catch(() => {})
  const loadSensor    = () => api.getSensors().then((d: any) => setCurrentTemp(parseFloat(d.temperature.current))).catch(() => {})
  const loadSchedules = () => api.getSchedules().then((d: any) => setSchedules(d.result?.jobs || d.jobs || [])).catch(() => {})

  // ── Boiler toggle — checks blackout before acting ──────────────────────────
  const toggleBoiler = async () => {
    // Spegnimento: non serve il check blackout
    const nextState = !isOn
    if (nextState) {
      // Vogliamo accendere: chiediamo al backend
      if (thermostat && !window.confirm('Thermostat is active. Switch to manual?')) return
      if (thermostat) { await api.thermostatOff().catch(() => {}); setThermostat(false) }
      try {
        const res = await fetch('/api/boiler/manual', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ turn_on: true }),
        })
        if (res.status === 403) {
          const err = await res.json()
          // Mostra il banner e non cambia lo stato
          setBlackoutBanner(err.reason || 'Boiler is blocked during this period.')
          return
        }
        if (!res.ok) throw new Error('Server error')
        setIsOn(true)
        showToast('Boiler ON')
        setBlackoutBanner(null)
      } catch {
        showToast('Error', 'error')
      }
    } else {
      // Spegnimento: procediamo normalmente
      if (thermostat && !window.confirm('Thermostat is active. Switch to manual?')) return
      if (thermostat) { await api.thermostatOff().catch(() => {}); setThermostat(false) }
      try {
        await api.manualBoiler(false)
        setIsOn(false)
        showToast('Boiler OFF')
        setBlackoutBanner(null)
      } catch {
        showToast('Error', 'error')
      }
    }
  }

  const toggleThermostat = async () => {
    const n = !thermostat
    // Se stiamo abilitando il termostato verifichiamo il blackout
    if (n) {
      try {
        const res = await fetch('/api/thermostat/on', { method: 'POST' })
        if (res.status === 403) {
          const err = await res.json()
          setBlackoutBanner(err.reason || 'Boiler is blocked during this period.')
          return
        }
        if (!res.ok) throw new Error('Server error')
        setThermostat(true)
        showToast('Thermostat enabled')
        setBlackoutBanner(null)
      } catch (e: any) {
        if (!e.message?.includes('403')) showToast('Error', 'error')
      }
    } else {
      try {
        await api.thermostatOff()
        setThermostat(false)
        showToast('Thermostat disabled')
      } catch { showToast('Error', 'error') }
    }
  }

  const sendTargetTemp = useCallback(
    useDebounce((val: number) => { api.setTargetTemp(val).catch(() => {}) }, 600),
    []
  )

  const adjustTarget = (d: number) => {
    const n = Math.max(15, Math.min(30, targetTemp + d))
    setTargetTemp(n)
    sendTargetTemp(n)
  }

  const applyPreset = (val: number) => {
    setTargetTemp(val)
    sendTargetTemp(val)
    showToast(`Target set to ${val}°C`)
  }

  const addSchedule = async ({ onTime, offTime, days }: any) => {
    const td = days.split(',').map((d: string) => d.trim()).map((d: string) => (DAY_MAP as any)[d]).filter((d: any) => d !== undefined)
    if (!td.length) { showToast('Invalid days', 'error'); return }
    const [onH, onM]   = onTime.split(':').map(Number)
    const [offH, offM] = offTime.split(':').map(Number)
    try {
      // The blackout check on schedule/create is server-side; handle 403
      const res = await fetch('/api/shelly/schedule/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timespec: `0 ${onM} ${onH} * * ${td.join(',')}`, is_on: true }),
      })
      if (res.status === 403) {
        const err = await res.json()
        setBlackoutBanner(err.reason || 'Cannot create schedule during blackout period.')
        return
      }
      await api.createSchedule({ timespec: `0 ${offM} ${offH} * * ${td.join(',')}`, is_on: false })
      showToast('Schedule created')
      setShowModal(false)
      loadSchedules()
    } catch { showToast('Error', 'error') }
  }

  const deleteSchedule = async (id: number) => {
    if (!window.confirm('Delete?')) return
    try { await api.deleteSchedule(id); showToast('Deleted'); loadSchedules() }
    catch { showToast('Error', 'error') }
  }

  const loadCharts = useCallback(async (m: number, y: number, cmp: boolean, cm: number | null, cy: number | null) => {
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
      setRangeData((d || []).map((e: any) => ({
        time: new Date(e.hour).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
        temp: e.avg_temperature,
      })))
      if (!d?.length) showToast('No data', 'warning')
    } catch { showToast('Error', 'error') } finally { setLoadingRange(false) }
  }

  // Grouped schedules
  const grouped: Record<string, { on: any[]; off: any[] }> = {}
  schedules.filter((j: any) => j.enable).forEach((job: any) => {
    const p = (job.timespec || '').split(' ')
    if (p.length < 6) return
    const [, min, hour, , , dayNums] = p
    const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    if (!grouped[dayNums]) grouped[dayNums] = { on: [], off: [] }
    const isOnJob = job.calls?.[0]?.params?.on
    ;(isOnJob ? grouped[dayNums].on : grouped[dayNums].off).push({ time, id: job.id })
  })

  const nextSchedule = getNextScheduleCountdown(schedules)

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

          {/* Blackout banner — shown inline when a block is triggered */}
          {blackoutBanner && (
            <div style={{ padding: '0.75rem 1.25rem 0' }}>
              <BlackoutBanner reason={blackoutBanner} onDismiss={() => setBlackoutBanner(null)} />
            </div>
          )}

          {/* Header row: title + boiler toggle */}
          <Row style={{ justifyContent: 'space-between', paddingBottom: '0.875rem', paddingTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Boiler</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem', fontFamily: 'var(--font-mono)' }}>
                {statusLabel}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {nextSchedule && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                }}>
                  <Clock size={11} />
                  {nextSchedule.isOn ? 'ON' : 'OFF'} in {nextSchedule.label}
                </span>
              )}

              <button onClick={toggleBoiler} style={{
                padding: '0.55rem 1.25rem',
                borderRadius: 'var(--radius-full)',
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

        {/* ── Blackout Period Card ──────────────────────── */}
        <BlackoutCard showToast={showToast} />

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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 500,
                      color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      {g.on.map(s => s.time).join(', ') || '—'}
                      <span style={{ width: 16, height: 1, background: 'var(--border-strong)', display: 'inline-block', flexShrink: 0 }} />
                      {g.off.map(s => s.time).join(', ') || '—'}
                    </div>
                    <div style={{
                      fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.2rem',
                      fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                      <span>{daysStr}</span>
                      {countdown && <span style={{ color: 'var(--accent)' }}>· in {countdown.label}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    {[...g.on.map(s => ({ ...s, t: 'on' })), ...g.off.map(s => ({ ...s, t: 'off' }))].map(s => (
                      <button
                        key={s.id}
                        onClick={() => deleteSchedule(s.id)}
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'transparent', color: 'var(--text-muted)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,59,48,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,59,48,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-danger)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
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
                <Tooltip {...TT} formatter={(v: any) => [v != null ? `${v}°C` : 'N/A', 'Temperature']} />
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
              <Tooltip {...TT} formatter={(v: any) => [v != null ? `${v}°C` : 'N/A', `Avg ${year}`]} />
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
                <Tooltip {...TT} formatter={(v: any) => [`${v}°C`, 'Avg Temp']} />
                <Area type="monotone" dataKey="temp" stroke="var(--color-danger)" fill="url(#gr)" strokeWidth={2} dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

      {showModal && <ScheduleModal onClose={() => setShowModal(false)} onSave={addSchedule} />}
      <Toast toast={toast} />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes boiler-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(52,199,89,0.3); }
          50%       { box-shadow: 0 0 24px rgba(52,199,89,0.55); }
        }
      `}</style>
    </div>
  )
}