import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, MapPin, ChevronRight } from 'lucide-react'

// ── Google Calendar color IDs → CSS colors ─────────────────
const COLOR_MAP = {
  '1':  '#a4bdfc', '2':  '#7ae7bf', '3':  '#dbadff',
  '4':  '#ff887c', '5':  '#fbd75b', '6':  '#ffb878',
  '7':  '#46d6db', '8':  '#e1e1e1', '9':  '#5484ed',
  '10': '#51b749', '11': '#dc2127',
}
const eventColor = (colorId) => COLOR_MAP[colorId] || 'var(--accent)'

// ── Helpers ────────────────────────────────────────────────

function formatTime(dateStr, allDay) {
  if (allDay) return 'All day'
  try {
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  })
}

// ── Single event row ───────────────────────────────────────

function EventRow({ event }) {
  const color = eventColor(event.color_id)

  return (
    <div style={{
      display:      'flex',
      alignItems:   'flex-start',
      gap:          '0.6rem',
      padding:      '0.45rem 0',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* colored dot matching the Google Calendar event color */}
      <div style={{
        width:        8,
        height:       8,
        borderRadius: '50%',
        background:   color,
        flexShrink:   0,
        marginTop:    4,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:     '0.8rem',
          fontWeight:   600,
          color:        'var(--text-primary)',
          whiteSpace:   'nowrap',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
        }}>
          {event.title}
        </div>

        <div style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '0.4rem',
          fontSize:   '0.7rem',
          color:      'var(--text-muted)',
          marginTop:  '0.1rem',
          flexWrap:   'wrap',
        }}>
          <Clock size={10} />
          <span>{formatTime(event.start, event.all_day)}</span>

          {event.location && (
            <>
              <MapPin size={10} style={{ marginLeft: '0.25rem' }} />
              <span style={{
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                maxWidth:     110,
              }}>
                {event.location}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main widget ────────────────────────────────────────────

export default function CalendarWidget() {
  const nav = useNavigate()
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const intervalRef = useRef(null)

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/calendar/today')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEvents(data.events || [])
    } catch (e) {
      setError(e.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Auto-refresh every 15 minutes — same pattern as WeatherWidget
    intervalRef.current = setInterval(() => load(true), 15 * 60 * 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  // ── Loading ────────────────────────────────────────────
  if (loading) return (
    <div style={{
      background:     'var(--bg-surface)',
      border:         '1px solid var(--border)',
      borderRadius:   'var(--radius-lg)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      140,
      height:         '100%',
    }}>
      <span className="spinner" />
    </div>
  )

  // ── Error ──────────────────────────────────────────────
  if (error) return (
    <div style={{
      background:    'var(--bg-surface)',
      border:        '1px solid var(--border)',
      borderRadius:  'var(--radius-lg)',
      padding:       '1.25rem',
      display:       'flex',
      flexDirection: 'column',
      gap:           '0.5rem',
      height:        '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Calendar
        </span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {error}
      </div>
    </div>
  )

  // ── Normal ─────────────────────────────────────────────
  return (
    <div
      onClick={() => nav('/calendar')}
      style={{
        background:    'var(--bg-surface)',
        border:        '1px solid var(--border)',
        borderRadius:  'var(--radius-lg)',
        cursor:        'pointer',
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        height:        '100%',
        transition:    'border-color var(--transition)',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* header: icon + chevron */}
      <div style={{
        padding:        '1.1rem 1.1rem 0',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
      }}>
        <div style={{
          width:          36,
          height:         36,
          borderRadius:   'var(--radius-md)',
          background:     'rgba(0,102,204,0.08)',
          color:          'var(--accent)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}>
          <Calendar size={18} />
        </div>
        <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
      </div>

      {/* title + today's date */}
      <div style={{ padding: '0.9rem 1.1rem 0' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          Calendar
        </div>
        <div style={{
          fontSize:      '0.72rem',
          color:         'var(--text-muted)',
          marginTop:     '0.2rem',
          fontFamily:    'var(--font-mono)',
          textTransform: 'capitalize',
        }}>
          {todayLabel()}
        </div>
      </div>

      {/* event list — max 3, rest visible on /calendar page */}
      <div style={{ flex: 1, padding: '0.75rem 1.1rem 1.1rem' }}>
        {events.length === 0 ? (
          <div style={{
            fontSize:   '0.78rem',
            color:      'var(--text-muted)',
            fontStyle:  'italic',
            paddingTop: '0.25rem',
          }}>
            No events today
          </div>
        ) : (
          <>
            {events.slice(0, 3).map(ev => (
              <EventRow key={ev.id} event={ev} />
            ))}
            {events.length > 3 && (
              <div style={{
                fontSize:   '0.7rem',
                color:      'var(--accent)',
                marginTop:  '0.5rem',
                fontWeight: 500,
              }}>
                +{events.length - 3} more →
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}