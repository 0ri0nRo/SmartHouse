import { useState, useEffect } from 'react'
import { Train, RefreshCw, X, ExternalLink, MapPin } from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { api } from '../api'

// ── Delay badge ────────────────────────────────────────────
function DelayBadge({ delay }) {
  if (!delay || delay === '0' || delay === 'On time')
    return <span className="badge badge--success">On time</span>
  const n = parseInt(delay)
  if (n <= 5) return <span className="badge badge--warning">{delay}</span>
  return <span className="badge badge--danger">{delay}</span>
}

// ── Train card ─────────────────────────────────────────────
function TrainCard({ train, onShowStops }) {
  return (
    <div className="card" style={{
      padding: '0.9rem 1.1rem',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: '0.75rem',
      alignItems: 'center',
      transition: 'transform 0.15s ease',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateX(3px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
    >
      {/* Left: train number + time */}
      <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem', minWidth:80 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', fontWeight:500,
          background:'var(--bg-surface-2)', padding:'3px 8px', borderRadius:'var(--radius-sm)',
          border:'1px solid var(--border)', color:'var(--text-secondary)', textAlign:'center' }}>
          {train.train_number}
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.1rem', fontWeight:500,
          color:'var(--text-primary)', textAlign:'center' }}>
          {train.time}
        </div>
      </div>

      {/* Center: destination + status */}
      <div>
        <div style={{ fontSize:'0.9rem', fontWeight:500, color:'var(--text-primary)', marginBottom:'0.35rem' }}>
          {train.destination}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
          <DelayBadge delay={train.delay}/>
          {train.platform && train.platform !== 'N/A' && (
            <span className="badge badge--muted">
              <MapPin size={9}/> Bin. {train.platform}
            </span>
          )}
        </div>
      </div>

      {/* Right: info button */}
      <button className="btn btn--primary btn--sm"
        style={{ width:32, height:32, padding:0, borderRadius:'var(--radius-sm)', flexShrink:0 }}
        onClick={() => onShowStops(train.stops)}>
        i
      </button>
    </div>
  )
}

// ── Stops modal ────────────────────────────────────────────
function StopsModal({ stops, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose}><X size={18}/></button>
        <div className="modal-title">Train Stops</div>
        <div style={{ fontSize:'0.875rem', color:'var(--text-secondary)', lineHeight:1.7 }}
          dangerouslySetInnerHTML={{ __html: stops }}/>
      </div>
    </div>
  )
}

// ── Section ────────────────────────────────────────────────
function TrainSection({ title, trains, accent, loading, onShowStops }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon"
          style={{ background:`var(--card-${accent}-bg)`, color:`var(--card-${accent}-accent)` }}>
          <Train size={15}/>
        </div>
        <span className="card-header-title">{title}</span>
        {!loading && (
          <span className="badge badge--muted" style={{ marginLeft:'auto' }}>
            {trains.length} train{trains.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
        {loading ? (
          <div className="loading-box"><span className="spinner"/></div>
        ) : trains.length === 0 ? (
          <div className="empty-state">
            <Train size={28}/><div>No trains found for this destination</div>
          </div>
        ) : trains.map((train, i) => (
          <TrainCard key={i} train={train} onShowStops={onShowStops}/>
        ))}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
const QUICK_DESTINATIONS = ['COLLEFERRO', 'TORVERGATA', 'FROSINONE']

const QUICK_LINKS = [
  { label:'Trenitalia InfoMobility', href:'https://www.trenitalia.com/it/informazioni/Infomobilita/notizie-infomobilita.html' },
  { label:'Metropolitana di Roma',   href:'https://www.metropolitanadiroma.it/notizie-metro-roma.html' },
  { label:'Italo Treno',             href:'https://www.italotreno.it/' },
]

export default function TrainPage() {
  const { toast, showToast } = useToast()

  const [destination,  setDestination]  = useState('')
  const [customDest,   setCustomDest]   = useState('')
  const [futureTrains, setFutureTrains] = useState([])
  const [pastTrains,   setPastTrains]   = useState([])
  const [loading,      setLoading]      = useState(false)
  const [stopsPopup,   setStopsPopup]   = useState(null)
  const [time,         setTime]         = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (destination) fetchTrains(destination)
  }, [destination])

  async function fetchTrains(dest) {
    if (!dest) return
    setLoading(true)
    try {
      const data = await api.getTrains(dest)
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
    if (dest) fetchTrains(dest)
    else showToast('Select a destination first', 'warning')
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header">
        <h1 className="page-title">Tr<span style={{ color:'var(--accent)' }}>ain</span></h1>
        <p className="page-subtitle">
          {time.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}
          {' · '}
          <span style={{ fontFamily:'var(--font-mono)' }}>
            {time.toLocaleTimeString('en-GB')}
          </span>
        </p>
      </div>

      {/* Search */}
      <div className="card mb-lg">
        <div className="card-header">
          <div className="card-header-icon"
            style={{ background:'var(--card-train-bg)', color:'var(--card-train-accent)' }}>
            <Train size={15}/>
          </div>
          <span className="card-header-title">Select Destination</span>
        </div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

          {/* Quick destination pills */}
          <div>
            <label className="field-label mb-sm">Quick Select</label>
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginTop:'0.4rem' }}>
              {QUICK_DESTINATIONS.map(d => (
                <button key={d}
                  className={`btn btn--sm ${destination === d ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => { setDestination(d); setCustomDest('') }}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Custom input */}
          <div className="field">
            <label className="field-label">Or type destination</label>
            <div style={{ display:'flex', gap:'0.5rem' }}>
              <input className="input" value={customDest}
                onChange={e => { setCustomDest(e.target.value); setDestination('') }}
                onKeyDown={e => e.key === 'Enter' && customDest.trim() && fetchTrains(customDest.trim())}
                placeholder="Type destination and press Enter"/>
              <button className="btn btn--primary" onClick={handleRefresh} disabled={loading} style={{ whiteSpace:'nowrap' }}>
                <RefreshCw size={14} style={{ animation:loading?'spin 0.8s linear infinite':'none' }}/>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Train sections */}
      <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
        <TrainSection
          title="Upcoming Departures"
          trains={futureTrains}
          accent="train"
          loading={loading}
          onShowStops={setStopsPopup}
        />
        <TrainSection
          title="Recent Departures"
          trains={pastTrains}
          accent="hum"
          loading={loading}
          onShowStops={setStopsPopup}
        />
      </div>

      {/* Quick links */}
      <div className="card mt-lg">
        <div className="card-header">
          <span className="card-header-title">Quick Links</span>
        </div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
          {QUICK_LINKS.map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer"
              className="btn btn--ghost"
              style={{ justifyContent:'space-between', textTransform:'none', letterSpacing:'normal',
                fontFamily:'var(--font-body)', fontWeight:400, fontSize:'0.875rem' }}>
              {link.label}
              <ExternalLink size={13} style={{ opacity:0.4 }}/>
            </a>
          ))}
        </div>
      </div>

      {stopsPopup && <StopsModal stops={stopsPopup} onClose={() => setStopsPopup(null)}/>}
      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}