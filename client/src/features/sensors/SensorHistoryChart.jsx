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
        <ResponsiveContainer width="100%" height="100%">
          {series.length > 1 ? (
            <LineChart data={rows} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="rgba(148,163,184,0.75)" />
              <YAxis stroke="rgba(148,163,184,0.75)" width={52} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.96)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 16,
                  color: '#f8fafc',
                }}
                labelFormatter={formatTimestamp}
              />
              <Legend />
              {series.map((serie) => (
                <Line
                  key={serie.key}
                  type="monotone"
                  dataKey={serie.key}
                  name={serie.label}
                  stroke={serie.color}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={rows} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="rgba(148,163,184,0.75)" />
              <YAxis stroke="rgba(148,163,184,0.75)" width={52} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15, 23, 42, 0.96)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  borderRadius: 16,
                  color: '#f8fafc',
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
                  fillOpacity={0.18}
                  strokeWidth={2.5}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
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
