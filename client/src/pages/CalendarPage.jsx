import { useState, useEffect } from 'react'
import { Calendar, Clock, MapPin, ExternalLink, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

// ── helpers ────────────────────────────────────────────────

const COLOR_MAP = {
  '1': '#a4bdfc', '2': '#7ae7bf', '3': '#dbadff',
  '4': '#ff887c', '5': '#fbd75b', '6': '#ffb878',
  '7': '#46d6db', '8': '#e1e1e1', '9': '#5484ed',
  '10': '#51b749', '11': '#dc2127',
}
const eventColor = (colorId) => COLOR_MAP[colorId] || 'var(--accent)'

function formatTime(dateStr, allDay) {
  if (allDay) return 'Tutto il giorno'
  try {
    return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function formatTimeRange(start, end, allDay) {
  if (allDay) return 'Tutto il giorno'
  try {
    const s = new Date(start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    const e = new Date(end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    return `${s} – ${e}`
  } catch { return formatTime(start, allDay) }
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)

  const isToday    = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  const base = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })

  if (isToday)    return { label: base, badge: 'Oggi',    badgeColor: 'var(--accent)' }
  if (isTomorrow) return { label: base, badge: 'Domani',  badgeColor: 'var(--color-warning)' }
  return { label: base, badge: null }
}

function isToday(dateStr) {
  return new Date(dateStr + 'T00:00:00').toDateString() === new Date().toDateString()
}

// ── EventCard ──────────────────────────────────────────────

function EventCard({ event }) {
  const [expanded, setExpanded] = useState(false)
  const color = eventColor(event.color)
  const hasDetails = event.description || event.location

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 'var(--radius-md)',
      padding: '0.85rem 1rem',
      transition: 'border-color var(--transition)',
    }}>
      {/* top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '0.88rem', fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {event.title}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', flexWrap: 'wrap',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Clock size={11} />
              {formatTimeRange(event.start, event.end, event.all_day)}
            </span>
            {event.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={11} />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          {event.html_link && (
            <a
              href={event.html_link}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                color: 'var(--text-muted)', display: 'flex',
                alignItems: 'center', padding: '2px',
              }}
            >
              <ExternalLink size={13} />
            </a>
          )}
          {hasDetails && (
            <button
              onClick={() => setExpanded(x => !x)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px',
              }}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* expanded details */}
      {expanded && hasDetails && (
        <div style={{
          marginTop: '0.65rem', paddingTop: '0.65rem',
          borderTop: '1px solid var(--border)',
          fontSize: '0.78rem', color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          {event.description && <p style={{ margin: 0 }}>{event.description}</p>}
        </div>
      )}
    </div>
  )
}

// ── DaySection ─────────────────────────────────────────────

function DaySection({ dateStr, events }) {
  const { label, badge, badgeColor } = dayLabel(dateStr)
  const highlight = isToday(dateStr)

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* day header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.6rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          width: 4, height: 18, borderRadius: 2,
          background: highlight ? 'var(--accent)' : 'var(--border-strong)',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: '0.82rem', fontWeight: 600,
          color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
          textTransform: 'capitalize',
        }}>
          {label}
        </span>
        {badge && (
          <span style={{
            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.4px',
            textTransform: 'uppercase', color: '#fff',
            background: badgeColor, borderRadius: '999px',
            padding: '2px 8px',
          }}>
            {badge}
          </span>
        )}
        <span style={{
          fontSize: '0.68rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)', marginLeft: 'auto',
        }}>
          {events.length} {events.length === 1 ? 'evento' : 'eventi'}
        </span>
      </div>

      {/* events */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.75rem' }}>
        {events.map(ev => <EventCard key={ev.id} event={ev} />)}
      </div>
    </div>
  )
}

// ── EmptyDay placeholder ───────────────────────────────────

function EmptyDayPlaceholder({ dateStr }) {
  const { label } = dayLabel(dateStr)
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 4, height: 18, borderRadius: 2, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
          {label}
        </span>
      </div>
      <div style={{
        paddingLeft: '0.75rem', fontSize: '0.75rem',
        color: 'var(--text-muted)', fontStyle: 'italic',
      }}>
        Nessun evento
      </div>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────

export default function CalendarPage() {
  const [days, setDays]       = useState({})
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [showEmpty, setShowEmpty] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/calendar/week')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setDays(d.days || {})
        setTotal(d.total || 0)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Genera lista dei prossimi 7 giorni
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  return (
    <div className="animate-fade">
      {/* header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--radius-md)',
              background: 'var(--card-cal-bg, rgba(0,102,204,0.08))',
              color: 'var(--card-cal-accent, var(--accent))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Calendar size={20} />
            </div>
            <div>
              <h1 className="page-title">Calendar</h1>
              <p style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                color: 'var(--text-muted)', letterSpacing: '0.5px', marginTop: '0.2rem',
              }}>
                Prossimi 7 giorni · {total} {total === 1 ? 'evento' : 'eventi'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setShowEmpty(x => !x)}
              style={{ fontSize: '0.72rem' }}
            >
              {showEmpty ? 'Nascondi giorni vuoti' : 'Mostra giorni vuoti'}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw size={13} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
              {loading ? 'Caricamento…' : 'Aggiorna'}
            </button>
          </div>
        </div>
      </div>

      {/* error */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem',
          background: 'var(--color-danger-light, rgba(255,59,48,0.08))',
          border: '1px solid var(--color-danger)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem', color: 'var(--color-danger)',
        }}>
          Errore nel caricamento: {error}
        </div>
      )}

      {/* content */}
      {!loading && !error && (
        <div>
          {next7.map(dateStr => {
            const eventsForDay = days[dateStr] || []
            if (eventsForDay.length === 0) {
              return showEmpty
                ? <EmptyDayPlaceholder key={dateStr} dateStr={dateStr} />
                : null
            }
            return <DaySection key={dateStr} dateStr={dateStr} events={eventsForDay} />
          })}

          {total === 0 && !showEmpty && (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem',
              color: 'var(--text-muted)', fontSize: '0.85rem',
            }}>
              <Calendar size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
              <p>Nessun evento nei prossimi 7 giorni</p>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}