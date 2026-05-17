import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Thermometer, Droplets, Wind, Cpu, Bell, Flame, ChevronRight, RefreshCw,
         Settings, GripVertical, Eye, EyeOff, RotateCcw, X, Newspaper,
         Radio, Shield, Sunrise, Sunset, LayoutGrid, Server, Activity,
         Info, Sliders } from 'lucide-react'
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
  { id: 'calendar',     label: 'Calendar',          category: 'info'    },
  { id: 'alarm',        label: 'Home Alarm',         category: 'control' },
  { id: 'boiler',       label: 'Boiler',             category: 'control' },
  { id: 'environment',  label: 'Sensors',            category: 'sensor'  },
  { id: 'raspi',        label: 'Raspberry Pi',       category: 'system'  },
  { id: 'weather',      label: 'Weather',            category: 'info'    },
  { id: 'ping',         label: 'Ping',               category: 'system'  },
  { id: 'train',        label: 'Train',              category: 'info'    },
  { id: 'air_external', label: 'Air Quality (Ext)',  category: 'sensor'  },
  { id: 'on_this_day',  label: 'On This Day',        category: 'info'    },
  { id: 'recipe',       label: 'Recipe',             category: 'info'    },
  { id: 'network',      label: 'Network Devices',    category: 'system'  },
  { id: 'sunmoon',      label: 'Sun & Moon',         category: 'info'    },
  { id: 'news',         label: 'News',               category: 'info'    },
  { id: 'picow',        label: 'Pico W',             category: 'sensor'  },
  { id: 'backup',       label: 'Backup',             category: 'system'  },
]

// ── Tab definitions (mobile bottom nav) ───────────────────
type TabId = 'overview' | 'control' | 'sensors' | 'info'

interface NavTab {
  id: TabId
  label: string
  icon: React.ComponentType<{ size: number; strokeWidth?: number }>
  categories: string[]
  // Which specific widget IDs to pin to this tab (overrides category filter)
  pinned?: string[]
}

const NAV_TABS: NavTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutGrid,
    categories: [],
    // hand-pick the "at a glance" cards
    pinned: ['environment', 'raspi', 'weather', 'calendar'],
  },
  {
    id: 'control',
    label: 'Control',
    icon: Sliders,
    categories: ['control'],
    pinned: ['alarm', 'boiler', 'ping', 'backup'],
  },
  {
    id: 'sensors',
    label: 'Sensors',
    icon: Activity,
    categories: ['sensor'],
    pinned: ['environment', 'air_external', 'picow', 'sunmoon', 'network'],
  },
  {
    id: 'info',
    label: 'Info',
    icon: Info,
    categories: ['info'],
    pinned: ['train', 'news', 'on_this_day', 'recipe'],
  },
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

// ── Bottom Nav ─────────────────────────────────────────────
function BottomNav({
  active,
  onChange,
  alerts,
}: {
  active: TabId
  onChange: (id: TabId) => void
  alerts: number
}) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
      backdropFilter: 'blur(20px)',
    }}>
      {NAV_TABS.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, padding: '10px 0 8px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              position: 'relative', transition: 'color 0.15s',
            }}
          >
            {isActive && (
              <div style={{
                position: 'absolute', top: 0,
                left: '20%', right: '20%',
                height: 2, borderRadius: 1,
                background: 'var(--accent)',
              }} />
            )}
            <div style={{ position: 'relative' }}>
              <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
              {tab.id === 'control' && alerts > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -6,
                  width: 14, height: 14, borderRadius: '50%',
                  background: 'var(--color-danger)', color: '#fff',
                  fontSize: '0.46rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1.5px solid var(--bg-surface)',
                }}>{alerts}</span>
              )}
            </div>
            <span style={{
              fontSize: '0.60rem',
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.2px',
            }}>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Settings sheet (bottom sheet on mobile, modal on desktop) ──
