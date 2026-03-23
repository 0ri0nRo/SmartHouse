import { useState, useEffect, useRef } from 'react'
import { Cloud, Sun, CloudRain, CloudSnow, Wind, Droplets, Thermometer, MapPin, ChevronRight, Search, X, Loader } from 'lucide-react'

const API_KEY = import.meta.env.VITE_OWM_KEY || ''
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function WeatherIcon({ code, size = 18 }) {
  const s = { flexShrink: 0 }
  if (code === 800)              return <Sun       size={size} style={{ ...s, color: 'var(--color-warning)' }} />
  if (code >= 200 && code < 300) return <CloudRain size={size} style={{ ...s, color: 'var(--card-hum-accent)' }} />
  if (code >= 300 && code < 600) return <CloudRain size={size} style={{ ...s, color: 'var(--card-hum-accent)' }} />
  if (code >= 600 && code < 700) return <CloudSnow size={size} style={{ ...s, color: 'var(--card-hum-accent)' }} />
  if (code >= 700 && code < 800) return <Wind      size={size} style={{ ...s, color: 'var(--text-secondary)' }} />
  return <Cloud size={size} style={{ ...s, color: 'var(--text-secondary)' }} />
}

// Fetches weather + forecast given lat/lon
async function fetchWeatherByCoords(lat, lon) {
  const [curRes, foreRes] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`),
  ])
  if (!curRes.ok || !foreRes.ok) throw new Error('Weather API error')
  return Promise.all([curRes.json(), foreRes.json()])
}

// Fetches weather + forecast given a city name string
async function fetchWeatherByCity(query) {
  const [curRes, foreRes] = await Promise.all([
    fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${API_KEY}&units=metric`),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${API_KEY}&units=metric&cnt=40`),
  ])
  if (!curRes.ok) {
    const err = await curRes.json().catch(() => ({}))
    throw new Error(err.message || 'City not found')
  }
  if (!foreRes.ok) throw new Error('Forecast unavailable')
  return Promise.all([curRes.json(), foreRes.json()])
}

function parseForecast(forecastData) {
  const byDay = {}
  forecastData.list.forEach(item => {
    const d = new Date(item.dt * 1000)
    const key = d.toDateString()
    const h = d.getHours()
    if (!byDay[key] || Math.abs(h - 13) < Math.abs(new Date(byDay[key].dt * 1000).getHours() - 13)) {
      byDay[key] = item
    }
  })
  return Object.values(byDay).slice(0, 5)
}

export default function WeatherWidget() {
  const [current,   setCurrent]   = useState(null)
  const [forecast,  setForecast]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [expanded,  setExpanded]  = useState(false)
  const [error,     setError]     = useState(null)   // string | null
  const [searching, setSearching] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const [searchErr, setSearchErr] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef(null)
  const intervalRef = useRef(null)

  // Load weather given lat/lon; sets up auto-refresh
  const loadCoords = async (lat, lon) => {
    clearInterval(intervalRef.current)
    setLoading(true)
    setError(null)
    try {
      const [cur, fore] = await fetchWeatherByCoords(lat, lon)
      setCurrent(cur)
      setForecast(parseForecast(fore))
    } catch (e) {
      setError(e.message || 'Failed to load weather')
    } finally {
      setLoading(false)
    }
    // Auto-refresh every 15 min using same coords
    intervalRef.current = setInterval(async () => {
      try {
        const [cur, fore] = await fetchWeatherByCoords(lat, lon)
        setCurrent(cur)
        setForecast(parseForecast(fore))
      } catch { /* silent */ }
    }, 15 * 60 * 1000)
  }

  // On mount: try device geolocation, fall back to Rome
  useEffect(() => {
    if (!API_KEY) { setError('missing_key'); setLoading(false); return }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => loadCoords(pos.coords.latitude, pos.coords.longitude),
        ()  => loadCoords(41.9028, 12.4964) // Rome fallback
      )
    } else {
      loadCoords(41.9028, 12.4964)
    }
    return () => clearInterval(intervalRef.current)
  }, [])

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50)
  }, [searchOpen])

  const handleSearch = async (e) => {
    e?.preventDefault()
    const q = searchVal.trim()
    if (!q) return
    setSearching(true)
    setSearchErr(null)
    try {
      clearInterval(intervalRef.current)
      const [cur, fore] = await fetchWeatherByCity(q)
      setCurrent(cur)
      setForecast(parseForecast(fore))
      setSearchOpen(false)
      setSearchVal('')
      // Auto-refresh by city name
      intervalRef.current = setInterval(async () => {
        try {
          const [c, f] = await fetchWeatherByCity(q)
          setCurrent(c)
          setForecast(parseForecast(f))
        } catch { /* silent */ }
      }, 15 * 60 * 1000)
    } catch (err) {
      setSearchErr(err.message || 'City not found')
    } finally {
      setSearching(false)
    }
  }

  const handleResetToDevice = () => {
    setSearchOpen(false)
    setSearchVal('')
    setSearchErr(null)
    if (navigator.geolocation) {
      setLoading(true)
      navigator.geolocation.getCurrentPosition(
        pos => loadCoords(pos.coords.latitude, pos.coords.longitude),
        ()  => loadCoords(41.9028, 12.4964)
      )
    } else {
      loadCoords(41.9028, 12.4964)
    }
  }

  // ── Missing API key ──────────────────────────────────────────────────────
  if (error === 'missing_key') return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Cloud size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Weather</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        Add <code style={{ background: 'var(--bg-surface-2)', padding: '1px 4px', borderRadius: 3 }}>VITE_OWM_KEY</code>
        {' '}to <code style={{ background: 'var(--bg-surface-2)', padding: '1px 4px', borderRadius: 3 }}>client/.env</code>
      </div>
    </div>
  )

  // ── Loading spinner ──────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', minHeight: 140, height: '100%' }}>
      <span className="spinner" />
    </div>
  )

  // ── Generic fetch error ──────────────────────────────────────────────────
  if (error) return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Cloud size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Weather</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{error}</div>
    </div>
  )

  const temp  = Math.round(current.main.temp)
  const feels = Math.round(current.main.feels_like)
  const code  = current.weather[0].id
  const desc  = current.weather[0].description
  const city  = current.name
  const country = current.sys?.country
  const hum   = current.main.humidity
  const wind  = Math.round(current.wind.speed * 3.6)

  return (
    <div
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        height: '100%', display: 'flex', flexDirection: 'column',
        transition: 'border-color var(--transition)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* ── Header: icon + city + search button ─────────────────────── */}
      <div style={{ padding: '1.1rem 1.1rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <WeatherIcon code={code} size={26} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {/* City label + GPS reset */}
            <button
              onClick={handleResetToDevice}
              title="Use my location"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <MapPin size={10} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {city}{country ? `, ${country}` : ''}
              </span>
            </button>

            {/* Search toggle */}
            <button
              onClick={() => setSearchOpen(v => !v)}
              title="Search city"
              style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                color: searchOpen ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'color 0.15s' }}>
              {searchOpen ? <X size={13} /> : <Search size={13} />}
            </button>
          </div>
        </div>

        {/* ── Search bar (collapsible) ───────────────────────────────── */}
        {searchOpen && (
          <form
            onSubmit={handleSearch}
            style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.7rem', alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={searchVal}
              onChange={e => { setSearchVal(e.target.value); setSearchErr(null) }}
              placeholder="City name…"
              style={{
                flex: 1,
                background: 'var(--bg-surface-2)',
                border: `1px solid ${searchErr ? 'var(--color-danger, #f87171)' : 'var(--border)'}`,
                borderRadius: 6,
                padding: '0.3rem 0.55rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { if (!searchErr) e.target.style.borderColor = 'var(--border-strong)' }}
              onBlur={e  => { if (!searchErr) e.target.style.borderColor = 'var(--border)' }}
            />
            <button
              type="submit"
              disabled={searching || !searchVal.trim()}
              style={{
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0.3rem 0.5rem',
                cursor: searching || !searchVal.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center',
                opacity: searching || !searchVal.trim() ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}>
              {searching
                ? <Loader size={12} style={{ color: 'var(--text-secondary)', animation: 'spin 1s linear infinite' }} />
                : <Search size={12} style={{ color: 'var(--text-secondary)' }} />
              }
            </button>
          </form>
        )}

        {/* Inline search error */}
        {searchErr && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
            color: 'var(--color-danger, #f87171)', marginBottom: '0.4rem' }}>
            ⚠ {searchErr}
          </div>
        )}

        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>Weather</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          textTransform: 'capitalize' }}>{desc}</div>
      </div>

      {/* ── Temp + stats ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '0.6rem 1.1rem 0.75rem',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(1.75rem,3.5vw,2.25rem)',
          fontWeight: 500, color: 'var(--color-warning)', lineHeight: 1 }}>
          {temp}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 400 }}>°C</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
          {[
            { icon: Thermometer, val: `Feels ${feels}°C`, color: 'var(--card-temp-accent)' },
            { icon: Droplets,    val: `${hum}%`,          color: 'var(--card-hum-accent)'  },
            { icon: Wind,        val: `${wind} km/h`,     color: 'var(--text-secondary)'   },
          ].map((s, i) => { const Icon = s.icon; return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Icon size={10} style={{ color: s.color }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{s.val}</span>
            </div>
          )})}
        </div>
      </div>

      {/* ── Forecast toggle ──────────────────────────────────────────── */}
      <button onClick={() => setExpanded(v => !v)} style={{
        width: '100%', background: 'var(--bg-surface-2)', border: 'none',
        borderTop: '1px solid var(--border)', padding: '0.5rem 1.1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.7rem',
        fontFamily: 'var(--font-mono)', fontWeight: 500,
      }}>
        <span>5-day forecast</span>
        <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* ── 5-day rows ───────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface-2)' }}>
          {forecast.map((item, i) => {
            const d   = new Date(item.dt * 1000)
            const day = i === 0 ? 'Today' : DAY_NAMES[d.getDay()]
            const hi  = Math.round(item.main.temp_max ?? item.main.temp)
            const lo  = Math.round(item.main.temp_min ?? item.main.temp - 3)
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.5rem 1.1rem',
                borderBottom: i < forecast.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
                  color: 'var(--text-secondary)', minWidth: 32 }}>{day}</span>
                <WeatherIcon code={item.weather[0].id} size={13} />
                <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                  color: 'var(--text-muted)', textTransform: 'capitalize',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.weather[0].description}
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{hi}°</span>
                  <span style={{ color: 'var(--text-muted)' }}>{lo}°</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Spin keyframe for loader icon */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}