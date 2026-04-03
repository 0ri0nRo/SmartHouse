import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Thermometer, Droplets, Wind, Cpu, Bell, Flame, ChevronRight, RefreshCw,
         Settings, GripVertical, Eye, EyeOff, RotateCcw, X, Newspaper,
         Radio, Shield, Sunrise, Sunset } from 'lucide-react'
import { api } from '../api'
import WeatherWidget            from '../components/WeatherWidget'
import PingWidget               from '../components/PingWidget'
import TrainWidget              from '../components/TrainWidget'
import AirQualityExternalWidget from '../components/AirQualityExternalWidget'
import OnThisDayWidget          from '../components/OnThisDayWidget'
import { useNotifications } from '../hooks/useNotifications'
import CalendarWidget       from '../components/CalendarWidget'
import RecipeWidget         from '../components/RecipeWidget'
import NetworkDevicesWidget from '../components/NetworkDevicesWidget'
import SunMoonWidget        from '../components/SunMoonWidget'

const REFRESH_INTERVAL = 15
const LAYOUT_KEY = 'smarthome:widget_layout'

// ── Widget registry ────────────────────────────────────────
const DEFAULT_WIDGETS: WidgetDef[] = [
  { id: 'calendar',     label: 'Calendar',               category: 'info'    },
  { id: 'alarm',        label: 'Home Alarm',             category: 'control' },
  { id: 'boiler',       label: 'Boiler',                 category: 'control' },
  { id: 'environment',  label: 'Temperature & Humidity', category: 'sensor'  },
  { id: 'raspi',        label: 'Raspberry Pi',           category: 'system'  },
  { id: 'weather',      label: 'Weather',                category: 'info'    },
  { id: 'ping',         label: 'Ping',                   category: 'system'  },
  { id: 'train',        label: 'Train',                  category: 'info'    },
  { id: 'air_external', label: 'Air Quality (Ext)',      category: 'sensor'  },
  { id: 'on_this_day',  label: 'On This Day',            category: 'info'    },
  { id: 'recipe',       label: 'Recipe',                 category: 'info'    },
  { id: 'network',      label: 'Network Devices',        category: 'system'  },
  { id: 'sunmoon',      label: 'Sun & Moon',             category: 'info'    },
  { id: 'news',         label: 'News',                   category: 'info'    },
  { id: 'picow',        label: 'Pico W',                 category: 'sensor'  },
  { id: 'backup',       label: 'Backup',                 category: 'system'  },
]

interface WidgetDef   { id: string; label: string; category: string }
interface LayoutEntry { id: string; visible: boolean }

function loadLayout(): LayoutEntry[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const saved: LayoutEntry[] = JSON.parse(raw)
      const savedIds = new Set(saved.map(e => e.id))
      return [
        ...saved,
        ...DEFAULT_WIDGETS.filter(w => !savedIds.has(w.id)).map(w => ({ id: w.id, visible: true })),
      ]
    }
  } catch {}
  return DEFAULT_WIDGETS.map(w => ({ id: w.id, visible: true }))
}

function saveLayout(layout: LayoutEntry[]) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
}

const CAT_COLOR: Record<string, string> = {
  control: 'var(--card-temp-accent)',
  sensor:  'var(--card-hum-accent)',
  system:  'var(--card-raspi-accent)',
  info:    'var(--card-air-accent)',
}

