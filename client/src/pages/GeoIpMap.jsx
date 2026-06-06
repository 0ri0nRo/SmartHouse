/**
 * GeoIpMap.jsx
 * ------------
 * Self-contained component that renders an SVG world map with attacker dots.
 * Uses data from GET /api/honeypot/geoip which is now backed by the local
 * MaxMind GeoLite2-City database instead of ip-api.com.
 *
 * Changes vs the ip-api version:
 *  - Added <DbErrorBanner> shown when the backend returns HTTP 503
 *    (database not found or geoip2 not installed).
 *  - ISP / Org fields removed from the selected-attacker detail card
 *    (GeoLite2-City does not include ASN/ISP data; those come from the
 *    separate GeoLite2-ASN database).
 *  - "powered by ip-api.com" attribution replaced with MaxMind credit.
 *  - Everything else (map rendering, pan/zoom, tooltips, country list)
 *    is unchanged.
 *
 * Named export — import with:
 *   import { GeoIpMap } from './GeoIpMap'
 */

import { useState, useRef } from 'react'
import { Globe, Target, RefreshCw, MapPin, TrendingUp, AlertTriangle } from 'lucide-react'

// ── Color helpers ─────────────────────────────────────────────────

function attackColor(count, maxCount) {
  const ratio = Math.sqrt(count / Math.max(maxCount, 1))
  if (ratio > 0.8)  return '#ef4444'
  if (ratio > 0.5)  return '#f97316'
  if (ratio > 0.25) return '#f59e0b'
  return '#60a5fa'
}

function flagEmoji(cc) {
  if (!cc || cc === 'XX') return '🌐'
  try {
    const offset = 0x1F1E6 - 65
    return (
      String.fromCodePoint(cc.charCodeAt(0) + offset) +
      String.fromCodePoint(cc.charCodeAt(1) + offset)
    )
  } catch {
    return '🌐'
  }
}

function project(lat, lon) {
  const x = ((lon + 180) / 360) * 1000
  const y = ((90 - lat) / 180) * 500
  return { x, y }
}

// ── Continent outlines (equirectangular SVG paths) ────────────────
const CONTINENT_SHAPES = [
  { d: 'M 80,50 L 220,50 L 280,100 L 300,150 L 280,200 L 240,220 L 180,250 L 120,230 L 80,200 L 60,150 L 70,100 Z' },
  { d: 'M 180,250 L 240,250 L 280,280 L 290,340 L 270,400 L 230,430 L 200,420 L 180,380 L 165,320 L 160,280 Z' },
  { d: 'M 430,60 L 530,55 L 560,80 L 550,120 L 510,140 L 480,130 L 450,110 L 420,90 Z' },
  { d: 'M 450,150 L 540,140 L 580,160 L 590,220 L 580,300 L 560,360 L 510,390 L 470,370 L 440,310 L 430,240 L 440,190 Z' },
  { d: 'M 540,50 L 800,40 L 850,80 L 820,120 L 750,140 L 650,130 L 580,120 L 540,90 Z' },
  { d: 'M 560,120 L 700,110 L 760,140 L 780,180 L 750,220 L 700,250 L 650,260 L 610,240 L 580,200 L 555,160 Z' },
  { d: 'M 720,90 L 830,80 L 870,110 L 860,160 L 820,190 L 770,200 L 730,180 L 710,150 L 705,115 Z' },
  { d: 'M 760,190 L 820,185 L 840,210 L 830,240 L 800,250 L 770,240 L 755,220 Z' },
  { d: 'M 780,300 L 880,295 L 920,320 L 910,380 L 870,400 L 810,395 L 770,370 L 760,330 Z' },
  { d: 'M 180,25 L 260,20 L 280,45 L 240,55 L 190,50 Z' },
  { d: 'M 850,105 L 870,100 L 880,120 L 865,135 L 848,120 Z' },
  { d: 'M 438,68 L 450,65 L 455,80 L 445,88 L 435,80 Z' },
  { d: 'M 570,320 L 580,315 L 585,340 L 575,360 L 565,350 L 560,330 Z' },
  { d: 'M 560,155 L 610,148 L 625,175 L 615,205 L 580,215 L 555,195 Z' },
  { d: 'M 920,380 L 935,375 L 940,395 L 928,405 L 918,395 Z' },
]

