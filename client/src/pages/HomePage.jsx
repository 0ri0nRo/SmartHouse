import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Thermometer, Droplets, Wind, Cpu, Bell, Flame, ChevronRight } from 'lucide-react'
import { api } from '../api'

const REFRESH_INTERVAL = 15

function Widget({ section, icon: Icon, label, sublabel, onNavigate, children }) {
  return (
    <div onClick={onNavigate}
      style={{ background:'var(--bg-surface)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', cursor:onNavigate?'pointer':'default',
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition:'border-color var(--transition)', height:'100%' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor='var(--border-strong)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
      <div style={{padding:'1.1rem 1.1rem 0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{width:36,height:36,borderRadius:'var(--radius-md)',
          background:`var(--card-${section}-bg)`,color:`var(--card-${section}-accent)`,
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <Icon size={18}/>
        </div>
        {onNavigate && <ChevronRight size={14} style={{color:'var(--text-muted)'}}/>}
      </div>
      <div style={{padding:'0.9rem 1.1rem 0'}}>
        <div style={{fontSize:'0.82rem',fontWeight:600,color:'var(--text-primary)',lineHeight:1.2}}>{label}</div>
        <div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'0.2rem',fontFamily:'var(--font-mono)'}}>{sublabel||'\u00a0'}</div>
      </div>
      <div style={{flex:1,padding:'0.9rem 1.1rem 1.25rem',display:'flex',alignItems:'flex-end'}}>{children}</div>
    </div>
  )
}

function ToggleWidget({ section, icon, label, sublabel, isOn, loading, onToggle, onNavigate }) {
  const [pressed, setPressed] = useState(false)
  return (
    <Widget section={section} icon={icon} label={label} sublabel={sublabel} onNavigate={onNavigate}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
        <div style={{fontFamily:'var(--font-mono)',fontSize:'1.5rem',fontWeight:700,letterSpacing:'-0.5px',
          color:loading||isOn===null?'var(--text-muted)':isOn?'var(--color-success)':'var(--color-danger)',
          transition:'color 0.3s'}}>
          {loading||isOn===null?'…':isOn?'ON':'OFF'}
        </div>
        <button
          onMouseDown={()=>setPressed(true)} onMouseUp={()=>setPressed(false)}
          onMouseLeave={()=>setPressed(false)}
          onTouchStart={e=>{e.stopPropagation();setPressed(true)}}
          onTouchEnd={e=>{e.stopPropagation();setPressed(false);onToggle()}}
          onClick={e=>{e.stopPropagation();onToggle()}}
          disabled={loading||isOn===null}
          style={{width:52,height:30,borderRadius:15,border:'none',padding:0,
            background:isOn?'var(--color-success)':'var(--color-danger)',
            cursor:loading?'not-allowed':'pointer',position:'relative',
            transition:'background 0.28s ease, transform 0.1s ease',
            transform:pressed?'scale(0.9)':'scale(1)',
            boxShadow:isOn?'0 0 12px rgba(52,199,89,0.4)':'0 0 12px rgba(255,59,48,0.3)',
            opacity:(loading||isOn===null)?0.5:1,flexShrink:0}}>
          <div style={{position:'absolute',top:3,left:isOn?25:3,
            width:24,height:24,borderRadius:'50%',background:'#fff',
            transition:'left 0.28s cubic-bezier(0.4,0,0.2,1)',boxShadow:'0 1px 3px rgba(0,0,0,0.25)'}}/>
        </button>
      </div>
    </Widget>
  )
}

function DualWidget({ section, icon, label, sublabel, onNavigate, val1, unit1, tag1, color1, val2, unit2, tag2, color2 }) {
  return (
    <Widget section={section} icon={icon} label={label} sublabel={sublabel} onNavigate={onNavigate}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem',width:'100%'}}>
        {[{v:val1,u:unit1,t:tag1,c:color1},{v:val2,u:unit2,t:tag2,c:color2}].map((item,i)=>(
          <div key={i} style={{background:'var(--bg-surface-2)',borderRadius:'var(--radius-md)',padding:'0.75rem 0.65rem',textAlign:'center'}}>
            <div style={{fontSize:'0.58rem',fontWeight:600,letterSpacing:'0.6px',textTransform:'uppercase',color:'var(--text-muted)',marginBottom:'0.4rem'}}>{item.t}</div>
            <div style={{fontFamily:'var(--font-mono)',fontSize:'1.4rem',fontWeight:500,color:item.c,lineHeight:1}}>
              {item.v??'—'}{item.u&&item.v!=null&&<span style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:400}}>{item.u}</span>}
            </div>
          </div>
        ))}
      </div>
    </Widget>
  )
}

