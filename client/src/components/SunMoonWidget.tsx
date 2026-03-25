import { useState, useEffect } from 'react'
import { Sunrise, Sunset, Moon } from 'lucide-react'

interface SunMoonData {
  sunrise: string        // "06:42"
  sunset: string         // "19:28"
  day_length: string     // "12h 46m"
  moon_phase: number     // 0.0–1.0
  moon_phase_name: string // "Waxing Gibbous"
  moon_emoji: string     // "🌖"
  next_full_moon: string // "2026-04-13"
  next_new_moon: string  // "2026-03-29"
}

function MoonSvg({ phase }: { phase: number }) {
  // Render a simple SVG crescent/full/new moon based on phase 0–1
  const size = 38
  const r = size / 2 - 2
  const cx = size / 2
  const cy = size / 2

  // phase: 0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter
  const isWaxing = phase < 0.5
  const normalized = isWaxing ? phase * 2 : (phase - 0.5) * 2  // 0–1 within half cycle

  // Crescent shadow offset: 0=fully lit (full), 1=fully dark (new)
  const shadowFactor = phase <= 0.5 ? 1 - phase * 2 : (phase - 0.5) * 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Moon disc */}
      <circle cx={cx} cy={cy} r={r} fill="var(--color-warning)" opacity={0.9} />
      {/* Shadow overlay for crescent */}
      {shadowFactor > 0.05 && (
        <ellipse
          cx={cx + (isWaxing ? -1 : 1) * r * (shadowFactor * 0.9)}
          cy={cy}
          rx={r * shadowFactor}
          ry={r}
          fill="var(--bg-surface)"
          opacity={0.92}
        />
      )}
    </svg>
  )
}

function SunArcBar({ sunrise, sunset }: { sunrise: string; sunset: string }) {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const riseMin = toMinutes(sunrise)
  const setMin = toMinutes(sunset)
  const total = setMin - riseMin
  const elapsed = Math.max(0, Math.min(nowMin - riseMin, total))
  const pct = total > 0 ? (elapsed / total) * 100 : 0
  const isDaytime = nowMin >= riseMin && nowMin <= setMin

  return (
    <div style={{ width: '100%', marginTop: '0.5rem' }}>
      <div style={{
        height: 4, background: 'var(--border)', borderRadius: 2,
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: isDaytime ? 'var(--color-warning)' : 'var(--text-muted)',
          borderRadius: 2, transition: 'width 1s linear',
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem',
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)',
      }}>
        <span>{sunrise}</span>
        <span>{sunset}</span>
      </div>
    </div>
  )
}

export default function SunMoonWidget() {
  const [data, setData] = useState<SunMoonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/sunmoon')
        if (!res.ok) throw new Error('Failed to load sun/moon data')
        const d: SunMoonData = await res.json()
        setData(d)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    // Refresh at midnight
    const msToMidnight = () => {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 10, 0)
      return midnight.getTime() - now.getTime()
    }
    const t = setTimeout(load, msToMidnight())
    return () => clearTimeout(t)
  }, [])

  if (loading) return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', minHeight: 140, height: '100%',
    }}>
      <span className="spinner" />
    </div>
  )

  if (error || !data) return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Sunrise size={16} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Sun & Moon</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{error}</div>
    </div>
  )

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', overflow: 'hidden', height: '100%',
      display: 'flex', flexDirection: 'column', transition: 'border-color var(--transition)',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {/* Header */}
      <div style={{ padding: '1.1rem 1.1rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'rgba(255,204,0,0.1)', color: 'var(--color-warning)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Sunrise size={18} />
          </div>
        </div>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
          Sun & Moon
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
          Day length: {data.day_length}
        </div>
      </div>

      {/* Sun row */}
      <div style={{ padding: '0.75rem 1.1rem 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          {[
            { icon: Sunrise, label: 'Sunrise', val: data.sunrise, color: 'var(--color-warning)' },
            { icon: Sunset,  label: 'Sunset',  val: data.sunset,  color: 'var(--card-temp-accent)' },
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} style={{
                background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)',
                padding: '0.65rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.6px',
                  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  {item.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  <Icon size={12} style={{ color: item.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 600, color: item.color }}>
                    {item.val}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Sun progress bar */}
        <SunArcBar sunrise={data.sunrise} sunset={data.sunset} />
      </div>

      {/* Moon row */}
      <div style={{ flex: 1, padding: '0.75rem 1.1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
        <MoonSvg phase={data.moon_phase} />
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {data.moon_phase_name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Full moon: {data.next_full_moon}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
            New moon: {data.next_new_moon}
          </div>
        </div>
      </div>
    </div>
  )
}