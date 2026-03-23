import { useState, useEffect } from 'react'
import { BookOpen, RefreshCw, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

export default function OnThisDayWidget() {
  const [events,  setEvents]  = useState([])
  const [index,   setIndex]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(false)
      try {
        const now   = new Date()
        const month = now.getMonth() + 1
        const day   = now.getDate()
        const res   = await fetch(
          `https://it.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`,
          { headers: { Accept: 'application/json' } }
        )
        if (!res.ok) throw new Error()
        const json = await res.json()
        // Pick up to 8 events, sorted by year descending (most recent first)
        const sorted = (json.events ?? [])
          .sort((a, b) => b.year - a.year)
          .slice(0, 8)
        setEvents(sorted)
        setIndex(0)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const prev = () => setIndex(i => Math.max(0, i - 1))
  const next = () => setIndex(i => Math.min(events.length - 1, i + 1))

  const event   = events[index]
  const today   = new Date()
  const dateStr = today.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

  // First Wikipedia page link if available
  const wikiPage = event?.pages?.[0]
  const wikiUrl  = wikiPage?.content_urls?.desktop?.page ?? null

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
            background: 'var(--card-sec-bg, rgba(100,100,200,0.1))',
            color: 'var(--card-sec-accent, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={18}/>
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Questo giorno nella storia
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
              color: 'var(--text-muted)', marginTop: 2 }}>
              {dateStr}
            </div>
          </div>
        </div>

        {/* Wiki link */}
        {wikiUrl && (
          <a href={wikiUrl} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            title="Apri su Wikipedia"
            style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)',
              padding: 2, textDecoration: 'none' }}>
            <ExternalLink size={12}/>
          </a>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '0 1.1rem 1rem',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 90 }}>
            <span className="spinner"/>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '0.4rem', color: 'var(--text-muted)', minHeight: 90 }}>
            <BookOpen size={20}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
              Errore caricamento
            </span>
          </div>
        ) : event ? (
          <>
            {/* Year badge + text */}
            <div style={{ minHeight: 80 }}>
              <div style={{ display: 'inline-block', fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem', fontWeight: 700,
                background: 'var(--accent-light, rgba(0,102,204,0.1))',
                color: 'var(--accent)', padding: '2px 8px', borderRadius: 4,
                marginBottom: '0.5rem' }}>
                {event.year}
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.55,
                margin: 0, display: '-webkit-box', WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {event.text}
              </p>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: '0.85rem' }}>
              <button onClick={prev} disabled={index === 0}
                style={{ background: 'none', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer',
                  padding: 4, color: index === 0 ? 'var(--border)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}>
                <ChevronLeft size={15}/>
              </button>

              {/* Dot indicators */}
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                {events.map((_, i) => (
                  <button key={i} onClick={() => setIndex(i)}
                    style={{ width: i === index ? 16 : 5, height: 5,
                      borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer',
                      background: i === index ? 'var(--accent)' : 'var(--border)',
                      transition: 'width 0.2s, background 0.2s' }}/>
                ))}
              </div>

              <button onClick={next} disabled={index === events.length - 1}
                style={{ background: 'none', border: 'none',
                  cursor: index === events.length - 1 ? 'not-allowed' : 'pointer',
                  padding: 4, color: index === events.length - 1 ? 'var(--border)' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}>
                <ChevronRight size={15}/>
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}