function StatWidget({ section, icon, label, sublabel, onNavigate, value, unit, color }) {
  const c = color||`var(--card-${section}-accent)`
  return (
    <Widget section={section} icon={icon} label={label} sublabel={sublabel} onNavigate={onNavigate}>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'clamp(2rem,4vw,2.5rem)',fontWeight:500,color:c,lineHeight:1,display:'flex',alignItems:'baseline',gap:'0.2rem'}}>
        {value??'—'}{unit&&value!=null&&<span style={{fontSize:'1rem',color:'var(--text-muted)',fontWeight:400}}>{unit}</span>}
      </div>
    </Widget>
  )
}

// ── Refresh countdown ring ─────────────────────────────────
function RefreshRing({ countdown, total, refreshing, onRefresh }) {
  const radius = 10
  const circ   = 2 * Math.PI * radius
  const dash   = (countdown / total) * circ
  return (
    <button onClick={onRefresh} disabled={refreshing}
      style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:'0.5rem',padding:0}}>
      <svg width={28} height={28} viewBox="0 0 28 28" style={{transform:'rotate(-90deg)',flexShrink:0}}>
        <circle cx={14} cy={14} r={radius} fill="none" stroke="var(--border-strong)" strokeWidth={2}/>
        <circle cx={14} cy={14} r={radius} fill="none"
          stroke={refreshing?'var(--accent)':'var(--card-hum-accent)'}
          strokeWidth={2}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{transition:refreshing?'none':'stroke-dasharray 1s linear'}}/>
      </svg>
      <span style={{fontFamily:'var(--font-mono)',fontSize:'0.68rem',color:'var(--text-muted)',whiteSpace:'nowrap'}}>
        {refreshing?'Refreshing…':`${countdown}s`}
      </span>
    </button>
  )
}

const aqiColor = v => v>=80?'var(--color-success)':v>=60?'var(--color-warning)':'var(--color-danger)'
const aqiLabel = v => v>=80?'Good':v>=60?'Moderate':v>=40?'Poor':'Hazardous'

