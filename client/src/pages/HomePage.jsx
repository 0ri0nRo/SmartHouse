import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Thermometer, Droplets, Wind, Cpu,
  Bell, Flame, ChevronRight, RefreshCw,
} from 'lucide-react'
import { api } from '../api'

// ── Toggle widget — iOS style, green ON / red OFF ──────────
function ToggleWidget({ label, sublabel, isOn, onToggle, loading, section, icon: Icon, onNavigate }) {
  const [pressed, setPressed] = useState(false)

  return (
    <div style={{
      background: isOn
        ? 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))'
        : 'var(--bg-surface)',
      border: `1px solid ${isOn ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-xl)',
      padding: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: '1.25rem',
      transition: 'all 0.3s ease',
    }}>
      {/* Icon + arrow */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: isOn ? 'rgba(34,197,94,0.18)' : `var(--card-${section}-bg)`,
          color: isOn ? 'var(--color-success)' : `var(--card-${section}-accent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.3s',
        }}>
          <Icon size={22}/>
        </div>
        <button onClick={onNavigate} style={{ background:'none', border:'none',
          cursor:'pointer', color:'var(--text-muted)', padding:4, display:'flex' }}>
          <ChevronRight size={16}/>
        </button>
      </div>

      {/* Labels */}
      <div>
        <div style={{ fontSize:'0.8rem', fontWeight:500, color:'var(--text-primary)',
          marginBottom:'0.2rem' }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)',
            fontFamily:'var(--font-mono)' }}>{sublabel}</div>
        )}
      </div>

      {/* Status + toggle */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 500,
          color: loading || isOn === null ? 'var(--text-muted)'
            : isOn ? 'var(--color-success)' : 'var(--color-danger)',
          lineHeight: 1, letterSpacing: 1,
          transition: 'color 0.3s',
        }}>
          {loading || isOn === null ? '…' : isOn ? 'ON' : 'OFF'}
        </div>

        {/* iOS pill toggle */}
        <button
          onMouseDown={() => setPressed(true)}
          onMouseUp={() => setPressed(false)}
          onMouseLeave={() => setPressed(false)}
          onTouchStart={() => setPressed(true)}
          onTouchEnd={() => { setPressed(false) }}
          onClick={onToggle}
          disabled={loading || isOn === null}
          style={{
            width: 58, height: 32, borderRadius: 16, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: isOn ? 'var(--color-success)' : 'var(--color-danger)',
            position: 'relative',
            transition: 'background 0.3s ease',
            transform: pressed ? 'scale(0.92)' : 'scale(1)',
            boxShadow: isOn
              ? '0 0 14px rgba(34,197,94,0.45)'
              : '0 0 14px rgba(239,68,68,0.35)',
            opacity: (loading || isOn === null) ? 0.55 : 1,
          }}
        >
          <div style={{
            position: 'absolute', top: 4,
            left: isOn ? 30 : 4,
            width: 24, height: 24, borderRadius: '50%', background: '#fff',
            transition: 'left 0.28s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.22)',
          }}/>
        </button>
      </div>
    </div>
  )
}