function SettingsSheet({
  open,
  onClose,
  layout,
  onToggleVisible,
  onReset,
  editMode,
  setEditMode,
  isMobile,
}: {
  open: boolean
  onClose: () => void
  layout: LayoutEntry[]
  onToggleVisible: (id: string) => void
  onReset: () => void
  editMode: boolean
  setEditMode: (v: boolean) => void
  isMobile: boolean
}) {
  if (!open) return null

  const categories = Array.from(new Set(DEFAULT_WIDGETS.map(w => w.category)))

  const Inner = () => (
    <>
      {/* Edit mode toggle */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.8px', color: 'var(--text-muted)',
          marginBottom: 10, fontFamily: 'var(--font-mono)',
        }}>Layout</div>
        <div
          onClick={() => { setEditMode(!editMode); if (isMobile) onClose() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
            background: editMode
              ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
              : 'var(--bg-surface-2)',
            border: `1px solid ${editMode
              ? 'color-mix(in srgb, var(--accent) 35%, transparent)'
              : 'var(--border)'}`,
            transition: 'all 0.15s',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: editMode
              ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
              : 'rgba(148,163,184,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GripVertical size={16} style={{ color: editMode ? 'var(--accent)' : 'var(--text-muted)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Reorder widgets
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>
              Drag & drop to rearrange
            </div>
          </div>
          {/* Toggle switch */}
          <div style={{
            width: 42, height: 24, borderRadius: 999,
            background: editMode ? 'var(--accent)' : 'rgba(148,163,184,0.25)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              left: editMode ? 21 : 3, transition: 'left 0.2s',
            }} />
          </div>
        </div>
      </div>

      {/* Widget visibility */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{
            fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          }}>Widget visibility</div>
          <button
            onClick={onReset}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: '0.65rem',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>

        {categories.map(cat => {
          const widgets = DEFAULT_WIDGETS.filter(w => w.category === cat)
          return (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: '0.55rem', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.7px',
                color: CAT_COLOR[cat] || 'var(--text-muted)',
                fontFamily: 'var(--font-mono)', marginBottom: 6,
              }}>{cat}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {widgets.map(w => {
                  const entry = layout.find(e => e.id === w.id)
                  const visible = entry?.visible ?? true
                  return (
                    <button
                      key={w.id}
                      onClick={() => onToggleVisible(w.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 99,
                        background: visible
                          ? `color-mix(in srgb, ${CAT_COLOR[cat] || 'var(--accent)'} 12%, transparent)`
                          : 'var(--bg-surface-2)',
                        border: `1px solid ${visible
                          ? `color-mix(in srgb, ${CAT_COLOR[cat] || 'var(--accent)'} 30%, transparent)`
                          : 'var(--border)'}`,
                        color: visible
                          ? (CAT_COLOR[cat] || 'var(--accent)')
                          : 'var(--text-muted)',
                        fontSize: '0.70rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {visible
                        ? <Eye size={10} />
                        : <EyeOff size={10} />}
                      {w.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
        Tap a widget to show/hide it across all tabs.
      </div>
      <div style={{ height: 20 }} />
    </>
  )

  if (isMobile) {
    // Bottom sheet on mobile
    return (
      <>
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          }}
        />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          background: 'var(--bg-surface)',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.35)',
          animation: 'slideUp 0.28s cubic-bezier(.32,1.1,.42,1)',
        }}>
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(148,163,184,0.35)' }} />
          </div>
          {/* Title row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 20px 14px', flexShrink: 0,
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Settings</span>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 7px', cursor: 'pointer',
                color: 'var(--text-secondary)', lineHeight: 1,
              }}
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Inner />
          </div>
        </div>
      </>
    )
  }

  // Desktop: centered modal
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 18, width: '100%', maxWidth: 460,
            maxHeight: '88vh', overflowY: 'auto',
            position: 'relative',
            boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.1rem 1.25rem', borderBottom: '1px solid var(--border)',
            position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 10,
          }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Settings</span>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 7px', cursor: 'pointer',
                color: 'var(--text-secondary)', lineHeight: 1,
              }}
            >
              <X size={13} />
            </button>
          </div>
          <Inner />
        </div>
      </div>
    </>
  )
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
            <RefreshCw size={12} style={{ animation:'spin 0.8s linear infinite' }}/> Loading...
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
    return m ? parseFloat(m[1]) : null
  }
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
          const sensorLog = [...data.logs].reverse().find((l: PicoLog) => l.level === 'SENSOR')
          const entry = sensorLog ?? data.logs[data.logs.length - 1]
          setLog(entry)
          if (entry.level === 'SENSOR') setAqi(parseAqi(entry.message))
          else setAqi(null)
          const d = parseTs(entry.created_at)
          if (d) {
            const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
            setLastLog(diffMin < 1 ? 'just now' : diffMin < 60 ? `${diffMin}m ago` : d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }))
            setOnline(diffMin >= 0 && diffMin < 5)
          } else { setOnline(false) }
        } else { setOnline(false) }
      } catch { setOnline(false) }
      finally { setLoading(false) }
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
  const statusLabel = { idle: lastDate ? `Last: ${lastDate}` : 'No backup', running:'In progress…', done:'Completed', error:'Error' }[status]

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
            ? <><RefreshCw size={12} style={{ animation:'spin 0.8s linear infinite' }}/> In progress…</>
            : <><Shield size={12}/> Start backup</>}
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

// ── Main page ──────────────────────────────────────────────
export default function HomePage() {
  const nav = useNavigate()
  const { permission, request, send } = useNotifications()
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [showSettings,    setShowSettings]    = useState(false)
  const [editMode,        setEditMode]        = useState(false)
  const [layout,          setLayout]          = useState<LayoutEntry[]>(loadLayout)
  const [isMobile,        setIsMobile]        = useState(false)
  const [mobileTab,       setMobileTab]       = useState<TabId>('overview')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 860)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
          isOn={boilerOn} loading={boilerLoading} onToggle={toggleBoiler} onNavigate={() => nav('/floorplan')}/>
      )
      case 'environment':  return (
        <DualWidget section="hum" icon={Thermometer} label="Sensors" sublabel="Floorplan hub"
          onNavigate={() => nav('/floorplan')}
          val1={temp} unit1="°C" tag1="Temp"    color1="var(--card-temp-accent)"
          val2={hum}  unit2="%" tag2="Humidity" color2="var(--card-hum-accent)"/>
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

  // ── Resolve which widget IDs to show for current mobile tab ──
  const mobileWidgetIds = (): string[] => {
    const tab = NAV_TABS.find(t => t.id === mobileTab)!
    const pinned = tab.pinned ?? []
    // filter to only visible ones
    const visibleIds = new Set(layout.filter(e => e.visible).map(e => e.id))
    return pinned.filter(id => visibleIds.has(id))
  }

  const visibleLayout = layout.filter(e => e.visible)
  const hiddenCount   = layout.filter(e => !e.visible).length
  const alertCount    = [
    alarm === true ? 1 : 0,
    boilerOn === true ? 1 : 0,
  ].reduce((a, b) => a + b, 0)

  const aqiColor = aqi != null
    ? aqi >= 80 ? 'var(--color-success)' : aqi >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'
    : 'var(--text-muted)'
  const aqiLabel = aqi != null
    ? aqi >= 80 ? 'Good' : aqi >= 60 ? 'Moderate' : 'Poor'
    : ''

  // ════════════════════════════════════════════════════════
  // MOBILE RENDER
  // ════════════════════════════════════════════════════════
  if (isMobile) {
    const tabWidgets = mobileWidgetIds()

    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--bg-page)',
        color: 'var(--text-primary)',
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
      }}>

        {/* ── MOBILE HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 50,
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Server size={15} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                Smart<span style={{ color: 'var(--accent)' }}>House</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-success)', animation: 'lp 2s infinite', display: 'inline-block' }} />
                {lastUpdate ? lastUpdate.toLocaleTimeString('it-IT') : '…'} · {REFRESH_INTERVAL}s
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Refresh */}
            <button
              onClick={() => loadAll(true)}
              disabled={refreshing}
              style={{
                width: 36, height: 36, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>

            {/* Gear icon */}
            <button
              onClick={() => setShowSettings(true)}
              style={{
                width: 40, height: 40, borderRadius: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showSettings
                  ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                  : 'var(--bg-surface-2)',
                border: `1px solid ${showSettings
                  ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
                  : 'var(--border)'}`,
                cursor: 'pointer',
                color: showSettings ? 'var(--accent)' : 'var(--text-primary)',
                transition: 'all 0.15s',
              }}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Refresh progress bar */}
        <div style={{ padding: '0 16px', paddingTop: 8 }}>
          <RefreshBar secondsLeft={countdown} total={REFRESH_INTERVAL} />
        </div>

        {/* Notification banner */}
        {showNotifBanner && permission === 'default' && (
          <div style={{
            margin: '8px 12px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.75rem', padding: '10px 14px',
            background: 'var(--accent-light)',
            border: '1px solid rgba(59,110,255,0.16)',
            borderRadius: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                Enable notifications for alerts
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--primary btn--sm" onClick={async () => { await request(); setShowNotifBanner(false) }}>Enable</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowNotifBanner(false)}>Not now</button>
            </div>
          </div>
        )}

        {/* Edit mode banner */}
        {editMode && (
          <div style={{
            margin: '8px 12px 0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '10px 14px',
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px dashed var(--accent)',
            borderRadius: 12, fontSize: '0.72rem', color: 'var(--accent)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <GripVertical size={13} />
              Drag to reorder widgets
            </div>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => setEditMode(false)}
            >Done</button>
          </div>
        )}

        {/* ── TAB CONTENT ── */}
        <div style={{ padding: '12px 12px 0' }}>
          {tabWidgets.length === 0 ? (
            <div style={{
              padding: '3rem 1rem', textAlign: 'center',
              color: 'var(--text-secondary)', fontSize: '0.82rem',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 10 }}>🙈</div>
              All widgets in this tab are hidden.
              <div style={{ marginTop: 8 }}>
                <button className="btn btn--ghost btn--sm" onClick={() => setShowSettings(true)}>
                  <Settings size={12} /> Manage
                </button>
              </div>
            </div>
          ) : (
            <div className="bento-grid bento-grid--auto" style={{ alignItems: 'stretch' }}>
              {tabWidgets.map(id => (
                <DraggableSlot key={id} id={id} editMode={editMode} isDragOver={dragOverId === id}
                  onDragStart={handleDragStart} onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd} onDrop={handleDrop}>
                  {renderWidget(id)}
                </DraggableSlot>
              ))}
            </div>
          )}
        </div>

        {/* Summary bar (bottom of tab content) */}
        {(tempMM || humMM || sunrise || sunset) && (
          <div style={{
            margin: '12px 12px 0',
            display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
            padding: '10px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            alignItems: 'center',
          }}>
            {tempMM && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Thermometer size={11} style={{ color: 'var(--card-temp-accent)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {tempMM} °C
                </span>
              </div>
            )}
            {humMM && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Droplets size={11} style={{ color: 'var(--card-hum-accent)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {humMM} %
                </span>
              </div>
            )}
            {sunrise && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Sunrise size={11} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {sunrise}
                </span>
              </div>
            )}
            {sunset && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Sunset size={11} style={{ color: 'var(--card-temp-accent)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {sunset}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── BOTTOM NAV ── */}
        <BottomNav active={mobileTab} onChange={setMobileTab} alerts={alertCount} />

        {/* ── SETTINGS SHEET (mobile) ── */}
        <SettingsSheet
          open={showSettings} onClose={() => setShowSettings(false)}
          layout={layout} onToggleVisible={toggleVisible} onReset={resetLayout}
          editMode={editMode} setEditMode={setEditMode}
          isMobile={true}
        />

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes lp   { 0%,100%{opacity:1} 50%{opacity:0.3} }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // DESKTOP RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div className="animate-fade">

      {/* Header */}
      <section className="page-header animate-slide-up" style={{ marginBottom: '1rem' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="section-tag section-tag--act" style={{ marginBottom:'0.45rem' }}>Overview</div>
            <h1 className="page-title" style={{ fontSize:'clamp(1.7rem, 4vw, 2.65rem)', marginBottom:'0.35rem' }}>
              Smart<span style={{ color:'var(--accent)' }}>House</span>
            </h1>
            <p className="page-subtitle" style={{ maxWidth:'64ch' }}>
              A live home dashboard with the essentials up front: sensors, automations, health checks, and quick actions.
            </p>
          </div>

          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
            <button className={editMode ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm'}
              onClick={() => setEditMode(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <GripVertical size={13}/>{editMode ? 'Done' : 'Reorder'}
            </button>

            <button className="btn btn--ghost btn--sm" onClick={() => loadAll()} disabled={refreshing}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <RefreshCw size={13} style={{ animation:refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
              {refreshing ? 'Refreshing...' : 'Refresh all'}
            </button>

            {/* ── GEAR ICON ── */}
            <button
              onClick={() => setShowSettings(v => !v)}
              title="Settings"
              style={{
                width: 34, height: 34, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showSettings
                  ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
                  : 'var(--bg-surface-2)',
                border: `1px solid ${showSettings
                  ? 'color-mix(in srgb, var(--accent) 40%, transparent)'
                  : 'var(--border)'}`,
                cursor: 'pointer',
                color: showSettings ? 'var(--accent)' : 'var(--text-secondary)',
                transition: 'all 0.15s', flexShrink: 0,
                position: 'relative',
              }}
            >
              <Settings size={15} />
              {hiddenCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 99,
                  background: 'var(--accent)', color: '#fff',
                  fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>{hiddenCount}</span>
              )}
            </button>
          </div>
        </div>

        <div className="panel-strip" style={{ padding:'0.95rem 0 0' }}>
          <div className="panel-strip__item">
            <span className="panel-strip__label">Updated</span>
            <span className="panel-strip__value">{lastUpdate ? lastUpdate.toLocaleTimeString('it-IT') : 'Loading...'}</span>
          </div>
          <div className="panel-strip__item">
            <span className="panel-strip__label">Widgets</span>
            <span className="panel-strip__value">{visibleLayout.length} visible</span>
          </div>
          <div className="panel-strip__item">
            <span className="panel-strip__label">Hidden</span>
            <span className="panel-strip__value">{hiddenCount}</span>
          </div>
          <div className="panel-strip__item">
            <span className="panel-strip__label">Mode</span>
            <span className="panel-strip__value">{editMode ? 'Reordering' : 'View'}</span>
          </div>
        </div>

        <div style={{ marginTop:'0.9rem' }}>
          <RefreshBar secondsLeft={countdown} total={REFRESH_INTERVAL}/>
        </div>
      </section>

      {/* Edit mode hint */}
      {editMode && (
        <div className="card animate-slide-up" style={{
          display:'flex', alignItems:'center', gap:'0.5rem',
          padding:'0.85rem 0.95rem', marginBottom:'0.875rem',
          background:'var(--accent-light)', borderColor:'rgba(59,110,255,0.16)',
          fontSize:'0.78rem', color:'var(--text-primary)'
        }}>
          <GripVertical size={13} style={{ color:'var(--accent)', flexShrink:0 }}/>
          Drag widgets to reorder them. Click <strong>Done</strong> when finished.
        </div>
      )}

      {/* Notification banner */}
      {showNotifBanner && permission === 'default' && (
        <div className="card animate-slide-up" style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          gap:'1rem', padding:'0.9rem 1rem', marginBottom:'1rem',
          background:'var(--accent-light)', borderColor:'rgba(59,110,255,0.16)',
          flexWrap:'wrap'
        }}>
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
      <section>
        <div className="flex-between" style={{ margin:'0.25rem 0 0.85rem', gap:'1rem', flexWrap:'wrap' }}>
          <div>
            <div className="section-tag section-tag--air">Widgets</div>
            <div className="page-subtitle" style={{ marginTop:'0.3rem' }}>
              Drag to reorder, hide what you do not need, and keep the essentials first.
            </div>
          </div>
        </div>

        <div className="bento-grid bento-grid--auto" style={{ alignItems:'stretch' }}>
          {visibleLayout.map(({ id }) => (
            <DraggableSlot key={id} id={id} editMode={editMode} isDragOver={dragOverId === id}
              onDragStart={handleDragStart} onDragOver={handleDragOver}
              onDragEnd={handleDragEnd} onDrop={handleDrop}>
              {renderWidget(id)}
            </DraggableSlot>
          ))}
        </div>
      </section>

      {/* Bottom summary bar */}
      {(tempMM || humMM || aqi != null || sunrise || sunset) && (
        <div className="card animate-slide-up" style={{ display:'flex', gap:'1rem', flexWrap:'wrap', marginTop:'1rem',
          padding:'0.9rem 1rem', background:'var(--bg-surface)', alignItems:'center' }}>
          {tempMM && (
            <div className="panel-strip__item" style={{ marginRight: '0.4rem' }}>
              <Thermometer size={12} style={{ color:'var(--card-temp-accent)', flexShrink:0 }}/>
              <span className="panel-strip__label" style={{ color:'var(--text-secondary)' }}>
                Temp 24h: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{tempMM} °C</span>
              </span>
            </div>
          )}
          {humMM && (
            <div className="panel-strip__item" style={{ marginRight: '0.4rem' }}>
              <Droplets size={12} style={{ color:'var(--card-hum-accent)', flexShrink:0 }}/>
              <span className="panel-strip__label" style={{ color:'var(--text-secondary)' }}>
                Hum 24h: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{humMM} %</span>
              </span>
            </div>
          )}
          {aqi != null && (
            <div className="panel-strip__item" style={{ marginRight: '0.4rem' }}>
              <Wind size={12} style={{ color: aqiColor, flexShrink:0 }}/>
              <span className="panel-strip__label" style={{ color:'var(--text-secondary)' }}>
                AQI: <span style={{ color: aqiColor, fontWeight:500 }}>{aqi.toFixed(0)} · {aqiLabel}</span>
              </span>
            </div>
          )}
          {sunrise && (
            <div className="panel-strip__item" style={{ marginRight: '0.4rem' }}>
              <Sunrise size={12} style={{ color:'var(--color-warning)', flexShrink:0 }}/>
              <span className="panel-strip__label" style={{ color:'var(--text-secondary)' }}>
                Sunrise: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{sunrise}</span>
              </span>
            </div>
          )}
          {sunset && (
            <div className="panel-strip__item" style={{ marginRight: '0.4rem' }}>
              <Sunset size={12} style={{ color:'var(--card-temp-accent)', flexShrink:0 }}/>
              <span className="panel-strip__label" style={{ color:'var(--text-secondary)' }}>
                Sunset: <span style={{ color:'var(--text-primary)', fontWeight:500 }}>{sunset}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Settings modal (desktop) */}
      <SettingsSheet
        open={showSettings} onClose={() => setShowSettings(false)}
        layout={layout} onToggleVisible={toggleVisible} onReset={resetLayout}
        editMode={editMode} setEditMode={setEditMode}
        isMobile={false}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes lp   { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @media (max-width: 480px) { .page-title { font-size: 1.4rem !important; } }
      `}</style>
    </div>
  )
}