import { useState, useEffect, useMemo } from 'react'
import {
  Calendar, Clock, MapPin, ExternalLink, RefreshCw,
  ChevronDown, ChevronUp, Search, X, LayoutList, LayoutGrid,
  Copy, Check, AlignLeft, Layers,
} from 'lucide-react'

// ── Color map (Google Calendar color IDs) ────────────────────
const COLOR_MAP = {
  '1': '#a4bdfc', '2': '#7ae7bf', '3': '#dbadff',
  '4': '#ff887c', '5': '#fbd75b', '6': '#ffb878',
  '7': '#46d6db', '8': '#e1e1e1', '9': '#5484ed',
  '10': '#51b749', '11': '#dc2127',
}
const eventColor = (colorId) => COLOR_MAP[colorId] || 'var(--accent)'

// ── Date/time helpers ─────────────────────────────────────────
function formatTimeRange(start, end, allDay) {
  if (allDay) return 'All day'
  try {
    const fmt = (s) => new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return `${fmt(start)} – ${fmt(end)}`
  } catch { return '' }
}

function dayLabel(dateStr) {
  const d        = new Date(dateStr + 'T00:00:00')
  const today    = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  const isToday    = d.toDateString() === today.toDateString()
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const base = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  if (isToday)    return { label: base, badge: 'Today',    badgeColor: 'var(--accent)' }
  if (isTomorrow) return { label: base, badge: 'Tomorrow', badgeColor: 'var(--color-warning)' }
  return { label: base, badge: null }
}

function isToday(dateStr) {
  return new Date(dateStr + 'T00:00:00').toDateString() === new Date().toDateString()
}

function durationMinutes(start, end) {
  try {
    return Math.round((new Date(end) - new Date(start)) / 60000)
  } catch { return null }
}

function fmtDuration(mins) {
  if (!mins || mins <= 0) return null
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function next7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

// ── Copy-to-clipboard hook ────────────────────────────────────
function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return { copied, copy }
}

// ── Week strip pill ───────────────────────────────────────────
function WeekPill({ dateStr, count, active, onClick }) {
  const d   = new Date(dateStr + 'T00:00:00')
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const num = d.getDate()
  const highlight = isToday(dateStr)

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.2rem',
        padding: '0.5rem 0.6rem',
        borderRadius: 'var(--radius-md)',
        border: active
          ? '1px solid var(--accent)'
          : '1px solid var(--border)',
        background: active
          ? 'var(--accent-light)'
          : 'var(--bg-surface-2)',
        cursor: 'pointer',
        transition: 'all var(--transition)',
        minWidth: 44,
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <span style={{
        fontSize: '0.6rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        fontFamily: 'var(--font-body)',
        color: active || highlight ? 'var(--accent)' : 'var(--text-muted)',
      }}>
        {day}
      </span>
      <span style={{
        fontSize: '0.88rem',
        fontWeight: 700,
        color: active
          ? 'var(--accent)'
          : highlight
            ? 'var(--text-primary)'
            : 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {num}
      </span>
      {count > 0 && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'background var(--transition)',
        }} />
      )}
    </button>
  )
}

// ── EventCard ─────────────────────────────────────────────────
function EventCard({ event, compact }) {
  const [expanded, setExpanded] = useState(false)
  const { copied, copy } = useCopy()
  const color    = eventColor(event.color)
  const hasExtra = event.description || event.location
  const dur      = !event.all_day ? fmtDuration(durationMinutes(event.start, event.end)) : null

  const clipText = [
    event.title,
    formatTimeRange(event.start, event.end, event.all_day),
    event.location && `📍 ${event.location}`,
    event.description,
  ].filter(Boolean).join('\n')

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.5rem 0.75rem',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        transition: 'border-color var(--transition)',
      }}>
        <span style={{
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {event.title}
        </span>
        <span style={{
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}>
          {formatTimeRange(event.start, event.end, event.all_day)}
        </span>
        {event.html_link && (
          <a href={event.html_link} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    )
  }

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
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            letterSpacing: '-0.1px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {event.title}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            marginTop: '0.3rem',
            flexWrap: 'wrap',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Clock size={11} />
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {formatTimeRange(event.start, event.end, event.all_day)}
              </span>
            </span>
            {dur && (
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.66rem',
                background: 'var(--bg-surface-2)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}>
                {dur}
              </span>
            )}
            {event.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                <MapPin size={11} /> {event.location}
              </span>
            )}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          <button
            onClick={() => copy(clipText)}
            title="Copy event details"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: copied ? 'var(--color-success)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--transition)',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {event.html_link && (
            <a href={event.html_link} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                padding: '3px',
                borderRadius: 'var(--radius-sm)',
              }}>
              <ExternalLink size={13} />
            </a>
          )}
          {hasExtra && (
            <button onClick={() => setExpanded(x => !x)} style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              padding: '3px',
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--transition)',
            }}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* expanded details */}
      {expanded && hasExtra && (
        <div style={{
          marginTop: '0.65rem',
          paddingTop: '0.65rem',
          borderTop: '1px solid var(--border)',
          fontSize: '0.78rem',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.6,
        }}>
          {event.location && (
            <p style={{ margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <MapPin size={11} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
              {event.location}
            </p>
          )}
          {event.description && <p style={{ margin: 0 }}>{event.description}</p>}
        </div>
      )}
    </div>
  )
}