// ── Dual stat widget — two values in one card ──────────────
function DualStatWidget({ label, section, icon: Icon, onNavigate, val1, unit1, label1, color1, val2, unit2, label2, color2 }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)', padding: '1.5rem',
      display: 'flex', flexDirection: 'column', gap: '1.25rem',
      cursor: 'pointer', transition: 'all 0.2s ease',
    }} onClick={onNavigate}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ width:44, height:44, borderRadius:12,
          background:`var(--card-${section}-bg)`, color:`var(--card-${section}-accent)`,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={22}/>
        </div>
        <ChevronRight size={16} style={{ color:'var(--text-muted)' }}/>
      </div>

      <div style={{ fontSize:'0.8rem', fontWeight:500, color:'var(--text-primary)' }}>
        {label}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
        {[
          { v:val1, u:unit1, l:label1, c:color1 },
          { v:val2, u:unit2, l:label2, c:color2 },
        ].map((item, i) => (
          <div key={i} style={{ background:'var(--bg-surface-2)', borderRadius:10,
            padding:'0.875rem', textAlign:'center' }}>
            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)',
              fontFamily:'var(--font-mono)', letterSpacing:'1px',
              textTransform:'uppercase', marginBottom:'0.4rem' }}>
              {item.l}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.6rem',
              fontWeight:500, color:item.c, lineHeight:1 }}>
              {item.v ?? '—'}
              {item.u && item.v && (
                <span style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{item.u}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stat widget — single big value ─────────────────────────
function StatWidget({ label, sublabel, value, unit, section, icon: Icon, onNavigate, color }) {
  const c = color || `var(--card-${section}-accent)`
  return (
    <div style={{
      background:'var(--bg-surface)', border:'1px solid var(--border)',
      borderRadius:'var(--radius-xl)', padding:'1.5rem',
      display:'flex', flexDirection:'column', gap:'1.25rem',
      cursor: onNavigate ? 'pointer' : 'default',
      transition:'all 0.2s ease',
    }} onClick={onNavigate}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ width:44, height:44, borderRadius:12,
          background:`var(--card-${section}-bg)`, color:c,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={22}/>
        </div>
        {onNavigate && <ChevronRight size={16} style={{ color:'var(--text-muted)' }}/>}
      </div>

      <div>
        <div style={{ fontSize:'0.8rem', fontWeight:500, color:'var(--text-primary)',
          marginBottom:'0.2rem' }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize:'0.68rem', color:'var(--text-muted)',
            fontFamily:'var(--font-mono)' }}>{sublabel}</div>
        )}
      </div>

      <div style={{ fontFamily:'var(--font-mono)', fontSize:'clamp(1.75rem,4vw,2.25rem)',
        fontWeight:500, color:c, lineHeight:1, display:'flex',
        alignItems:'baseline', gap:'0.2rem' }}>
        {value ?? '—'}
        {unit && value && value !== '—' && (
          <span style={{ fontSize:'1rem', color:'var(--text-muted)' }}>{unit}</span>
        )}
      </div>
    </div>
  )
}

// ── AQI helpers ────────────────────────────────────────────
const aqiColor = v => v >= 80 ? 'var(--color-success)' : v >= 60 ? 'var(--card-train-accent)' : v >= 40 ? 'var(--color-warning)' : 'var(--color-danger)'
const aqiLabel = v => v >= 80 ? 'Good' : v >= 60 ? 'Moderate' : v >= 40 ? 'Poor' : 'Hazardous'

