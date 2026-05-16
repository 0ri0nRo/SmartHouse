import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LayoutGrid,
  LocateFixed,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  SquarePen,
  Thermometer,
  TrendingUp,
  X,
  LineChart as LineChartIcon,
  Droplets,
} from 'lucide-react'
import { api } from '../api'
import SensorLiveValueTag from '../components/SensorLiveValueTag'
import { resolveSensorKind, SENSOR_KIND_REGISTRY } from '../features/sensors/sensorRegistry'
import { useSensorCatalog, useSensorCatalogSync, useSensorHistory } from '../features/sensors/useSensors'

const SensorHistoryChart = lazy(() => import('../features/sensors/SensorHistoryChart.jsx'))

const ROOM_LAYOUT = [
  { id: 'cucina', label: 'Kitchen', x: 6, y: 12, w: 28, h: 26 },
  { id: 'sala', label: 'Living room', x: 37, y: 12, w: 26, h: 26 },
  { id: 'corridoio', label: 'Hallway', x: 6, y: 42, w: 57, h: 16 },
  { id: 'camera1', label: 'Bedroom', x: 6, y: 62, w: 26, h: 24 },
  { id: 'bagno', label: 'Bathroom', x: 35, y: 62, w: 22, h: 24 },
  { id: 'ufficio', label: 'Office', x: 60, y: 42, w: 32, h: 44 },
]

const CLIMATE_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const CLIMATE_TOOLTIP_THEME = {
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

function toRelativePosition(sensor) {
  return {
    left: `${Math.max(2, Math.min(96, Number(sensor.x ?? 50)))}%`,
    top: `${Math.max(2, Math.min(96, Number(sensor.y ?? 50)))}%`,
  }
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value)))
}

function toHourlySeries(payload, valueKey) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  return Object.keys(payload)
    .map(Number)
    .filter((hour) => !Number.isNaN(hour))
    .sort((a, b) => a - b)
    .map((hour) => ({
      hour: `${hour}:00`,
      [valueKey]: Number(payload[hour]),
    }))
    .filter((row) => Number.isFinite(row[valueKey]))
}

function toGasSeries(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  return Object.keys(payload)
    .map(Number)
    .filter((hour) => !Number.isNaN(hour))
    .sort((a, b) => a - b)
    .map((hour) => ({
      hour: `${hour}:00`,
      smoke: Number(payload[hour]?.avg_smoke ?? 0),
      lpg: Number(payload[hour]?.avg_lpg ?? 0),
      methane: Number(payload[hour]?.avg_methane ?? 0),
      hydrogen: Number(payload[hour]?.avg_hydrogen ?? 0),
    }))
}

function hasNumericHistoryValues(historyRows = []) {
  if (!Array.isArray(historyRows) || historyRows.length === 0) return false
  return historyRows.some((row) => {
    if (row?.temperature != null && Number.isFinite(Number(row.temperature))) return true
    if (row?.humidity != null && Number.isFinite(Number(row.humidity))) return true

    const extra = row?.extra
    if (extra && typeof extra === 'object') {
      return Object.values(extra).some((value) => Number.isFinite(Number(value)))
    }

    return false
  })
}

