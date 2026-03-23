import { useEffect, useState } from 'react'

/**
 * Full-screen loading overlay shown for the first ~600ms.
 * Fades out automatically.
 */
export default function LoadingScreen() {
  const [visible, setVisible] = useState(true)
  const [fading,  setFading]  = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true),  400)
    const t2 = setTimeout(() => setVisible(false), 700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--bg-page)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1.25rem',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.3s ease',
      pointerEvents: fading ? 'none' : 'all',
    }}>
      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--radius-md)',
          background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
            stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
        <span style={{
          fontFamily: 'var(--font-body)', fontWeight: 700,
          fontSize: '1.25rem', letterSpacing: '-0.3px',
          color: 'var(--text-primary)',
        }}>
          Smart<span style={{ color:'var(--accent)' }}>House</span>
        </span>
      </div>

      {/* Minimal spinner */}
      <div style={{
        width: 28, height: 28,
        border: '2px solid var(--border-strong)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}/>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}