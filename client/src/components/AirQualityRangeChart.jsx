import { useState, useEffect } from 'react'
import { Calendar, RefreshCw, Download } from 'lucide-react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

function aqiColor(v) {
  if (v >= 80) return 'var(--color-success)'
  if (v >= 60) return 'var(--color-warning)'
  if (v >= 40) return 'var(--card-temp-accent)'
  return 'var(--color-danger)'
}

function formatDateISO(date) {
  return date.toISOString().split('T')[0]
}

export default function AirQualityRangeChart() {
  const today = new Date()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [startDate, setStartDate] = useState(formatDateISO(sevenDaysAgo))
  const [endDate, setEndDate] = useState(formatDateISO(today))
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)

  const fetchData = async () => {
    if (new Date(startDate) > new Date(endDate)) {
      setError('Start date must be before end date')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/air_quality_range?start=${startDate}&end=${endDate}`)
      
      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'No data available')
        setChartData([])
        setStats(null)
        return
      }

      const data = await res.json()
      
      // Transform hours object to array for charts
      const chartArray = Object.keys(data.hours)
        .sort()
        .map(hourKey => ({
          time: hourKey,
          aqi: data.hours[hourKey].avg_aqi,
          min_aqi: data.hours[hourKey].min_aqi,
          max_aqi: data.hours[hourKey].max_aqi,
          smoke: parseFloat(data.hours[hourKey].avg_smoke),
          lpg: parseFloat(data.hours[hourKey].avg_lpg),
          methane: parseFloat(data.hours[hourKey].avg_methane),
          hydrogen: parseFloat(data.hours[hourKey].avg_hydrogen),
          records: data.hours[hourKey].record_count,
        }))

      setChartData(chartArray)

      // Calculate stats
      const aqiValues = chartArray.map(d => d.aqi)
      const maxAqi = Math.max(...aqiValues)
      const minAqi = Math.min(...aqiValues)
      const avgAqi = (aqiValues.reduce((a, b) => a + b, 0) / aqiValues.length).toFixed(1)

      setStats({
        total_records: data.total_records,
        hours_count: data.hours_count,
        avg_aqi: avgAqi,
        max_aqi: maxAqi.toFixed(1),
        min_aqi: minAqi.toFixed(1),
      })
    } catch (err) {
      setError(err.message || 'Failed to fetch data')
      setChartData([])
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const downloadCSV = () => {
    if (chartData.length === 0) return

    const headers = ['Time', 'AQI', 'Min AQI', 'Max AQI', 'Smoke (ppm)', 'LPG (ppm)', 'Methane (ppm)', 'Hydrogen (ppm)', 'Records']
    const rows = chartData.map(d => [
      d.time,
      d.aqi,
      d.min_aqi,
      d.max_aqi,
      d.smoke,
      d.lpg,
      d.methane,
      d.hydrogen,
      d.records,
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `air_quality_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
          <Calendar size={14} />
        </div>
        <span className="card-header-title">Air Quality — Custom Range</span>

        {stats && (
          <span className="badge badge--muted" style={{ marginLeft: 'auto', marginRight: '0.5rem' }}>
            {stats.total_records} records · {stats.hours_count} hours
          </span>
        )}

        <button
          onClick={fetchData}
          disabled={loading}
          className="btn btn--ghost btn--sm"
          style={{ padding: '0.28rem 0.4rem' }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
        </button>

        {chartData.length > 0 && (
          <button
            onClick={downloadCSV}
            className="btn btn--ghost btn--sm"
            style={{ padding: '0.28rem 0.4rem' }}
          >
            <Download size={12} />
          </button>
        )}
      </div>

      {/* Date Controls */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        background: 'var(--bg-surface-2)',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Start</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            max={endDate}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>End</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            min={startDate}
            max={formatDateISO(today)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          />
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            padding: '0.4rem 1rem',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Query'}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-surface-2)',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.7rem' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Avg AQI</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: aqiColor(stats.avg_aqi) }}>
              {stats.avg_aqi}
            </div>
          </div>
          <div style={{ fontSize: '0.7rem' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Max AQI</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: aqiColor(stats.max_aqi) }}>
              {stats.max_aqi}
            </div>
          </div>
          <div style={{ fontSize: '0.7rem' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Min AQI</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600, color: aqiColor(stats.min_aqi) }}>
              {stats.min_aqi}
            </div>
          </div>
          <div style={{ fontSize: '0.7rem' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Records</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 600 }}>
              {stats.total_records}
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{
        padding: '1rem 0.5rem',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280 }}>
            <span className="spinner" />
          </div>
        )}

        {error && !loading && (
          <div className="empty-state" style={{ padding: '3rem 1rem', color: 'var(--color-warning)' }}>
            <Calendar size={24} />
            <div>{error}</div>
          </div>
        )}

        {!loading && chartData.length > 0 && (
          <>
            {/* AQI Chart */}
            <div style={{ marginBottom: '2rem' }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                padding: '0.5rem 1rem 0',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                Air Quality Index
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ left: -16, right: 8 }}>
                    <defs>
                      <linearGradient id="aqigradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--card-air-accent)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      interval={Math.ceil(chartData.length / 12)}
                    />
                    <YAxis
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 8,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.7rem',
                        color: 'var(--text-primary)',
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(v, name) => {
                        if (name === 'aqi') return [`${v}`, 'AQI']
                        return [v, name]
                      }}
                      labelFormatter={l => `Time: ${l}`}
                    />
                    <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)" fill="url(#aqigradient)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gas Chart */}
            <div>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                padding: '0.5rem 1rem 0',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                Gas Concentrations (ppm)
              </div>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ left: -16, right: 8 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 8, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      interval={Math.ceil(chartData.length / 12)}
                    />
                    <YAxis
                      tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 8,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.7rem',
                        color: 'var(--text-primary)',
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(v, name) => [`${parseFloat(v).toFixed(1)} ppm`, name]}
                      labelFormatter={l => `Time: ${l}`}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />
                    <Line type="monotone" dataKey="smoke" stroke="var(--color-danger)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="Smoke" />
                    <Line type="monotone" dataKey="lpg" stroke="var(--card-hum-accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="LPG" />
                    <Line type="monotone" dataKey="methane" stroke="var(--card-shop-accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="Methane" />
                    <Line type="monotone" dataKey="hydrogen" stroke="var(--card-temp-accent)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls name="Hydrogen" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
