import { useState, useEffect } from 'react'
import { Calendar, ExternalLink, CheckCircle, AlertCircle, Loader } from 'lucide-react'

export default function CalendarAuthPage() {
  const [step,    setStep]    = useState('idle')
  const [authUrl, setAuthUrl] = useState('')
  const [message, setMessage] = useState('')

  // ── Check if Google redirected back here with ?success=1 or ?error=... ──
  useEffect(() => {
    const hash   = window.location.hash || ''          // e.g. "#/calendar/auth?success=1"
    const qIndex = hash.indexOf('?')
    if (qIndex === -1) return
    const params = new URLSearchParams(hash.slice(qIndex + 1))
    if (params.get('success')) {
      setStep('success')
    } else if (params.get('error')) {
      setMessage(decodeURIComponent(params.get('error')))
      setStep('error')
    }
  }, [])

  // ── Step 1: ask Flask for the Google OAuth URL ────────────
  const startAuth = async () => {
    setStep('loading')
    setMessage('')
    try {
      const res  = await fetch('/api/calendar/auth/start')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAuthUrl(data.auth_url)
      setStep('url')
    } catch (e) {
      setMessage(e.message)
      setStep('error')
    }
  }

  // ── Styles ────────────────────────────────────────────────
  const card = {
    background:   'var(--bg-surface)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding:      '2rem',
    maxWidth:     520,
    margin:       '2rem auto',
  }

  const primaryBtn = {
    display:        'inline-flex',
    alignItems:     'center',
    gap:            '0.4rem',
    padding:        '0.55rem 1.1rem',
    borderRadius:   'var(--radius-md)',
    border:         'none',
    cursor:         'pointer',
    fontSize:       '0.82rem',
    fontWeight:     600,
    background:     'var(--accent)',
    color:          '#fff',
    textDecoration: 'none',
    transition:     'opacity 0.15s',
  }

  const ghostBtn = {
    ...primaryBtn,
    background: 'var(--bg-surface-2)',
    color:      'var(--text-primary)',
  }

  const urlBox = {
    wordBreak:    'break-all',
    fontSize:     '0.72rem',
    fontFamily:   'var(--font-mono)',
    background:   'var(--bg-surface-2)',
    border:       '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding:      '0.75rem',
    color:        'var(--text-secondary)',
    marginBottom: '1rem',
    lineHeight:   1.5,
  }

  const stepLabel = (n, text) => (
    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)',
      margin: '0 0 0.6rem', lineHeight: 1.6 }}>
      <strong>{n}.</strong> {text}
    </p>
  )

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="animate-fade" style={{ padding: '1.5rem' }}>
      <div style={card}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: 'rgba(0,102,204,0.08)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Calendar size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Google Calendar — Autorizzazione
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Collega il tuo account Google al SmartHouse
            </div>
          </div>
        </div>

        {/* ── IDLE ── */}
        {step === 'idle' && (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)',
              marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Clicca il pulsante per avviare il flusso OAuth con Google.
              Verrai reindirizzato alla pagina di consenso di Google e,
              dopo aver accettato, tornerai qui automaticamente.
            </p>
            <button style={primaryBtn} onClick={startAuth}>
              Inizia autorizzazione
            </button>
          </>
        )}

        {/* ── LOADING ── */}
        {step === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem',
            color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
            Attendere…
          </div>
        )}

        {/* ── URL: show link, Google will redirect back automatically ── */}
        {step === 'url' && (
          <>
            {stepLabel(1, 'Clicca il pulsante qui sotto per aprire la pagina di consenso Google.')}
            {stepLabel(2, 'Accetta le autorizzazioni richieste.')}
            {stepLabel(3, 'Google ti riporterà automaticamente qui — attendi il redirect.')}

            <div style={urlBox}>{authUrl}</div>

            <a href={authUrl} style={primaryBtn}>
              <ExternalLink size={14} />
              Apri su Google
            </a>

            <div style={{ marginTop: '1.25rem', fontSize: '0.72rem',
              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Redirect atteso su: smarthouse.local:4443/api/calendar/auth/callback
            </div>
          </>
        )}

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.75rem', padding: '1rem 0', textAlign: 'center' }}>
            <CheckCircle size={44} style={{ color: 'var(--color-success)' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
              Autorizzazione completata!
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 360 }}>
              Il token è stato salvato sul server. Il widget Calendar nella Home
              dovrebbe funzionare correttamente ora.
            </div>
            <a href="/" style={{ ...primaryBtn, marginTop: '0.5rem' }}>
              Torna alla Home
            </a>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: 'var(--color-danger)', fontSize: '0.82rem', fontWeight: 600 }}>
              <AlertCircle size={16} /> Errore
            </div>
            <div style={{
              fontFamily:   'var(--font-mono)',
              fontSize:     '0.72rem',
              color:        'var(--text-muted)',
              background:   'var(--bg-surface-2)',
              padding:      '0.6rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              wordBreak:    'break-all',
              lineHeight:   1.5,
            }}>
              {message || 'Errore sconosciuto'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button style={primaryBtn}
                onClick={() => { setStep('idle'); setMessage(''); setAuthUrl('') }}>
                Riprova
              </button>
              <a href="/" style={ghostBtn}>Torna alla Home</a>
            </div>
          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}