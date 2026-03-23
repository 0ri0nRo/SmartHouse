/**
 * PingWidget
 * Measures round-trip latency to the Flask server using a lightweight
 * /api/ping endpoint. Shows current ping and a mini sparkline.
 */
import { useState, useEffect, useRef } from 'react'
import { Activity, Wifi, WifiOff } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

const MAX_HISTORY = 20
const INTERVAL_MS = 5000

export default function PingWidget({ onNavigate }) {
  const [history, setHistory] = useState([])  // [{t, ms}]
  const [status,  setStatus]  = useState('checking')  // checking | ok | slow | offline

  useEffect(() => {
    let cancelled = false

    const measure = async () => {
      const t0 = performance.now()
      try {
        await fetch('/api/ping', { cache:'no-store' })
        const ms = Math.round(performance.now() - t0)
        if (cancelled) return
        setHistory(prev => [
          ...prev.slice(-(MAX_HISTORY-1)),
          { t: new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}), ms }
        ])
        setStatus(ms < 50 ? 'ok' : ms < 200 ? 'slow' : 'poor')
      } catch {
        if (cancelled) return
        setHistory(prev => [...prev.slice(-(MAX_HISTORY-1)), { t: '', ms: 0 }])
        setStatus('offline')
      }
    }

    measure()
    const id = setInterval(measure, INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const latest = history[history.length - 1]
  const avg    = history.length ? Math.round(history.reduce((s,h) => s+h.ms, 0) / history.length) : null

  const COLOR = {
    ok:      'var(--color-success)',
    slow:    'var(--color-warning)',
    poor:    'var(--color-danger)',
    offline: 'var(--color-danger)',
    checking:'var(--text-muted)',
  }
  const color = COLOR[status]

  const LABEL = {
    ok:      'Good',
    slow:    'Slow',
    poor:    'Poor',
    offline: 'Offline',
    checking:'Checking...',
  }

  return (
    <div
      onClick={onNavigate}
      style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', overflow:'hidden',
        height:'100%', display:'flex', flexDirection:'column',
        cursor: onNavigate ? 'pointer' : 'default',
        transition:'border-color var(--transition)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor='var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
    >
      {/* Header zone */}
      <div style={{ padding:'1.1rem 1.1rem 0' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.6rem' }}>
          <div style={{ width:36, height:36, borderRadius:'var(--radius-md)',
            background:'var(--card-raspi-bg)', color:'var(--card-raspi-accent)',
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            {status === 'offline' ? <WifiOff size={18}/> : <Wifi size={18}/>}
          </div>
        </div>

        <div style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)', marginBottom:'0.15rem' }}>
          LAN Speed
        </div>
        <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
          192.168.178.101
        </div>
      </div>

      {/* Big ping value */}
      <div style={{ flex:1, padding:'0.75rem 1.1rem 0',
        display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(1.75rem,3.5vw,2.25rem)',
          fontWeight:500, color, lineHeight:1 }}>
          {status === 'offline' ? '—' : latest ? latest.ms : '…'}
          {status !== 'offline' && latest && (
            <span style={{ fontSize:'0.85rem', color:'var(--text-muted)', fontWeight:400 }}> ms</span>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem', alignItems:'flex-end' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
            <span className="dot" style={{ background: color }}/>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.7rem', color }}>{LABEL[status]}</span>
          </div>
          {avg != null && status !== 'offline' && (
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem', color:'var(--text-muted)' }}>
              avg {avg}ms
            </span>
          )}
        </div>
      </div>

      {/* Sparkline */}
      {history.length > 2 && (
        <div style={{ height:48, padding:'0.25rem 0 0', marginTop:'0.25rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ left:0, right:0, top:2, bottom:0 }}>
              <defs>
                <linearGradient id="gpng" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="ms" stroke={color} fill="url(#gpng)"
                strokeWidth={1.5} dot={false} isAnimationActive={false}/>
              <Tooltip
                contentStyle={{ display:'none' }}
                cursor={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}