// ── Widget shells ──────────────────────────────────────────
function Widget({ section, icon: Icon, label, sublabel, onNavigate, children }: any) {
  return (
    <div onClick={onNavigate} style={{
      background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', cursor:onNavigate?'pointer':'default',
      display:'flex', flexDirection:'column', overflow:'hidden',
      transition:'border-color var(--transition)', height:'100%',
    }}
      onMouseEnter={e=>{ if(onNavigate)(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-strong)' }}
      onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--border)'}
    >
      <div style={{ padding:'clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem) 0',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ width:'clamp(28px,5vw,36px)', height:'clamp(28px,5vw,36px)',
          borderRadius:'var(--radius-md)',
          background:`var(--card-${section}-bg)`, color:`var(--card-${section}-accent)`,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={16}/>
        </div>
        {onNavigate && <ChevronRight size={12} style={{ color:'var(--text-muted)' }}/>}
      </div>
      <div style={{ padding:'0.5rem clamp(0.65rem,2vw,1.1rem) 0' }}>
        <div style={{ fontSize:'clamp(0.7rem,2vw,0.82rem)', fontWeight:600,
          color:'var(--text-primary)', lineHeight:1.2 }}>{label}</div>
        <div style={{ fontSize:'clamp(0.6rem,1.5vw,0.72rem)', color:'var(--text-muted)',
          marginTop:'0.15rem', fontFamily:'var(--font-mono)' }}>
          {sublabel || '\u00a0'}
        </div>
      </div>
      <div style={{ flex:1, padding:`0.5rem clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem)`,
        display:'flex', alignItems:'flex-end' }}>
        {children}
      </div>
    </div>
  )
}

function ToggleWidget({ section, icon, label, sublabel, isOn, loading, onToggle, onNavigate }: any) {
  const [pressed, setPressed] = useState(false)
  return (
    <Widget section={section} icon={icon} label={label} sublabel={sublabel} onNavigate={onNavigate}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(1.1rem,4vw,1.5rem)',
          fontWeight:700, letterSpacing:'-0.5px',
          color:loading||isOn===null?'var(--text-muted)':isOn?'var(--color-success)':'var(--color-danger)',
          transition:'color 0.3s' }}>
          {loading||isOn===null?'…':isOn?'ON':'OFF'}
        </div>
        <button
          onMouseDown={()=>setPressed(true)} onMouseUp={()=>setPressed(false)}
          onMouseLeave={()=>setPressed(false)}
          onTouchStart={e=>{e.stopPropagation();setPressed(true)}}
          onTouchEnd={e=>{e.stopPropagation();setPressed(false);onToggle()}}
          onClick={e=>{e.stopPropagation();onToggle()}}
          disabled={loading||isOn===null}
          style={{ width:'clamp(40px,8vw,52px)', height:'clamp(24px,5vw,30px)',
            borderRadius:15, border:'none', padding:0,
            background:isOn?'var(--color-success)':'var(--color-danger)',
            cursor:loading?'not-allowed':'pointer', position:'relative',
            transition:'background 0.28s ease, transform 0.1s',
            transform:pressed?'scale(0.9)':'scale(1)',
            boxShadow:isOn?'0 0 12px rgba(52,199,89,0.4)':'0 0 12px rgba(255,59,48,0.3)',
            opacity:(loading||isOn===null)?0.5:1, flexShrink:0 }}>
          <div style={{ position:'absolute',
            top:'clamp(2px,0.5vw,3px)',
            left:isOn?'clamp(18px,4vw,25px)':'clamp(2px,0.5vw,3px)',
            width:'clamp(18px,4vw,24px)', height:'clamp(18px,4vw,24px)',
            borderRadius:'50%', background:'#fff',
            transition:'left 0.28s cubic-bezier(0.4,0,0.2,1)',
            boxShadow:'0 1px 3px rgba(0,0,0,0.25)' }}/>
        </button>
      </div>
    </Widget>
  )
}

function DualWidget({ section, icon, label, sublabel, onNavigate,
  val1, unit1, tag1, color1, val2, unit2, tag2, color2 }: any) {
  return (
    <Widget section={section} icon={icon} label={label} sublabel={sublabel} onNavigate={onNavigate}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.4rem', width:'100%' }}>
        {[{v:val1,u:unit1,t:tag1,c:color1},{v:val2,u:unit2,t:tag2,c:color2}].map((item,i)=>(
          <div key={i} style={{ background:'var(--bg-surface-2)', borderRadius:'var(--radius-md)',
            padding:'clamp(0.4rem,1.5vw,0.75rem) clamp(0.35rem,1.5vw,0.65rem)', textAlign:'center' }}>
            <div style={{ fontSize:'0.55rem', fontWeight:600, letterSpacing:'0.5px',
              textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'0.3rem' }}>{item.t}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(1rem,3.5vw,1.4rem)',
              fontWeight:500, color:item.c, lineHeight:1 }}>
              {item.v??'—'}
              {item.u&&item.v!=null&&<span style={{ fontSize:'clamp(0.6rem,1.5vw,0.75rem)',
                color:'var(--text-muted)', fontWeight:400 }}>{item.u}</span>}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  )
}

function StatWidget({ section, icon, label, sublabel, onNavigate, value, unit, color }: any) {
  const c = color || `var(--card-${section}-accent)`
  return (
    <Widget section={section} icon={icon} label={label} sublabel={sublabel} onNavigate={onNavigate}>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(1.5rem,5vw,2.5rem)',
        fontWeight:500, color:c, lineHeight:1, display:'flex', alignItems:'baseline', gap:'0.2rem' }}>
        {value??'—'}
        {unit&&value!=null&&<span style={{ fontSize:'clamp(0.75rem,2vw,1rem)',
          color:'var(--text-muted)', fontWeight:400 }}>{unit}</span>}
      </div>
    </Widget>
  )
}

