import { useState, useEffect } from 'react'

/**
 * AppLoader
 * Shows a full-screen splash for `duration` ms on first load,
 * then fades out and renders children.
 */
export default function AppLoader({ children, duration = 900 }) {
  const [visible, setVisible] = useState(true)
  const [fading,  setFading]  = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), duration - 300)
    const hideTimer = setTimeout(() => setVisible(false), duration)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [duration])

  return (
    <>
      {/* Splash overlay */}
      {visible && (
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
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: '2rem', fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.5px',
          }}>
            Smart<span style={{ color: 'var(--accent)' }}>House</span>
          </div>

          {/* Thin progress bar */}
          <div style={{
            width: 120, height: 2,
            borderRadius: 1,
            background: 'var(--border)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: 'var(--accent)',
              borderRadius: 1,
              animation: `loader-bar ${duration}ms ease forwards`,
            }}/>
          </div>

          <style>{`
            @keyframes loader-bar {
              from { width: 0%; }
              to   { width: 100%; }
            }
          `}</style>
        </div>
      )}

      {/* App content — rendered underneath, visible after splash */}
      <div style={{ opacity: visible && !fading ? 0 : 1, transition: 'opacity 0.3s ease' }}>
        {children}
      </div>
    </>
  )
}