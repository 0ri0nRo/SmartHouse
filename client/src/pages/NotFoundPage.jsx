import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="page animate-fade" style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '70vh', textAlign: 'center', gap: '1.5rem',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'clamp(5rem, 15vw, 9rem)',
        fontWeight: 700,
        color: 'var(--border-strong)',
        lineHeight: 1,
        letterSpacing: '-4px',
        userSelect: 'none',
      }}>
        404
      </div>

      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Page not found
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: 320 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn--ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={15}/> Go back
        </button>
        <button className="btn btn--primary" onClick={() => navigate('/')}>
          <Home size={15}/> Dashboard
        </button>
      </div>
    </div>
  )
}