// ── Sub-components ────────────────────────────────────────────────

function StatCard({ label, value, icon, color, sub }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '0.9rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}>
      <span style={{
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: 8,
        background: `${color}1a`,
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.1rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
        }}>
          {value}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.67rem',
          color: 'var(--text-secondary)',
          marginTop: '0.2rem',
        }}>
          {label}
        </div>
        {sub && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.63rem',
            color,
            marginTop: '0.1rem',
          }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Banner shown when the backend returns a 503 (database missing / geoip2
 * not installed). Provides actionable setup instructions inline.
 */
function DbErrorBanner({ error, dbPath }) {
  return (
    <div style={{
      margin: '1rem',
      padding: '1rem 1.25rem',
      background: '#f9731610',
      border: '1px solid #f9731640',
      borderRadius: 10,
      display: 'flex',
      gap: '0.85rem',
      alignItems: 'flex-start',
    }}>
      <AlertTriangle size={18} style={{ color: '#f97316', flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          fontWeight: 700,
          color: '#f97316',
          marginBottom: '0.4rem',
        }}>
          GeoIP database not available
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          {error}
        </div>
        <div style={{
          marginTop: '0.6rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
        }}>
          <div>1. Register (free) at <span style={{ color: '#60a5fa' }}>maxmind.com/en/geolite2/signup</span></div>
          <div>2. Download <code style={{ color: 'var(--accent)' }}>GeoLite2-City.mmdb</code></div>
          <div>3. Mount it in Docker at <code style={{ color: 'var(--accent)' }}>{dbPath || '/usr/share/GeoIP/GeoLite2-City.mmdb'}</code></div>
          <div>4. Set env var <code style={{ color: 'var(--accent)' }}>GEOIP_DB_PATH</code> if you use a different path</div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

/**
 * GeoIpMap
 *
 * Props:
 *   geoData   — object from GET /api/honeypot/geoip
 *               { attackers, countries, total_ips, cached_ips, db_path, error? }
 *   loading   — boolean
 *   isMobile  — boolean
 *   onRefresh — callback
 */
export function GeoIpMap({ geoData, loading, isMobile, onRefresh }) {
  const [selected,  setSelected]  = useState(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [tooltip,   setTooltip]   = useState(null)

  const svgWrapRef = useRef(null)
  const dragging   = useRef(false)
  const lastPos    = useRef({ x: 0, y: 0 })
  const pinchDist  = useRef(null)

  // If the backend returned an error object (503 response stored in geoData)
  const dbError = geoData?.error

  const attackers      = geoData?.attackers  || []
  const countries      = geoData?.countries  || []
  const maxCount       = attackers.length > 0 ? attackers[0].count : 1
  const validAttackers = attackers.filter(a => !(a.lat === 0 && a.lon === 0))

  // ── Pan / zoom ────────────────────────────────────────────────

  const clampScale = s => Math.min(8, Math.max(0.7, s))

  const handleWheel = e => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.85 : 1.18
    const rect  = svgWrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setTransform(prev => {
      const newScale = clampScale(prev.scale * delta)
      const ratio    = newScale / prev.scale
      return { scale: newScale, x: mx - ratio * (mx - prev.x), y: my - ratio * (my - prev.y) }
    })
  }

  const handleMouseDown = e => {
    if (e.target.closest('.geo-dot')) return
    dragging.current = true
    lastPos.current  = { x: e.clientX, y: e.clientY }
  }
  const handleMouseMove = e => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }
  const handleMouseUp = () => { dragging.current = false }

  const handleTouchStart = e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchDist.current = Math.hypot(dx, dy)
    } else {
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }
  const handleTouchMove = e => {
    if (e.touches.length === 2 && pinchDist.current) {
      const dx      = e.touches[0].clientX - e.touches[1].clientX
      const dy      = e.touches[0].clientY - e.touches[1].clientY
      const newDist = Math.hypot(dx, dy)
      setTransform(prev => ({ ...prev, scale: clampScale(prev.scale * (newDist / pinchDist.current)) }))
      pinchDist.current = newDist
    } else if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastPos.current.x
      const dy = e.touches[0].clientY - lastPos.current.y
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Summary stat cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
        gap: '0.75rem',
      }}>
        <StatCard label="Geolocated IPs"   value={validAttackers.length}                          icon={<MapPin size={15} />}    color="#60a5fa" />
        <StatCard label="Source countries" value={countries.length}                                icon={<Globe size={15} />}     color="#f97316" />
        <StatCard label="Top country"      value={countries[0] ? `${flagEmoji(countries[0].countryCode)} ${countries[0].country}` : '—'} icon={<Target size={15} />} color="#ef4444" />
        <StatCard label="Top IP attacks"   value={attackers[0]?.count?.toLocaleString() ?? '—'}   icon={<TrendingUp size={15} />} color="#a78bfa" sub={attackers[0]?.ip} />
      </div>

      {/* ── World map card ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header">
          <div className="card-header-icon" style={{ background: '#60a5fa18', color: '#60a5fa' }}>
            <Globe size={15} />
          </div>
          <span className="card-header-title">Attacker map</span>
          <span style={{ marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
            {validAttackers.length} IPs · MaxMind GeoLite2
          </span>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              marginLeft: 'auto',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 6, padding: '0.25rem 0.6rem',
              cursor: 'pointer', fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem', color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {/* Database error state */}
        {dbError && <DbErrorBanner error={dbError} dbPath={geoData?.db_path} />}

        {loading ? (
          <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem' }}>
            <span className="spinner" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              Loading GeoIP data…
            </span>
          </div>
        ) : !dbError && (
          <div
            ref={svgWrapRef}
            style={{ position: 'relative', background: '#0a1628', borderTop: '1px solid var(--border)', userSelect: 'none' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { handleMouseUp(); setTooltip(null) }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => { pinchDist.current = null }}
          >
            {/* Zoom controls */}
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {[
                { label: '+', fn: () => setTransform(p => ({ ...p, scale: clampScale(p.scale * 1.3) })) },
                { label: '−', fn: () => setTransform(p => ({ ...p, scale: clampScale(p.scale * 0.75) })) },
                { label: '↺', fn: () => setTransform({ x: 0, y: 0, scale: 1 }) },
              ].map(({ label, fn }) => (
                <button key={label} onClick={fn} style={{
                  width: 26, height: 26, border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 5, background: 'rgba(255,255,255,0.07)', color: '#c0cfe8',
                  cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Intensity legend */}
            <div style={{
              position: 'absolute', bottom: 32, left: 8, zIndex: 10,
              background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '0.4rem 0.6rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#8aa0be',
            }}>
              <div style={{ marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attack intensity</div>
              {[
                { color: '#60a5fa', label: 'Low' },
                { color: '#f59e0b', label: 'Medium' },
                { color: '#f97316', label: 'High' },
                { color: '#ef4444', label: 'Critical' },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>

            {/* SVG world map */}
            <svg
              viewBox="0 0 1000 500"
              style={{ width: '100%', display: 'block', cursor: dragging.current ? 'grabbing' : 'grab', touchAction: 'none' }}
            >
              <defs>
                <pattern id="map-grid" width="50" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 25" fill="none" stroke="#1a2e45" strokeWidth="0.5" />
                </pattern>
              </defs>

              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                <rect width="1000" height="500" fill="#0a1628" />
                <rect width="1000" height="500" fill="url(#map-grid)" />

                {[-60, -30, 0, 30, 60].map(lat => {
                  const y = ((90 - lat) / 180) * 500
                  return <line key={`lat${lat}`} x1="0" y1={y} x2="1000" y2={y} stroke="#1e3450" strokeWidth="0.5" />
                })}
                {[-120, -60, 0, 60, 120].map(lon => {
                  const x = ((lon + 180) / 360) * 1000
                  return <line key={`lon${lon}`} x1={x} y1="0" x2={x} y2="500" stroke="#1e3450" strokeWidth="0.5" />
                })}

                <text x={6} y={248} fill="#2a4a6a" fontFamily="monospace" fontSize="6">Equator</text>

                {CONTINENT_SHAPES.map((shape, i) => (
                  <path key={i} d={shape.d} fill="#1a2e45" stroke="#243d56" strokeWidth="0.5" />
                ))}

                {validAttackers.map((a, i) => {
                  const { x, y } = project(a.lat, a.lon)
                  const color    = attackColor(a.count, maxCount)
                  const ratio    = Math.sqrt(a.count / maxCount)
                  const r        = 3 + ratio * 9
                  const isTop    = i < 5
                  const isSel    = selected?.ip === a.ip

                  return (
                    <g
                      key={a.ip}
                      className="geo-dot"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(isSel ? null : a)}
                      onMouseEnter={e => setTooltip({ attacker: a, clientX: e.clientX, clientY: e.clientY })}
                      onMouseMove={e => setTooltip(prev => prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {isTop && (
                        <circle cx={x} cy={y} r={r + 4} fill={color} opacity="0.12">
                          <animate attributeName="r" values={`${r + 2};${r + 9};${r + 2}`} dur="2.5s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.12;0.03;0.12" dur="2.5s" repeatCount="indefinite" />
                        </circle>
                      )}
                      {isSel && (
                        <circle cx={x} cy={y} r={r + 6} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.9" />
                      )}
                      <circle cx={x} cy={y} r={r} fill={color} opacity={isSel ? 1 : 0.88} stroke={isSel ? '#fff' : color} strokeWidth={isSel ? 1 : 0} />
                      {r > 7 && (
                        <text x={x} y={y + 3} textAnchor="middle" fill="#fff" fontFamily="monospace" fontSize={Math.max(5, r * 0.65)} fontWeight="700" pointerEvents="none">
                          {a.count > 999 ? `${(a.count / 1000).toFixed(1)}k` : a.count}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* "You" marker — Rome */}
                <g>
                  <circle cx={project(41.9, 12.5).x} cy={project(41.9, 12.5).y} r={4} fill="#22c55e" stroke="#fff" strokeWidth={1} />
                  <text x={project(41.9, 12.5).x + 6} y={project(41.9, 12.5).y + 3} fill="#22c55e" fontFamily="monospace" fontSize="6" fontWeight="700">You</text>
                </g>
              </g>
            </svg>

            {/* Floating tooltip */}
            {tooltip && (() => {
              const wrapRect = svgWrapRef.current?.getBoundingClientRect()
              const offsetX  = wrapRect ? tooltip.clientX - wrapRect.left : 0
              const offsetY  = wrapRect ? tooltip.clientY - wrapRect.top  : 0
              const tipWidth = 180, tipHeight = 80
              const left     = Math.min(offsetX + 12, (wrapRect?.width  || 600) - tipWidth  - 8)
              const top      = Math.min(offsetY + 12, (wrapRect?.height || 400) - tipHeight - 8)
              const color    = attackColor(tooltip.attacker.count, maxCount)
              return (
                <div style={{
                  position: 'absolute', left, top, pointerEvents: 'none',
                  background: 'rgba(10,22,40,0.92)', border: `1px solid ${color}60`,
                  borderRadius: 6, padding: '0.5rem 0.65rem',
                  fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#c0cfe8',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
                  zIndex: 20, minWidth: tipWidth,
                }}>
                  <div style={{ fontWeight: 700, color, marginBottom: '0.2rem' }}>{tooltip.attacker.ip}</div>
                  <div style={{ marginBottom: '0.1rem' }}>
                    {flagEmoji(tooltip.attacker.countryCode)}{' '}
                    {tooltip.attacker.city ? `${tooltip.attacker.city}, ` : ''}{tooltip.attacker.country}
                  </div>
                  <div>{tooltip.attacker.count.toLocaleString()} attacks</div>
                </div>
              )
            })()}

            <div style={{ textAlign: 'center', fontSize: '0.6rem', color: '#2a4a6a', fontFamily: 'var(--font-mono)', padding: '0.25rem 0 0.4rem' }}>
              scroll / pinch to zoom · drag to pan · click a dot for details
            </div>
          </div>
        )}
      </div>

      {/* ── Selected attacker detail card ── */}
      {selected && (() => {
        const color = attackColor(selected.count, maxCount)
        return (
          <div className="card" style={{ border: `1px solid ${color}40` }}>
            <div className="card-header">
              <div className="card-header-icon" style={{ background: `${color}18`, color }}>
                <Target size={15} />
              </div>
              <span className="card-header-title">{flagEmoji(selected.countryCode)} {selected.ip}</span>
              <button onClick={() => setSelected(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{
              padding: '0.75rem 1rem',
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)',
              gap: '0.6rem',
            }}>
              {[
                { label: 'Attacks', value: selected.count.toLocaleString() },
                { label: 'Country', value: `${flagEmoji(selected.countryCode)} ${selected.country}` },
                { label: 'City',    value: selected.city   || '—' },
                { label: 'Region',  value: selected.region || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '0.5rem 0.65rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Bottom panels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>

        {/* Top countries */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#f9731618', color: '#f97316' }}><Globe size={15} /></div>
            <span className="card-header-title">Top source countries</span>
          </div>
          <div style={{ padding: '0.5rem 1rem 1rem' }}>
            {countries.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No data yet</div>
            ) : countries.slice(0, 10).map((c, i) => {
              const max = countries[0]?.count || 1
              return (
                <div key={c.countryCode} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: 16, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{flagEmoji(c.countryCode)}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: 'var(--text-primary)', minWidth: 90, flexShrink: 0 }}>{c.country}</span>
                  <div style={{ flex: 1, height: 5, background: 'var(--bg-muted)', borderRadius: 99 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${(c.count / max) * 100}%`, background: '#f97316', transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-secondary)', minWidth: 32, textAlign: 'right' }}>{c.count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Top 15 IPs */}
        <div className="card">
          <div className="card-header">
            <div className="card-header-icon" style={{ background: '#ef444418', color: '#ef4444' }}><Target size={15} /></div>
            <span className="card-header-title">Top 15 attacking IPs</span>
          </div>
          <div style={{ padding: '0 1rem 1rem', maxHeight: 320, overflowY: 'auto' }}>
            {attackers.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No attacker data</div>
            ) : attackers.slice(0, 15).map((a, i) => {
              const color = attackColor(a.count, maxCount)
              const isSel = selected?.ip === a.ip
              return (
                <div
                  key={a.ip}
                  onClick={() => setSelected(isSel ? null : a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.35rem 0.4rem', borderRadius: 6, cursor: 'pointer',
                    marginBottom: '0.2rem',
                    background: isSel ? `${color}12` : 'transparent',
                    border: `1px solid ${isSel ? `${color}30` : 'transparent'}`,
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', minWidth: 14, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ fontSize: '0.85rem', lineHeight: 1, flexShrink: 0 }}>{flagEmoji(a.countryCode)}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color, fontWeight: 600, minWidth: 100, flexShrink: 0 }}>{a.ip}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.city ? `${a.city}, ` : ''}{a.country}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{a.count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}