// ── Main page ──────────────────────────────────────────────
export default function HomePage() {
  const nav = useNavigate()

  const [temp,       setTemp]       = useState(null)
  const [hum,        setHum]        = useState(null)
  const [tempMM,     setTempMM]     = useState(null)
  const [humMM,      setHumMM]      = useState(null)
  const [aqi,        setAqi]        = useState(null)
  const [cpu,        setCpu]        = useState(null)
  const [raspiTemp,  setRaspiTemp]  = useState(null)
  const [alarm,      setAlarm]      = useState(null)
  const [boilerOn,   setBoilerOn]   = useState(null)
  const [thermostat, setThermostat] = useState(null)

  const [alarmLoading,  setAlarmLoading]  = useState(false)
  const [boilerLoading, setBoilerLoading] = useState(false)
  const [refreshing,    setRefreshing]    = useState(false)
  const [lastUpdate,    setLastUpdate]    = useState(null)

  // ── Loaders ────────────────────────────────────────────
  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    await Promise.allSettled([
      // Sensors
      api.getSensors().then(d => {
        setTemp(parseFloat(d.temperature.current).toFixed(1))
        setHum(parseFloat(d.humidity.current).toFixed(0))
        const tMM = d.temperature.minMaxLast24Hours
        const hMM = d.humidity.minMaxLast24Hours
        setTempMM(`${parseFloat(tMM[0]).toFixed(1)} / ${parseFloat(tMM[1]).toFixed(1)}`)
        setHumMM(`${parseFloat(hMM[0]).toFixed(0)} / ${parseFloat(hMM[1]).toFixed(0)}`)
      }).catch(() => {}),

      // Air quality
      api.getAirQuality().then(d => setAqi(parseFloat(d.air_quality_index || 0))).catch(() => {}),

      // Raspi
      fetch('/api_raspberry_pi_stats').then(r => r.json()).then(d => {
        setCpu(parseFloat(d.cpuUsage || 0).toFixed(1))
        setRaspiTemp(parseFloat(d.temperature || 0).toFixed(1))
      }).catch(() => {}),

      // Alarm
      api.getAlarm().then(([s]) => setAlarm(s === 'true')).catch(() => {}),

      // Boiler
      Promise.all([api.getBoilerStatus(), api.getThermostatFull()]).then(([b, t]) => {
        setBoilerOn(b.is_on)
        setThermostat(t.thermostat_enabled)
      }).catch(() => {}),
    ])
    setLastUpdate(new Date())
    if (!silent) setRefreshing(false)
  }, [])

  useEffect(() => {
    loadAll()
    const id = setInterval(() => loadAll(true), 15000)
    return () => clearInterval(id)
  }, [loadAll])

  // ── Toggle handlers ─────────────────────────────────────
  const toggleAlarm = async () => {
    setAlarmLoading(true)
    try { await api.toggleAlarm(!alarm); await api.getAlarm().then(([s]) => setAlarm(s === 'true')) }
    catch {} finally { setAlarmLoading(false) }
  }

  const toggleBoiler = async () => {
    setBoilerLoading(true)
    try {
      if (thermostat) await api.thermostatOff()
      await api.manualBoiler(!boilerOn)
      const b = await api.getBoilerStatus()
      setBoilerOn(b.is_on)
    } catch {} finally { setBoilerLoading(false) }
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="page animate-fade">

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'2rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom:'0.2rem' }}>
            Smart<span style={{ color:'var(--accent)' }}>House</span>
          </h1>
          <p style={{ fontFamily:'var(--font-mono)', fontSize:'0.65rem',
            color:'var(--text-muted)', letterSpacing:'0.5px' }}>
            {lastUpdate
              ? `Updated ${lastUpdate.toLocaleTimeString('it-IT')}`
              : 'Loading...'}
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => loadAll()} disabled={refreshing}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
          {refreshing ? 'Refreshing...' : 'Refresh all'}
        </button>
      </div>

      {/* Widget grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(256px, 1fr))',
        gap: '1rem',
        alignItems: 'start',
      }}>
        {/* Alarm toggle */}
        <ToggleWidget
          label="Home Alarm"
          sublabel="Security system"
          isOn={alarm}
          loading={alarmLoading}
          onToggle={toggleAlarm}
          section="sec"
          icon={Bell}
          onNavigate={() => nav('/security')}
        />

        {/* Boiler toggle */}
        <ToggleWidget
          label="Boiler"
          sublabel={thermostat ? 'Thermostat active' : 'Manual control'}
          isOn={boilerOn}
          loading={boilerLoading}
          onToggle={toggleBoiler}
          section="temp"
          icon={Flame}
          onNavigate={() => nav('/temperature')}
        />

        {/* Temperature + Humidity */}
        <DualStatWidget
          label="Environment"
          section="temp"
          icon={Thermometer}
          onNavigate={() => nav('/temperature')}
          val1={temp}  unit1="°C" label1="Temp"     color1="var(--card-temp-accent)"
          val2={hum}   unit2="%" label2="Humidity" color2="var(--card-hum-accent)"
        />

        {/* Air Quality */}
        <StatWidget
          label="Air Quality"
          sublabel={aqi != null ? aqiLabel(aqi) : 'Loading...'}
          value={aqi != null ? aqi.toFixed(1) : null}
          section="air"
          icon={Wind}
          onNavigate={() => nav('/air-quality')}
          color={aqi != null ? aqiColor(aqi) : undefined}
        />

        {/* Raspberry Pi */}
        <DualStatWidget
          label="Raspberry Pi"
          section="raspi"
          icon={Cpu}
          onNavigate={() => nav('/raspi')}
          val1={cpu}       unit1="%" label1="CPU"
          color1={cpu && parseFloat(cpu) > 80 ? 'var(--color-danger)' : 'var(--card-raspi-accent)'}
          val2={raspiTemp} unit2="°C" label2="Temp"
          color2={raspiTemp && parseFloat(raspiTemp) > 70 ? 'var(--color-danger)' : 'var(--card-temp-accent)'}
        />
      </div>

      {/* 24h min/max bar */}
      {(tempMM || humMM) && (
        <div style={{ display:'flex', gap:'2rem', flexWrap:'wrap',
          marginTop:'1.25rem', padding:'0.875rem 1.25rem',
          background:'var(--bg-surface)', border:'1px solid var(--border)',
          borderRadius:'var(--radius-lg)' }}>
          {[
            tempMM && { icon:Thermometer, color:'var(--card-temp-accent)', label:'Temp 24h', value:`${tempMM} °C` },
            humMM  && { icon:Droplets,    color:'var(--card-hum-accent)',  label:'Hum 24h',  value:`${humMM} %` },
          ].filter(Boolean).map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <Icon size={13} style={{ color: item.color }}/>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem',
                  color:'var(--text-secondary)' }}>
                  {item.label}:{' '}
                  <span style={{ color:'var(--text-primary)' }}>{item.value}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}