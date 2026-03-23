import { useState, useEffect, useRef } from 'react'
import { Wind, ChevronRight, RefreshCw, AlertCircle, MapPin } from 'lucide-react'

const API_KEY = import.meta.env.VITE_OWM_KEY || ''
const DEFAULT_LAT = '41.9028'
const DEFAULT_LON = '12.4964'

// OWM AQI: 1=Good 2=Fair 3=Moderate 4=Poor 5=Very Poor
const AQI_META = {
  1: { label: 'Good',      color: 'var(--color-success)',            bg: 'rgba(52,199,89,0.12)'   },
  2: { label: 'Fair',      color: '#34c759',                         bg: 'rgba(52,199,89,0.08)'   },
  3: { label: 'Moderate',  color: 'var(--color-warning)',            bg: 'rgba(255,159,10,0.12)'  },
  4: { label: 'Poor',      color: '#ff6b35',                         bg: 'rgba(255,107,53,0.12)'  },
  5: { label: 'Very Poor', color: 'var(--color-danger)',             bg: 'rgba(255,59,48,0.12)'   },
}

const POLLUTANTS = [
  { key: 'pm2_5', label: 'PM2.5', unit: 'μg/m³' },
  { key: 'pm10',  label: 'PM10',  unit: 'μg/m³' },
  { key: 'no2',   label: 'NO₂',   unit: 'μg/m³' },
  { key: 'o3',    label: 'O₃',    unit: 'μg/m³' },
]

function PollutantBar({ label, value, unit, max }) {
  const pct = Math.min((value / max) * 100, 100)
  const color = pct > 75 ? 'var(--color-danger)'
              : pct > 45 ? 'var(--color-warning)'
              : 'var(--color-success)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
          color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          color: 'var(--text-secondary)' }}>{value != null ? `${value.toFixed(1)} ${unit}` : '—'}</span>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          borderRadius: 2, transition: 'width 0.6s ease' }}/>
      </div>
    </div>
  )
}

export default function AirQualityExternalWidget() {
  const [data,     setData]     = useState(null)
  const [city,     setCity]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const intervalRef = useRef(null)

  const load = async (lat, lon, silent = false) => {
    if (!silent) setLoading(true)
    setError(false)
    try {
      const [aqRes, geoRes] = await Promise.all([
        fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`),
        fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`),
      ])
      if (!aqRes.ok) throw new Error()
      const aqJson  = await aqRes.json()
      const geoJson = geoRes.ok ? await geoRes.json() : []
      setData(aqJson.list?.[0] ?? null)
      setCity(geoJson[0]?.name ?? null)
      setLastFetch(new Date())
    } catch {
      setError(true)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const init = () => {
    if (!API_KEY) { setError(true); setLoading(false); return }
    const run = (lat, lon) => {
      load(lat, lon)
      clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => load(lat, lon, true), 15 * 60 * 1000)
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => run(pos.coords.latitude, pos.coords.longitude),
        ()  => run(DEFAULT_LAT, DEFAULT_LON)
      )
    } else {
      run(DEFAULT_LAT, DEFAULT_LON)
    }
  }

  useEffect(() => {
    init()
    return () => clearInterval(intervalRef.current)
  }, [])

  const aqi  = data?.main?.aqi
  const meta = AQI_META[aqi] ?? AQI_META[3]
  const comp = data?.components ?? {}
  const lastLabel = lastFetch
    ? lastFetch.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      height: '100%', display: 'flex', flexDirection: 'column',
      transition: 'border-color var(--transition)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Header */}
      <div style={{ padding: '1.1rem 1.1rem 0.75rem',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--card-air-bg)', color: 'var(--card-air-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wind size={18}/>
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Aria esterna
            </div>
            {city && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: 2 }}>
                <MapPin size={9} style={{ color: 'var(--text-muted)', flexShrink: 0 }}/>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                  color: 'var(--text-muted)' }}>{city}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {lastLabel && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
              color: 'var(--text-muted)' }}>{lastLabel}</span>
          )}
          <button onClick={init} title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}/>
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '0 1.1rem 0.9rem',
        display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }}>
            <span className="spinner"/>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '0.4rem', color: 'var(--text-muted)', minHeight: 80 }}>
            <AlertCircle size={20}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
              {API_KEY ? 'Errore caricamento' : 'VITE_OWM_KEY mancante'}
            </span>
          </div>
        ) : (
          <>
            {/* AQI big display */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '0.75rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(2rem,4vw,2.4rem)',
                fontWeight: 500, color: meta.color, lineHeight: 1 }}>
                {aqi}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)',
                  fontWeight: 400, marginLeft: 4 }}>/5</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 600,
                padding: '4px 10px', borderRadius: 6,
                background: meta.bg, color: meta.color }}>
                {meta.label}
              </span>
            </div>

            {/* Pollutants toggle */}
            <button onClick={() => setExpanded(v => !v)} style={{
              width: '100%', background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.65rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)', fontWeight: 500,
            }}>
              <span>Inquinanti</span>
              <ChevronRight size={11} style={{
                transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}/>
            </button>

            {expanded && (
              <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                <PollutantBar label="PM2.5" value={comp.pm2_5}  unit="μg/m³" max={75}  />
                <PollutantBar label="PM10"  value={comp.pm10}   unit="μg/m³" max={150} />
                <PollutantBar label="NO₂"   value={comp.no2}    unit="μg/m³" max={200} />
                <PollutantBar label="O₃"    value={comp.o3}     unit="μg/m³" max={180} />
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}