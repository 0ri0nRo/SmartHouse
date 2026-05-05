import { useState, useEffect } from 'react'
import { ChevronDown, Wind, TrendingUp, RefreshCw } from 'lucide-react'

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

function formatTime(isoString) {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return isoString
  }
}

function HourRow({ hour, data, expanded, onToggle }) {
  const [showRecords, setShowRecords] = useState(false)
  
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Hour Summary */}
      <div
        onClick={() => setShowRecords(!showRecords)}
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr 120px 100px 100px 100px 100px 30px',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          cursor: 'pointer',
          background: 'var(--bg-surface-2)',
          transition: 'background 0.15s',
          alignItems: 'center',
          fontSize: '0.78rem',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-surface-2)'}
      >
        {/* Hour */}
        <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {hour}:00
        </div>
        
        {/* Records count */}
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 6px',
            background: 'var(--bg-surface)',
            borderRadius: 4,
            fontWeight: 500,
          }}>
            {data.count} rec{data.count === 1 ? '' : 's'}
          </span>
        </div>

        {/* Avg AQI */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: aqiColor(data.avg_aqi),
            fontSize: '0.85rem',
          }}>
            {data.avg_aqi}
          </div>
          <div style={{
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}>
            {aqiLabel(data.avg_aqi)}
          </div>
        </div>

        {/* Min */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>min</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{data.min_aqi}</div>
        </div>

        {/* Max */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>max</div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{data.max_aqi}</div>
        </div>

        {/* Smoke */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '0.65rem' }}>Smoke</div>
          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            {data.records[0]?.smoke || '—'}
          </div>
        </div>

        {/* LPG */}
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: '0.65rem' }}>LPG</div>
          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            {data.records[0]?.lpg || '—'}
          </div>
        </div>

        {/* Expand */}
        <div style={{
          textAlign: 'center',
          color: 'var(--text-muted)',
          transform: showRecords ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
        }}>
          <ChevronDown size={16} />
        </div>
      </div>

      {/* Expanded Records */}
      {showRecords && (
        <div style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border)',
          maxHeight: 400,
          overflowY: 'auto',
        }}>
          {data.records.map((rec, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 60px 60px 60px 60px 70px',
                gap: '1rem',
                padding: '0.5rem 1rem',
                borderBottom: idx < data.records.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
                fontSize: '0.7rem',
              }}
            >
              {/* Time */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                minWidth: 45,
              }}>
                {formatTime(rec.timestamp)}
              </div>

              {/* Smoke */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-danger)',
                textAlign: 'center',
                fontWeight: 500,
              }}>
                {rec.smoke}
              </div>

              {/* LPG */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--card-hum-accent)',
                textAlign: 'center',
                fontWeight: 500,
              }}>
                {rec.lpg}
              </div>

              {/* Methane */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--card-shop-accent)',
                textAlign: 'center',
                fontWeight: 500,
              }}>
                {rec.methane}
              </div>

              {/* Hydrogen */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--card-temp-accent)',
                textAlign: 'center',
                fontWeight: 500,
              }}>
                {rec.hydrogen}
              </div>

              {/* AQI */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                textAlign: 'center',
                color: aqiColor(rec.air_quality_index),
                padding: '2px 6px',
                background: `${aqiColor(rec.air_quality_index)}15`,
                borderRadius: 4,
              }}>
                {rec.air_quality_index} {rec.air_quality_description.slice(0, 1).toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AirQualityDataTable() {
  const [tableData, setTableData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTableData = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/air_quality_table_today')
      if (!r.ok) {
        if (r.status === 404) {
          setError('No data for today yet')
          setTableData(null)
        } else {
          throw new Error(`HTTP ${r.status}`)
        }
        return
      }
      const d = await r.json()
      setTableData(d)
    } catch (err) {
      setError(err.message || 'Failed to load data')
      setTableData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTableData()
    const id = setInterval(fetchTableData, 60000) // Refresh every minute
    return () => clearInterval(id)
  }, [])

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: 'var(--card-air-bg)', color: 'var(--card-air-accent)' }}>
          <Wind size={14} />
        </div>
        <span className="card-header-title">Hourly Data — Today</span>
        
        {tableData && (
          <span className="badge badge--muted" style={{ marginLeft: 'auto', marginRight: '0.5rem' }}>
            {tableData.total_records} records
          </span>
        )}

        <button
          onClick={fetchTableData}
          disabled={loading}
          className="btn btn--ghost btn--sm"
          style={{ padding: '0.28rem 0.4rem' }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>

      {loading && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '3rem 1rem',
        }}>
          <span className="spinner" />
        </div>
      )}

      {error && !loading && (
        <div className="empty-state" style={{
          padding: '2rem 1rem',
          color: 'var(--color-warning)',
        }}>
          <TrendingUp size={20} />
          <div>{error}</div>
        </div>
      )}

      {!loading && tableData && tableData.hours && (
        <div>
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 120px 100px 100px 100px 100px 30px',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--bg-muted)',
              borderBottom: '2px solid var(--border)',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              color: 'var(--text-muted)',
            }}
          >
            <div>Hour</div>
            <div>Records</div>
            <div style={{ textAlign: 'center' }}>Avg AQI</div>
            <div style={{ textAlign: 'center' }}>Min</div>
            <div style={{ textAlign: 'center' }}>Max</div>
            <div style={{ textAlign: 'center' }}>Smoke</div>
            <div style={{ textAlign: 'center' }}>LPG</div>
            <div></div>
          </div>

          {/* Rows */}
          <div>
            {Object.keys(tableData.hours || {})
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map(hour => (
                <HourRow
                  key={hour}
                  hour={hour}
                  data={tableData.hours[hour]}
                />
              ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--bg-surface-2)',
              borderTop: '1px solid var(--border)',
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Date: {tableData?.date || '—'}</span>
            <span>Total: {tableData?.total_records || 0} readings</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
