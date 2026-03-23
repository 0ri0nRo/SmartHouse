import { useState, useEffect, useRef } from 'react'
import { Train, MapPin, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const FROM = 'Roma Termini'
const TO   = 'COLLEFERRO'

function DelayBadge({ delay }) {
  if (!delay || delay === '0' || delay === 'On time')
    return <span style={{ ...badge, background: 'var(--color-success-bg, rgba(52,199,89,0.12))',
      color: 'var(--color-success)' }}>On time</span>
  const n = parseInt(delay)
  if (n <= 5) return <span style={{ ...badge, background: 'rgba(255,159,10,0.12)',
    color: 'var(--color-warning)' }}>+{delay}</span>
  return <span style={{ ...badge, background: 'rgba(255,59,48,0.12)',
    color: 'var(--color-danger)' }}>+{delay}</span>
}

const badge = {
  fontFamily: 'var(--font-mono)', fontSize: '0.6rem', fontWeight: 600,
  padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
}

function TrainRow({ train, isLast }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '48px 1fr auto',
      alignItems: 'center',
      gap: '0.6rem',
      padding: '0.45rem 1.1rem',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      {/* Time */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 600,
        color: 'var(--text-primary)', lineHeight: 1 }}>
        {train.time}
        {train.platform && train.platform !== 'N/A' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem',
            color: 'var(--text-muted)', marginTop: 2 }}>
            Bin. {train.platform}
          </div>
        )}
      </div>

      {/* Train number + destination snippet */}
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
          color: 'var(--text-muted)', marginBottom: 2 }}>
          {train.train_number}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {train.destination}
        </div>
      </div>

      {/* Delay badge */}
      <DelayBadge delay={train.delay} />
    </div>
  )
}

export default function TrainWidget() {
  const nav = useNavigate()
  const [trains,   setTrains]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)
  const [lastFetch, setLastFetch] = useState(null)
  const intervalRef = useRef(null)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(false)
    try {
      const data = await api.getTrains(TO)
      // Show next 4 upcoming departures
      setTrains((data.result || []).slice(0, 4))
      setLastFetch(new Date())
    } catch {
      setError(true)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(() => load(true), 2 * 60 * 1000) // refresh every 2 min
    return () => clearInterval(intervalRef.current)
  }, [])

  const lastFetchLabel = lastFetch
    ? lastFetch.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null

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
      <div style={{ padding: '1.1rem 1.1rem 0.75rem',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'var(--card-train-bg)', color: 'var(--card-train-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Train size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Train
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: 2 }}>
              <MapPin size={9} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {FROM} → {TO.charAt(0) + TO.slice(1).toLowerCase()}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {lastFetchLabel && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem',
              color: 'var(--text-muted)' }}>
              {lastFetchLabel}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); load() }}
            title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
        borderTop: '1px solid var(--border)' }}>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', minHeight: 100 }}>
            <span className="spinner" />
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            color: 'var(--text-muted)', padding: '1.5rem', minHeight: 100 }}>
            <AlertCircle size={20} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
              Could not load trains
            </span>
          </div>
        ) : trains.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            color: 'var(--text-muted)', padding: '1.5rem', minHeight: 100 }}>
            <Train size={22} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
              No upcoming departures
            </span>
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