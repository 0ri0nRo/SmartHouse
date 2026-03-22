import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Thermometer, Droplets, Wind, Monitor,
  Lock, Train, ShoppingCart, CreditCard,
  Calendar, Bell, ArrowRight,
} from 'lucide-react'
import { api } from '../api'

// ── Card config ────────────────────────────────────────────
// Each entry defines one tile on the dashboard.
// value / sub can be static strings or will be replaced by live data.
const BASE_CARDS = [
  { section:'temp',  icon:Thermometer,  title:'Temperature',     value:'--',   sub:'-- / --',    route:'/temperature' },
  { section:'hum',   icon:Droplets,     title:'Humidity',        value:'--',   sub:'-- / --',    route:'/humidity' },
  { section:'air',   icon:Wind,         title:'Air Quality',     value:'--',   sub:'Loading...',  route:'/air-quality' },
  { section:'raspi', icon:Monitor,      title:'Raspberry Pi',    value:'Online', sub:'System',   route:'/raspi' },
  { section:'sec',   icon:Lock,         title:'Home Security',   value:'Security', sub:'Devices', route:'/security' },
  { section:'train', icon:Train,        title:'Travel',          value:'Train', sub:'Schedule',  route:'/train' },
  { section:'shop',  icon:ShoppingCart, title:'Shopping List',   value:'List', sub:'Items',      route:'/shopping' },
  { section:'exp',   icon:CreditCard,   title:'Expenses',        value:'Expenses', sub:'Track',  route:'/expenses' },
  { section:'act',   icon:Calendar,     title:'Activities',      value:'Activities', sub:'Calendar', route:'/activities' },
  { section:'rec',   icon:Bell,         title:'Home Alarm',      value:'--',   sub:'Security',   route:null, isAlarm:true },
]

// ── Single tile ────────────────────────────────────────────
function DashTile({ section, icon: Icon, title, value, sub, dot, pulse, onClick }) {
  const [pressed, setPressed] = useState(false)

  return (
    <article
      className={`section-card section-card--${section}`}
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        minHeight: 120,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Top row: tag + icon */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <span className={`section-tag section-tag--${section}`}>{title}</span>
        <Icon size={16} style={{ opacity:0.45, flexShrink:0 }} />
      </div>

      {/* Value — grows to fill available space */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
        fontWeight: 500,
        color: `var(--card-${section}-value)`,
        lineHeight: 1.1,
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        wordBreak: 'break-word',
      }}>
        {value}
      </div>

      {/* Bottom row: sub + status dot */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5rem' }}>
        <span style={{ fontSize:'0.72rem', color:'var(--text-secondary)', lineHeight:1.3 }}>{sub}</span>
        <span className={`dot dot--${dot || 'green'} ${pulse ? 'dot--pulse' : ''}`} style={{ flexShrink:0 }}/>
      </div>
    </article>
  )
}

// ── Main page ──────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()

  const [cards, setCards] = useState(BASE_CARDS)
  const [alarm, setAlarm] = useState(null)

  // Load live data
  useEffect(() => {
    loadSensors()
    loadAir()
    loadAlarm()

    // Refresh every 5 minutes
    const id = setInterval(() => { loadSensors(); loadAir() }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  function updateCard(section, patch) {
    setCards(prev => prev.map(c => c.section === section ? { ...c, ...patch } : c))
  }

  async function loadSensors() {
    try {
      const d = await api.getSensors()
      const temp = parseFloat(d.temperature.current).toFixed(1)
      const hum  = parseFloat(d.humidity.current).toFixed(0)
      const tMM  = d.temperature.minMaxLast24Hours
      const hMM  = d.humidity.minMaxLast24Hours

      updateCard('temp', {
        value: `${temp} °C`,
        sub: `${parseFloat(tMM[0]).toFixed(1)} / ${parseFloat(tMM[1]).toFixed(1)}`,
      })
      updateCard('hum', {
        value: `${hum} %`,
        sub: `${parseFloat(hMM[0]).toFixed(0)} / ${parseFloat(hMM[1]).toFixed(0)}`,
      })
    } catch (e) {
      console.error('Sensor error:', e)
    }
  }

  async function loadAir() {
    try {
      const d = await api.getAirQuality()
      updateCard('air', {
        value: d.air_quality_index?.toFixed(1) ?? '--',
        sub:   d.air_quality_description ?? '--',
      })
    } catch {}
  }

  async function loadAlarm() {
    try {
      const [status] = await api.getAlarm()
      const isOn = status === 'true'
      setAlarm(isOn)
      updateCard('rec', {
        value: isOn ? 'ON' : 'OFF',
        dot:   isOn ? 'green' : 'red',
        pulse: isOn,
      })
    } catch {}
  }

  async function handleAlarmToggle() {
    try {
      await api.toggleAlarm(!alarm)
      loadAlarm()
    } catch {}
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header mb-lg">
        <h1 className="page-title">Smart<span style={{ color:'var(--accent)' }}>House</span></h1>
        <p className="page-subtitle">Home automation dashboard</p>
      </div>

      {/* Tile grid
          Desktop: 3 or 4 columns
          Tablet:  2 columns
          Mobile:  2 columns (like the original) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '0.875rem',
      }}>
        {cards.map((card) => (
          <DashTile
            key={card.section}
            {...card}
            onClick={card.isAlarm ? handleAlarmToggle : () => navigate(card.route)}
          />
        ))}
      </div>
    </div>
  )
}