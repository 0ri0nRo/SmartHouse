import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Thermometer, Droplets, Wind, Monitor,
  Lock, Train, ShoppingCart, CreditCard,
  Calendar, Bell
} from 'lucide-react'

// ── API calls ────────────────────────────────────────────
async function fetchSensors() {
  const res = await fetch('/api_sensors')
  if (!res.ok) throw new Error('sensor fetch failed')
  return res.json()
}

async function fetchAlarmStatus() {
  const res = await fetch('/security/alarm')
  if (!res.ok) throw new Error('alarm fetch failed')
  return res.json()
}

async function fetchAirQuality() {
  const res = await fetch('/api/last_air_quality_today')
  if (!res.ok) throw new Error('air quality fetch failed')
  return res.json()
}

// ── Single card component ────────────────────────────────
function DashCard({ section, icon: Icon, title, value, sub, dot, onClick, pulse }) {
  return (
    <article
      className={`section-card section-card--${section}`}
      onClick={onClick}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: 120 }}
    >
      {/* Top row: tag + icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`section-tag section-tag--${section}`}>{title}</span>
        <Icon size={16} style={{ opacity: 0.5 }} />
      </div>

      {/* Value */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '1.6rem',
        fontWeight: 500,
        color: `var(--card-${section}-value)`,
        lineHeight: 1.1,
        flex: 1,
        display: 'flex',
        alignItems: 'center',
      }}>
        {value}
      </div>

      {/* Bottom row: sub + status dot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub}</span>
        <span className={`dot dot--${dot || 'green'} ${pulse ? 'dot--pulse' : ''}`} />
      </div>
    </article>
  )
}

// ── Main page ────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate()

  const [temp,    setTemp]    = useState(null)
  const [hum,     setHum]     = useState(null)
  const [minMax,  setMinMax]  = useState({ temp: '--/--', hum: '--/--' })
  const [air,     setAir]     = useState({ index: '--', desc: 'Loading...' })
  const [alarm,   setAlarm]   = useState(null) // true | false | null

  // Load all data
  useEffect(() => {
    loadSensors()
    loadAlarm()
    loadAir()

    // Refresh every 5 minutes
    const id = setInterval(() => { loadSensors(); loadAir() }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  async function loadSensors() {
    try {
      const d = await fetchSensors()
      setTemp(parseFloat(d.temperature.current).toFixed(1))
      setHum(parseFloat(d.humidity.current).toFixed(0))
      setMinMax({
        temp: `${parseFloat(d.temperature.minMaxLast24Hours[0]).toFixed(1)} / ${parseFloat(d.temperature.minMaxLast24Hours[1]).toFixed(1)}`,
        hum:  `${parseFloat(d.humidity.minMaxLast24Hours[0]).toFixed(0)} / ${parseFloat(d.humidity.minMaxLast24Hours[1]).toFixed(0)}`,
      })
    } catch (e) {
      console.error('Sensor error:', e)
    }
  }

  async function loadAlarm() {
    try {
      const [status] = await fetchAlarmStatus()
      setAlarm(status === 'true')
    } catch (e) {
      console.error('Alarm error:', e)
    }
  }

  async function loadAir() {
    try {
      const d = await fetchAirQuality()
      setAir({
        index: d.air_quality_index?.toFixed(1) ?? '--',
        desc:  d.air_quality_description ?? '--',
      })
    } catch (e) {
      console.error('Air quality error:', e)
    }
  }

  async function toggleAlarm() {
    try {
      const res = await fetch('/security/alarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: !alarm }),
      })
      if (res.ok) loadAlarm()
    } catch (e) {
      console.error('Alarm toggle error:', e)
    }
  }

  // Cards definition
  const cards = [
    {
      section: 'temp',
      icon: Thermometer,
      title: 'Temperature',
      value: temp != null ? `${temp} °C` : '-- °C',
      sub: minMax.temp,
      onClick: () => navigate('/temperature'),
    },
    {
      section: 'hum',
      icon: Droplets,
      title: 'Humidity',
      value: hum != null ? `${hum} %` : '-- %',
      sub: minMax.hum,
      onClick: () => navigate('/humidity'),
    },
    {
      section: 'air',
      icon: Wind,
      title: 'Air Quality',
      value: air.index,
      sub: air.desc,
      onClick: () => navigate('/air-quality'),
    },
    {
      section: 'raspi',
      icon: Monitor,
      title: 'Raspberry Pi',
      value: 'System',
      sub: 'Status',
      onClick: () => navigate('/raspi'),
    },
    {
      section: 'sec',
      icon: Lock,
      title: 'Home Security',
      value: 'Security',
      sub: 'Devices',
      onClick: () => navigate('/security'),
    },
    {
      section: 'train',
      icon: Train,
      title: 'Travel',
      value: 'Transport',
      sub: 'Schedule',
      onClick: () => navigate('/train'),
    },
    {
      section: 'shop',
      icon: ShoppingCart,
      title: 'Shopping List',
      value: 'List',
      sub: 'Items',
      onClick: () => navigate('/shopping'),
    },
    {
      section: 'exp',
      icon: CreditCard,
      title: 'Expenses',
      value: 'Expenses',
      sub: 'Track',
      onClick: () => navigate('/expenses'),
    },
    {
      section: 'act',
      icon: Calendar,
      title: 'Activity Monitor',
      value: 'Activities',
      sub: 'Calendar',
      onClick: () => navigate('/activities'),
    },
    {
      section: alarm === true ? 'air' : 'rec',
      icon: Bell,
      title: 'Home Alarm',
      value: alarm === null ? '--' : alarm ? 'ON' : 'OFF',
      sub: 'Security',
      dot: alarm ? 'green' : 'red',
      pulse: alarm === true,
      onClick: toggleAlarm,
    },
  ]

  return (
    <div className="page animate-fade">
      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '1rem',
      }}>
        {cards.map((card, i) => (
          <DashCard key={i} {...card} />
        ))}
      </div>
    </div>
  )
}