export default function HomePage() {
  const nav = useNavigate()
  const [temp,setTemp]           = useState(null)
  const [hum,setHum]             = useState(null)
  const [tempMM,setTempMM]       = useState(null)
  const [humMM,setHumMM]         = useState(null)
  const [aqi,setAqi]             = useState(null)
  const [cpu,setCpu]             = useState(null)
  const [raspiTemp,setRaspiTemp] = useState(null)
  const [alarm,setAlarm]         = useState(null)
  const [boilerOn,setBoilerOn]   = useState(null)
  const [thermostat,setThermostat] = useState(null)
  const [alarmLoading,setAlarmLoading]   = useState(false)
  const [boilerLoading,setBoilerLoading] = useState(false)
  const [refreshing,setRefreshing]       = useState(false)
  const [lastUpdate,setLastUpdate]       = useState(null)
  const [countdown,setCountdown]         = useState(REFRESH_INTERVAL)

  const loadAll = useCallback(async (silent=false) => {
    if(!silent) setRefreshing(true)
    setCountdown(REFRESH_INTERVAL)
    await Promise.allSettled([
      api.getSensors().then(d=>{
        setTemp(parseFloat(d.temperature.current).toFixed(1))
        setHum(parseFloat(d.humidity.current).toFixed(0))
        const tMM=d.temperature.minMaxLast24Hours, hMM=d.humidity.minMaxLast24Hours
        setTempMM(`${parseFloat(tMM[0]).toFixed(1)} / ${parseFloat(tMM[1]).toFixed(1)}`)
        setHumMM(`${parseFloat(hMM[0]).toFixed(0)} / ${parseFloat(hMM[1]).toFixed(0)}`)
      }).catch(()=>{}),
      api.getAirQuality().then(d=>setAqi(parseFloat(d.air_quality_index||0))).catch(()=>{}),
      fetch('/api_raspberry_pi_stats').then(r=>r.json()).then(d=>{
        setCpu(parseFloat(d.cpuUsage||0).toFixed(1))
        setRaspiTemp(parseFloat(d.temperature||0).toFixed(1))
      }).catch(()=>{}),
      api.getAlarm().then(([s])=>setAlarm(s==='true')).catch(()=>{}),
      Promise.all([api.getBoilerStatus(),api.getThermostatFull()]).then(([b,t])=>{
        setBoilerOn(b.is_on); setThermostat(t.thermostat_enabled)
      }).catch(()=>{}),
    ])
    setLastUpdate(new Date())
    if(!silent) setRefreshing(false)
  },[])

  useEffect(()=>{
    loadAll()
    const id=setInterval(()=>loadAll(true), REFRESH_INTERVAL*1000)
    return()=>clearInterval(id)
  },[loadAll])

  useEffect(()=>{
    const id=setInterval(()=>setCountdown(p=>p<=1?REFRESH_INTERVAL:p-1),1000)
    return()=>clearInterval(id)
  },[])

  const toggleAlarm=async()=>{
    setAlarmLoading(true)
    try{await api.toggleAlarm(!alarm);await api.getAlarm().then(([s])=>setAlarm(s==='true'))}
    catch{}finally{setAlarmLoading(false)}
  }
  const toggleBoiler=async()=>{
    setBoilerLoading(true)
    try{
      if(thermostat)await api.thermostatOff()
      await api.manualBoiler(!boilerOn)
      const b=await api.getBoilerStatus();setBoilerOn(b.is_on)
    }catch{}finally{setBoilerLoading(false)}
  }

  return (
    <div className="page animate-fade">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'2rem',flexWrap:'wrap',gap:'0.75rem'}}>
        <div>
          <h1 className="page-title">SmartHouse</h1>
          <p style={{fontFamily:'var(--font-mono)',fontSize:'0.65rem',color:'var(--text-muted)',letterSpacing:'0.5px',marginTop:'0.2rem'}}>
            {lastUpdate?`Updated ${lastUpdate.toLocaleTimeString('it-IT')}`:'Loading...'}
          </p>
        </div>
        <RefreshRing countdown={countdown} total={REFRESH_INTERVAL} refreshing={refreshing} onRefresh={()=>loadAll()}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',gap:'0.875rem',alignItems:'stretch'}}>
        <ToggleWidget section="sec" icon={Bell} label="Home Alarm" sublabel="Security system" isOn={alarm} loading={alarmLoading} onToggle={toggleAlarm} onNavigate={()=>nav('/security')}/>
        <ToggleWidget section="temp" icon={Flame} label="Boiler" sublabel={thermostat?'Thermostat active':'Manual control'} isOn={boilerOn} loading={boilerLoading} onToggle={toggleBoiler} onNavigate={()=>nav('/temperature')}/>
        <DualWidget section="hum" icon={Thermometer} label="Environment" sublabel="Temperature & Humidity" onNavigate={()=>nav('/temperature')} val1={temp} unit1="°C" tag1="Temp" color1="var(--card-temp-accent)" val2={hum} unit2="%" tag2="Humidity" color2="var(--card-hum-accent)"/>
        <StatWidget section="air" icon={Wind} label="Air Quality" sublabel={aqi!=null?aqiLabel(aqi):'Loading...'} onNavigate={()=>nav('/air-quality')} value={aqi!=null?aqi.toFixed(1):null} color={aqi!=null?aqiColor(aqi):undefined}/>
        <DualWidget section="raspi" icon={Cpu} label="Raspberry Pi" sublabel="System status" onNavigate={()=>nav('/raspi')} val1={cpu} unit1="%" tag1="CPU" color1={cpu&&parseFloat(cpu)>80?'var(--color-danger)':'var(--card-raspi-accent)'} val2={raspiTemp} unit2="°C" tag2="Temp" color2={raspiTemp&&parseFloat(raspiTemp)>70?'var(--color-danger)':'var(--card-temp-accent)'}/>
      </div>

      {(tempMM||humMM)&&(
        <div style={{display:'flex',gap:'2rem',flexWrap:'wrap',marginTop:'1rem',padding:'0.75rem 1rem',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-md)'}}>
          {[tempMM&&{icon:Thermometer,color:'var(--card-temp-accent)',label:'Temp 24h',value:`${tempMM} °C`},humMM&&{icon:Droplets,color:'var(--card-hum-accent)',label:'Hum 24h',value:`${humMM} %`}].filter(Boolean).map((item,i)=>{
            const Icon=item.icon
            return(<div key={i} style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
              <Icon size={12} style={{color:item.color,flexShrink:0}}/>
              <span style={{fontFamily:'var(--font-mono)',fontSize:'0.72rem',color:'var(--text-secondary)'}}>
                {item.label}: <span style={{color:'var(--text-primary)',fontWeight:500}}>{item.value}</span>
              </span>
            </div>)
          })}
        </div>
      )}
    </div>
  )
}