import { useState, useEffect } from 'react'
import { Train, RefreshCw, X, ExternalLink, MapPin, Home, Navigation, ArrowRight } from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Constants ──────────────────────────────────────────────
const COLLEFERRO_LAT = 41.7295
const COLLEFERRO_LON = 13.0105
const HOME_RADIUS_KM = 5

const DIRECTION = {
  home: { from: 'COLLEFERRO',   to: 'ROMA TERMINI', fromParam: 'COLLEFERRO'   },
  away: { from: 'ROMA TERMINI', to: 'COLLEFERRO',   fromParam: 'ROMA TERMINI' },
}

const QUICK_DESTINATIONS = ['COLLEFERRO', 'ROMA TERMINI', 'FROSINONE', 'TORVERGATA']

const QUICK_LINKS = [
  { label: 'Trenitalia InfoMobility', href: 'https://www.trenitalia.com/it/informazioni/Infomobilita/notizie-infomobilita.html' },
  { label: 'Metropolitana di Roma',   href: 'https://www.metropolitanadiroma.it/notizie-metro-roma.html' },
  { label: 'Italo Treno',             href: 'https://www.italotreno.it/' },
]

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

async function fetchTrains(destination, fromStation) {
  const params = fromStation ? `?from_station=${encodeURIComponent(fromStation)}` : ''
  const res    = await fetch(`/trains_data/${encodeURIComponent(destination)}${params}`)
  if (!res.ok) throw new Error('Network error')
  return res.json()
}

// ── Sub-components ─────────────────────────────────────────
function DelayBadge({ delay }) {
  if (!delay || delay === '0' || delay === 'On time')
    return <span className="badge badge--success">On time</span>
  const n = parseInt(delay)
  if (n <= 5) return <span className="badge badge--warning">{delay}</span>
  return <span className="badge badge--danger">{delay}</span>
}

function TrainCard({ train, onShowStops }) {
  return (
    <div
      className="card"
      style={{ padding: '0.9rem 1.1rem', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.75rem', alignItems: 'center', transition: 'transform 0.15s ease' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateX(3px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 80 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 500, background: 'var(--bg-surface-2)', padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {train.train_number}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-primary)', textAlign: 'center' }}>
          {train.time}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
          {train.destination}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <DelayBadge delay={train.delay} />
          {train.platform && train.platform !== 'N/A' && (
            <span className="badge badge--muted">
              <MapPin size={9} /> Bin. {train.platform}
            </span>
          )}
        </div>
      </div>

      <button
        className="btn btn--primary btn--sm"
        style={{ width: 32, height: 32, padding: 0, borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        onClick={() => onShowStops(train.stops)}
      >
        i
      </button>
    </div>
  )
}

function StopsModal({ stops, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
        <div className="modal-title">Train Stops</div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: stops }} />
      </div>
    </div>
  )
}

