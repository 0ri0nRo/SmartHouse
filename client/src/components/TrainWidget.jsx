import { useState, useEffect, useRef } from 'react'
import { Train, MapPin, ChevronRight, RefreshCw, AlertCircle, Navigation, Home, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

// ── Station config ─────────────────────────────────────────
const COLLEFERRO_LAT = 41.7295
const COLLEFERRO_LON = 13.0105
const HOME_RADIUS_KM = 5          // within 5 km = "at home" in Colleferro

// When at home:  Colleferro → Roma Termini
// When away:     Roma Termini → Colleferro  (scraper default, no from_station needed)
const DIRECTION = {
  home: { from: 'COLLEFERRO',   to: 'ROMA TERMINI', fromParam: 'COLLEFERRO'   },
  away: { from: 'ROMA TERMINI', to: 'COLLEFERRO',   fromParam: 'ROMA TERMINI' },
}

// ── Helpers ────────────────────────────────────────────────
function distanceKm(lat1, lon1, lat2, lon2) {
  const R  = 6371
  const dL = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dl / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function DelayBadge({ delay }) {
  if (!delay || delay === '0' || delay === 'On time')
    return <span style={{ ...badgeSx, background: 'rgba(52,199,89,0.12)', color: 'var(--color-success)' }}>On time</span>
  const n = parseInt(delay)
  if (n <= 5)
    return <span style={{ ...badgeSx, background: 'rgba(255,159,10,0.12)', color: 'var(--color-warning)' }}>+{delay}</span>
  return <span style={{ ...badgeSx, background: 'rgba(255,59,48,0.12)', color: 'var(--color-danger)' }}>+{delay}</span>
}

const badgeSx = {
  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
  padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
}

function TrainRow({ train, isLast }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '48px 1fr auto',
      alignItems: 'center', gap: '0.6rem',
      padding: '0.45rem 1.1rem',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
        {train.time}
        {train.platform && train.platform !== 'N/A' && (
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Bin. {train.platform}
          </div>
        )}
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 2 }}>
          {train.train_number}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {train.destination}
        </div>
      </div>
      <DelayBadge delay={train.delay} />
    </div>
  )
}

// ── Main widget ────────────────────────────────────────────
export default function TrainWidget() {
  const nav = useNavigate()

  // atHome: null = still locating, true = at home, false = away
  const [atHome,    setAtHome]    = useState(null)
  const [locating,  setLocating]  = useState(true)
  const [trains,    setTrains]    = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const intervalRef = useRef(null)

  const dir = atHome === null ? null : atHome ? DIRECTION.home : DIRECTION.away

  // ── GPS on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setAtHome(false)   // no GPS → assume away, show Roma→Colleferro
      setLocating(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const km = distanceKm(coords.latitude, coords.longitude, COLLEFERRO_LAT, COLLEFERRO_LON)
        setAtHome(km <= HOME_RADIUS_KM)
        setLocating(false)
      },
      () => {
        setAtHome(false)  // denied → show Roma→Colleferro as safe default
        setLocating(false)
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  // ── Fetch whenever direction changes ─────────────────────
  const load = async (silent = false, direction = dir) => {
    if (!direction) return
    if (!silent) setLoading(true)
    setError(false)
    try {
      // api.getTrains already calls /trains_data/<destination>
      // We pass from_station as a query param via a small wrapper below
      const data = await fetchTrains(direction.to, direction.fromParam)
      setTrains((data.result || []).slice(0, 4))
      setLastFetch(new Date())
    } catch {
      setError(true)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (atHome === null) return
    clearInterval(intervalRef.current)
    load(false, atHome ? DIRECTION.home : DIRECTION.away)
    intervalRef.current = setInterval(
      () => load(true, atHome ? DIRECTION.home : DIRECTION.away),
      2 * 60 * 1000
    )
    return () => clearInterval(intervalRef.current)
  }, [atHome])

  // manual toggle (tap the location pill)
  const handleToggle = () => setAtHome(v => !v)

  const lastFetchLabel = lastFetch
    ? lastFetch.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null

  // ── Render ───────────────────────────────────────────────
  return (
    <div
      onClick={() => nav('/train')}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        height: '100%', display: 'flex', flexDirection: 'column',
        cursor: 'pointer', transition: 'border-color var(--transition)',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Header */}
      <div style={{ padding: '1.1rem 1.1rem 0.75rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--card-train-bg)', color: 'var(--card-train-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Train size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>Train</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: 2 }}>
              <MapPin size={9} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              {locating ? (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                  detecting location…
                </span>
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {dir.from}
                  <ArrowRight size={8} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} />
                  {dir.to}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: location toggle + time + refresh + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 1 }}>
          {/* Tappable location pill — lets user override GPS manually */}
          {!locating && (
            <button
              onClick={e => { e.stopPropagation(); handleToggle() }}
              title="Toggle direction"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 5px', cursor: 'pointer',
                flexShrink: 1, minWidth: 0,
              }}
            >
              {atHome
                ? <Home size={9} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                : <Navigation size={9} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              }
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {atHome ? '' : ''}
              </span>
            </button>
          )}

          <button
            onClick={e => { e.stopPropagation(); load() }}
            title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
        {locating || loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
            <span className="spinner" />
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-muted)', padding: '1.5rem', minHeight: 100 }}>
            <AlertCircle size={20} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>Could not load trains</span>
          </div>
        ) : trains.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-muted)', padding: '1.5rem', minHeight: 100 }}>
            <Train size={22} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>No upcoming departures</span>
          </div>
        ) : (
          trains.map((train, i) => (
            <TrainRow key={i} train={train} isLast={i === trains.length - 1} />
          ))
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Internal fetch helper ──────────────────────────────────
// Extends api.getTrains to support the from_station query param
async function fetchTrains(destination, fromStation) {
  const params = fromStation ? `?from_station=${encodeURIComponent(fromStation)}` : ''
  const res    = await fetch(`/trains_data/${encodeURIComponent(destination)}${params}`)
  if (!res.ok) throw new Error('Network error')
  return res.json()
}