// ── News widget ────────────────────────────────────────────
function NewsWidget() {
  const [items,   setItems]   = useState<{title:string; link:string; date:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(false)
      try {
        const res  = await fetch('/api/news', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        const entries = (json.items ?? []).map((item: any) => ({
          title: item.title?.trim() ?? '',
          link:  item.link  ?? '#',
          date:  item.date  ?? '',
        }))
        if (!entries.length) throw new Error('empty')
        setItems(entries)
      } catch { setError(true) }
      finally  { setLoading(false) }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const fmtDate = (raw: string) => {
    try {
      const d = new Date(raw)
      return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })
    } catch { return '' }
  }

  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', display:'flex', flexDirection:'column',
      overflow:'hidden', height:'100%' }}>
      <div style={{ padding:'clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem) 0',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ width:'clamp(28px,5vw,36px)', height:'clamp(28px,5vw,36px)',
          borderRadius:'var(--radius-md)', background:'var(--card-air-bg)',
          color:'var(--card-air-accent)', display:'flex', alignItems:'center',
          justifyContent:'center', flexShrink:0 }}>
          <Newspaper size={16}/>
        </div>
      </div>
      <div style={{ padding:'0.5rem clamp(0.65rem,2vw,1.1rem) 0' }}>
        <div style={{ fontSize:'clamp(0.7rem,2vw,0.82rem)', fontWeight:600,
          color:'var(--text-primary)', lineHeight:1.2 }}>News</div>
        <div style={{ fontSize:'clamp(0.6rem,1.5vw,0.72rem)', color:'var(--text-muted)',
          marginTop:'0.15rem', fontFamily:'var(--font-mono)' }}>BBC World · ogni 5 min</div>
      </div>
      <div style={{ flex:1, padding:'clamp(0.5rem,2vw,0.75rem) clamp(0.65rem,2vw,1.1rem)' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem',
            color:'var(--text-muted)', fontSize:'0.75rem' }}>
            <RefreshCw size={12} style={{ animation:'spin 0.8s linear infinite' }}/> Caricamento...
          </div>
        ) : error ? (
          <div style={{ color:'var(--color-danger)', fontSize:'0.72rem',
            fontFamily:'var(--font-mono)' }}>Feed non disponibile</div>
        ) : items.map((item, i) => (
          <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between',
              gap:'0.5rem', padding:'0.35rem 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration:'none' }}>
            <span style={{ fontSize:'clamp(0.65rem,1.8vw,0.75rem)', color:'var(--text-primary)',
              lineHeight:1.35, flex:1,
              display:'-webkit-box', WebkitLineClamp:2,
              WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {item.title}
            </span>
            {item.date && (
              <span style={{ fontSize:'0.6rem', color:'var(--text-muted)',
                fontFamily:'var(--font-mono)', flexShrink:0 }}>
                {fmtDate(item.date)}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Pico W widget ──────────────────────────────────────────
interface PicoLog {
  id: number; level: string; message: string
  created_at: string; device_id: string
}

function PicoWidget({ onNavigate }: { onNavigate: () => void }) {
  const [log,     setLog]     = useState<PicoLog | null>(null)
  const [online,  setOnline]  = useState<boolean | null>(null)
  const [lastLog, setLastLog] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [aqi,     setAqi]     = useState<number | null>(null)

  const levelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'SENSOR':  return 'var(--card-hum-accent)'
      case 'INFO':    return 'var(--card-air-accent)'
      case 'WARNING': return 'var(--color-warning)'
      case 'ERROR':   return 'var(--color-danger)'
      case 'SUCCESS': return 'var(--color-success)'
      default:        return 'var(--text-muted)'
    }
  }

  const aqiColor  = (v: number) => v >= 80 ? 'var(--color-success)' : v >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'
  const aqiLabel  = (v: number) => v >= 80 ? 'Good' : v >= 60 ? 'Moderate' : v >= 40 ? 'Poor' : 'Hazardous'
  const parseAqi = (msg: string): number | null => {
    const m = msg.match(/aqi\s*[:=]\s*([\d.]+)/i)
    return m ? parseFloat(m[1]) : null}
  const parseTs   = (raw: string): Date | null => {
    try { const d = new Date(raw.replace(' ','T').replace(/(\.(\d{3}))\d+/,'$1')); return isNaN(d.getTime()) ? null : d }
    catch { return null }
  }

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/pico-logs?limit=20', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        if (data?.logs?.length) {

          // 🔥 prendi ultimo log SENSOR (non l'ultimo generico)
          const sensorLog = [...data.logs]
            .reverse()
            .find((l: PicoLog) => l.level === 'SENSOR')

          const entry = sensorLog ?? data.logs[data.logs.length - 1]

          setLog(entry)

          // AQI solo se è SENSOR
          if (entry.level === 'SENSOR') {
            setAqi(parseAqi(entry.message))
          } else {
            setAqi(null)
          }

          // timestamp / online status
          const d = parseTs(entry.created_at)
          if (d) {
            const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)

            setLastLog(
              diffMin < 1
                ? 'just now'
                : diffMin < 60
                  ? `${diffMin}m ago`
                  : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
            )

            setOnline(diffMin >= 0 && diffMin < 5)
          } else {
            setOnline(false)
          }

        } else {
          setOnline(false)
        }

      } catch {
        setOnline(false)
      } finally {
        setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div onClick={onNavigate} style={{
      background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', cursor:'pointer',
      display:'flex', flexDirection:'column', overflow:'hidden',
      transition:'border-color var(--transition)', height:'100%',
    }}
      onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-strong)'}
      onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--border)'}
    >
      <div style={{ padding:'clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem) 0',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ width:'clamp(28px,5vw,36px)', height:'clamp(28px,5vw,36px)',
          borderRadius:'var(--radius-md)', background:'var(--card-hum-bg)',
          color:'var(--card-hum-accent)', display:'flex', alignItems:'center',
          justifyContent:'center', flexShrink:0 }}>
          <Radio size={16}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
            background: online===null ? 'var(--text-muted)' : online ? 'var(--color-success)' : 'var(--color-danger)',
            boxShadow: online ? '0 0 6px var(--color-success)' : 'none' }}/>
          <span style={{ fontSize:'0.6rem', fontFamily:'var(--font-mono)',
            color: online===null ? 'var(--text-muted)' : online ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {online===null ? '…' : online ? 'online' : 'offline'}
          </span>
          <ChevronRight size={12} style={{ color:'var(--text-muted)' }}/>
        </div>
      </div>
      <div style={{ padding:'0.5rem clamp(0.65rem,2vw,1.1rem) 0' }}>
        <div style={{ fontSize:'clamp(0.7rem,2vw,0.82rem)', fontWeight:600, color:'var(--text-primary)', lineHeight:1.2 }}>Pico W</div>
        <div style={{ fontSize:'clamp(0.6rem,1.5vw,0.72rem)', color:'var(--text-muted)', marginTop:'0.15rem', fontFamily:'var(--font-mono)' }}>
          {lastLog ? `last log: ${lastLog}` : 'Air quality sensor'}
        </div>
      </div>
      <div style={{ flex:1, padding:`0.5rem clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem)`, display:'flex', alignItems:'flex-end' }}>
        {loading ? (
          <div style={{ color:'var(--text-muted)', fontFamily:'var(--font-mono)', fontSize:'1.2rem' }}>…</div>
        ) : log ? (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.4rem', width:'100%' }}>
            <div style={{ background:'var(--bg-surface-2)', borderRadius:'var(--radius-md)',
              padding:'clamp(0.4rem,1.5vw,0.75rem) clamp(0.35rem,1.5vw,0.65rem)', textAlign:'center',
              display:'flex', flexDirection:'column', justifyContent:'center', gap:'0.25rem' }}>
              <div style={{ fontSize:'0.55rem', fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-muted)' }}>AQI</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(1rem,3.5vw,1.4rem)', fontWeight:700, lineHeight:1,
                color: aqi!=null ? aqiColor(aqi) : 'var(--text-muted)' }}>
                {aqi!=null ? aqi.toFixed(0) : '—'}
              </div>
              {aqi!=null && <div style={{ fontSize:'0.58rem', fontWeight:600, color:aqiColor(aqi), fontFamily:'var(--font-mono)' }}>{aqiLabel(aqi)}</div>}
            </div>
            <div style={{ background:'var(--bg-surface-2)', borderRadius:'var(--radius-md)',
              padding:'clamp(0.4rem,1.5vw,0.75rem) clamp(0.35rem,1.5vw,0.65rem)',
              display:'flex', flexDirection:'column', justifyContent:'center', gap:'0.3rem' }}>
              <span style={{ alignSelf:'flex-start', fontSize:'0.55rem', fontWeight:700, letterSpacing:'0.06em',
                textTransform:'uppercase', fontFamily:'var(--font-mono)', padding:'0.15rem 0.4rem', borderRadius:4,
                background:`color-mix(in srgb, ${levelColor(log.level)} 15%, transparent)`,
                color:levelColor(log.level), border:`1px solid color-mix(in srgb, ${levelColor(log.level)} 30%, transparent)` }}>
                {log.level}
              </span>
              <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)', lineHeight:1.4 }}>
                <div style={{ fontSize:'0.55rem', fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:'0.25rem' }}>timestamp</div>
                <div style={{ color:'var(--text-primary)' }}>
                  {new Date(log.created_at)?.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) ?? '—'}
                </div>
                <div style={{ opacity:0.6, marginTop:'0.1rem' }}>
                  {new Date(log.created_at)?.toLocaleDateString('it-IT') ?? ''}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>No logs available</div>
        )}
      </div>
    </div>
  )
}