// ── DaySection ────────────────────────────────────────────────
function DaySection({ dateStr, events, compact }) {
  const { label, badge, badgeColor } = dayLabel(dateStr)
  const highlight = isToday(dateStr)
  const allDay = events.filter(e => e.all_day)
  const timed  = events.filter(e => !e.all_day)

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* day header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <div style={{
          width: 3,
          height: 18,
          borderRadius: 2,
          background: highlight ? 'var(--accent)' : 'var(--border-strong)',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          fontFamily: 'var(--font-body)',
          letterSpacing: '-0.1px',
          color: highlight ? 'var(--text-primary)' : 'var(--text-secondary)',
          textTransform: 'capitalize',
        }}>
          {label}
        </span>
        {badge && (
          /* reuse .badge token style */
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.62rem',
            fontWeight: 700,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-body)',
            color: '#fff',
            background: badgeColor,
            border: '1px solid transparent',
          }}>
            {badge}
          </span>
        )}
        <span style={{
          fontSize: '0.68rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          marginLeft: 'auto',
        }}>
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.75rem' }}>
        {/* All-day chip row */}
        {allDay.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
            {allDay.map(ev => (
              <div key={ev.id} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                background: eventColor(ev.color) + '22',
                borderLeft: `2px solid ${eventColor(ev.color)}`,
                color: 'var(--text-secondary)',
                padding: '3px 9px',
                borderRadius: 'var(--radius-sm)',
              }}>
                <Layers size={10} /> {ev.title}
              </div>
            ))}
          </div>
        )}
        {timed.map(ev => <EventCard key={ev.id} event={ev} compact={compact} />)}
      </div>
    </div>
  )
}

