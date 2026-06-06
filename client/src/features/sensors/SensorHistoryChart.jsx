import { Suspense, useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { resolveSensorKind } from './sensorRegistry'

function formatTimestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function buildChartRows(history) {
  return history.map((row) => {
    const nextRow = {
      timestamp: row.timestamp || row.recorded_at || row.created_at,
      temperature: row.temperature ?? null,
      humidity: row.humidity ?? null,
    }

    if (row.extra && typeof row.extra === 'object') {
      Object.entries(row.extra).forEach(([key, value]) => {
        const numeric = Number(value)
        nextRow[key] = Number.isFinite(numeric) ? numeric : value
      })
    }

    Object.entries(row).forEach(([key, value]) => {
      if (key === 'extra' || key === 'timestamp' || key === 'recorded_at' || key === 'created_at') return
      if (nextRow[key] == null && typeof value === 'number') {
        nextRow[key] = value
      }
    })

    return nextRow
  })
}

function resolveSeries(sensor, history) {
  const definition = resolveSensorKind(sensor?.type)
  const series = [...definition.series]

  if (definition.id !== 'generic' && definition.id !== 'default' && series.length > 0) return series

  const numericKeys = new Set()
  history.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (key === 'timestamp') return
      if (typeof value === 'number' && Number.isFinite(value)) numericKeys.add(key)
    })
  })

  return Array.from(numericKeys).map((key) => ({ key, label: key, color: '#94a3b8' }))
}

function SensorHistoryChart({ sensor, history, hours }) {
  const rows = useMemo(() => buildChartRows(history), [history])
  const series = useMemo(() => resolveSeries(sensor, rows), [history, sensor])
  const hasValues = useMemo(
    () => series.some((serie) => rows.some((row) => typeof row[serie.key] === 'number' && Number.isFinite(row[serie.key]))),
    [rows, series],
  )

  if (!sensor) {
    return null
  }

  return (
    <div className="sensor-history-panel">
      <div className="sensor-history-panel__header">
        <div>
          <h3>{sensor.name || 'Sensor history'}</h3>
          <p>{hours} hour timeline</p>
        </div>
        <div className="sensor-history-panel__legend">
          {series.map((serie) => (
            <span key={serie.key} className="sensor-history-panel__legend-item" style={{ borderColor: serie.color }}>
              {serie.label}
            </span>
          ))}
        </div>
      </div>
      <div className="sensor-history-panel__chart">
        {!hasValues ? (
          <div className="sensor-history-panel__empty">No historical data available for this sensor in the selected time range.</div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          {series.length > 1 ? (
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.14)" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="rgba(148,163,184,0.45)" tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis stroke="rgba(148,163,184,0.45)" width={46} tickLine={false} axisLine={false} tickMargin={8} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.98)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 14,
                  color: 'var(--text-primary)',
                  boxShadow: '0 12px 30px rgba(15,23,42,0.10)',
                }}
                labelFormatter={formatTimestamp}
              />
              <Legend wrapperStyle={{ paddingTop: 8, fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }} />
              {series.map((serie) => (
                <Line
                  key={serie.key}
                  type="monotone"
                  dataKey={serie.key}
                  name={serie.label}
                  stroke={serie.color}
                  strokeWidth={2.3}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.14)" vertical={false} />
              <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="rgba(148,163,184,0.45)" tickLine={false} axisLine={false} tickMargin={10} />
              <YAxis stroke="rgba(148,163,184,0.45)" width={46} tickLine={false} axisLine={false} tickMargin={8} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.98)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 14,
                  color: 'var(--text-primary)',
                  boxShadow: '0 12px 30px rgba(15,23,42,0.10)',
                }}
                labelFormatter={formatTimestamp}
              />
              {series.map((serie) => (
                <Area
                  key={serie.key}
                  type="monotone"
                  dataKey={serie.key}
                  name={serie.label}
                  stroke={serie.color}
                  fill={serie.color}
                  fillOpacity={0.12}
                  strokeWidth={2.3}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default function SensorHistoryChartWrapper(props) {
  return (
    <Suspense fallback={<div className="sensor-history-panel sensor-history-panel--loading">Loading chart…</div>}>
      <SensorHistoryChart {...props} />
    </Suspense>
  )
}