function TrainSection({ title, trains, accent, loading, onShowStops }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon" style={{ background: `var(--card-${accent}-bg)`, color: `var(--card-${accent}-accent)` }}>
          <Train size={15} />
        </div>
        <span className="card-header-title">{title}</span>
        {!loading && (
          <span className="badge badge--muted" style={{ marginLeft: 'auto' }}>
            {trains.length} train{trains.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {loading ? (
          <div className="loading-box"><span className="spinner" /></div>
        ) : trains.length === 0 ? (
          <div className="empty-state">
            <Train size={28} /><div>No trains found</div>
          </div>
        ) : (
          trains.map((train, i) => <TrainCard key={i} train={train} onShowStops={onShowStops} />)
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function TrainPage() {
  const { toast, showToast } = useToast()

  // GPS state
  const [atHome,   setAtHome]   = useState(null)    // null = locating
  const [locating, setLocating] = useState(true)

  // Search state — driven by GPS default, overridable manually
  const [destination,  setDestination]  = useState('')
  const [fromStation,  setFromStation]  = useState('ROMA TERMINI')
  const [customDest,   setCustomDest]   = useState('')

  // Results
  const [futureTrains, setFutureTrains] = useState([])
  const [pastTrains,   setPastTrains]   = useState([])
  const [loading,      setLoading]      = useState(false)
  const [stopsPopup,   setStopsPopup]   = useState(null)
  const [time,         setTime]         = useState(new Date())

  // Clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── GPS detection on mount ───────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setAtHome(false)
      setLocating(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const km = distanceKm(coords.latitude, coords.longitude, COLLEFERRO_LAT, COLLEFERRO_LON)
        const home = km <= HOME_RADIUS_KM
        setAtHome(home)
        setLocating(false)
        // Set default direction based on GPS
        const dir = home ? DIRECTION.home : DIRECTION.away
        setDestination(dir.to)
        setFromStation(dir.fromParam)
      },
      () => {
        // GPS denied: default to Roma→Colleferro
        setAtHome(false)
        setLocating(false)
        setDestination(DIRECTION.away.to)
        setFromStation(DIRECTION.away.fromParam)
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  // ── Auto-fetch when destination is set ───────────────────
  useEffect(() => {
    if (destination) doFetch(destination, fromStation)
  }, [destination, fromStation])

  async function doFetch(dest, from) {
    if (!dest) return
    setLoading(true)
    try {
      const data = await fetchTrains(dest, from)
      setFutureTrains(data.result     || [])
      setPastTrains(data.result_old   || [])
    } catch {
      showToast('Error retrieving train data', 'error')
      setFutureTrains([])
      setPastTrains([])
    } finally {
      setLoading(false)
    }
  }

  function handleRefresh() {
    const dest = destination || customDest.trim()
    if (dest) doFetch(dest, fromStation)
    else showToast('Select a destination first', 'warning')
  }

  // When user picks a quick destination, reset from_station to default scraper
  function handleQuickSelect(dest) {
    setCustomDest('')
    setFromStation('ROMA TERMINI')   // quick picks always scrape from Roma
    setDestination(dest)
  }

  // Toggle direction (Home ↔ Away) manually
  function handleToggleDirection() {
    const newHome = !atHome
    setAtHome(newHome)
    const dir = newHome ? DIRECTION.home : DIRECTION.away
    setDestination(dir.to)
    setFromStation(dir.fromParam)
    setCustomDest('')
  }

  const dir = atHome === null ? null : atHome ? DIRECTION.home : DIRECTION.away

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Tr<span style={{ color: 'var(--accent)' }}>ain</span></h1>
        <p className="page-subtitle">
          {time.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          {' · '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {time.toLocaleTimeString('en-GB')}
          </span>
        </p>
      </div>

      {/* Search card */}
      <div className="card mb-lg">
        <div className="card-header">
          <div className="card-header-icon" style={{ background: 'var(--card-train-bg)', color: 'var(--card-train-accent)' }}>
            <Train size={15} />
          </div>
          <span className="card-header-title">Direction</span>

          {/* Current direction label + toggle */}
          {!locating && dir && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {dir.from}
                <ArrowRight size={10} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 3px' }} />
                {dir.to}
              </span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={handleToggleDirection}
                title="Swap direction"
                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                {atHome
                  ? <><Home size={11} /> Home</>
                  : <><Navigation size={11} /> Away</>
                }
              </button>
            </div>
          )}
          {locating && (
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              detecting location…
            </span>
          )}
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Quick destination pills */}
          <div>
            <label className="field-label mb-sm">Quick select destination</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
              {QUICK_DESTINATIONS.map(d => (
                <button
                  key={d}
                  className={`btn btn--sm ${destination === d && !customDest ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => handleQuickSelect(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Custom input */}
          <div className="field">
            <label className="field-label">Or type a custom destination</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="input"
                value={customDest}
                onChange={e => { setCustomDest(e.target.value); setDestination('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customDest.trim()) {
                    setFromStation('ROMA TERMINI')
                    setDestination(customDest.trim())
                  }
                }}
                placeholder="Type destination and press Enter"
              />
              <button
                className="btn btn--primary"
                onClick={handleRefresh}
                disabled={loading}
                style={{ whiteSpace: 'nowrap' }}
              >
                <RefreshCw size={14} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Train sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <TrainSection title="Upcoming Departures" trains={futureTrains} accent="train" loading={loading} onShowStops={setStopsPopup} />
        <TrainSection title="Recent Departures"   trains={pastTrains}   accent="hum"   loading={loading} onShowStops={setStopsPopup} />
      </div>

      {/* Quick links */}
      <div className="card mt-lg">
        <div className="card-header">
          <span className="card-header-title">Quick Links</span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {QUICK_LINKS.map(link => (
            <a
              key={link.href} href={link.href} target="_blank" rel="noreferrer"
              className="btn btn--ghost"
              style={{ justifyContent: 'space-between', textTransform: 'none', letterSpacing: 'normal', fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '0.875rem' }}
            >
              {link.label}
              <ExternalLink size={13} style={{ opacity: 0.4 }} />
            </a>
          ))}
        </div>
      </div>

      {stopsPopup && <StopsModal stops={stopsPopup} onClose={() => setStopsPopup(null)} />}
      <Toast toast={toast} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}