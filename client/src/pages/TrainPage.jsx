import { useState, useEffect } from 'react'
import { Train, RefreshCw, X } from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Helpers ────────────────────────────────────────────────
function DelayBadge({ delay }) {
  if (!delay || delay === '0' || delay === 'On time') {
    return <span className="badge badge--success">On time</span>
  }
  const n = parseInt(delay)
  if (n <= 5) return <span className="badge badge--warning">{delay}</span>
  return <span className="badge badge--danger">{delay}</span>
}

function PlatformBadge({ platform }) {
  if (!platform || platform === 'N/A') {
    return <span className="badge badge--muted">TBD</span>
  }
  return <span className="badge badge--muted">Bin. {platform}</span>
}

// ── Single train card ──────────────────────────────────────
function TrainCard({ train, onShowStops }) {
  return (
    <div className="card" style={{
      padding:'1rem',
      display:'flex',
      flexWrap:'wrap',
      gap:'0.75rem',
      alignItems:'center',
      cursor:'default',
    }}>
      {/* Number + time */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        flex:'0 0 auto', gap:'1rem', minWidth:160 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.9rem', fontWeight:500,
          background:'var(--bg-surface-2)', padding:'4px 10px', borderRadius:'var(--radius-sm)',
          border:'1px solid var(--border)', color:'var(--text-primary)' }}>
          {train.train_number}
        </div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', fontWeight:500,
          color:'var(--text-primary)' }}>
          {train.time}
        </div>
      </div>

      {/* Destination */}
      <div style={{ flex:1, minWidth:140, fontSize:'0.95rem', fontWeight:500,
        color:'var(--text-primary)' }}>
        {train.destination}
      </div>

      {/* Status + info */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexShrink:0 }}>
        <DelayBadge delay={train.delay}/>
        <PlatformBadge platform={train.platform}/>
        <button className="btn btn--primary btn--sm"
          style={{ width:32, height:32, padding:0, borderRadius:'var(--radius-sm)' }}
          onClick={() => onShowStops(train.stops)}>
          i
        </button>
      </div>
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

// ── Section wrapper ────────────────────────────────────────
function TrainSection({ title, trains, accent, onShowStops }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon"
          style={{ background:`var(--card-${accent}-bg)`, color:`var(--card-${accent}-accent)` }}>
          <Train size={15}/>
        </div>
        <span className="card-header-title">{title}</span>
        <span className={`badge badge--muted`} style={{ marginLeft:'auto' }}>
          {trains.length} train{trains.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
        {trains.length === 0 ? (
          <div className="empty-state">
            <Train size={28}/><div>No trains found for this destination</div>
          </div>
        ) : (
          trains.map((train, i) => (
            <TrainCard key={i} train={train} onShowStops={onShowStops}/>
          ))
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
const QUICK_DESTINATIONS = ['COLLEFERRO', 'TORVERGATA', 'FROSINONE']

export default function TrainPage() {
  const { toast, showToast } = useToast()

  const [destination,   setDestination]   = useState('')
  const [customDest,    setCustomDest]    = useState('')
  const [futureTrains,  setFutureTrains]  = useState([])
  const [pastTrains,    setPastTrains]    = useState([])
  const [loading,       setLoading]       = useState(false)
  const [stopsPopup,    setStopsPopup]    = useState(null)
  const [time,          setTime]          = useState(new Date())

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch when destination changes
  useEffect(() => {
    if (destination) fetchTrains(destination)
  }, [destination])

  async function fetchTrains(dest) {
    if (!dest) return
    setLoading(true)
    try {
      const res = await fetch(`/trains_data/${dest}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
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

  function handleCustomDest(val) {
    setCustomDest(val)
    setDestination('')
  }

  function handleCustomEnter(e) {
    if (e.key === 'Enter' && customDest.trim()) {
      fetchTrains(customDest.trim())
    }
  }

  // ── Render ───────────────────────────────────────────────
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

      {/* Search card */}
      <div className="card mb-lg">
        <div className="card-header">
          <div className="card-header-icon"
            style={{ background:'var(--card-train-bg)', color:'var(--card-train-accent)' }}>
            <Train size={15}/>
          </div>
          <span className="card-header-title">Select Destination</span>
        </div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

          {/* Quick select */}
          <div className="field">
            <label className="field-label">Quick Select</label>
            <select className="select" value={destination}
              onChange={e => { setDestination(e.target.value); setCustomDest('') }}>
              <option value="">Choose destination...</option>
              {QUICK_DESTINATIONS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Custom input */}
          <div className="field">
            <label className="field-label">Or type destination</label>
            <input className="input" value={customDest}
              onChange={e => handleCustomDest(e.target.value)}
              onKeyPress={handleCustomEnter}
              placeholder="Enter destination name and press Enter"/>
          </div>

          {/* Refresh button */}
          <button className="btn btn--primary btn--full" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={15} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}/>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Train sections */}
      {loading ? (
        <div className="loading-box"><span className="spinner"/></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
          <TrainSection
            title="Upcoming Departures"
            trains={futureTrains}
            accent="train"
            onShowStops={setStopsPopup}
          />
          <TrainSection
            title="Recent Departures"
            trains={pastTrains}
            accent="hum"
            onShowStops={setStopsPopup}
          />
        </div>
      )}

      {/* Quick links */}
      <div className="card mt-lg">
        <div className="card-header">
          <span className="card-header-title">Quick Links</span>
        </div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {[
            { label:'Trenitalia InfoMobility', href:'https://www.trenitalia.com/it/informazioni/Infomobilita/notizie-infomobilita.html' },
            { label:'Metropolitana di Roma',   href:'https://www.metropolitanadiroma.it/notizie-metro-roma.html' },
            { label:'Italo Treno',             href:'https://www.italotreno.it/' },
          ].map(link => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer"
              className="btn btn--ghost" style={{ justifyContent:'flex-start', textTransform:'none',
                letterSpacing:'normal', fontFamily:'var(--font-body)', fontWeight:400 }}>
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Stops popup */}
      {stopsPopup && (
        <StopsModal stops={stopsPopup} onClose={() => setStopsPopup(null)}/>
      )}

      <Toast toast={toast}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}