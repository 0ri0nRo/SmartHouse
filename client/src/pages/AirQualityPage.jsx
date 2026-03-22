import { useState, useEffect } from 'react'
import { Wind, Activity } from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import ChartCard from '../components/ChartCard'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── API ────────────────────────────────────────────────────
// Note: the original uses https://192.168.178.101:4443 — same origin works inside Docker
const fetchAQIToday  = () => fetch('/api/air_quality_today').then(r => r.json())
const fetchGasToday  = () => fetch('/api/gas_concentration_today').then(r => r.json())

// ── AQI status helper ──────────────────────────────────────
function aqiStatus(val) {
  if (val >= 80) return { label:'Good',      className:'badge--success' }
  if (val >= 60) return { label:'Moderate',  className:'badge--warning' }
  if (val >= 40) return { label:'Poor',      className:'badge--danger' }
  return           { label:'Hazardous',  className:'badge--danger' }
}

// Shared tooltip style
const TOOLTIP = {
  contentStyle: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
  },
}

// ── Main page ──────────────────────────────────────────────
export default function AirQualityPage() {
  const { toast, showToast } = useToast()

  const [aqiData,  setAqiData]  = useState([])
  const [gasData,  setGasData]  = useState([])
  const [latestAQI, setLatestAQI] = useState(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [aqi, gas] = await Promise.all([
          fetchAQIToday().catch(() => ({})),
          fetchGasToday().catch(() => ({})),
        ])

        // AQI data — can be { hour: value } or array
        let aqiArr = []
        if (Array.isArray(aqi)) {
          aqiArr = aqi.map(e => ({ hour:`${e.hour}:00`, aqi: parseFloat(e.aqi) }))
        } else if (typeof aqi === 'object') {
          aqiArr = Object.keys(aqi).map(Number).sort((a,b)=>a-b)
            .map(h => ({ hour:`${h}:00`, aqi: parseFloat(aqi[h]) || 0 }))
        }
        setAqiData(aqiArr)
        if (aqiArr.length) setLatestAQI(aqiArr[aqiArr.length-1].aqi)

        // Gas data — { hour: { avg_smoke, avg_lpg, avg_methane, avg_hydrogen } }
        let gasArr = []
        if (typeof gas === 'object' && !Array.isArray(gas)) {
          gasArr = Object.keys(gas).map(Number).sort((a,b)=>a-b).map(h => ({
            hour:     `${h}:00`,
            smoke:    parseFloat(gas[h]?.avg_smoke    || 0).toFixed(2),
            lpg:      parseFloat(gas[h]?.avg_lpg      || 0).toFixed(2),
            methane:  parseFloat(gas[h]?.avg_methane  || 0).toFixed(2),
            hydrogen: parseFloat(gas[h]?.avg_hydrogen || 0).toFixed(2),
          }))
        }
        setGasData(gasArr)
      } catch { showToast('Error loading air quality data', 'error') }
      finally { setLoading(false) }
    }

    load()
    const id = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const status = latestAQI !== null ? aqiStatus(latestAQI) : null

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="page animate-fade">
      <div className="page-header" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 className="page-title">Air <span style={{ color:'var(--accent)' }}>Quality</span></h1>
          <p className="page-subtitle">Real-time air quality monitoring and gas concentration analysis</p>
        </div>
        {status && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.5rem' }}>
            {latestAQI !== null && (
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'1.5rem', fontWeight:500,
                color:'var(--card-air-accent)' }}>
                {latestAQI.toFixed(1)}
              </span>
            )}
            <span className={`badge ${status.className}`}>
              <span className="dot" style={{ background:'currentColor' }}/> {status.label}
            </span>
          </div>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>

        {/* AQI today */}
        <ChartCard title="Air Quality Index" icon={Wind} iconSection="air" badge="Live">
          {loading ? (
            <div className="loading-box"><span className="spinner"/></div>
          ) : aqiData.length === 0 ? (
            <div className="empty-state"><Wind size={28}/><div>No air quality data for today</div></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={aqiData}>
                <defs>
                  <linearGradient id="gaqi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--card-air-accent)" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="var(--card-air-accent)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="hour" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <Tooltip {...TOOLTIP} formatter={v => [`${v}`, 'AQI']}/>
                <Area type="monotone" dataKey="aqi" stroke="var(--card-air-accent)"
                  fill="url(#gaqi)" strokeWidth={2.5}
                  dot={{ r:3, fill:'var(--card-air-accent)', strokeWidth:0 }}
                  activeDot={{ r:5 }} connectNulls/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Gas concentrations */}
        <ChartCard title="Gas Concentrations" icon={Activity} iconSection="air" badge="Multi-Gas">
          {loading ? (
            <div className="loading-box"><span className="spinner"/></div>
          ) : gasData.length === 0 ? (
            <div className="empty-state"><Activity size={28}/><div>No gas concentration data for today</div></div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gasData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="hour" tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <YAxis tick={{ fontFamily:'var(--font-mono)', fontSize:9, fill:'var(--text-secondary)' }}/>
                <Tooltip {...TOOLTIP} formatter={(v, name) => [`${v} ppm`, name]}/>
                <Legend wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:'0.68rem', color:'var(--text-secondary)' }}/>
                {[
                  { key:'smoke',    label:'Smoke',    color:'var(--color-danger)' },
                  { key:'lpg',      label:'LPG',      color:'var(--card-hum-accent)' },
                  { key:'methane',  label:'Methane',  color:'var(--card-shop-accent)' },
                  { key:'hydrogen', label:'Hydrogen', color:'var(--card-temp-accent)' },
                ].map(g => (
                  <Line key={g.key} type="monotone" dataKey={g.key} name={g.label}
                    stroke={g.color} strokeWidth={2}
                    dot={{ r:3, fill:g.color, strokeWidth:0 }}
                    activeDot={{ r:5 }} connectNulls/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

      <Toast toast={toast}/>
    </div>
  )
}