// ── EmptyDay ──────────────────────────────────────────────────
function EmptyDay({ dateStr }) {
  const { label } = dayLabel(dateStr)
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <div style={{ width: 3, height: 18, borderRadius: 2, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-body)',
          textTransform: 'capitalize',
        }}>
          {label}
        </span>
      </div>
      <div style={{
        paddingLeft: '0.75rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-body)',
        fontStyle: 'italic',
      }}>
        No events
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function CalendarPage() {
  const [days,      setDays]      = useState({})
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const [compact,   setCompact]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [focusDay,  setFocusDay]  = useState(null)

  const dates = useMemo(() => next7Days(), [])

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

  const allEvents = useMemo(() => Object.values(days).flat(), [days])

  const stats = useMemo(() => {
    const allDay = allEvents.filter(e => e.all_day).length
    const timed  = allEvents.filter(e => !e.all_day).length
    const busiest = dates.reduce((best, d) => {
      const c = (days[d] || []).length
      return c > (days[best] || []).length ? d : best
    }, dates[0])
    const busiestCount = (days[busiest] || []).length
    return { allDay, timed, busiest: busiestCount > 0 ? busiest : null, busiestCount }
  }, [allEvents, days, dates])

  const filteredDays = useMemo(() => {
    if (!search.trim()) return days
    const q = search.toLowerCase()
    const result = {}
    for (const [date, evs] of Object.entries(days)) {
      const matched = evs.filter(e =>
        e.title?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q)
      )
      if (matched.length) result[date] = matched
    }
    return result
  }, [days, search])

  const visibleDates = focusDay ? [focusDay] : dates
  const hasResults = visibleDates.some(d => (filteredDays[d] || []).length > 0)

  return (
    <div className="page animate-fade">

      {/* ── Page header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 className="page-title">Cale<span style={{ color: 'var(--accent)' }}>ndar</span></h1>
          <p className="page-subtitle">
            Next 7 days · {total} {total === 1 ? 'event' : 'events'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
          {!loading && !error && (
            <span className="badge badge--success">
              <span className="dot dot--green" /> Synced
            </span>
          )}
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
          }}>
            Google Calendar
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* ── Week strip + stats ── */}
        <div className="card">
          {/* Week pill strip */}
          <div style={{
            padding: '0.875rem 1rem',
            display: 'flex',
            gap: '0.4rem',
            overflowX: 'auto',
            borderBottom: '1px solid var(--border)',
          }}>
            {dates.map(d => (
              <WeekPill
                key={d}
                dateStr={d}
                count={(days[d] || []).length}
                active={focusDay === d}
                onClick={() => setFocusDay(prev => prev === d ? null : d)}
              />
            ))}
          </div>

          {/* Stats strip */}
          <div style={{
            padding: '0.75rem 1rem',
            background: 'var(--bg-surface-2)',
            display: 'flex',
            gap: '1.5rem',
            flexWrap: 'wrap',
            overflowX: 'auto',
          }}>
            {[
              ['Total', `${total} events`],
              ['Timed', `${stats.timed}`],
              ['All-day', `${stats.allDay}`],
              ['Busiest', stats.busiest
                ? new Date(stats.busiest + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) + ` · ${stats.busiestCount}`
                : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                <span className="stat-label" style={{ margin: 0 }}>{k}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Events card ── */}
        <div className="card">
          <div className="card-header">
            <div
              className="card-header-icon"
              style={{
                background: 'var(--card-cal-bg, var(--accent-light))',
                color: 'var(--card-cal-accent, var(--accent))',
              }}
            >
              <Calendar size={14} />
            </div>
            <span className="card-header-title">Events</span>

            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: '0.4rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}>
              {/* Search */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={12} style={{
                  position: 'absolute',
                  left: 8,
                  pointerEvents: 'none',
                  color: 'var(--text-muted)',
                }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search events…"
                  className="input input--mono"
                  style={{
                    paddingLeft: 26,
                    paddingRight: search ? 26 : 10,
                    height: 30,
                    fontSize: '0.72rem',
                    width: 150,
                    padding: `0 ${search ? '26px' : '10px'} 0 26px`,
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: 6,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      padding: 0,
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Compact toggle */}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setCompact(x => !x)}
                title={compact ? 'Expanded view' : 'Compact view'}
              >
                {compact ? <LayoutList size={13} /> : <LayoutGrid size={13} />}
              </button>

              {/* Empty days toggle */}
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowEmpty(x => !x)}
              >
                <AlignLeft size={13} />
                {showEmpty ? 'Hide empty' : 'Show empty'}
              </button>

              {/* Refresh */}
              <button
                className="btn btn--ghost btn--sm"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw
                  size={13}
                  style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}
                />
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              margin: '0.75rem 1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(255,59,48,0.08)',
              border: '1px solid var(--color-danger)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              color: 'var(--color-danger)',
              fontFamily: 'var(--font-body)',
            }}>
              Failed to load: {error}
            </div>
          )}

          {/* Search result count */}
          {search.trim() && !loading && (
            <div style={{
              padding: '0.5rem 1rem',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface-2)',
            }}>
              {Object.values(filteredDays).flat().length} result{Object.values(filteredDays).flat().length !== 1 ? 's' : ''} for "{search}"
            </div>
          )}

          {/* Focus day indicator */}
          {focusDay && !loading && (
            <div style={{
              padding: '0.45rem 1rem',
              fontSize: '0.72rem',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              borderBottom: '1px solid var(--border)',
              background: 'var(--accent-light)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span>
                Showing {new Date(focusDay + 'T00:00:00').toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </span>
              <button
                onClick={() => setFocusDay(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: 0,
                  marginLeft: 'auto',
                  fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <X size={12} /> Clear
              </button>
            </div>
          )}

          {/* Events list */}
          {!loading && !error && (
            <div style={{ padding: '1rem' }}>
              {visibleDates.map(dateStr => {
                const eventsForDay = filteredDays[dateStr] || []
                if (eventsForDay.length === 0) {
                  return showEmpty && !search
                    ? <EmptyDay key={dateStr} dateStr={dateStr} />
                    : null
                }
                return (
                  <DaySection
                    key={dateStr}
                    dateStr={dateStr}
                    events={eventsForDay}
                    compact={compact}
                  />
                )
              })}

              {!hasResults && (
                <div className="empty-state">
                  <Calendar size={28} />
                  <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>
                    {search ? `No events matching "${search}"` : 'No events in the next 7 days'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div style={{
              padding: '1.5rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              {[80, 60, 90, 50].map((w, i) => (
                <div key={i} style={{
                  height: 52,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-2)',
                  animation: 'pulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.1}s`,
                  width: `${w}%`,
                }} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.9; } }
      `}</style>
    </div>
  )
}