// ── Backup widget ──────────────────────────────────────────
function BackupWidget() {
  const [backing,  setBacking]  = useState(false)
  const [lastDate, setLastDate] = useState<string | null>(null)
  const [status,   setStatus]   = useState<'idle'|'running'|'done'|'error'>('idle')

  useEffect(() => {
    const saved = localStorage.getItem('smarthome:last_backup')
    if (saved) setLastDate(saved)
  }, [])

  const runBackup = async (e: React.MouseEvent) => {
    e.stopPropagation(); setBacking(true); setStatus('running')
    try {
      await fetch('/api_run_backup', { method:'POST' })
      const now = new Date().toLocaleString('it-IT')
      setLastDate(now); localStorage.setItem('smarthome:last_backup', now); setStatus('done')
    } catch { setStatus('error') }
    finally { setBacking(false); setTimeout(() => setStatus('idle'), 4000) }
  }

  const statusColor = { idle:'var(--text-muted)', running:'var(--color-warning)', done:'var(--color-success)', error:'var(--color-danger)' }[status]
  const statusLabel = { idle: lastDate ? `Ultimo: ${lastDate}` : 'Nessun backup', running:'In corso…', done:'Completato', error:'Errore' }[status]

  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-lg)', display:'flex', flexDirection:'column',
      overflow:'hidden', height:'100%' }}>
      <div style={{ padding:'clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem) 0',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ width:'clamp(28px,5vw,36px)', height:'clamp(28px,5vw,36px)',
          borderRadius:'var(--radius-md)', background:'var(--card-air-bg)',
          color:'var(--card-air-accent)', display:'flex', alignItems:'center',
          justifyContent:'center', flexShrink:0 }}>
          <Shield size={16}/>
        </div>
      </div>
      <div style={{ padding:'0.5rem clamp(0.65rem,2vw,1.1rem) 0' }}>
        <div style={{ fontSize:'clamp(0.7rem,2vw,0.82rem)', fontWeight:600, color:'var(--text-primary)', lineHeight:1.2 }}>Backup</div>
        <div style={{ fontSize:'clamp(0.6rem,1.5vw,0.72rem)', fontFamily:'var(--font-mono)', marginTop:'0.15rem', color:statusColor, transition:'color 0.3s' }}>{statusLabel}</div>
      </div>
      <div style={{ flex:1, padding:`0.5rem clamp(0.65rem,2vw,1.1rem) clamp(0.65rem,2vw,1.1rem)`, display:'flex', alignItems:'flex-end' }}>
        <button onClick={runBackup} disabled={backing} className="btn btn--primary"
          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', fontSize:'clamp(0.68rem,2vw,0.78rem)', padding:'0.5rem' }}>
          {backing
            ? <><RefreshCw size={12} style={{ animation:'spin 0.8s linear infinite' }}/> In corso…</>
            : <><Shield size={12}/> Avvia backup</>}
        </button>
      </div>
    </div>
  )
}