function FloorplanClimateFallbackChart() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const [tempRaw, humRaw] = await Promise.all([
          api.getTodayTemp().catch(() => ({})),
          api.getTodayHum().catch(() => ({})),
        ])

        if (!mounted) return

        const hourly = Array.from({ length: 24 }, (_, hour) => {
          const temperature = tempRaw?.[hour]
          const humidity = humRaw?.[hour]
          return {
            hour: `${hour}:00`,
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : null,
            humidity: Number.isFinite(Number(humidity)) ? Number(humidity) : null,
          }
        })

        const meaningfulRows = hourly.filter((row) => row.temperature != null || row.humidity != null)
        setRows(meaningfulRows)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="sensor-history-panel">
      <div className="sensor-history-panel__header">
        <div>
          <h3>Temperature & Humidity</h3>
          <p>Fallback timeline from daily climate APIs</p>
        </div>
      </div>
      <div className="sensor-history-panel__chart">
        {loading ? (
          <div className="sensor-history-panel__empty">Loading fallback climate data...</div>
        ) : !rows.length ? (
          <div className="sensor-history-panel__empty">No fallback climate data available for today.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="hour" stroke="rgba(148,163,184,0.75)" />
              <YAxis stroke="rgba(148,163,184,0.75)" width={52} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.96)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 16,
                  color: '#f8fafc',
                }}
              />
              <Line type="monotone" dataKey="temperature" name="Temperature" stroke="#f97316" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="humidity" name="Humidity" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function EnvironmentApiWidgets() {
  const [temperatureRows, setTemperatureRows] = useState([])
  const [humidityRows, setHumidityRows] = useState([])
  const [gasRows, setGasRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const [tempRaw, humRaw, gasRaw] = await Promise.all([
          api.getTodayTemp().catch(() => ({})),
          api.getTodayHum().catch(() => ({})),
          api.getGasToday().catch(() => ({})),
        ])

        if (!mounted) return
        setTemperatureRows(toHourlySeries(tempRaw, 'temperature'))
        setHumidityRows(toHourlySeries(humRaw, 'humidity'))
        setGasRows(toGasSeries(gasRaw))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    const intervalId = window.setInterval(load, 5 * 60 * 1000)
    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  const renderChart = (rows, lineDefs) => {
    if (!rows.length) return <p className="floorplan-api-widget__empty">No data available today.</p>
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
          <XAxis dataKey="hour" stroke="rgba(148,163,184,0.75)" tick={{ fontSize: 11 }} />
          <YAxis stroke="rgba(148,163,184,0.75)" width={42} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: 'rgba(15, 23, 42, 0.96)',
              border: '1px solid rgba(148, 163, 184, 0.18)',
              borderRadius: 12,
              color: '#f8fafc',
            }}
          />
          {lineDefs.map((lineDef) => (
            <Line
              key={lineDef.key}
              type="monotone"
              dataKey={lineDef.key}
              stroke={lineDef.color}
              strokeWidth={2}
              dot={false}
              name={lineDef.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <section className="floorplan-api-widget-grid">
      <article className="floorplan-api-widget">
        <header>
          <h3>Temperature API</h3>
          <p>Source: /api/today_temperature</p>
        </header>
        <div className="floorplan-api-widget__chart">
          {loading ? <p className="floorplan-api-widget__empty">Loading...</p> : renderChart(temperatureRows, [{ key: 'temperature', label: 'Temperature', color: '#f97316' }])}
        </div>
      </article>

      <article className="floorplan-api-widget">
        <header>
          <h3>Humidity API</h3>
          <p>Source: /api/today_humidity</p>
        </header>
        <div className="floorplan-api-widget__chart">
          {loading ? <p className="floorplan-api-widget__empty">Loading...</p> : renderChart(humidityRows, [{ key: 'humidity', label: 'Humidity', color: '#0ea5e9' }])}
        </div>
      </article>

      <article className="floorplan-api-widget">
        <header>
          <h3>Gas API</h3>
          <p>Source: /api/gas_concentration_today</p>
        </header>
        <div className="floorplan-api-widget__chart">
          {loading ? (
            <p className="floorplan-api-widget__empty">Loading...</p>
          ) : renderChart(gasRows, [
            { key: 'smoke', label: 'Smoke', color: '#ef4444' },
            { key: 'lpg', label: 'LPG', color: '#22c55e' },
            { key: 'methane', label: 'Methane', color: '#f59e0b' },
            { key: 'hydrogen', label: 'Hydrogen', color: '#38bdf8' },
          ])}
        </div>
      </article>
    </section>
  )
}

function ApiHealthPanel() {
  const [checks, setChecks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const runChecks = async () => {
      const checkDefinitions = [
        { id: 'legacy-summary', label: 'Legacy summary', run: () => api.getSensors() },
        { id: 'sensor-catalog', label: 'Sensor catalog', run: () => api.getSensorCatalog() },
        { id: 'sensor-summary', label: 'Sensor summary', run: () => api.getSensorsSummary() },
        { id: 'today-temp', label: 'Today temperature', run: () => api.getTodayTemp() },
        { id: 'today-humidity', label: 'Today humidity', run: () => api.getTodayHum() },
        { id: 'today-gas', label: 'Today gas', run: () => api.getGasToday() },
        { id: 'zigbee-latest', label: 'Zigbee latest', run: () => api.getZigbeeLatest() },
      ]

      const results = await Promise.all(
        checkDefinitions.map(async (check) => {
          const started = performance.now()
          try {
            await check.run()
            return {
              id: check.id,
              label: check.label,
              ok: true,
              latencyMs: Math.round(performance.now() - started),
              message: 'OK',
            }
          } catch (error) {
            return {
              id: check.id,
              label: check.label,
              ok: false,
              latencyMs: Math.round(performance.now() - started),
              message: error instanceof Error ? error.message : 'Request failed',
            }
          }
        }),
      )

      if (!mounted) return
      setChecks(results)
      setLoading(false)
    }

    runChecks()
    const intervalId = window.setInterval(runChecks, 60000)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <section className="floorplan-api-health">
      <header>
        <h3>
          <Activity size={16} /> API health
        </h3>
        <p>Backend/frontend endpoint contract checks every 60s.</p>
      </header>

      {loading ? (
        <p className="floorplan-api-health__loading">Running checks...</p>
      ) : (
        <div className="floorplan-api-health__grid">
          {checks.map((check) => (
            <article key={check.id} className={`floorplan-api-health__item ${check.ok ? 'is-ok' : 'is-error'}`}>
              <div>
                <strong>{check.label}</strong>
                <p>{check.message}</p>
              </div>
              <span>{check.latencyMs} ms</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ClimateChartCard({ title, icon: Icon, badge, controls, children, height = 220 }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon icon-blue"><Icon size={14} /></div>
        <span className="card-header-title">{title}</span>
        {badge ? <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>{badge}</span> : null}
      </div>
      {controls ? (
        <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface-2)', display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
          {controls}
        </div>
      ) : null}
      <div style={{ padding: '1rem 0.5rem 0.75rem', height }}>
        {children}
      </div>
    </div>
  )
}

function ClimatePageIntegrationBlock({ mode }) {
  const isTemperature = mode === 'temperature'
  const accent = isTemperature ? 'var(--card-temp-accent)' : 'var(--card-hum-accent)'
  const unit = isTemperature ? '°C' : '%'
  const title = isTemperature ? 'Temperature' : 'Humidity'

  const now = new Date()
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 5 + i)

  const [currentValue, setCurrentValue] = useState(null)
  const [minMax, setMinMax] = useState(null)

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareMonth, setCompareMonth] = useState(now.getMonth() + 1)
  const [compareYear, setCompareYear] = useState(now.getFullYear() - 1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [todayData, setTodayData] = useState([])
  const [monthlyData, setMonthlyData] = useState([])
  const [dailyData, setDailyData] = useState([])
  const [compareData, setCompareData] = useState(null)
  const [rangeData, setRangeData] = useState([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [loadingRange, setLoadingRange] = useState(false)

  const loadCurrent = useMemo(() => async () => {
    try {
      const summary = await api.getSensors()
      const root = isTemperature ? summary?.temperature : summary?.humidity
      const current = Number(root?.current)
      const mm = root?.minMaxLast24Hours
      setCurrentValue(Number.isFinite(current) ? current : null)
      if (Array.isArray(mm) && mm.length >= 2) {
        const min = Number(mm[0])
        const max = Number(mm[1])
        setMinMax(Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null)
      } else {
        setMinMax(null)
      }
    } catch {
      setCurrentValue(null)
      setMinMax(null)
    }
  }, [isTemperature])

  const loadCharts = useMemo(() => async (m, y, cmp, cm, cy) => {
    setLoadingCharts(true)
    try {
      const [today, monthly, daily] = await Promise.all([
        (isTemperature ? api.getTodayTemp() : api.getTodayHum()).catch(() => ({})),
        (isTemperature ? api.getMonthlyTemp(y) : api.getMonthlyHum(y)).catch(() => ({})),
        (isTemperature ? api.getDailyTemp(m, y) : api.getDailyHum(m, y)).catch(() => ({})),
      ])

      setTodayData(
        Object.keys(today)
          .map(Number)
          .sort((a, b) => a - b)
          .map((hour) => ({ hour: `${hour}:00`, value: today[hour] ?? null })),
      )

      setMonthlyData(CLIMATE_MONTHS.map((monthName, i) => ({ month: monthName.substring(0, 3), value: monthly[i + 1] ?? null })))

      const days = Array.from({ length: 31 }, (_, i) => i + 1)
      setDailyData(days.map((day) => ({ day: `${day}`, value: daily[day] ?? null })))

      if (cmp && cm && cy) {
        const compareDaily = await (isTemperature ? api.getDailyTemp(cm, cy) : api.getDailyHum(cm, cy)).catch(() => ({}))
        setCompareData(days.map((day) => compareDaily[day] ?? null))
      } else {
        setCompareData(null)
      }
    } finally {
      setLoadingCharts(false)
    }
  }, [isTemperature])

  useEffect(() => {
    loadCurrent()
    loadCharts(month, year, false, null, null)
    const intervalId = window.setInterval(loadCurrent, 30000)
    return () => window.clearInterval(intervalId)
  }, [loadCurrent, loadCharts, month, year])

  const fetchRange = async () => {
    if (!startDate || !endDate) return
    if (new Date(startDate) >= new Date(endDate)) return

    setLoadingRange(true)
    try {
      const rows = await (isTemperature ? api.getRangeTemp(startDate, endDate) : api.getRangeHum(startDate, endDate))
      setRangeData((rows || []).map((row) => ({
        time: new Date(row.hour).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
        value: isTemperature ? row.avg_temperature : row.avg_humidity,
      })))
    } catch {
      setRangeData([])
    } finally {
      setLoadingRange(false)
    }
  }

  const dailyControls = (
    <>
      <div className="field" style={{ flex: 1, minWidth: 110 }}>
        <label className="field-label">Month</label>
        <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {CLIMATE_MONTHS.map((monthName, i) => <option key={monthName} value={i + 1}>{monthName}</option>)}
        </select>
      </div>
      <div className="field" style={{ flex: 1, minWidth: 90 }}>
        <label className="field-label">Year</label>
        <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {years.map((yearOption) => <option key={yearOption}>{yearOption}</option>)}
        </select>
      </div>
      <div className="field" style={{ flex: 'none', justifyContent: 'flex-end' }}>
        <label className="field-label" style={{ opacity: 0 }}>-</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={compareEnabled} onChange={(event) => setCompareEnabled(event.target.checked)} /> Compare
        </label>
      </div>
      {compareEnabled ? (
        <>
          <div className="field" style={{ flex: 1, minWidth: 110 }}>
            <label className="field-label">Cmp Month</label>
            <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={compareMonth} onChange={(event) => setCompareMonth(Number(event.target.value))}>
              {CLIMATE_MONTHS.map((monthName, i) => <option key={monthName} value={i + 1}>{monthName}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 90 }}>
            <label className="field-label">Cmp Year</label>
            <select className="select" style={{ padding: '0.42rem 0.6rem', fontSize: '0.8rem' }} value={compareYear} onChange={(event) => setCompareYear(Number(event.target.value))}>
              {years.map((yearOption) => <option key={yearOption}>{yearOption}</option>)}
            </select>
          </div>
        </>
      ) : null}
      <button className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={() => loadCharts(month, year, compareEnabled, compareMonth, compareYear)} disabled={loadingCharts}>
        <RefreshCw size={12} style={{ animation: loadingCharts ? 'spin 0.8s linear infinite' : 'none' }} /> Update
      </button>
    </>
  )

  const rangeControls = (
    <>
      {[{ label: 'Start', value: startDate, setter: setStartDate }, { label: 'End', value: endDate, setter: setEndDate }].map((field) => (
        <div key={field.label} className="field" style={{ flex: 1, minWidth: 150 }}>
          <label className="field-label">{field.label}</label>
          <input
            type="datetime-local"
            className="input input--mono"
            style={{ padding: '0.42rem 0.6rem', fontSize: '0.78rem' }}
            value={field.value}
            onChange={(event) => field.setter(event.target.value)}
          />
        </div>
      ))}
      <button className="btn btn--primary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={fetchRange} disabled={loadingRange}>
        <Search size={12} style={{ animation: loadingRange ? 'spin 0.8s linear infinite' : 'none' }} /> Fetch
      </button>
    </>
  )

  return (
    <section className="floorplan-climate-panel">
      <header className="floorplan-climate-panel__header">
        <h2>{title} Page Integration</h2>
        <button className="btn btn--ghost btn--sm" onClick={loadCurrent}>
          <RefreshCw size={12} /> Refresh current
        </button>
      </header>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '1.25rem', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Current {title.toLowerCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 500, color: accent, lineHeight: 1 }}>
              {currentValue != null ? Number(currentValue).toFixed(isTemperature ? 1 : 0) : '—'}
              <span style={{ fontSize: '1.05rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.2rem' }}>{unit}</span>
            </div>
          </div>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              Last 24h min-max
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {minMax ? `${minMax.min.toFixed(isTemperature ? 1 : 0)} - ${minMax.max.toFixed(isTemperature ? 1 : 0)} ${unit}` : '—'}
            </div>
          </div>
        </div>
      </div>

      <ClimateChartCard title="Today's readings" icon={isTemperature ? Thermometer : Droplets} badge="Live">
        {!todayData.length ? (
          <div className="floorplan-api-widget__empty">No data yet today.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={todayData} margin={{ left: -16, right: 8 }}>
              <defs>
                <linearGradient id={`g-${mode}-today`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit={unit} axisLine={false} tickLine={false} width={36} />
              <Tooltip {...CLIMATE_TOOLTIP_THEME} formatter={(value) => [value != null ? `${value}${unit}` : 'N/A', title]} />
              <Area type="monotone" dataKey="value" stroke={accent} fill={`url(#g-${mode}-today)`} strokeWidth={2} dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ClimateChartCard>

      <ClimateChartCard title="Monthly average" icon={TrendingUp} badge={`${year}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData} margin={{ left: -16, right: 8 }}>
            <defs>
              <linearGradient id={`g-${mode}-month`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accent} stopOpacity={0.14} />
                <stop offset="95%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit={unit} axisLine={false} tickLine={false} width={36} />
            <Tooltip {...CLIMATE_TOOLTIP_THEME} formatter={(value) => [value != null ? `${value}${unit}` : 'N/A', `Avg ${year}`]} />
            <Area type="monotone" dataKey="value" stroke={accent} fill={`url(#g-${mode}-month)`} strokeWidth={2} dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </ClimateChartCard>

      <ClimateChartCard title="Daily breakdown" icon={CalendarDays} controls={dailyControls}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dailyData.map((row, idx) => ({ ...row, compare: compareData ? compareData[idx] : undefined }))} margin={{ left: -16, right: 8 }} barGap={1}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit={unit} axisLine={false} tickLine={false} width={36} />
            <Tooltip {...CLIMATE_TOOLTIP_THEME} />
            {compareData ? <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} /> : null}
            <Bar dataKey="value" name={`${CLIMATE_MONTHS[month - 1].substring(0, 3)} ${year}`} fill={accent} radius={[3, 3, 0, 0]} maxBarSize={14} />
            {compareData ? <Bar dataKey="compare" name={`${CLIMATE_MONTHS[compareMonth - 1].substring(0, 3)} ${compareYear}`} fill="var(--card-shop-accent)" radius={[3, 3, 0, 0]} maxBarSize={14} /> : null}
          </BarChart>
        </ResponsiveContainer>
      </ClimateChartCard>

      <ClimateChartCard title="Custom range" icon={LineChartIcon} controls={rangeControls}>
        {!rangeData.length ? (
          <div className="floorplan-api-widget__empty">Pick a date range above.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rangeData} margin={{ left: -16, right: 8 }}>
              <defs>
                <linearGradient id={`g-${mode}-range`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent} stopOpacity={0.14} />
                  <stop offset="95%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} unit={unit} axisLine={false} tickLine={false} width={36} />
              <Tooltip {...CLIMATE_TOOLTIP_THEME} formatter={(value) => [`${value}${unit}`, `Avg ${title}`]} />
              <Area type="monotone" dataKey="value" stroke={accent} fill={`url(#g-${mode}-range)`} strokeWidth={2} dot={false} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ClimateChartCard>
    </section>
  )
}

function IntegratedClimatePagesSection({ showTemperature, showHumidity }) {
  if (!showTemperature && !showHumidity) {
    return null
  }

  return (
    <section className="floorplan-climate-grid">
      {showTemperature ? <ClimatePageIntegrationBlock mode="temperature" /> : null}
      {showHumidity ? <ClimatePageIntegrationBlock mode="humidity" /> : null}
    </section>
  )
}

function AddSensorPanel({ typeOptions, onCreate }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    name: '',
    type: typeOptions[0] || 'temp_hum',
    room_id: 'corridoio',
    topic: '',
    device_name: '',
    live_api_endpoint: '',
    live_api_unit: '',
    x: 50,
    y: 50,
  })

  const reset = () => {
    setForm((current) => ({
      ...current,
      name: '',
      topic: '',
      device_name: '',
      live_api_endpoint: '',
      live_api_unit: '',
      x: 50,
      y: 50,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Please provide a sensor name')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onCreate({
        name: form.name.trim(),
        type: form.type,
        room_id: form.room_id,
        topic: form.topic.trim(),
        device_name: form.device_name.trim(),
        x: clampPercent(form.x),
        y: clampPercent(form.y),
        live_api: form.live_api_endpoint.trim()
          ? {
              endpoint: form.live_api_endpoint.trim(),
              unit: form.live_api_unit.trim() || undefined,
            }
          : undefined,
      })
      reset()
      setIsOpen(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create sensor')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="floorplan-add-sensor">
      <button type="button" className="floorplan-add-sensor__toggle" onClick={() => setIsOpen((value) => !value)}>
        <Plus size={16} />
        New Zigbee sensor
      </button>

      {isOpen ? (
        <form className="floorplan-add-sensor__form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Kitchen Temp"
            />
          </label>
          <label>
            Type
            <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {resolveSensorKind(type).label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room
            <select value={form.room_id} onChange={(event) => setForm((current) => ({ ...current, room_id: event.target.value }))}>
              {ROOM_LAYOUT.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            MQTT topic
            <input
              value={form.topic}
              onChange={(event) => setForm((current) => ({ ...current, topic: event.target.value }))}
              placeholder="zigbee2mqtt/kitchen"
            />
          </label>
          <label>
            Device name
            <input
              value={form.device_name}
              onChange={(event) => setForm((current) => ({ ...current, device_name: event.target.value }))}
              placeholder="0x00124b..."
            />
          </label>
          <label>
            Live API endpoint
            <input
              value={form.live_api_endpoint}
              onChange={(event) => setForm((current) => ({ ...current, live_api_endpoint: event.target.value }))}
              placeholder="/api/live/kitchen-temp"
            />
          </label>
          <label>
            Live API unit
            <input
              value={form.live_api_unit}
              onChange={(event) => setForm((current) => ({ ...current, live_api_unit: event.target.value }))}
              placeholder="°C"
            />
          </label>
          <div className="floorplan-add-sensor__coords">
            <label>
              X (%)
              <input
                type="number"
                min={0}
                max={100}
                value={form.x}
                onChange={(event) => setForm((current) => ({ ...current, x: event.target.value }))}
              />
            </label>
            <label>
              Y (%)
              <input
                type="number"
                min={0}
                max={100}
                value={form.y}
                onChange={(event) => setForm((current) => ({ ...current, y: event.target.value }))}
              />
            </label>
          </div>

          {error ? <p className="floorplan-add-sensor__error">{error}</p> : null}

          <div className="floorplan-add-sensor__actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Create sensor'}
            </button>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

function formatValue(sensor) {
  const values = []
  if (sensor.temperature != null) values.push(`${Number(sensor.temperature).toFixed(1)} °C`)
  if (sensor.humidity != null) values.push(`${Number(sensor.humidity).toFixed(0)} %`)
  if (sensor.battery != null) values.push(`${Number(sensor.battery).toFixed(0)} % battery`)
  if (sensor.signal_quality != null) values.push(`${Number(sensor.signal_quality).toFixed(0)} lqi`)
  return values.join(' · ')
}

function isOnline(sensor) {
  const hasLastSeen = Boolean(sensor.last_seen)
  const seenRecently = hasLastSeen
    ? Date.now() - new Date(sensor.last_seen).getTime() < 5 * 60 * 1000
    : false

  // Prioritize real freshness over stale persisted flags.
  if (seenRecently) return true
  if (sensor.online != null) return Boolean(sensor.online)
  return false
}

function SensorTile({ sensor, selected, onSelect }) {
  const kind = resolveSensorKind(sensor.type)
  const Icon = kind.icon
  const online = isOnline(sensor)

  return (
    <button
      type="button"
      className={`floorplan-marker ${selected ? 'is-selected' : ''} ${online ? 'is-online' : 'is-offline'}`}
      style={{ ...toRelativePosition(sensor), borderColor: kind.color }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(sensor.id)
      }}
      title={sensor.name}
    >
      <span className="floorplan-marker__icon" style={{ background: kind.color }}>
        <Icon size={16} />
      </span>
      <span className="floorplan-marker__meta">
        <strong>{sensor.name}</strong>
        <span>{online ? 'Online' : 'Offline'}</span>
      </span>
    </button>
  )
}

function FloorplanStats({ summary }) {
  const cards = [
    { label: 'Total', value: summary?.total ?? 0 },
    { label: 'Online', value: summary?.online ?? 0 },
    { label: 'Alerts', value: summary?.alerts ?? 0 },
    { label: 'Avg temp', value: summary?.avg_temp != null ? `${summary.avg_temp} °C` : '—' },
    { label: 'Avg hum', value: summary?.avg_hum != null ? `${summary.avg_hum} %` : '—' },
  ]

  return (
    <div className="floorplan-stats">
      {cards.map((card) => (
        <article key={card.label} className="floorplan-stat-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  )
}

function FilterBar({ filters, roomOptions, typeOptions, onChange, onRefresh }) {
  return (
    <div className="floorplan-filters">
      <label>
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder="Search sensors, rooms, topics"
        />
      </label>
      <label>
        <Filter size={16} />
        <select value={filters.room} onChange={(event) => onChange({ room: event.target.value })}>
          <option value="all">All rooms</option>
          {roomOptions.map((room) => (
            <option key={room} value={room}>
              {room}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Settings2 size={16} />
        <select value={filters.type} onChange={(event) => onChange({ type: event.target.value })}>
          <option value="all">All types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        <SlidersHorizontal size={16} />
        <select value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
          <option value="all">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </label>
      <button type="button" className="floorplan-filters__refresh" onClick={onRefresh}>
        <RefreshCw size={16} />
        Refresh
      </button>
    </div>
  )
}

function SensorDetails({ sensor, historyHours, onMove, onSetHistoryHours, onRefreshHistory, onTogglePlacement, placementMode, onPinWidget, widgetPinned }) {
  if (!sensor) {
    return (
      <section className="floorplan-sidebar__empty">
        <MapPin size={18} />
        <h3>Select a sensor</h3>
        <p>Choose a device from the map or the list to inspect its live values and history.</p>
      </section>
    )
  }

  const kind = resolveSensorKind(sensor.type)
  const online = isOnline(sensor)
  const liveSummary = formatValue(sensor)
  const liveApi = sensor.live_api

  return (
    <section className="floorplan-sidebar__card">
      <div className="floorplan-sidebar__card-header">
        <div>
          <p>{kind.label}</p>
          <h3>{sensor.name}</h3>
        </div>
        <span className={online ? 'status-pill status-pill--online' : 'status-pill status-pill--offline'}>
          {online ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="floorplan-sidebar__description">{sensor.room_name || sensor.room_id || 'Unassigned room'}</p>
      <div className="floorplan-sidebar__metrics">
        <div>
          <span>Topic</span>
          <strong>{sensor.topic || '—'}</strong>
        </div>
        <div>
          <span>Live values</span>
          <strong>{liveSummary || '—'}</strong>
        </div>
        <div>
          <span>Last seen</span>
          <strong>{sensor.last_seen ? new Date(sensor.last_seen).toLocaleString() : '—'}</strong>
        </div>
        {liveApi?.endpoint ? (
          <div>
            <span>Live API</span>
            <SensorLiveValueTag liveApi={liveApi} compact showUnit />
          </div>
        ) : null}
      </div>
      <div className="floorplan-sidebar__actions">
        <button type="button" onClick={() => onRefreshHistory(sensor.id)}>
          <RefreshCw size={16} />
          Refresh history
        </button>
        <button type="button" onClick={() => onSetHistoryHours(historyHours === 6 ? 24 : 6)}>
          <ArrowRight size={16} />
          {historyHours === 6 ? '24h history' : '6h history'}
        </button>
        <button type="button" onClick={() => onTogglePlacement()}>
          <LocateFixed size={16} />
          {placementMode ? 'Placement on' : 'Position on map'}
        </button>
        <button type="button" onClick={() => onPinWidget(sensor.id)}>
          <LayoutGrid size={16} />
          {widgetPinned ? 'Widget pinned' : 'Add widget'}
        </button>
      </div>
      <div className="floorplan-sidebar__position">
        <div>
          <span>Position</span>
          <strong>
            {Math.round(Number(sensor.x ?? 0))}% / {Math.round(Number(sensor.y ?? 0))}%
          </strong>
        </div>
        <button
          type="button"
          onClick={() => onMove(sensor.id, Math.max(0, Math.min(100, Number(sensor.x ?? 0) + 4)), Math.max(0, Math.min(100, Number(sensor.y ?? 0) + 4)))}
        >
          <SquarePen size={16} />
          Move slightly
        </button>
      </div>
    </section>
  )
}

function SensorWidgetCard({ sensor, hours, onRemove }) {
  const { history, refresh } = useSensorHistory(sensor?.id ?? null, hours)

  if (!sensor) return null

  return (
    <article className="floorplan-widget-card">
      <header className="floorplan-widget-card__header">
        <div>
          <p>{sensor.room_name || sensor.room_id || 'Room'}</p>
          <h3>{sensor.name}</h3>
        </div>
        <div className="floorplan-widget-card__actions">
          <button type="button" onClick={() => refresh()}>
            <RefreshCw size={15} />
          </button>
          <button type="button" onClick={() => onRemove(sensor.id)}>
            <X size={15} />
          </button>
        </div>
      </header>
      <Suspense fallback={<div className="sensor-history-panel sensor-history-panel--loading">Loading history…</div>}>
        <SensorHistoryChart sensor={sensor} history={history} hours={hours} />
      </Suspense>
    </article>
  )
}

export default function FloorplanPage() {
  const navigate = useNavigate()
  const { refresh: refreshCatalog } = useSensorCatalogSync()
  const { sensors, selectedSensor, selectedSensorId, setSelectedSensorId, historyHours, setHistoryHours, filters, setFilters, filteredSensors, filterOptions, summary, isLoading, error } = useSensorCatalog()
  const { history, refresh: refreshHistory } = useSensorHistory(selectedSensor?.id ?? null, historyHours)
  const [banner, setBanner] = useState(null)
  const [placementMode, setPlacementMode] = useState(false)
  const [widgetSensorIds, setWidgetSensorIds] = useState([])
  const [showTemperatureIntegration, setShowTemperatureIntegration] = useState(true)
  const [showHumidityIntegration, setShowHumidityIntegration] = useState(true)
  const mapGridRef = useRef(null)

  const availableTypeOptions = useMemo(() => {
    const discovered = filterOptions.typeOptions.filter(Boolean)
    const registry = Object.keys(SENSOR_KIND_REGISTRY).filter((key) => key !== 'default' && key !== 'generic')
    return Array.from(new Set([...discovered, ...registry]))
  }, [filterOptions.typeOptions])

  const widgetSensors = useMemo(
    () => widgetSensorIds.map((sensorId) => sensors.find((sensor) => sensor.id === sensorId)).filter(Boolean),
    [widgetSensorIds, sensors],
  )

  useEffect(() => {
    if (!selectedSensorId && filteredSensors.length > 0) {
      setSelectedSensorId(filteredSensors[0].id)
    }
  }, [filteredSensors, selectedSensorId, setSelectedSensorId])

  useEffect(() => {
    setWidgetSensorIds((current) => current.filter((sensorId) => sensors.some((sensor) => sensor.id === sensorId)))
  }, [sensors])

  const activeSensor = selectedSensor || filteredSensors[0] || null
  const hasActiveSensorHistory = hasNumericHistoryValues(history)

  const handleRefreshAll = async () => {
    await refreshCatalog()
    await refreshHistory()
  }

  const handleMoveSensor = async (sensorId, x, y) => {
    try {
      await api.updateSensorPosition(sensorId, { x, y })
      await refreshCatalog()
      await refreshHistory()
      setBanner({ type: 'info', message: 'Sensor position saved to Postgres.' })
    } catch (moveError) {
      setBanner({
        type: 'error',
        message: moveError instanceof Error ? moveError.message : 'Error while saving the sensor position',
      })
    }
  }

  const handleCreateSensor = async (payload) => {
    const createdSensor = await api.createSensor(payload)
    await refreshCatalog()
    if (createdSensor?.id) {
      setSelectedSensorId(createdSensor.id)
    }
    setBanner({ type: 'info', message: 'New Zigbee sensor created and saved to Postgres.' })
  }

  const handleMapPlacement = async (event) => {
    if (!placementMode || !activeSensor || !mapGridRef.current) return

    const rect = mapGridRef.current.getBoundingClientRect()
    const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100)
    const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100)
    await handleMoveSensor(activeSensor.id, x, y)
    setPlacementMode(false)
  }

  const handleToggleWidget = (sensorId) => {
    setWidgetSensorIds((current) => {
      if (current.includes(sensorId)) return current
      return [...current, sensorId]
    })
  }

  const handleRemoveWidget = (sensorId) => {
    setWidgetSensorIds((current) => current.filter((id) => id !== sensorId))
  }

  return (
    <div className="floorplan-page animate-fade">
      <header className="floorplan-header">
        <div>
          <p className="floorplan-header__eyebrow">Unified sensor hub</p>
          <h1>Floorplan</h1>
          <p>All Zigbee and generic sensors are managed from a single room map with live values, history, and status.</p>
        </div>
        <div className="floorplan-header__actions">
          <button type="button" onClick={() => navigate('/sensors')}>
            <MapPin size={16} />
            Sensor registry
          </button>
          <button type="button" onClick={handleRefreshAll}>
            <RefreshCw size={16} />
            Refresh all
          </button>
        </div>
      </header>

      <FloorplanStats summary={summary} />

      <FilterBar
        filters={filters}
        roomOptions={filterOptions.roomOptions}
        typeOptions={filterOptions.typeOptions}
        onChange={(partial) => setFilters(partial)}
        onRefresh={handleRefreshAll}
      />

      {banner ? <div className={`floorplan-banner ${banner.type === 'error' ? 'floorplan-banner--error' : ''}`}>{banner.message}</div> : null}
      {error ? <div className="floorplan-banner floorplan-banner--error">{error}</div> : null}
      {isLoading ? <div className="floorplan-banner">Loading sensors…</div> : null}

      <div className="floorplan-grid">
        <section className="floorplan-map">
          <div
            className={`floorplan-map__grid ${placementMode ? 'is-placement-mode' : ''}`}
            ref={mapGridRef}
            onClick={handleMapPlacement}
          >
            {ROOM_LAYOUT.map((room) => (
              <article
                key={room.id}
                className="floorplan-room"
                style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }}
              >
                <strong>{room.label}</strong>
              </article>
            ))}

            {filteredSensors.map((sensor) => (
              <SensorTile
                key={sensor.id}
                sensor={sensor}
                selected={sensor.id === activeSensor?.id}
                onSelect={setSelectedSensorId}
              />
            ))}

            {placementMode && activeSensor ? (
              <div className="floorplan-placement-hint">
                Placement mode enabled for {activeSensor.name}: click anywhere on the map.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="floorplan-sidebar">
          <AddSensorPanel typeOptions={availableTypeOptions} onCreate={handleCreateSensor} />

          <SensorDetails
            sensor={activeSensor}
            historyHours={historyHours}
            onMove={handleMoveSensor}
            onSetHistoryHours={setHistoryHours}
            onRefreshHistory={refreshHistory}
            onTogglePlacement={() => setPlacementMode((value) => !value)}
            placementMode={placementMode}
            onPinWidget={handleToggleWidget}
            widgetPinned={activeSensor ? widgetSensorIds.includes(activeSensor.id) : false}
          />

          <div className="floorplan-list">
            <div className="floorplan-list__header">
              <h3>Visible sensors</h3>
              <span>{filteredSensors.length}</span>
            </div>
            {filteredSensors.map((sensor) => {
              const kind = resolveSensorKind(sensor.type)
              const online = isOnline(sensor)
              return (
                <button
                  type="button"
                  key={sensor.id}
                  className={`floorplan-list__item ${sensor.id === activeSensor?.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedSensorId(sensor.id)}
                >
                  <span className="floorplan-list__item-dot" style={{ background: kind.color }} />
                  <span className="floorplan-list__item-content">
                    <strong>{sensor.name}</strong>
                    <span>
                      {sensor.room_name || sensor.room_id || 'No room'} · {online ? 'online' : 'offline'}
                    </span>
                  </span>
                  <span className="floorplan-list__item-value">{formatValue(sensor) || '—'}</span>
                </button>
              )
            })}
            {!filteredSensors.length ? <p className="floorplan-list__empty">No sensors match the current filters.</p> : null}
          </div>
        </aside>
      </div>

      <section className="floorplan-block">
        <header className="floorplan-block__header">
          <div>
            <h2>Sensor analytics</h2>
            <p>Focused trends for your selected sensor, with automatic climate fallback when history is missing.</p>
          </div>
        </header>
        {widgetSensors.length ? (
          <section className="floorplan-widget-grid">
            {widgetSensors.map((sensor) => (
              <SensorWidgetCard key={sensor.id} sensor={sensor} hours={historyHours} onRemove={handleRemoveWidget} />
            ))}
          </section>
        ) : (
          <Suspense fallback={<div className="sensor-history-panel sensor-history-panel--loading">Loading history…</div>}>
            {selectedSensor ? (
              hasActiveSensorHistory
                ? <SensorHistoryChart sensor={selectedSensor} history={history} hours={historyHours} />
                : <FloorplanClimateFallbackChart />
            ) : null}
          </Suspense>
        )}
      </section>

      <section className="floorplan-block">
        <header className="floorplan-block__header">
          <div>
            <h2>API observability</h2>
            <p>Live endpoint widgets and contract checks to validate backend/frontend integration quality.</p>
          </div>
        </header>
        <EnvironmentApiWidgets />
        <ApiHealthPanel />
      </section>

      <section className="floorplan-block">
        <header className="floorplan-block__header">
          <div>
            <h2>Climate studio</h2>
            <p>Embedded Temperature and Humidity pages for historical analysis without leaving Floorplan.</p>
          </div>
        </header>

        <section className="floorplan-integration-controls">
          <h2>Integrated climate pages</h2>
          <div className="floorplan-integration-controls__actions">
            <button type="button" className={`btn btn--sm ${showTemperatureIntegration ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setShowTemperatureIntegration((value) => !value)}>
              {showTemperatureIntegration ? 'Hide Temperature integration' : 'Show Temperature integration'}
            </button>
            <button type="button" className={`btn btn--sm ${showHumidityIntegration ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setShowHumidityIntegration((value) => !value)}>
              {showHumidityIntegration ? 'Hide Humidity integration' : 'Show Humidity integration'}
            </button>
          </div>
        </section>

        <IntegratedClimatePagesSection
          showTemperature={showTemperatureIntegration}
          showHumidity={showHumidityIntegration}
        />
      </section>
    </div>
  )
}