// ── Refresh bar ────────────────────────────────────────────
function RefreshBar({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const pct = ((total - secondsLeft) / total) * 100
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
      <div style={{ flex:1, height:2, background:'var(--border)', borderRadius:1, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:'var(--accent)', borderRadius:1, transition:'width 1s linear' }}/>
      </div>
      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.62rem', color:'var(--text-muted)', flexShrink:0, minWidth:28, textAlign:'right' }}>
        {secondsLeft}s
      </span>
    </div>
  )
}

// ── Draggable slot ─────────────────────────────────────────
function DraggableSlot({ id, editMode, isDragOver, onDragStart, onDragOver, onDragEnd, onDrop, children }: {
  id: string; editMode: boolean; isDragOver: boolean
  onDragStart: (id: string) => void; onDragOver: (id: string) => void
  onDragEnd: () => void; onDrop: (id: string) => void
  children: React.ReactNode
}) {
  const ghost = useRef<HTMLDivElement | null>(null)
  const touchActive = useRef(false)

  const createGhost = (sourceEl: HTMLElement) => {
    const rect = sourceEl.getBoundingClientRect()
    const div = document.createElement('div')
    div.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;opacity:0.72;pointer-events:none;z-index:9999;border-radius:var(--radius-lg,12px);border:2px dashed var(--accent,#0066cc);background:var(--bg-surface,#fff);box-shadow:0 10px 32px rgba(0,0,0,0.22);`
    document.body.appendChild(div); ghost.current = div
  }
  const moveGhost = (x: number, y: number) => {
    if (!ghost.current) return
    ghost.current.style.left = `${x - parseFloat(ghost.current.style.width) / 2}px`
    ghost.current.style.top  = `${y - parseFloat(ghost.current.style.height) / 2}px`
  }
  const removeGhost = () => { ghost.current?.remove(); ghost.current = null }
  const getTargetId = (x: number, y: number): string | null => {
    if (ghost.current) ghost.current.style.display = 'none'
    const el = document.elementFromPoint(x, y)
    if (ghost.current) ghost.current.style.display = ''
    return (el?.closest('[data-draggable-id]') as HTMLElement | null)?.dataset.draggableId ?? null
  }

  return (
    <div data-draggable-id={id} draggable={editMode}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(id) }}
      onDragOver={e => { e.preventDefault(); onDragOver(id) }}
      onDragEnd={onDragEnd}
      onDrop={e => { e.preventDefault(); onDrop(id) }}
      onTouchStart={e => { if (!editMode) return; touchActive.current = true; createGhost(e.currentTarget as HTMLElement); onDragStart(id) }}
      onTouchMove={e => {
        if (!editMode || !touchActive.current) return; e.preventDefault()
        const t = e.changedTouches[0]; moveGhost(t.clientX, t.clientY)
        const tid = getTargetId(t.clientX, t.clientY); if (tid && tid !== id) onDragOver(tid)
      }}
      onTouchEnd={e => {
        if (!editMode || !touchActive.current) return; touchActive.current = false
        const t = e.changedTouches[0]; const tid = getTargetId(t.clientX, t.clientY)
        removeGhost(); if (tid && tid !== id) onDrop(tid); else onDragEnd()
      }}
      style={{
        position:'relative',
        outline: isDragOver ? '2px dashed var(--accent)' : '2px dashed transparent',
        borderRadius:'var(--radius-lg)', transition:'outline 0.15s, opacity 0.15s',
        opacity: isDragOver ? 0.55 : 1,
        cursor: editMode ? 'grab' : 'default',
        touchAction: editMode ? 'none' : 'auto',
      }}
    >
      {editMode && (
        <div style={{ position:'absolute', top:6, left:6, zIndex:10, color:'var(--text-muted)', pointerEvents:'none' }}>
          <GripVertical size={14}/>
        </div>
      )}
      <div style={{ pointerEvents: editMode ? 'none' : 'auto', height:'100%' }}>{children}</div>
    </div>
  )
}

// ── Settings panel ─────────────────────────────────────────
function SettingsPanel({ layout, onToggleVisible, onReset, onClose }: {
  layout: LayoutEntry[]; onToggleVisible: (id: string) => void; onReset: () => void; onClose: () => void
}) {
  const categories = Array.from(new Set(DEFAULT_WIDGETS.map(w => w.category)))
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }} onClick={onClose}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'var(--radius-lg)',
        border:'1px solid var(--border)', width:'100%', maxWidth:420,
        maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'1rem 1.25rem', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontWeight:600, fontSize:'0.9rem' }}>Widget visibility</span>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button className="btn btn--ghost btn--sm" onClick={onReset}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <RotateCcw size={12}/> Reset
            </button>
            <button className="btn btn--ghost btn--sm" onClick={onClose}><X size={14}/></button>
          </div>
        </div>
        <div style={{ overflowY:'auto', padding:'0.75rem 1.25rem 1.25rem' }}>
          {categories.map(cat => {
            const widgets = DEFAULT_WIDGETS.filter(w => w.category === cat)
            return (
              <div key={cat} style={{ marginTop:'0.75rem' }}>
                <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase',
                  letterSpacing:'0.07em', color: CAT_COLOR[cat] || 'var(--text-muted)',
                  marginBottom:'0.4rem', fontFamily:'var(--font-mono)' }}>{cat}</div>
                {widgets.map(w => {
                  const entry   = layout.find(e => e.id === w.id)
                  const visible = entry?.visible ?? true
                  return (
                    <div key={w.id} onClick={() => onToggleVisible(w.id)}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'0.5rem 0.75rem', borderRadius:'var(--radius-md)',
                        cursor:'pointer', marginBottom:'0.2rem',
                        background: visible ? 'transparent' : 'var(--bg-muted)', transition:'background 0.15s' }}
                      onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.background='var(--bg-surface-2)'}
                      onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.background=visible?'transparent':'var(--bg-muted)'}
                    >
                      <span style={{ fontSize:'0.82rem', color: visible ? 'var(--text-primary)' : 'var(--text-muted)',
                        textDecoration: visible ? 'none' : 'line-through' }}>{w.label}</span>
                      {visible
                        ? <Eye size={14} style={{ color:'var(--color-success)', flexShrink:0 }}/>
                        : <EyeOff size={14} style={{ color:'var(--text-muted)', flexShrink:0 }}/>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div style={{ padding:'0.75rem 1.25rem', borderTop:'1px solid var(--border)',
          fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-muted)' }}>
          Drag widgets in the dashboard to reorder them
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function HomePage() {
  const nav = useNavigate()
  const { permission, request, send } = useNotifications()
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [showSettings,    setShowSettings]    = useState(false)
  const [editMode,        setEditMode]        = useState(false)
  const [layout,          setLayout]          = useState<LayoutEntry[]>(loadLayout)

  const dragId    = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const [temp,       setTemp]       = useState<string | null>(null)
  const [hum,        setHum]        = useState<string | null>(null)
  const [tempMM,     setTempMM]     = useState<string | null>(null)
  const [humMM,      setHumMM]      = useState<string | null>(null)
  const [cpu,        setCpu]        = useState<string | null>(null)
  const [raspiTemp,  setRaspiTemp]  = useState<string | null>(null)
  const [alarm,      setAlarm]      = useState<boolean | null>(null)
  const [boilerOn,   setBoilerOn]   = useState<boolean | null>(null)
  const [thermostat, setThermostat] = useState<any>(null)
  const [alarmLoading,  setAlarmLoading]  = useState(false)
  const [boilerLoading, setBoilerLoading] = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)
  const [lastUpdate,    setLastUpdate]    = useState<Date | null>(null)
  const [countdown,     setCountdown]     = useState(REFRESH_INTERVAL)

  // ── Nuovi state per la barra ───────────────────────────
  const [aqi,     setAqi]     = useState<number | null>(null)
  const [sunrise, setSunrise] = useState<string | null>(null)
  const [sunset,  setSunset]  = useState<string | null>(null)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { saveLayout(layout) }, [layout])

  useEffect(() => {
    if (permission === 'default') {
      const t = setTimeout(() => setShowNotifBanner(true), 3000)
      return () => clearTimeout(t)
    }
  }, [permission])

  const resetCountdown = () => {
    setCountdown(REFRESH_INTERVAL)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() =>
      setCountdown(c => c <= 1 ? REFRESH_INTERVAL : c - 1), 1000)
  }

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    await Promise.allSettled([
      api.getSensors().then((d: any) => {
        setTemp(parseFloat(d.temperature.current).toFixed(1))
        setHum(parseFloat(d.humidity.current).toFixed(0))
        const tMM = d.temperature.minMaxLast24Hours
        const hMM = d.humidity.minMaxLast24Hours
        setTempMM(`${parseFloat(tMM[0]).toFixed(1)} / ${parseFloat(tMM[1]).toFixed(1)}`)
        setHumMM(`${parseFloat(hMM[0]).toFixed(0)} / ${parseFloat(hMM[1]).toFixed(0)}`)
      }).catch(() => {}),

      fetch('/api_raspberry_pi_stats').then(r => r.json()).then((d: any) => {
        setCpu(parseFloat(d.cpuUsage || 0).toFixed(1))
        setRaspiTemp(parseFloat(d.temperature || 0).toFixed(1))
      }).catch(() => {}),

      api.getAlarm().then(([s]: [string]) => setAlarm(s === 'true')).catch(() => {}),

      Promise.all([api.getBoilerStatus(), api.getThermostatFull()])
        .then(([b, t]: [any, any]) => { setBoilerOn(b.is_on); setThermostat(t.thermostat_enabled) })
        .catch(() => {}),


      // ── Alba e tramonto ───────────────────────────────
      fetch('/api/sunmoon')
        .then(r => r.json())
        .then((d: any) => {
          setSunrise(d.sunrise ?? null)
          setSunset(d.sunset  ?? null)
        }).catch(() => {}),
    ])
    setLastUpdate(new Date())
    resetCountdown()
    if (!silent) setRefreshing(false)
  }, [])

  useEffect(() => {
    loadAll()
    const id = setInterval(() => loadAll(true), REFRESH_INTERVAL * 1000)
    return () => {
      clearInterval(id)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [loadAll])

  const toggleAlarm = async () => {
    setAlarmLoading(true)
    try {
      await api.toggleAlarm(!alarm)
      await api.getAlarm().then(([s]: [string]) => {
        const v = s === 'true'
        setAlarm(v)
        send(v ? 'Alarm ACTIVATED' : 'Alarm deactivated',
          v ? 'Home alarm has been turned ON' : 'Home alarm has been turned OFF')
      })
    } catch {} finally { setAlarmLoading(false) }
  }

  const toggleBoiler = async () => {
    setBoilerLoading(true)
    try {
      if (thermostat) await api.thermostatOff()
      await api.manualBoiler(!boilerOn)
      const b = await api.getBoilerStatus()
      setBoilerOn(b.is_on)
      send(b.is_on ? '🔥 Boiler ON' : '❄️ Boiler OFF',
        b.is_on ? 'The boiler has been turned on' : 'The boiler has been turned off')
    } catch {} finally { setBoilerLoading(false) }
  }

  const toggleVisible = (id: string) =>
    setLayout(prev => prev.map(e => e.id === id ? { ...e, visible: !e.visible } : e))

  const resetLayout = () =>
    setLayout(DEFAULT_WIDGETS.map(w => ({ id: w.id, visible: true })))

  const handleDragStart = (id: string) => { dragId.current = id }
  const handleDragOver  = (targetId: string) => { if (targetId !== dragId.current) setDragOverId(targetId) }
  const handleDragEnd   = () => { setDragOverId(null); dragId.current = null }
  const handleDrop      = (targetId: string) => {
    const fromId = dragId.current
    if (!fromId || fromId === targetId) { setDragOverId(null); return }
    setLayout(prev => {
      const next = [...prev]
      const fi = next.findIndex(e => e.id === fromId)
      const ti = next.findIndex(e => e.id === targetId)
      if (fi < 0 || ti < 0) return prev
      const [moved] = next.splice(fi, 1)
      next.splice(ti, 0, moved)
      return next
    })
    setDragOverId(null); dragId.current = null
  }

  const renderWidget = (id: string) => {
    switch (id) {
      case 'calendar':     return <CalendarWidget />
      case 'alarm':        return (
        <ToggleWidget section="sec" icon={Bell} label="Home Alarm" sublabel="Security system"
          isOn={alarm} loading={alarmLoading} onToggle={toggleAlarm} onNavigate={() => nav('/security')}/>
      )
      case 'boiler':       return (
        <ToggleWidget section="temp" icon={Flame} label="Boiler"
          sublabel={thermostat ? 'Thermostat active' : 'Manual control'}
          isOn={boilerOn} loading={boilerLoading} onToggle={toggleBoiler} onNavigate={() => nav('/temperature')}/>
      )
      case 'environment':  return (
        <DualWidget section="hum" icon={Thermometer} label="Environment" sublabel="Temperature & Humidity"
          onNavigate={() => nav('/temperature')}
          val1={temp} unit1="°C" tag1="Temp"     color1="var(--card-temp-accent)"
          val2={hum}  unit2="%" tag2="Humidity"  color2="var(--card-hum-accent)"/>
      )
      case 'raspi':        return (
        <DualWidget section="raspi" icon={Cpu} label="Raspberry Pi" sublabel="System status"
          onNavigate={() => nav('/raspi')}
          val1={cpu}       unit1="%" tag1="CPU"
          color1={cpu && parseFloat(cpu) > 80 ? 'var(--color-danger)' : 'var(--card-raspi-accent)'}
          val2={raspiTemp} unit2="°C" tag2="Temp"
          color2={raspiTemp && parseFloat(raspiTemp) > 70 ? 'var(--color-danger)' : 'var(--card-temp-accent)'}/>
      )
      case 'weather':      return <WeatherWidget />
      case 'ping':         return <PingWidget onNavigate={() => {}} />
      case 'train':        return <TrainWidget />
      case 'air_external': return <AirQualityExternalWidget />
      case 'on_this_day':  return <OnThisDayWidget />
      case 'recipe':       return <RecipeWidget />
      case 'network':      return <NetworkDevicesWidget />
      case 'sunmoon':      return <SunMoonWidget />
      case 'news':         return <NewsWidget />
      case 'picow':        return <PicoWidget onNavigate={() => nav('/air-quality')} />
      case 'backup':       return <BackupWidget />
      default:             return null
    }
  }

  const visibleLayout = layout.filter(e => e.visible)
  const hiddenCount   = layout.filter(e => !e.visible).length

  // ── Colore AQI ─────────────────────────────────────────
  const aqiColor = aqi != null
    ? aqi >= 80 ? 'var(--color-success)' : aqi >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'
    : 'var(--text-muted)'
  const aqiLabel = aqi != null
    ? aqi >= 80 ? 'Good' : aqi >= 60 ? 'Moderate' : 'Poor'
    : ''

  return (
    <div className="animate-fade">

      {/* Header */}
      <div style={{ marginBottom:'1.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          flexWrap:'wrap', gap:'0.75rem', marginBottom:'0.6rem' }}>
          <div>
            <h1 className="page-title" style={{ fontSize:'clamp(1.4rem,4vw,2rem)' }}>
              Smart<span style={{ color:'var(--accent)' }}>House</span>
            </h1>
            <p style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem',
              color:'var(--text-muted)', letterSpacing:'0.5px', marginTop:'0.2rem' }}>
              {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString('it-IT')}` : 'Loading...'}
            </p>
          </div>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
            <button className={editMode ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm'}
              onClick={() => setEditMode(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <GripVertical size={13}/>{editMode ? 'Done' : 'Reorder'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowSettings(true)}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem', position:'relative' }}>
              <Settings size={13}/> Widgets
              {hiddenCount > 0 && (
                <span style={{ position:'absolute', top:-4, right:-4, minWidth:16, height:16,
                  borderRadius:99, background:'var(--accent)', color:'#fff',
                  fontFamily:'var(--font-mono)', fontSize:'0.6rem', fontWeight:700,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px' }}>
                  {hiddenCount}
                </span>
              )}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => loadAll()} disabled={refreshing}>
              <RefreshCw size={13} style={{ animation:refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
              {refreshing ? 'Refreshing...' : 'Refresh all'}
            </button>
          </div>
        </div>
        <RefreshBar secondsLeft={countdown} total={REFRESH_INTERVAL}/>
      </div>

      {/* Edit mode hint */}
      {editMode && (
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem',
          padding:'0.6rem 0.875rem', marginBottom:'0.875rem',
          background:'var(--accent-light)', border:'1px solid rgba(0,102,204,0.2)',
          borderRadius:'var(--radius-md)', fontSize:'0.78rem', color:'var(--text-primary)' }}>
          <GripVertical size={13} style={{ color:'var(--accent)', flexShrink:0 }}/>
          Drag widgets to reorder them. Click <strong>Done</strong> when finished.
        </div>
      )}

      {/* Notification banner */}
      {showNotifBanner && permission === 'default' && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          gap:'1rem', padding:'0.75rem 1rem', marginBottom:'1rem',
          background:'var(--accent-light)', border:'1px solid rgba(0,102,204,0.2)',
          borderRadius:'var(--radius-md)', flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            <Bell size={14} style={{ color:'var(--accent)', flexShrink:0 }}/>
            <span style={{ fontSize:'0.8rem', color:'var(--text-primary)' }}>
              Enable notifications for alarm &amp; boiler alerts
            </span>
          </div>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            <button className="btn btn--primary btn--sm"
              onClick={async () => { await request(); setShowNotifBanner(false) }}>Enable</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowNotifBanner(false)}>Not now</button>
          </div>
        </div>
      )}

      {/* Widget grid */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
        gap:'0.625rem', alignItems:'stretch',
      }}>
        {visibleLayout.map(({ id }) => (
          <DraggableSlot key={id} id={id} editMode={editMode} isDragOver={dragOverId === id}
            onDragStart={handleDragStart} onDragOver={handleDragOver}
            onDragEnd={handleDragEnd} onDrop={handleDrop}>
            {renderWidget(id)}
          </DraggableSlot>
        ))}
      </div>

      {/* ── Bottom summary bar ── */}
      {(tempMM || humMM || aqi != null || sunrise || sunset) && (
        <div style={{ display:'flex', gap:'1.25rem', flexWrap:'wrap', marginTop:'1rem',
          padding:'0.75rem 1rem', background:'var(--bg-surface)',
          border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
          alignItems:'center' }}>

          {/* Temp 24h */}
          {tempMM && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Thermometer size={12} style={{ color:'var(--card-temp-accent)', flexShrink:0 }}/>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                Temp 24h: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{tempMM} °C</span>
              </span>
            </div>
          )}

          {/* Hum 24h */}
          {humMM && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Droplets size={12} style={{ color:'var(--card-hum-accent)', flexShrink:0 }}/>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                Hum 24h: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{humMM} %</span>
              </span>
            </div>
          )}

          {/* AQI */}
          {aqi != null && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Wind size={12} style={{ color: aqiColor, flexShrink:0 }}/>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                AQI: <span style={{ color: aqiColor, fontWeight:500 }}>{aqi.toFixed(0)} · {aqiLabel}</span>
              </span>
            </div>
          )}

          {/* Sunrise */}
          {sunrise && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Sunrise size={12} style={{ color:'var(--color-warning)', flexShrink:0 }}/>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                Sunrise: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{sunrise}</span>
              </span>
            </div>
          )}

          {/* Sunset */}
          {sunset && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
              <Sunset size={12} style={{ color:'var(--card-temp-accent)', flexShrink:0 }}/>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                Sunset: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{sunset}</span>
              </span>
            </div>
          )}

        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsPanel layout={layout} onToggleVisible={toggleVisible}
          onReset={resetLayout} onClose={() => setShowSettings(false)}/>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 480px) { .page-title { font-size: 1.4rem !important; } }
      `}</style>
    </div>
  )
}