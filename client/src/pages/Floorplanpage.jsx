import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Plus, X, Move, MapPin,
  RefreshCw, Wifi, AlertTriangle, Trash2, Save,
  ZoomIn, ZoomOut, Home, Layers, Grid3x3, Map as MapIcon,
  Settings, Radio, CheckCircle2, XCircle,
  Thermometer, Droplets, Wind, Eye, DoorOpen, Gauge,
  GripVertical, Maximize2, Activity, TrendingUp, TrendingDown,
  ChevronRight, MoreHorizontal, Zap, Search, LayoutGrid, RotateCcw,
} from 'lucide-react'
import { api } from '../api'
import Toast from '../components/Toast'
import SensorLiveValueTag from '../components/SensorLiveValueTag'
import { useToast } from '../hooks/useToast'
import { resolvePath, formatLiveValue, useLiveSensorValue } from '../hooks/useLiveSensorValue'
import { create } from 'zustand'

// ════════════════════════════════════════════════════════════════════════════
// ║ ZUSTAND STORE
// ════════════════════════════════════════════════════════════════════════════
const useFloorplanStore = create((set, get) => ({
  sensors: [],
  setSensors: (sensors) => set({ sensors }),
  updateSensor: (id, updates) => set((s) => ({
    sensors: s.sensors.map((sensor) => sensor.id === id ? { ...sensor, ...updates } : sensor),
  })),
  removeSensor: (id) => set((s) => ({
    sensors: s.sensors.filter((sensor) => sensor.id !== id),
  })),
  getSensor: (id) => get().sensors.find((s) => s.id === id),
}))

// ════════════════════════════════════════════════════════════════════════════
// ║ CONSTANTS
// ════════════════════════════════════════════════════════════════════════════
const DEFAULT_ROOMS = [
  { id: 'camera1',   label: 'Bedroom',     area: '16.11 m²', x: 2.5,  y: 4,  w: 39, h: 38 },
  { id: 'ufficio',   label: 'Office',      area: '2.59 m²',  x: 41.5, y: 4,  w: 11, h: 14 },
  { id: 'cucina',    label: 'Kitchen',     area: '23.54 m²', x: 2.5,  y: 42, w: 39, h: 30 },
  { id: 'sala',      label: 'Dining room', area: '21.78 m²', x: 52.5, y: 4,  w: 45, h: 54 },
  { id: 'bagno',     label: 'Bathroom',    area: '5.63 m²',  x: 52.5, y: 58, w: 29, h: 21 },
  { id: 'camera2',   label: 'Bedroom 2',   area: '6.16 m²',  x: 52.5, y: 79, w: 45, h: 18 },
  { id: 'corridoio', label: 'Hallway',     area: '',         x: 41.5, y: 18, w: 11, h: 54 },
]

const SENSOR_TYPES = [
  { id: 'temp_hum', label: 'Temp + Hum',   icon: '🌡️', color: '#f97316', lucideIcon: Thermometer },
  { id: 'temp',     label: 'Temperature',  icon: '🌡️', color: '#f97316', lucideIcon: Thermometer },
  { id: 'humidity', label: 'Humidity',     icon: '💧', color: '#38bdf8', lucideIcon: Droplets },
  { id: 'motion',   label: 'Motion',       icon: '👁️', color: '#a78bfa', lucideIcon: Eye },
  { id: 'door',     label: 'Door/Window',  icon: '🚪', color: '#34d399', lucideIcon: DoorOpen },
  { id: 'air',      label: 'Air quality',  icon: '🌬️', color: '#34d399', lucideIcon: Wind },
]

const TYPE_META = Object.fromEntries(SENSOR_TYPES.map((t) => [t.id, t]))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function daysInMonth(month) {
  return new Date(2001, month, 0).getDate()
}

function relativeTs(isoString) {
  if (!isoString) return ''
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return new Date(isoString).toLocaleTimeString()
}

// ════════════════════════════════════════════════════════════════════════════
// ║ SENSOR POSITION — localStorage persistence (fallback + cache)
// ════════════════════════════════════════════════════════════════════════════
const SENSOR_POS_KEY = 'fp-sensor-positions-v1'

function loadSensorPositions() {
  try { return JSON.parse(localStorage.getItem(SENSOR_POS_KEY) || '{}') } catch { return {} }
}

function saveSensorPosition(id, x, y) {
  try {
    const current = loadSensorPositions()
    localStorage.setItem(SENSOR_POS_KEY, JSON.stringify({ ...current, [id]: { x, y } }))
  } catch {}
}

function clearSensorPosition(id) {
  try {
    const current = loadSensorPositions()
    delete current[id]
    localStorage.setItem(SENSOR_POS_KEY, JSON.stringify(current))
  } catch {}
}

// Merge API sensor list with any locally-cached positions
function mergeSensorPositions(sensors) {
  const pos = loadSensorPositions()
  return sensors.map(s => pos[s.id] ? { ...s, x: pos[s.id].x, y: pos[s.id].y } : s)
}

// ════════════════════════════════════════════════════════════════════════════
// ║ WIDGET LAYOUT SYSTEM — drag, resize & persist
// ════════════════════════════════════════════════════════════════════════════
const FP_GRID_COLS  = 12
const FP_GRID_ROW_H = 60
const FP_GRID_GAP   = 12
const FP_MIN_CS     = 2
const FP_MIN_RS     = 2
const FP_LAYOUT_KEY = 'fp-widget-layout-v1'

const FP_DEFAULT_LAYOUT = [
  { id: 'kpi',      col: 0, row: 0,  colSpan: 12, rowSpan: 3  },
  { id: 'boiler',   col: 0, row: 3,  colSpan: 12, rowSpan: 4  },
  { id: 'floormap', col: 0, row: 7,  colSpan: 12, rowSpan: 10 },
  { id: 'climate',  col: 0, row: 17, colSpan: 12, rowSpan: 7  },
]

const FP_WIDGET_LABELS = {
  kpi:      'KPI Stats',
  boiler:   'Boiler Control',
  floormap: 'Floorplan Map',
  climate:  'Climate Trend',
}

function loadFpLayout() {
  try {
    const raw = localStorage.getItem(FP_LAYOUT_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return FP_DEFAULT_LAYOUT.map(d => ({ ...d, ...(saved.find(s => s.id === d.id) || {}) }))
    }
  } catch {}
  return FP_DEFAULT_LAYOUT
}

function saveFpLayout(l) {
  try { localStorage.setItem(FP_LAYOUT_KEY, JSON.stringify(l)) } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
// ║ FP GRID LAYOUT ENGINE
// ════════════════════════════════════════════════════════════════════════════
function FpGridLayout({ layout, setLayout, layoutEditMode, children }) {
  const containerRef = useRef(null)
  const stateRef     = useRef(null)
  const rafRef       = useRef(null)

  const pxToCol = useCallback(px => {
    const el = containerRef.current
    if (!el) return 0
    return Math.round(px / ((el.offsetWidth + FP_GRID_GAP) / FP_GRID_COLS))
  }, [])

  const pxToRow = useCallback(px =>
    Math.round(px / (FP_GRID_ROW_H + FP_GRID_GAP)), [])

  const onMove = useCallback(e => {
    if (!stateRef.current) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const { id, type, startX, startY, snapshot } = stateRef.current
      const dx = clientX - startX
      const dy = clientY - startY
      const base = snapshot.find(x => x.id === id)
      if (!base) return
      setLayout(prev => prev.map(x => {
        if (x.id !== id) return x
        if (type === 'drag') return {
          ...x,
          col: Math.max(0, Math.min(FP_GRID_COLS - base.colSpan, base.col + pxToCol(dx))),
          row: Math.max(0, base.row + pxToRow(dy)),
        }
        return {
          ...x,
          colSpan: Math.max(FP_MIN_CS, Math.min(FP_GRID_COLS - base.col, base.colSpan + pxToCol(dx))),
          rowSpan: Math.max(FP_MIN_RS, base.rowSpan + pxToRow(dy)),
        }
      }))
    })
  }, [pxToCol, pxToRow, setLayout])

  const onUp = useCallback(() => {
    if (!stateRef.current) return
    stateRef.current = null
    setLayout(prev => { saveFpLayout(prev); return prev })
  }, [setLayout])

  useEffect(() => {
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [onMove, onUp])

  const startInteraction = (e, id, type) => {
    if (!layoutEditMode) return
    e.preventDefault(); e.stopPropagation()
    const cx = e.touches ? e.touches[0].clientX : e.clientX
    const cy = e.touches ? e.touches[0].clientY : e.clientY
    stateRef.current = { id, type, startX: cx, startY: cy, snapshot: layout.map(x => ({ ...x })) }
  }

  const totalRows = layout.reduce((m, x) => Math.max(m, x.row + x.rowSpan), 0) + 1

  return (
    <div ref={containerRef} style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${FP_GRID_COLS}, 1fr)`,
      gridTemplateRows: `repeat(${totalRows}, ${FP_GRID_ROW_H}px)`,
      gap: FP_GRID_GAP,
    }}>
      {children(layout, (id, type) => layoutEditMode ? e => startInteraction(e, id, type) : undefined)}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ FP WIDGET SHELL
// ════════════════════════════════════════════════════════════════════════════
function FpWidgetShell({ item, layoutEditMode, onDragStart, onResizeStart, hidden, children }) {
  if (hidden) return null
  return (
    <div style={{
      gridColumn: `${item.col + 1} / span ${item.colSpan}`,
      gridRow: `${item.row + 1} / span ${item.rowSpan}`,
      position: 'relative',
      borderRadius: 16,
      overflow: 'hidden',
      outline: layoutEditMode ? '2px dashed var(--accent)' : 'none',
      outlineOffset: 3,
      touchAction: layoutEditMode ? 'none' : 'auto',
    }}>
      {layoutEditMode && (
        <div
          onPointerDown={onDragStart}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 32, zIndex: 30,
            cursor: 'grab',
            background: 'rgba(99,102,241,0.12)',
            borderBottom: '1px dashed rgba(99,102,241,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            backdropFilter: 'blur(4px)',
          }}
        >
          <GripVertical size={13} style={{ color: 'var(--accent)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.60rem', color: 'var(--accent)', fontWeight: 700 }}>
            {FP_WIDGET_LABELS[item.id] || item.id}
          </span>
        </div>
      )}
      <div style={{ height: '100%', paddingTop: layoutEditMode ? 32 : 0, boxSizing: 'border-box' }}>
        {children}
      </div>
      {layoutEditMode && (
        <div
          onPointerDown={onResizeStart}
          style={{
            position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, zIndex: 30,
            cursor: 'nwse-resize',
            background: 'rgba(99,102,241,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderTopLeftRadius: 6,
          }}
        >
          <Maximize2 size={10} style={{ color: 'var(--accent)' }} />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ WIDGET VISIBILITY PANEL
// ════════════════════════════════════════════════════════════════════════════
function FpVisibilityPanel({ hidden, onToggle }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '0.35rem',
      padding: '0.6rem 1rem', marginBottom: '0.75rem',
      borderRadius: 10, background: 'rgba(99,102,241,0.06)',
      border: '1px dashed rgba(99,102,241,0.30)',
    }}>
      <span style={{ fontSize: '0.60rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', width: '100%', marginBottom: 2 }}>
        Widget Visibility
      </span>
      {Object.entries(FP_WIDGET_LABELS).map(([id, label]) => {
        const vis = !hidden.has(id)
        return (
          <button key={id} onClick={() => onToggle(id)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 999,
            background: vis ? 'rgba(99,102,241,0.14)' : 'var(--bg-surface-2)',
            border: `1px solid ${vis ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
            color: vis ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.14s',
          }}>
            <span style={{ fontSize: '0.5rem' }}>{vis ? '●' : '○'}</span> {label}
          </button>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ ROOM OVERRIDES — localStorage helper
// ════════════════════════════════════════════════════════════════════════════
const ROOMS_STORAGE_KEY = 'fp-rooms-v2'

function loadRoomOverrides() {
  try { return JSON.parse(localStorage.getItem(ROOMS_STORAGE_KEY) || '{}') } catch { return {} }
}

function saveRoomOverrides(overrides) {
  try { localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(overrides)) } catch {}
}

function resolveRoom(room, overrides) {
  return overrides[room.id] ? { ...room, ...overrides[room.id] } : room
}

// ════════════════════════════════════════════════════════════════════════════
// ║ DESIGN TOKENS
// ════════════════════════════════════════════════════════════════════════════
const T = {
  bg:        'var(--bg-page)',
  surface:   'var(--bg-surface)',
  surface2:  'var(--bg-surface-2)',
  glass:     'var(--bg-glass)',
  glassBd:   'var(--border)',
  blur:      'blur(12px)',
  radius:    '16px',
  radiusSm:  '10px',
  radiusFull:'999px',
  textPrimary:   'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted:     'var(--text-muted)',
  accent:    'var(--accent)',
  accentHov: 'var(--accent-hover)',
  border:    'var(--border)',
  borderHov: 'var(--border-strong)',
  mono:      'var(--font-mono)',
  sans:      'var(--font-body)',
}

const CLIMATE_TT = {
  contentStyle: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-strong)',
    borderRadius: 10,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow-md)',
  },
  cursor: { stroke: 'var(--border-strong)', strokeDasharray: '3 3' },
}

const GCard = ({ children, style, onClick, className }) => (
  <div onClick={onClick} className={className} style={{
    background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur,
    border: `1px solid ${T.glassBd}`, borderRadius: T.radius, ...style,
  }}>
    {children}
  </div>
)

// ════════════════════════════════════════════════════════════════════════════
// ║ CLIMATE TREND CARD
// ════════════════════════════════════════════════════════════════════════════
function ClimateTrendCard() {
  const [loading, setLoading] = useState(true)
  const [todayData, setTodayData] = useState([])
  const [rangeData, setRangeData] = useState([])
  const [currentTemp, setCurrentTemp] = useState(null)
  const [currentHum, setCurrentHum] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loadingRange, setLoadingRange] = useState(false)
  const [chartMode, setChartMode] = useState('today')
  const [rangeLabel, setRangeLabel] = useState('Today')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [sensors, tempToday, humToday] = await Promise.all([
          api.getSensors().catch(() => null),
          api.getTodayTemp().catch(() => ({})),
          api.getTodayHum().catch(() => ({})),
        ])
        if (sensors?.temperature?.current != null) setCurrentTemp(parseFloat(sensors.temperature.current))
        if (sensors?.humidity?.current != null) setCurrentHum(parseFloat(sensors.humidity.current))
        const hourSet = new Set([
          ...Object.keys(tempToday || {}).map(Number),
          ...Object.keys(humToday || {}).map(Number),
        ])
        const merged = Array.from(hourSet).filter((h) => Number.isFinite(h)).sort((a, b) => a - b).map((hour) => ({
          hour: `${hour}:00`,
          temp: tempToday?.[hour] ?? tempToday?.[String(hour)] ?? null,
          hum: humToday?.[hour] ?? humToday?.[String(hour)] ?? null,
        }))
        setTodayData(merged); setChartMode('today'); setRangeLabel('Today')
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const fetchRange = async () => {
    if (!startDate || !endDate) return
    if (new Date(startDate) >= new Date(endDate)) return
    setLoadingRange(true)
    try {
      const [tempRange, humRange] = await Promise.all([
        api.getRangeTemp(startDate, endDate).catch(() => []),
        api.getRangeHum(startDate, endDate).catch(() => []),
      ])
      const timeSet = new Set([...tempRange.map((e) => e.hour), ...humRange.map((e) => e.hour)])
      const merged = Array.from(timeSet).sort((a, b) => new Date(a) - new Date(b)).map((hour) => {
        const tempEntry = tempRange.find((e) => e.hour === hour)
        const humEntry = humRange.find((e) => e.hour === hour)
        return {
          hour: new Date(hour).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
          temp: tempEntry?.avg_temperature ?? null,
          hum: humEntry?.avg_humidity ?? null,
        }
      })
      setRangeData(merged); setChartMode('range'); setRangeLabel(`${startDate} → ${endDate}`)
    } finally { setLoadingRange(false) }
  }

  const chartData = chartMode === 'range' ? rangeData : todayData
  const tempLabel = currentTemp != null ? `${currentTemp.toFixed(1)}°C` : '—'
  const humLabel = currentHum != null ? `${currentHum.toFixed(0)}%` : '—'

  return (
    <GCard style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Thermometer size={13} style={{ color: '#f97316' }} />
            <Droplets size={13} style={{ color: '#38bdf8' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: T.textPrimary }}>Climate trend</div>
            <div style={{ fontSize: '0.58rem', color: T.textSecondary, fontFamily: T.mono }}>Temperature + humidity on one chart</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.55rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Temp</span>
            <span style={{ fontFamily: T.mono, fontSize: '0.92rem', fontWeight: 700, color: '#f97316' }}>{tempLabel}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.55rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Hum</span>
            <span style={{ fontFamily: T.mono, fontSize: '0.92rem', fontWeight: 700, color: '#38bdf8' }}>{humLabel}</span>
          </div>
        </div>
      </div>
      <div style={{ padding: '0.8rem 1rem 0.9rem', borderBottom: `1px solid ${T.border}`, display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'end', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'end' }}>
          <div className="field" style={{ minWidth: 140 }}>
            <label className="field-label">Start</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label className="field-label">End</label>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button className="btn btn--primary btn--sm" onClick={fetchRange} disabled={loadingRange || !startDate || !endDate} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', alignSelf: 'end' }}>
            <Search size={12} /> Query history
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => { setChartMode('today'); setRangeLabel('Today') }} disabled={chartMode === 'today'} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', alignSelf: 'end' }}>
            Today
          </button>
        </div>
        <div style={{ fontSize: '0.58rem', color: T.textMuted, fontFamily: T.mono }}>{chartMode === 'range' ? rangeLabel : 'Showing today'}</div>
      </div>
      <div style={{ flex: 1, padding: '0.9rem 0.85rem 1rem', minHeight: 0 }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMuted, fontSize: '0.75rem', fontFamily: T.mono }}>
            <RefreshCw size={14} style={{ marginRight: 8, animation: 'spin 0.8s linear infinite' }} /> Loading climate trend...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="climateTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="climateHum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,184,0.14)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickMargin={10} />
              <YAxis yAxisId="temp" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={34} tickMargin={8} unit="°" domain={['auto', 'auto']} />
              <YAxis yAxisId="hum" orientation="right" tick={{ fontFamily: 'var(--font-mono)', fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={34} tickMargin={8} unit="%" domain={['auto', 'auto']} />
              <Tooltip {...CLIMATE_TT} formatter={(value, name) => {
                if (value == null) return ['N/A', name === 'temp' ? 'Temperature' : 'Humidity']
                return [name === 'temp' ? `${value}°C` : `${value}%`, name === 'temp' ? 'Temperature' : 'Humidity']
              }} />
              <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-secondary)' }} />
              <Area yAxisId="temp" type="monotone" dataKey="temp" name="Temperature" stroke="#f97316" fill="url(#climateTemp)" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: '#f97316', strokeWidth: 0 }} connectNulls />
              <Area yAxisId="hum" type="monotone" dataKey="hum" name="Humidity" stroke="#38bdf8" fill="url(#climateHum)" strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: '#38bdf8', strokeWidth: 0 }} connectNulls />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </GCard>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ BOILER CONTROL CARD
// ════════════════════════════════════════════════════════════════════════════
function BoilerControlCard({ isOn, thermostat, currentTemp, targetTemp, onToggleBoiler, onToggleThermostat, onAdjustTarget, onOpenBlackout, statusLabel }) {
  const boilerColor = isOn ? 'var(--color-success)' : 'var(--color-danger)'
  return (
    <GCard style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: T.textPrimary }}>Boiler control</div>
          <div style={{ fontSize: '0.58rem', color: T.textSecondary, fontFamily: T.mono }}>Manual + thermostat management</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 8px', borderRadius: T.radiusFull, fontSize: '0.60rem', fontWeight: 700, color: boilerColor, background: `${boilerColor}14`, border: `1px solid ${boilerColor}24`, fontFamily: T.mono }}>
            Boiler {isOn ? 'ON' : 'OFF'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 8px', borderRadius: T.radiusFull, fontSize: '0.60rem', fontWeight: 700, color: thermostat ? 'var(--color-success)' : T.textMuted, background: thermostat ? 'rgba(22,163,74,0.10)' : T.surface2, border: `1px solid ${thermostat ? 'rgba(22,163,74,0.20)' : T.border}`, fontFamily: T.mono }}>
            Thermostat {thermostat ? 'Auto' : 'Manual'}
          </span>
        </div>
      </div>
      <div style={{ padding: '0.9rem 1rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem', flexShrink: 0 }}>
        <div style={{ padding: '0.75rem', borderRadius: T.radiusSm, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.55rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Current temp</div>
          <div style={{ marginTop: '0.35rem', fontFamily: T.mono, fontSize: '1.4rem', fontWeight: 800, color: T.textPrimary }}>{currentTemp != null ? `${currentTemp.toFixed(1)}°C` : '—'}</div>
        </div>
        <div style={{ padding: '0.75rem', borderRadius: T.radiusSm, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.55rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Target temp</div>
          <div style={{ marginTop: '0.35rem', fontFamily: T.mono, fontSize: '1.4rem', fontWeight: 800, color: T.textPrimary }}>{targetTemp != null ? `${targetTemp.toFixed(1)}°C` : '—'}</div>
        </div>
        <div style={{ padding: '0.75rem', borderRadius: T.radiusSm, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.55rem', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Status</div>
          <div style={{ marginTop: '0.35rem', fontFamily: T.mono, fontSize: '0.9rem', fontWeight: 700, color: T.textPrimary }}>{statusLabel || '—'}</div>
        </div>
      </div>
      <div style={{ padding: '0 1rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn--sm" onClick={onToggleBoiler} style={{ background: isOn ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)', borderColor: isOn ? 'rgba(22,163,74,0.20)' : 'rgba(220,38,38,0.20)', color: isOn ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {isOn ? 'Turn boiler off' : 'Turn boiler on'}
        </button>
        <button className="btn btn--sm btn--ghost" onClick={onToggleThermostat}>{thermostat ? 'Disable thermostat' : 'Enable thermostat'}</button>
        <button className="btn btn--sm btn--ghost" onClick={onOpenBlackout}>Season blackout</button>
        <button className="btn btn--sm btn--ghost" onClick={() => onAdjustTarget(-0.5)} disabled={!thermostat}>-0.5°C</button>
        <button className="btn btn--sm btn--ghost" onClick={() => onAdjustTarget(0.5)} disabled={!thermostat}>+0.5°C</button>
      </div>
    </GCard>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ BOILER BLACKOUT MODAL
// ════════════════════════════════════════════════════════════════════════════
function BoilerBlackoutModal({ onClose, onSaved, showToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [startMonth, setStartMonth] = useState(4)
  const [startDay, setStartDay] = useState(1)
  const [endMonth, setEndMonth] = useState(9)
  const [endDay, setEndDay] = useState(30)
  const [reason, setReason] = useState('Boiler disabled during warm season')
  const [currentlyBlocked, setCurrentlyBlocked] = useState(false)

  useEffect(() => {
    const loadCfg = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/boiler/blackout')
        const data = await res.json()
        setEnabled(!!data.enabled); setStartMonth(data.start_month || 4); setStartDay(data.start_day || 1)
        setEndMonth(data.end_month || 9); setEndDay(data.end_day || 30)
        setReason(data.reason || 'Boiler disabled during warm season'); setCurrentlyBlocked(!!data.currently_blocked)
      } catch { showToast('Failed to load blackout config', 'error') }
      finally { setLoading(false) }
    }
    loadCfg()
  }, [showToast])

  const selectStyle = { padding: '0.42rem 0.6rem', fontSize: '0.8rem', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.textPrimary, fontFamily: T.mono, cursor: 'pointer' }
  const isWrapAround = startMonth * 100 + startDay > endMonth * 100 + endDay

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/boiler/blackout', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, start_month: startMonth, start_day: startDay, end_month: endMonth, end_day: endDay, reason: reason.trim() || 'Boiler disabled during this period' }),
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Save failed') }
      await res.json().catch(() => null); onSaved?.(); showToast('Blackout settings saved', 'success'); onClose()
    } catch (err) { showToast(err.message || 'Error saving', 'error') }
    finally { setSaving(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <AlertTriangle size={15} style={{ color: enabled && currentlyBlocked ? 'var(--color-danger)' : 'var(--color-warning)' }} />
          <span style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary }}>Boiler blackout period</span>
        </div>
        <div style={{ fontSize: '0.7rem', color: T.textSecondary }}>Choose the season in which the boiler is disabled.</div>
      </div>
      {loading ? (
        <div style={{ padding: '1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: T.textMuted, fontSize: '0.8rem' }}>
          <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.85rem 0', borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: T.textPrimary }}>Enable blackout period</div>
              <div style={{ fontSize: '0.7rem', color: T.textSecondary, marginTop: '0.15rem' }}>
                {enabled ? `Boiler blocked from ${MONTHS_SHORT[startMonth - 1]} ${startDay} to ${MONTHS_SHORT[endMonth - 1]} ${endDay}` : 'No restriction active'}
              </div>
            </div>
            <button onClick={() => setEnabled((v) => !v)} style={{ width: 46, height: 28, borderRadius: 999, border: 'none', padding: 0, background: enabled ? 'var(--color-warning)' : 'var(--bg-surface-3)', position: 'relative', cursor: 'pointer' }}>
              <div style={{ position: 'absolute', top: 3, left: enabled ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.22)' }} />
            </button>
          </div>
          <div style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-success)', marginBottom: '0.5rem', fontFamily: T.mono }}>Block starts</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <select style={selectStyle} value={startMonth} onChange={(e) => setStartMonth(+e.target.value)}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
                  <select style={{ ...selectStyle, minWidth: 56 }} value={startDay} onChange={(e) => setStartDay(+e.target.value)}>{Array.from({ length: daysInMonth(startMonth) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-danger)', marginBottom: '0.5rem', fontFamily: T.mono }}>Block ends</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <select style={selectStyle} value={endMonth} onChange={(e) => setEndMonth(+e.target.value)}>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
                  <select style={{ ...selectStyle, minWidth: 56 }} value={endDay} onChange={(e) => setEndDay(+e.target.value)}>{Array.from({ length: daysInMonth(endMonth) }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select>
                </div>
              </div>
            </div>
            {enabled && isWrapAround && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--color-warning)', fontFamily: T.mono, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertTriangle size={12} /> Wrap-around period: blocks across year-end.
              </div>
            )}
            <div style={{ marginTop: '0.85rem' }} className="field">
              <label className="field-label">Message shown when blocked</label>
              <input className="input input--mono" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Boiler disabled during warm season (Apr–Sep)" style={{ fontSize: '0.78rem' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: '0.68rem', color: T.textMuted, fontFamily: T.mono }}>{currentlyBlocked ? 'Active now' : 'Not active now'}</div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
              <button className="btn btn--primary btn--sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save blackout'}</button>
            </div>
          </div>
        </div>
      )}
    </ModalOverlay>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ BUTTON primitive
// ════════════════════════════════════════════════════════════════════════════
const Btn = ({ children, onClick, active, danger, ghost, sm, style, ...rest }) => (
  <button onClick={onClick} {...rest} style={{
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
    padding: sm ? '0.35rem 0.65rem' : '0.45rem 0.875rem',
    fontSize: sm ? '0.72rem' : '0.78rem', fontWeight: 600, fontFamily: T.sans, borderRadius: T.radiusSm,
    border: `1px solid ${active ? T.accent : danger ? 'rgba(239,68,68,0.35)' : T.border}`,
    background: active ? `${T.accent}22` : danger ? 'rgba(239,68,68,0.08)' : ghost ? 'transparent' : T.surface2,
    color: active ? '#818cf8' : danger ? '#f87171' : T.textPrimary,
    cursor: 'pointer', transition: 'all 0.14s', whiteSpace: 'nowrap', ...style,
  }}>
    {children}
  </button>
)

// ════════════════════════════════════════════════════════════════════════════
// ║ LIVE VALUE BADGE
// ════════════════════════════════════════════════════════════════════════════
function LiveValueBadge({ liveApi }) {
  const { value, timestamp, loading, error, refetch } = useLiveSensorValue(liveApi)
  const hasValue = value !== null && !error
  return (
    <div style={{ borderRadius: T.radiusSm, padding: '0.55rem 0.7rem', background: hasValue ? 'rgba(52,211,153,0.07)' : T.surface, border: `1px solid ${hasValue ? 'rgba(52,211,153,0.20)' : T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: hasValue ? '#34d399' : T.textMuted, display: 'inline-block', animation: hasValue ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: hasValue ? '#34d399' : T.textMuted }}>
            {liveApi.endpoint?.split('/').pop()?.split('?')[0] || 'Live API'}
          </span>
        </div>
        <button onClick={refetch} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.textMuted, lineHeight: 1 }}>
          <RefreshCw size={9} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>
      {error ? (
        <div style={{ fontSize: '0.68rem', color: '#f87171', fontFamily: T.mono }}>{error}</div>
      ) : loading && value === null ? (
        <div style={{ fontSize: '0.65rem', color: T.textMuted }}>Fetching…</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
          <span style={{ fontFamily: T.mono, fontSize: '1.25rem', fontWeight: 800, color: T.textPrimary, lineHeight: 1 }}>{formatLiveValue(value)}</span>
          {liveApi.unit && <span style={{ fontFamily: T.mono, fontSize: '0.68rem', color: T.textSecondary, fontWeight: 500 }}>{liveApi.unit}</span>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
        <span style={{ fontSize: '0.55rem', fontFamily: T.mono, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{liveApi.value_path || 'root'}</span>
        {timestamp && <span style={{ fontSize: '0.55rem', fontFamily: T.mono, color: T.textMuted }}>{relativeTs(timestamp)}</span>}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ KPI STRIP
// ════════════════════════════════════════════════════════════════════════════
const KpiCard = ({ label, value, unit, icon, color, trend }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    style={{ background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${T.glassBd}`, borderTop: `2px solid ${color}`, borderRadius: T.radius, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
    </div>
    <div style={{ fontFamily: T.mono, fontSize: '1.6rem', fontWeight: 800, color: T.textPrimary, lineHeight: 1 }}>
      {value != null ? `${value}${unit}` : '—'}
    </div>
    {trend && <div style={{ fontSize: '0.62rem', color: T.textSecondary, fontFamily: T.mono }}>{trend}</div>}
  </motion.div>
)

// ════════════════════════════════════════════════════════════════════════════
// ║ SENSOR CARD (grid)
// ════════════════════════════════════════════════════════════════════════════
const SensorCard = ({ sensor, isSelected, onSelect, onDelete, onConfigureApi }) => {
  const meta = TYPE_META[sensor.type] || TYPE_META['temp_hum']
  const hasAlert = sensor.temperature > 28 || sensor.humidity > 75
  const hasApi = !!sensor.live_api?.endpoint
  return (
    <motion.div layoutId={`sensor-${sensor.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
      onClick={() => onSelect(sensor)} whileHover={{ y: -2 }}
      style={{ background: T.glass, backdropFilter: T.blur, WebkitBackdropFilter: T.blur, border: `1px solid ${isSelected ? meta.color + '60' : T.glassBd}`, borderRadius: T.radius, padding: '1.1rem', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s' }}>
      {hasAlert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #ef4444, #f97316)' }} />}
      {isSelected && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${meta.color}, transparent)` }} />}
      {hasApi && (
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', gap: '0.22rem', padding: '2px 7px', borderRadius: T.radiusFull, fontSize: '0.50rem', fontWeight: 700, color: '#34d399', fontFamily: T.mono, background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.22)' }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite', display: 'inline-block' }} /> LIVE
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', marginBottom: '0.85rem', paddingRight: hasApi ? '3rem' : 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: '10px', flexShrink: 0, background: `${meta.color}18`, border: `1px solid ${meta.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>{meta.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sensor.name}</div>
          <div style={{ fontSize: '0.62rem', color: T.textSecondary, marginTop: 2 }}>{meta.label} · {sensor.room_name || '—'}</div>
        </div>
      </div>
      {hasApi && <div style={{ marginBottom: '0.85rem' }}><LiveValueBadge liveApi={sensor.live_api} /></div>}
      {!hasApi && (sensor.temperature != null || sensor.humidity != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.85rem' }}>
          {sensor.temperature != null && (
            <div style={{ background: 'rgba(249,115,22,0.08)', borderRadius: T.radiusSm, padding: '0.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.55rem', color: '#f97316', fontWeight: 700, marginBottom: 2, letterSpacing: '0.5px' }}>TEMP</div>
              <div style={{ fontFamily: T.mono, fontSize: '1.1rem', fontWeight: 800, color: sensor.temperature > 28 ? '#f87171' : T.textPrimary }}>{sensor.temperature.toFixed(1)}°</div>
            </div>
          )}
          {sensor.humidity != null && (
            <div style={{ background: 'rgba(56,189,248,0.08)', borderRadius: T.radiusSm, padding: '0.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.55rem', color: '#38bdf8', fontWeight: 700, marginBottom: 2, letterSpacing: '0.5px' }}>HUM</div>
              <div style={{ fontFamily: T.mono, fontSize: '1.1rem', fontWeight: 800, color: sensor.humidity > 75 ? '#f87171' : T.textPrimary }}>{sensor.humidity.toFixed(0)}%</div>
            </div>
          )}
        </div>
      )}
      {!hasApi && sensor.last_seen && <div style={{ fontSize: '0.58rem', color: T.textMuted, fontFamily: T.mono, marginBottom: '0.75rem' }}>{relativeTs(sensor.last_seen)}</div>}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button onClick={e => { e.stopPropagation(); onConfigureApi(sensor) }} style={{ flex: 1, fontSize: '0.65rem', fontWeight: 600, fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.4rem', color: hasApi ? '#34d399' : T.textSecondary, borderRadius: T.radiusSm, border: `1px solid ${hasApi ? 'rgba(52,211,153,0.25)' : T.border}`, background: hasApi ? 'rgba(52,211,153,0.07)' : 'transparent', cursor: 'pointer', transition: 'all 0.14s' }}>
          <Settings size={11} />{hasApi ? 'Edit API' : 'Set API'}
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(sensor.id) }} style={{ padding: '0.4rem 0.6rem', borderRadius: T.radiusSm, border: '1px solid rgba(239,68,68,0.20)', background: 'rgba(239,68,68,0.05)', color: '#f87171', cursor: 'pointer', transition: 'all 0.14s' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ SIDEBAR SENSOR ROW
// ════════════════════════════════════════════════════════════════════════════
const SidebarSensorRow = ({ s, isSelected, onSelect, onConfigureApi }) => {
  const meta = TYPE_META[s.type] || TYPE_META['temp_hum']
  const hasApi = !!s.live_api?.endpoint
  const hasAlert = s.temperature > 28 || s.humidity > 75
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
      onClick={() => onSelect(s)}
      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.875rem', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', background: isSelected ? `${T.accent}12` : 'transparent', borderLeft: `2px solid ${isSelected ? T.accent : 'transparent'}`, transition: 'all 0.15s' }}>
      <div style={{ width: 28, height: 28, borderRadius: '8px', flexShrink: 0, background: `${meta.color}18`, border: `1px solid ${meta.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>{meta.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
        <div style={{ fontSize: '0.58rem', color: T.textSecondary }}>{s.room_name || '—'}</div>
      </div>
      {hasApi && <span style={{ fontSize: '0.50rem', fontWeight: 700, fontFamily: T.mono, color: '#34d399', padding: '1px 5px', borderRadius: T.radiusFull, flexShrink: 0, background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.22)' }}>LIVE</span>}
      {hasAlert && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: '0.68rem', fontFamily: T.mono, fontWeight: 700 }}>
        {s.temperature != null && <span style={{ color: s.temperature > 28 ? '#f87171' : T.textPrimary }}>{s.temperature.toFixed(1)}°</span>}
        {s.humidity != null && <span style={{ color: s.humidity > 75 ? '#f87171' : T.textSecondary }}>{s.humidity.toFixed(0)}%</span>}
      </div>
      <button onClick={e => { e.stopPropagation(); onConfigureApi(s) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: hasApi ? '#34d399' : T.textMuted, lineHeight: 1, flexShrink: 0 }}>
        <Settings size={11} />
      </button>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ MODAL OVERLAY
// ════════════════════════════════════════════════════════════════════════════
const ModalOverlay = ({ children, onClose }) => (
  <AnimatePresence>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <motion.div initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 16 }} transition={{ duration: 0.22 }}
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', backdropFilter: 'blur(24px)', border: `1px solid ${T.border}`, borderRadius: '18px', padding: '1.75rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', color: T.textSecondary, lineHeight: 1 }}>
          <X size={13} />
        </button>
        {children}
      </motion.div>
    </motion.div>
  </AnimatePresence>
)

// ════════════════════════════════════════════════════════════════════════════
// ║ API CONFIG MODAL
// ════════════════════════════════════════════════════════════════════════════
const DEFAULT_API_CONFIG = { endpoint: '', mode: 'direct', array_key: 'logs', sort_by: 'created_at', value_path: '', unit: '', refresh_ms: 15000 }
const QUICK_PRESETS = [
  { label: '🌡️ Temperature',  config: { endpoint: '/api_sensors', mode: 'direct', value_path: 'temperature.current', unit: '°C', refresh_ms: 15000 } },
  { label: '💧 Humidity',     config: { endpoint: '/api_sensors', mode: 'direct', value_path: 'humidity.current', unit: '%', refresh_ms: 15000 } },
  { label: '📈 Temp avg 24h', config: { endpoint: '/api_sensors', mode: 'direct', value_path: 'temperature.minMaxLast24Hours', unit: '', refresh_ms: 30000 } },
  { label: '🌬️ Latest log',   config: { endpoint: '/api/pico-logs?limit=20', mode: 'array', array_key: 'logs', sort_by: 'created_at', value_path: 'message', unit: '', refresh_ms: 30000 } },
  { label: '📊 AQI',          config: { endpoint: '/api/pico-logs?limit=20', mode: 'array', array_key: 'logs', sort_by: 'created_at', value_path: 'sensor_data.aqi', unit: 'AQI', refresh_ms: 30000 } },
]

function ApiConfigModal({ sensor, onSave, onClose }) {
  const [cfg, setCfg] = useState({ ...DEFAULT_API_CONFIG, ...(sensor.live_api || {}) })
  const [preview, setPreview] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState(null)
  const upd = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  const testApi = async () => {
    if (!cfg.endpoint) return
    setTesting(true); setTestOk(null); setPreview(null)
    try {
      const res = await fetch(cfg.endpoint)
      const json = await res.json()
      let extracted = null
      if (cfg.mode === 'array') {
        const raw = cfg.array_key ? resolvePath(json, cfg.array_key) : json
        const arr = Array.isArray(raw) ? raw : null
        if (arr && arr.length > 0) {
          const sorted = [...arr].sort((a, b) => new Date(b[cfg.sort_by]) - new Date(a[cfg.sort_by]))
          extracted = cfg.value_path ? resolvePath(sorted[0], cfg.value_path) : sorted[0]
        }
      } else {
        extracted = cfg.value_path ? resolvePath(json, cfg.value_path) : json
      }
      setPreview(extracted); setTestOk(true)
    } catch { setPreview('ERROR — could not reach endpoint'); setTestOk(false) }
    finally { setTesting(false) }
  }

  const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.textPrimary, fontSize: '0.78rem', fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: '0.65rem', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
          <Radio size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary }}>Live API Config</span>
        </div>
        <div style={{ fontSize: '0.70rem', color: T.textSecondary }}>{sensor.name}</div>
      </div>
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Quick presets</label>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {QUICK_PRESETS.map(p => <Btn key={p.label} sm ghost onClick={() => setCfg(c => ({ ...c, ...p.config }))} style={{ fontSize: '0.62rem' }}>{p.label}</Btn>)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        <div>
          <label style={labelStyle}>API Endpoint URL</label>
          <input style={{ ...inputStyle, fontFamily: T.mono }} value={cfg.endpoint} onChange={e => upd('endpoint', e.target.value)} placeholder="https://smarthouse.local/api_sensors" />
        </div>
        <div>
          <label style={labelStyle}>Response mode</label>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {[{ id: 'direct', label: '📦 Direct', sub: 'JSON object' }, { id: 'array', label: '📋 Array', sub: 'Sort → newest item' }].map(m => (
              <button key={m.id} onClick={() => upd('mode', m.id)} style={{ flex: 1, padding: '0.55rem 0.5rem', borderRadius: T.radiusSm, cursor: 'pointer', border: `1px solid ${cfg.mode === m.id ? T.accent : T.border}`, background: cfg.mode === m.id ? `${T.accent}16` : T.surface, textAlign: 'left', transition: 'all 0.14s' }}>
                <div style={{ fontSize: '0.70rem', fontWeight: 700, color: cfg.mode === m.id ? '#818cf8' : T.textPrimary }}>{m.label}</div>
                <div style={{ fontSize: '0.58rem', color: T.textSecondary, marginTop: 2 }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>
        {cfg.mode === 'array' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.75rem', borderRadius: T.radiusSm, background: T.surface, border: `1px solid ${T.border}` }}>
            <div>
              <label style={labelStyle}>Array key</label>
              <input style={{ ...inputStyle, fontFamily: T.mono }} value={cfg.array_key} onChange={e => upd('array_key', e.target.value)} placeholder="logs" />
            </div>
            <div>
              <label style={labelStyle}>Sort by</label>
              <input style={{ ...inputStyle, fontFamily: T.mono }} value={cfg.sort_by} onChange={e => upd('sort_by', e.target.value)} placeholder="created_at" />
            </div>
          </div>
        )}
        <div>
          <label style={labelStyle}>Value path <span style={{ fontWeight: 400, textTransform: 'none' }}>(dot notation)</span></label>
          <input style={{ ...inputStyle, fontFamily: T.mono }} value={cfg.value_path} onChange={e => upd('value_path', e.target.value)} placeholder="temperature.current" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={labelStyle}>Unit</label>
            <input style={inputStyle} value={cfg.unit} onChange={e => upd('unit', e.target.value)} placeholder="°C, %, AQI…" />
          </div>
          <div>
            <label style={labelStyle}>Refresh (ms)</label>
            <input style={{ ...inputStyle, fontFamily: T.mono }} type="number" min={5000} step={1000} value={cfg.refresh_ms} onChange={e => upd('refresh_ms', parseInt(e.target.value) || 15000)} />
          </div>
        </div>
        {preview !== null && (
          <div style={{ padding: '0.65rem 0.875rem', borderRadius: T.radiusSm, background: testOk ? 'rgba(52,211,153,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${testOk ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`, display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            {testOk ? <CheckCircle2 size={14} style={{ color: '#34d399', flexShrink: 0, marginTop: 1 }} /> : <XCircle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />}
            <div>
              <div style={{ fontSize: '0.60rem', fontWeight: 700, marginBottom: 3, color: testOk ? '#34d399' : '#f87171' }}>{testOk ? 'Success — value extracted:' : 'Error'}</div>
              <div style={{ fontFamily: T.mono, fontSize: '0.82rem', color: T.textPrimary, wordBreak: 'break-all' }}>
                {typeof preview === 'object' ? JSON.stringify(preview) : String(preview)}
                {testOk && cfg.unit && <span style={{ color: T.textSecondary }}> {cfg.unit}</span>}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
          <Btn ghost sm onClick={testApi} disabled={!cfg.endpoint || testing}>
            {testing ? <RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : '🔍'} Test
          </Btn>
          <Btn ghost onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <button onClick={() => onSave(cfg)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.55rem', borderRadius: T.radiusSm, fontWeight: 700, fontSize: '0.80rem', background: `linear-gradient(135deg, ${T.accent}, #8b5cf6)`, border: 'none', color: '#fff', cursor: 'pointer' }}>
            <Save size={13} /> Save config
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ SENSOR FORM MODAL
// ════════════════════════════════════════════════════════════════════════════
const SensorFormModal = ({ sensor, pendingPos, onSave, onClose }) => {
  const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm({
    defaultValues: { name: sensor?.name || '', type: sensor?.type || 'temp_hum', room_id: sensor?.room_id || '', topic: sensor?.topic || '' },
    mode: 'onChange',
  })
  const typeValue = watch('type')
  const inputStyle = { width: '100%', padding: '0.6rem 0.75rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, color: T.textPrimary, fontSize: '0.78rem', fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { fontSize: '0.65rem', fontWeight: 700, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '0.4rem' }
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary }}>{sensor ? '✏️ Edit sensor' : '➕ New sensor'}</span>
        {pendingPos && <div style={{ fontSize: '0.63rem', fontFamily: T.mono, color: T.textSecondary, marginTop: 4 }}>Position: x={pendingPos.x.toFixed(1)}% · y={pendingPos.y.toFixed(1)}%</div>}
      </div>
      <form onSubmit={handleSubmit(data => onSave({ ...data, ...pendingPos }))}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Sensor name *</label>
            <input style={inputStyle} {...register('name', { required: 'Name required', minLength: 2 })} placeholder="e.g. Bedroom north" autoFocus />
            {errors.name && <span style={{ fontSize: '0.65rem', color: '#f87171', marginTop: '0.2rem', display: 'block' }}>{errors.name.message}</span>}
          </div>
          <div>
            <label style={labelStyle}>Sensor type *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              {SENSOR_TYPES.map(t => (
                <button key={t.id} type="button" onClick={() => register('type').onChange({ target: { value: t.id } })}
                  style={{ padding: '0.6rem 0.3rem', borderRadius: T.radiusSm, cursor: 'pointer', border: `1px solid ${typeValue === t.id ? t.color + '80' : T.border}`, background: typeValue === t.id ? `${t.color}12` : T.surface, fontSize: '0.60rem', color: typeValue === t.id ? t.color : T.textSecondary, fontWeight: typeValue === t.id ? 700 : 400, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.14s' }}>
                  <span style={{ fontSize: '1rem' }}>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
            <input type="hidden" {...register('type')} />
          </div>
          <div>
            <label style={labelStyle}>Room *</label>
            <select style={{ ...inputStyle }} {...register('room_id', { required: 'Room required' })}>
              <option value="">— Select room —</option>
              {DEFAULT_ROOMS.filter(r => r.area).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {errors.room_id && <span style={{ fontSize: '0.65rem', color: '#f87171', marginTop: '0.2rem', display: 'block' }}>{errors.room_id.message}</span>}
          </div>
          <div>
            <label style={labelStyle}>MQTT Topic <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
            <input style={{ ...inputStyle, fontFamily: T.mono }} {...register('topic')} placeholder="home/sala/temperatura" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Btn ghost onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <button type="submit" disabled={!isValid}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.6rem', borderRadius: T.radiusSm, fontWeight: 700, fontSize: '0.80rem', background: isValid ? `linear-gradient(135deg, ${T.accent}, #8b5cf6)` : T.surface, border: 'none', color: isValid ? '#fff' : T.textMuted, cursor: isValid ? 'pointer' : 'not-allowed' }}>
            <Save size={13} /> {sensor ? 'Update' : 'Add sensor'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ ROOM EDIT HANDLE
// ════════════════════════════════════════════════════════════════════════════
function RoomEditHandle({ room, onDragStart, onResizeStart }) {
  return (
    <g>
      {/* Translucent overlay — full room is draggable */}
      <rect
        x={room.x} y={room.y} width={room.w} height={room.h}
        fill="rgba(99,102,241,0.06)"
        stroke="#6366f1"
        strokeWidth={0.5}
        strokeDasharray="1.5 1"
        rx={0.8}
        style={{ cursor: 'move' }}
        onMouseDown={e => onDragStart(e, room)}
      />
      {/* Move handle — top-left badge */}
      <rect x={room.x + 0.4} y={room.y + 0.4} width={5} height={3.2} rx={1.5}
        fill="rgba(99,102,241,0.85)" style={{ cursor: 'move' }}
        onMouseDown={e => onDragStart(e, room)}
      />
      <text x={room.x + 2.9} y={room.y + 2.45} textAnchor="middle" fontSize={1.8} fill="#fff"
        style={{ cursor: 'move', pointerEvents: 'none', userSelect: 'none' }}>⠿</text>
      {/* Resize handle — bottom-right corner */}
      <rect
        x={room.x + room.w - 3.5} y={room.y + room.h - 3.5}
        width={3.5} height={3.5} rx={1}
        fill="rgba(99,102,241,0.85)"
        style={{ cursor: 'se-resize' }}
        onMouseDown={e => onResizeStart(e, room)}
      />
      <text x={room.x + room.w - 1.75} y={room.y + room.h - 0.7} textAnchor="middle" fontSize={2.2}
        fill="#fff" style={{ cursor: 'se-resize', pointerEvents: 'none', userSelect: 'none' }}>⇲</text>
      {/* Dimensions label */}
      <rect x={room.x + room.w / 2 - 6} y={room.y + room.h - 4.8} width={12} height={3.5} rx={1.7}
        fill="rgba(8,12,30,0.70)" style={{ pointerEvents: 'none' }} />
      <text x={room.x + room.w / 2} y={room.y + room.h - 2.6} textAnchor="middle" fontSize={1.6}
        fill="rgba(139,140,248,0.95)" fontFamily="monospace" style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {room.w.toFixed(1)}×{room.h.toFixed(1)}
      </text>
    </g>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ FLOORPLAN MAP SVG — fixed coordinate conversion
// ════════════════════════════════════════════════════════════════════════════
const FloorplanMap = ({
  sensors, selectedId, onSelectSensor, onDragSensor, onDragSensorEnd,
  bgImage, zoom, onZoom, editMode, addMode, onAddClick,
  roomsEditMode, roomOverrides, onRoomChange,
}) => {
  const svgRef  = useRef(null)
  const dragRef = useRef(null)

  /**
   * Convert a pointer screen position → SVG viewBox coordinates (0–100).
   * We read the live CTM so zoom/pan is always accounted for correctly.
   */
  const toSvgCoords = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt  = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    // matrixTransform with the inverse of the current transformation matrix
    // gives us coordinates in the SVG's own coordinate space (0–100 viewBox),
    // already accounting for the inner <g transform="scale(zoom)"> because
    // we target the <svg> element, not the <g>.
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse())
    return {
      x: clamp(svgPt.x, 0, 100),
      y: clamp(svgPt.y, 0, 100),
    }
  }, [])

  // ── Sensor drag ────────────────────────────────────────────────────────
  const handleSensorPointerDown = useCallback((e, sensor) => {
    if (!editMode) return
    e.preventDefault()
    e.stopPropagation()
    const origin = toSvgCoords(e.clientX, e.clientY)
    dragRef.current = {
      type: 'sensor',
      sensor,
      originSvg: origin,
      originItem: { x: sensor.x, y: sensor.y },
    }
    ;(e.target).setPointerCapture(e.pointerId)
  }, [editMode, toSvgCoords])

  // ── Room drag / resize ─────────────────────────────────────────────────
  const handleRoomPointerDown = useCallback((e, room, action) => {
    if (!roomsEditMode) return
    e.preventDefault()
    e.stopPropagation()
    const origin = toSvgCoords(e.clientX, e.clientY)
    dragRef.current = {
      type: action === 'resize' ? 'roomResize' : 'roomDrag',
      roomId: room.id,
      originSvg: origin,
      originItem: { x: room.x, y: room.y, w: room.w, h: room.h },
    }
    ;(e.target).setPointerCapture(e.pointerId)
  }, [roomsEditMode, toSvgCoords])

  // ── Unified pointer move (on the SVG element) ──────────────────────────
  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return
    e.preventDefault()
    const cur  = toSvgCoords(e.clientX, e.clientY)
    const { type, originSvg, originItem } = dragRef.current
    const dx = cur.x - originSvg.x
    const dy = cur.y - originSvg.y

    if (type === 'sensor') {
      const newX = clamp(originItem.x + dx, 1.5, 98.5)
      const newY = clamp(originItem.y + dy, 1.5, 98.5)
      onDragSensor(dragRef.current.sensor.id, { x: newX, y: newY })
    } else if (type === 'roomDrag') {
      onRoomChange(dragRef.current.roomId, {
        x: clamp(originItem.x + dx, 0, 100 - originItem.w),
        y: clamp(originItem.y + dy, 0, 100 - originItem.h),
        w: originItem.w,
        h: originItem.h,
      })
    } else if (type === 'roomResize') {
      onRoomChange(dragRef.current.roomId, {
        x: originItem.x,
        y: originItem.y,
        w: clamp(originItem.w + dx, 5, 95),
        h: clamp(originItem.h + dy, 5, 95),
      })
    }
  }, [toSvgCoords, onDragSensor, onRoomChange])

  // ── Pointer up — finalise and persist ─────────────────────────────────
  const handlePointerUp = useCallback((e) => {
    if (!dragRef.current) return
    if (dragRef.current.type === 'sensor') {
      onDragSensorEnd?.(dragRef.current.sensor.id)
    }
    dragRef.current = null
  }, [onDragSensorEnd])

  // ── SVG click for "add" mode ───────────────────────────────────────────
  const handleSvgClick = useCallback((e) => {
    if (!addMode) return
    const coords = toSvgCoords(e.clientX, e.clientY)
    onAddClick(coords)
  }, [addMode, toSvgCoords, onAddClick])

  return (
    <div style={{
      position: 'relative', overflow: 'hidden', height: '100%',
      borderRadius: T.radius, background: 'var(--bg-surface)',
      border: `1px solid ${T.glassBd}`, backdropFilter: 'blur(12px)',
      boxShadow: 'var(--shadow-md)',
    }}>

      {/* Status banner */}
      <AnimatePresence>
        {(addMode || editMode || roomsEditMode) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15,
              background: addMode ? 'rgba(59,130,246,0.88)' : roomsEditMode ? 'rgba(99,102,241,0.88)' : 'rgba(245,158,11,0.88)',
              color: '#fff', textAlign: 'center', padding: '0.5rem',
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.2px',
              pointerEvents: 'none',
            }}>
            {addMode
              ? '📍 Click on the map to place sensor'
              : roomsEditMode
              ? '🏠 Drag rooms to move · resize handle (⇲) to resize · saved automatically'
              : '✋ Drag sensors to reposition · saved on release'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 10, display: 'flex', gap: '0.2rem', alignItems: 'center', background: 'var(--bg-surface)', borderRadius: '12px', padding: '0.3rem', border: `1px solid ${T.border}`, backdropFilter: 'blur(8px)', boxShadow: 'var(--shadow-sm)' }}>
        <button onClick={() => onZoom(-0.2)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: '3px 4px', borderRadius: '6px', lineHeight: 1 }}><ZoomOut size={12} /></button>
        <span style={{ fontFamily: T.mono, fontSize: '0.60rem', minWidth: 30, textAlign: 'center', color: T.textSecondary }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => onZoom(0.2)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: '3px 4px', borderRadius: '6px', lineHeight: 1 }}><ZoomIn size={12} /></button>
        <div style={{ width: 1, height: 14, background: T.border, margin: '0 2px' }} />
        <button onClick={() => onZoom(0, true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: '0.58rem', fontFamily: T.mono, padding: '2px 4px' }}>1:1</button>
      </div>

      {/*
        ── SVG MAP ─────────────────────────────────────────────────────────
        All pointer events are handled directly on the SVG so that
        setPointerCapture works correctly and coordinates are always
        computed from the live CTM (no manual zoom maths needed).
      */}
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        style={{
          width: '100%', height: '100%', display: 'block',
          cursor: addMode ? 'crosshair' : 'default',
          userSelect: 'none',
          touchAction: 'none',
        }}
        onClick={handleSvgClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <pattern id="dark-grid" width="2" height="2" patternUnits="userSpaceOnUse">
            <path d="M2 0 L0 0 0 2" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="0.06" />
          </pattern>
        </defs>

        {/* ── Inner group with zoom transform ───────────────────────── */}
        <g transform={`scale(${zoom})`} style={{ transformOrigin: '50px 50px' }}>
          <rect x={0} y={0} width={100} height={100} fill="var(--bg-surface)" />
          <rect x={0} y={0} width={100} height={100} fill="url(#dark-grid)" />
          {bgImage && (
            <image href={bgImage} x={0} y={0} width={100} height={100}
              preserveAspectRatio="xMidYMid meet" opacity={0.32} />
          )}

          {/* ── ROOMS ─────────────────────────────────────────────── */}
          {DEFAULT_ROOMS.map(baseRoom => {
            const room = resolveRoom(baseRoom, roomOverrides)
            return (
              <g key={room.id}>
                <rect
                  x={room.x} y={room.y} width={room.w} height={room.h}
                  fill="var(--bg-surface)" stroke="var(--border)" strokeWidth={0.4} rx={0.8}
                />
                {room.area ? (
                  <>
                    <text x={room.x + room.w / 2} y={room.y + room.h / 2 - 2.2}
                      textAnchor="middle" fontSize={2.3} fill="var(--text-primary)"
                      fontFamily="var(--font-body)" fontWeight="700" letterSpacing="0.2"
                      style={{ pointerEvents: 'none' }}>
                      {room.label}
                    </text>
                    <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 2.5}
                      textAnchor="middle" fontSize={1.6} fill="var(--text-secondary)"
                      fontFamily="var(--font-body)" style={{ pointerEvents: 'none' }}>
                      {room.area}
                    </text>
                  </>
                ) : (
                  <text x={room.x + room.w / 2} y={room.y + room.h / 2}
                    textAnchor="middle" dominantBaseline="central" fontSize={1.8}
                    fill="var(--text-muted)" fontFamily="var(--font-body)"
                    transform={`rotate(-90, ${room.x + room.w / 2}, ${room.y + room.h / 2})`}
                    style={{ pointerEvents: 'none' }}>
                    Hallway
                  </text>
                )}

                {/* Edit handles — rendered on top of room rect */}
                {roomsEditMode && (
                  <RoomEditHandle
                    room={room}
                    onDragStart={(e, r) => handleRoomPointerDown(e, r, 'drag')}
                    onResizeStart={(e, r) => handleRoomPointerDown(e, r, 'resize')}
                  />
                )}
              </g>
            )
          })}

          {/* Outer wall */}
          <rect x={2.5} y={4} width={94.5} height={93}
            fill="none" stroke="var(--border-strong)" strokeWidth={0.7} rx={1} />

          {/* ── SENSORS ─────────────────────────────────────────── */}
          {sensors.map(sensor => {
            const meta = TYPE_META[sensor.type] || TYPE_META['temp_hum']
            const isSelected = selectedId === sensor.id
            const hasAlert = sensor.temperature > 28 || sensor.humidity > 75
            const hasApi   = !!sensor.live_api?.endpoint

            return (
              <g key={sensor.id}
                transform={`translate(${sensor.x}, ${sensor.y})`}
                style={{ cursor: editMode ? 'grab' : 'pointer' }}
              >
                {/* Pulse ring — only when not in edit mode */}
                {!editMode && (
                  <circle r={4.5} fill={meta.color} opacity={0.06}>
                    <animate attributeName="r"       values="2;4.5;2"         dur="2.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity"  values="0.12;0.03;0.12"  dur="2.6s" repeatCount="indefinite" />
                  </circle>
                )}

                {isSelected && (
                  <circle r={3.4} fill="none" stroke={meta.color}
                    strokeWidth={0.4} opacity={0.45} strokeDasharray="0.8 0.6" />
                )}

                {/* Main dot — drag handle when in editMode */}
                <circle r={2.2}
                  fill={isSelected ? meta.color + '18' : 'var(--bg-surface)'}
                  stroke={meta.color}
                  strokeWidth={0.65}
                  style={{
                    filter: isSelected ? `drop-shadow(0 0 4px ${meta.color})` : 'drop-shadow(0 2px 4px rgba(15,23,42,0.12))',
                    cursor: editMode ? 'grab' : 'pointer',
                  }}
                  onClick={e => { if (!editMode) { e.stopPropagation(); onSelectSensor(sensor) } }}
                  onPointerDown={e => handleSensorPointerDown(e, sensor)}
                />

                {/* Alert dot */}
                {hasAlert && (
                  <circle cx={2.2} cy={-2.2} r={0.8}
                    fill="#f87171" stroke="rgba(8,12,30,0.9)" strokeWidth={0.3} />
                )}
                {/* Live dot */}
                {hasApi && !hasAlert && (
                  <circle cx={2.2} cy={-2.2} r={0.65}
                    fill="#34d399" stroke="rgba(8,12,30,0.9)" strokeWidth={0.22} />
                )}

                {/* Edit mode indicator */}
                {editMode && (
                  <circle r={1.4} cx={-2.2} cy={-2.2}
                    fill="rgba(245,158,11,0.9)" stroke="rgba(8,12,30,0.8)" strokeWidth={0.2}
                    style={{ pointerEvents: 'none' }} />
                )}

                {/* Name tag — only when not editing and not selected */}
                {!editMode && !isSelected && (
                  <g transform="translate(2.8, -4.2)">
                    <rect x={0} y={0}
                      width={sensor.name.length * 1.05 + 2.8} height={3.9}
                      rx={2.5} fill="var(--bg-surface)" stroke="var(--border)" strokeWidth={0.38} />
                    <text x={1.4} y={2.6} fontSize={1.65}
                      fill="var(--text-primary)" fontFamily="var(--font-body)"
                      fontWeight="600" letterSpacing="0.08">
                      {sensor.name}
                    </text>
                  </g>
                )}

                {/* Type icon */}
                <text textAnchor="middle" dominantBaseline="central"
                  fontSize={1.5} style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {meta.icon}
                </text>

                {/* Live value tag */}
                <SensorLiveValueTag liveApi={sensor.live_api} compact offsetY={-9.1} theme="light" />
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function FloorplanPage() {
  const { toast, showToast } = useToast()
  const { sensors, setSensors, updateSensor, removeSensor } = useFloorplanStore()
  const fileRef = useRef(null)

  const [loading, setLoading]           = useState(true)
  const [selectedSensor, setSelectedSensor] = useState(null)
  const [editMode, setEditMode]         = useState(false)
  const [addMode, setAddMode]           = useState(false)
  const [roomsEditMode, setRoomsEditMode] = useState(false)
  const [modal, setModal]               = useState(null)
  const [apiModal, setApiModal]         = useState(null)
  const [blackoutOpen, setBlackoutOpen] = useState(false)
  const [bgImage, setBgImage]           = useState(() => localStorage.getItem('fp-bg-image') || '')
  const [mapZoom, setMapZoom]           = useState(1)
  const [viewMode, setViewMode]         = useState('map')
  const [isOn, setIsOn]                 = useState(null)
  const [thermostat, setThermostat]     = useState(false)
  const [currentTemp, setCurrentTemp]   = useState(null)
  const [targetTemp, setTargetTemp]     = useState(null)

  // ── Widget layout ────────────────────────────────────────────────────────
  const [widgetLayout, setWidgetLayout]     = useState(loadFpLayout)
  const [layoutEditMode, setLayoutEditMode] = useState(false)
  const [hiddenWidgets, setHiddenWidgets]   = useState(new Set())

  const toggleWidget = useCallback((id) => {
    setHiddenWidgets(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }, [])

  const resetWidgetLayout = useCallback(() => {
    setWidgetLayout(FP_DEFAULT_LAYOUT)
    saveFpLayout(FP_DEFAULT_LAYOUT)
    showToast('Widget layout reset to default', 'success')
  }, [showToast])

  // ── Room overrides ───────────────────────────────────────────────────────
  const [roomOverrides, setRoomOverrides] = useState(loadRoomOverrides)

  const handleRoomChange = useCallback((roomId, rect) => {
    setRoomOverrides(prev => {
      const next = { ...prev, [roomId]: rect }
      saveRoomOverrides(next)
      return next
    })
  }, [])

  const resetRooms = useCallback(() => {
    setRoomOverrides({})
    saveRoomOverrides({})
    showToast('Rooms reset to default layout', 'success')
  }, [showToast])

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadSensors = useCallback(async () => {
    try {
      const data = await fetch('/api/sensors').then(r => r.json())
      const list = Array.isArray(data) ? data : []
      // Merge in any locally-cached positions so a page refresh keeps positions
      setSensors(mergeSensorPositions(list))
    } catch { showToast('Error loading sensors', 'error') }
    finally { setLoading(false) }
  }, [setSensors, showToast])

  const loadBoiler = useCallback(async () => {
    try {
      const [boiler, thermostatFull] = await Promise.all([
        api.getBoilerStatus().catch(() => null),
        api.getThermostatFull().catch(() => null),
      ])
      if (boiler?.is_on != null) setIsOn(boiler.is_on)
      if (thermostatFull) {
        setThermostat(thermostatFull.thermostat_enabled || false)
        if (thermostatFull.current_temperature != null) setCurrentTemp(thermostatFull.current_temperature)
        if (thermostatFull.target_temperature != null) setTargetTemp(thermostatFull.target_temperature)
        if (thermostatFull.boiler_on != null) setIsOn(thermostatFull.boiler_on)
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadSensors()
    loadBoiler()
    const id       = setInterval(loadSensors, 10000)
    const boilerId = setInterval(loadBoiler,  20000)
    return () => { clearInterval(id); clearInterval(boilerId) }
  }, [loadSensors, loadBoiler])

  // ── Sensor drag — optimistic update + dual persistence ──────────────────
  const handleDragSensor = useCallback((id, coords) => {
    updateSensor(id, coords)
  }, [updateSensor])

  const handleDragSensorEnd = useCallback(async (id) => {
    const sensor = useFloorplanStore.getState().getSensor(id)
    if (!sensor) return

    // 1. Save to localStorage immediately (instant, offline-safe)
    saveSensorPosition(id, sensor.x, sensor.y)

    // 2. Persist via the dedicated position endpoint; keep local fallback otherwise
    try {
      const res = await fetch(`/api/sensors/${id}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: sensor.x, y: sensor.y }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json().catch(() => null)
      if (data && typeof data.x === 'number' && typeof data.y === 'number') {
        const sameX = Math.abs(data.x - sensor.x) < 0.05
        const sameY = Math.abs(data.y - sensor.y) < 0.05
        if (!sameX || !sameY) throw new Error()
      }
      // API persisted → we can trust it on next load; clear the local copy
      clearSensorPosition(id)
      showToast(`📍 ${sensor.name} position saved`, 'success')
    } catch {
      // Keep the localStorage copy as fallback
      showToast(`📍 ${sensor.name} position saved locally`, 'info')
    }
  }, [showToast])

  // ── Boiler controls ──────────────────────────────────────────────────────
  const toggleBoiler = useCallback(async () => {
    if (isOn == null) return
    try {
      if (!isOn) {
        if (thermostat) { await api.thermostatOff().catch(() => {}); setThermostat(false) }
        const res = await fetch('/api/boiler/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turn_on: true }) })
        if (res.status === 403) { const err = await res.json(); showToast(err.reason || 'Boiler is blocked during this period.', 'error'); return }
        if (!res.ok) throw new Error('Server error')
        setIsOn(true); showToast('Boiler ON', 'success')
      } else {
        await api.manualBoiler(false); setIsOn(false); showToast('Boiler OFF', 'success')
      }
    } catch { showToast('Error changing boiler state', 'error') }
  }, [isOn, thermostat, showToast])

  const toggleThermostat = useCallback(async () => {
    try {
      if (thermostat) {
        await api.thermostatOff(); setThermostat(false); showToast('Thermostat disabled', 'success')
      } else {
        const res = await fetch('/api/thermostat/on', { method: 'POST' })
        if (res.status === 403) { const err = await res.json(); showToast(err.reason || 'Boiler is blocked during this period.', 'error'); return }
        if (!res.ok) throw new Error('Server error')
        setThermostat(true); showToast('Thermostat enabled', 'success')
      }
    } catch { showToast('Error changing thermostat state', 'error') }
  }, [thermostat, showToast])

  const adjustTarget = useCallback(async (delta) => {
    if (targetTemp == null) return
    const next = Math.max(15, Math.min(30, Number((targetTemp + delta).toFixed(1))))
    setTargetTemp(next)
    try { await api.setTargetTemp(next); showToast(`Target set to ${next}°C`, 'success') }
    catch { showToast('Error updating target temperature', 'error') }
  }, [targetTemp, showToast])

  // ── Sensor CRUD ──────────────────────────────────────────────────────────
  const saveSensor = useCallback(async (data) => {
    try {
      if (modal?.sensor) {
        const res = await fetch(`/api/sensors/${modal.sensor.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) throw new Error()
        updateSensor(modal.sensor.id, data); showToast('Sensor updated', 'success')
      } else {
        const res = await fetch('/api/sensors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) throw new Error()
        showToast('Sensor added', 'success'); await loadSensors()
      }
      setModal(null); setSelectedSensor(null)
    } catch { showToast('Error saving sensor', 'error') }
  }, [modal, updateSensor, loadSensors, showToast])

  const saveApiConfig = useCallback(async (liveApiConfig) => {
    if (!apiModal) return
    try {
      const payload = { ...apiModal, live_api: liveApiConfig }
      const res = await fetch(`/api/sensors/${apiModal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      await loadSensors(); updateSensor(apiModal.id, { live_api: liveApiConfig }); showToast('API config saved', 'success')
    } catch { showToast('Error saving API config', 'error') }
    finally { setApiModal(null) }
  }, [apiModal, loadSensors, updateSensor, showToast])

  const deleteSensor = useCallback(async (id) => {
    if (!window.confirm('Delete this sensor?')) return
    try {
      await fetch(`/api/sensors/${id}`, { method: 'DELETE' })
      clearSensorPosition(id)
      removeSensor(id); setSelectedSensor(null); showToast('Sensor deleted', 'success')
    } catch { showToast('Error deleting sensor', 'error') }
  }, [removeSensor, showToast])

  const uploadBg = useCallback((file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      if (url) { setBgImage(url); localStorage.setItem('fp-bg-image', url); showToast('Floorplan uploaded', 'success') }
    }
    reader.readAsDataURL(file)
  }, [showToast])

  const handleZoom = useCallback((delta, reset) => {
    if (reset) setMapZoom(1)
    else setMapZoom(p => parseFloat(clamp(p + delta, 0.5, 3).toFixed(2)))
  }, [])

  // ── Stats ────────────────────────────────────────────────────────────────
  const withTemp   = sensors.filter(s => s.temperature != null)
  const withHum    = sensors.filter(s => s.humidity != null)
  const alerts     = sensors.filter(s => s.temperature > 28 || s.humidity > 75)
  const apiSensors = sensors.filter(s => s.live_api?.endpoint)
  const avgTemp    = withTemp.length ? (withTemp.reduce((a, s) => a + s.temperature, 0) / withTemp.length).toFixed(1) : null
  const avgHum     = withHum.length  ? (withHum.reduce((a, s) => a + s.humidity, 0) / withHum.length).toFixed(0)    : null
  const hasRoomOverrides = Object.keys(roomOverrides).length > 0

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.textPrimary, fontFamily: T.sans, padding: '0 1.5rem 2rem' }}>

      {/* ── HEADER ── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', padding: '1.25rem 0 1rem', borderBottom: `1px solid ${T.border}`, marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: `linear-gradient(135deg, ${T.accent}18, rgba(245,158,11,0.18))`, border: `1px solid ${T.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={16} style={{ color: T.accent }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.3px' }}>Smart Floorplan</h1>
            <p style={{ margin: 0, fontSize: '0.65rem', color: T.textMuted, letterSpacing: '0.2px' }}>Live sensor monitoring · auto-refresh 10s</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {alerts.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 8px', borderRadius: T.radiusFull, fontSize: '0.62rem', fontWeight: 700, color: '#dc2626', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)' }}>
              <AlertTriangle size={10} /> {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 8px', borderRadius: T.radiusFull, fontSize: '0.60rem', fontWeight: 600, color: T.textMuted, background: T.surface, border: `1px solid ${T.border}`, fontFamily: T.mono }}>
            {sensors.length} sensor{sensors.length !== 1 ? 's' : ''}
          </span>
          {apiSensors.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 8px', borderRadius: T.radiusFull, fontSize: '0.60rem', fontWeight: 700, color: '#059669', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', fontFamily: T.mono }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite', display: 'inline-block' }} />
              {apiSensors.length} live
            </span>
          )}

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '0.15rem', background: T.surface, borderRadius: '999px', padding: '0.2rem', border: `1px solid ${T.border}` }}>
            <Btn sm active={viewMode === 'map'}  ghost={viewMode !== 'map'}  onClick={() => setViewMode('map')}  title="Map view"><MapIcon size={12} /></Btn>
            <Btn sm active={viewMode === 'grid'} ghost={viewMode !== 'grid'} onClick={() => setViewMode('grid')} title="Grid view"><Grid3x3 size={12} /></Btn>
          </div>

          {/* Sensor move mode */}
          <Btn sm active={editMode} ghost={!editMode}
            onClick={() => { setEditMode(e => !e); setAddMode(false); setRoomsEditMode(false); setSelectedSensor(null) }}>
            <Move size={12} /> {editMode ? 'Done' : 'Move sensors'}
          </Btn>

          {/* Add sensor */}
          <Btn sm active={addMode} ghost={!addMode}
            onClick={() => { setAddMode(a => !a); setEditMode(false); setRoomsEditMode(false); setSelectedSensor(null) }}>
            <Plus size={12} /> {addMode ? 'Cancel' : 'Add sensor'}
          </Btn>

          {/* Edit rooms */}
          {viewMode === 'map' && (
            <>
              <Btn sm active={roomsEditMode} ghost={!roomsEditMode}
                onClick={() => { setRoomsEditMode(r => !r); setEditMode(false); setAddMode(false); setSelectedSensor(null) }}
                style={roomsEditMode ? { borderColor: '#6366f1', background: 'rgba(99,102,241,0.14)', color: '#818cf8' } : {}}>
                <LayoutGrid size={12} /> {roomsEditMode ? 'Done' : 'Edit rooms'}
              </Btn>
              {hasRoomOverrides && !roomsEditMode && (
                <Btn sm ghost danger onClick={resetRooms} title="Reset rooms to default layout">
                  <RotateCcw size={11} /> Reset rooms
                </Btn>
              )}
            </>
          )}

          {/* Widget layout */}
          <div style={{ width: 1, height: 16, background: T.border, margin: '0 2px' }} />
          <Btn sm active={layoutEditMode} ghost={!layoutEditMode}
            onClick={() => setLayoutEditMode(m => !m)}
            style={layoutEditMode ? { borderColor: 'var(--accent)', background: 'rgba(99,102,241,0.14)', color: '#818cf8' } : {}}>
            <Layers size={12} /> {layoutEditMode ? 'Done' : 'Layout'}
          </Btn>
          {layoutEditMode && (
            <Btn sm ghost danger onClick={resetWidgetLayout} title="Reset widget layout to default">
              <RotateCcw size={11} /> Reset
            </Btn>
          )}

          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadBg(e.target.files?.[0])} />
          <Btn sm ghost onClick={() => fileRef.current?.click()}><Home size={12} /> Map image</Btn>
          {bgImage && <Btn sm ghost danger onClick={() => { setBgImage(''); localStorage.removeItem('fp-bg-image') }}><X size={11} /></Btn>}
          <Btn sm ghost onClick={loadSensors}><RefreshCw size={12} /></Btn>
        </div>
      </motion.div>

      {/* ── ROOM EDIT HINT ── */}
      <AnimatePresence>
        {roomsEditMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginBottom: '0.75rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', borderRadius: T.radiusSm, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.22)', fontSize: '0.70rem', color: '#818cf8', flexWrap: 'wrap' }}>
              <LayoutGrid size={13} />
              <span>
                <strong>Room edit mode:</strong> drag the move handle (⠿ top-left) to reposition ·
                drag the resize handle (⇲ bottom-right) to resize ·
                changes are saved to browser storage automatically.
              </span>
              {hasRoomOverrides && (
                <button onClick={resetRooms} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: '1px solid rgba(99,102,241,0.35)', borderRadius: '6px', padding: '3px 8px', color: '#818cf8', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}>
                  <RotateCcw size={10} /> Reset to default
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SENSOR MOVE HINT ── */}
      <AnimatePresence>
        {editMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginBottom: '0.75rem', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', borderRadius: T.radiusSm, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', fontSize: '0.70rem', color: '#fbbf24', flexWrap: 'wrap' }}>
              <Move size={13} />
              <span>
                <strong>Sensor move mode:</strong> drag any sensor dot to reposition it ·
                position is saved to the server and to localStorage as fallback ·
                release to confirm.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ALERTS ── */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', overflow: 'hidden' }}>
            {alerts.map(s => (
              <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.875rem', borderRadius: T.radiusFull, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', fontSize: '0.68rem', color: '#f87171', fontFamily: T.mono, fontWeight: 600 }}>
                <AlertTriangle size={10} />
                <strong>{s.name}</strong>
                {s.temperature > 28 && <span>{s.temperature.toFixed(1)}°C</span>}
                {s.humidity > 75 && <span>{s.humidity.toFixed(0)}%</span>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LAYOUT EDIT BANNER ── */}
      <AnimatePresence>
        {layoutEditMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 1rem', borderRadius: T.radiusSm, background: 'rgba(99,102,241,0.07)', border: '1px dashed rgba(99,102,241,0.32)', fontSize: '0.68rem', color: '#818cf8', fontFamily: T.mono }}>
              <GripVertical size={13} />
              <span><strong>Layout edit:</strong> drag the top handle to move widgets · drag the bottom-right corner to resize · layout saves automatically on release</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── VISIBILITY PANEL ── */}
      {layoutEditMode && <FpVisibilityPanel hidden={hiddenWidgets} onToggle={toggleWidget} />}

      {/* ════════════════════════════════════════════════════════════════════
          WIDGET GRID
      ════════════════════════════════════════════════════════════════════ */}
      <FpGridLayout layout={widgetLayout} setLayout={setWidgetLayout} layoutEditMode={layoutEditMode}>
        {(laidOut, getHandlers) => laidOut.map(item => (
          <FpWidgetShell
            key={item.id} item={item} layoutEditMode={layoutEditMode}
            hidden={hiddenWidgets.has(item.id)}
            onDragStart={getHandlers(item.id, 'drag')}
            onResizeStart={getHandlers(item.id, 'resize')}
          >
            {/* ── KPI STRIP ─────────────────────────────────────────── */}
            {item.id === 'kpi' && (
              <div style={{ height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', padding: '0.25rem 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', width: '100%' }}>
                  {avgTemp && <KpiCard label="Avg temp" icon="🌡️" value={avgTemp} unit="°C" color={parseFloat(avgTemp) > 26 ? '#f87171' : '#f97316'} />}
                  {avgHum  && <KpiCard label="Avg humidity" icon="💧" value={avgHum} unit="%" color={parseFloat(avgHum) > 70 ? '#f87171' : '#38bdf8'} />}
                  {!avgTemp && !avgHum && (
                    <div style={{ color: T.textMuted, fontSize: '0.75rem', fontFamily: T.mono, padding: '1rem' }}>No sensor data yet</div>
                  )}
                </div>
              </div>
            )}

            {/* ── BOILER CONTROL ────────────────────────────────────── */}
            {item.id === 'boiler' && (
              <div style={{ height: '100%', overflow: 'auto' }}>
                <BoilerControlCard
                  isOn={isOn} thermostat={thermostat} currentTemp={currentTemp} targetTemp={targetTemp}
                  onToggleBoiler={toggleBoiler} onToggleThermostat={toggleThermostat} onAdjustTarget={adjustTarget}
                  onOpenBlackout={() => setBlackoutOpen(true)}
                  statusLabel={thermostat ? 'Automatic mode' : (isOn ? 'Manual on' : 'Manual off')}
                />
              </div>
            )}

            {/* ── FLOORPLAN MAP / SENSOR GRID ───────────────────────── */}
            {item.id === 'floormap' && (
              <div style={{ height: '100%', overflow: 'hidden' }}>
                {viewMode === 'map' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1rem', height: '100%' }}>
                    <FloorplanMap
                      sensors={sensors}
                      selectedId={selectedSensor?.id}
                      onSelectSensor={s => setSelectedSensor(s)}
                      onDragSensor={handleDragSensor}
                      onDragSensorEnd={handleDragSensorEnd}
                      bgImage={bgImage} zoom={mapZoom} onZoom={handleZoom}
                      editMode={editMode} addMode={addMode}
                      onAddClick={pos => setModal({ pendingPos: pos })}
                      roomsEditMode={roomsEditMode}
                      roomOverrides={roomOverrides}
                      onRoomChange={handleRoomChange}
                    />

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', overflow: 'hidden' }}>
                      <GCard style={{ padding: '0.875rem', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                          <Layers size={12} style={{ color: T.accent }} />
                          <span style={{ fontSize: '0.70rem', fontWeight: 700, color: T.textPrimary }}>Legend</span>
                        </div>
                        {SENSOR_TYPES.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.28rem' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color, flexShrink: 0, boxShadow: `0 0 4px ${t.color}60` }} />
                            <span style={{ fontSize: '0.62rem', color: T.textSecondary }}>{t.icon} {t.label}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.55rem', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '0.875rem', fontSize: '0.55rem', color: T.textMuted, fontFamily: T.mono }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} /> Live
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#f87171', display: 'inline-block' }} /> Alert
                          </div>
                          {hasRoomOverrides && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#818cf8', display: 'inline-block' }} /> Custom layout
                            </div>
                          )}
                        </div>
                      </GCard>

                      <GCard style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.875rem', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                          <Wifi size={12} style={{ color: T.accent }} />
                          <span style={{ fontSize: '0.70rem', fontWeight: 700, color: T.textPrimary }}>Sensors</span>
                          <span style={{ marginLeft: 'auto', fontSize: '0.58rem', fontFamily: T.mono, color: T.textMuted, padding: '1px 6px', borderRadius: T.radiusFull, background: T.surface, border: `1px solid ${T.border}` }}>{sensors.length}</span>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                          <AnimatePresence mode="popLayout">
                            {loading ? (
                              <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', color: T.textMuted }} />
                              </div>
                            ) : sensors.length === 0 ? (
                              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: T.textSecondary, fontSize: '0.72rem' }}>
                                No sensors yet.<br />
                                <button onClick={() => setAddMode(true)} style={{ marginTop: '0.5rem', background: 'none', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: '0.35rem 0.75rem', color: T.accent, fontSize: '0.68rem', cursor: 'pointer' }}>
                                  + Add first
                                </button>
                              </div>
                            ) : sensors.map(s => (
                              <SidebarSensorRow key={s.id} s={s}
                                isSelected={selectedSensor?.id === s.id}
                                onSelect={s => { setSelectedSensor(s); setEditMode(false); setAddMode(false); setRoomsEditMode(false) }}
                                onConfigureApi={sensor => setApiModal(sensor)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </GCard>
                    </div>
                  </div>
                ) : (
                  /* ── GRID VIEW ─────────────────────────────────────── */
                  <div style={{ height: '100%', overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.875rem', padding: '0.25rem 0' }}>
                      <AnimatePresence mode="popLayout">
                        {loading ? (
                          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: T.textMuted }} />
                          </div>
                        ) : sensors.length === 0 ? (
                          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '3rem', color: T.textSecondary, fontSize: '0.80rem' }}>
                            No sensors yet.
                            <div style={{ marginTop: '0.75rem' }}><Btn onClick={() => setAddMode(true)}>+ Add first sensor</Btn></div>
                          </div>
                        ) : sensors.map(s => (
                          <SensorCard key={s.id} sensor={s} isSelected={selectedSensor?.id === s.id}
                            onSelect={setSelectedSensor} onDelete={deleteSensor} onConfigureApi={sensor => setApiModal(sensor)} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CLIMATE TREND ─────────────────────────────────────── */}
            {item.id === 'climate' && (
              <div style={{ height: '100%', overflow: 'hidden' }}>
                <ClimateTrendCard />
              </div>
            )}

          </FpWidgetShell>
        ))}
      </FpGridLayout>

      {/* ── MODALS ── */}
      {modal      && <SensorFormModal sensor={modal.sensor} pendingPos={modal.pendingPos} onSave={saveSensor} onClose={() => setModal(null)} />}
      {apiModal   && <ApiConfigModal  sensor={apiModal}     onSave={saveApiConfig}        onClose={() => setApiModal(null)} />}
      {blackoutOpen && <BoilerBlackoutModal onClose={() => setBlackoutOpen(false)} onSaved={loadBoiler} showToast={showToast} />}

      <Toast toast={toast} />

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.25); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(99,102,241,0.40); }
        select option { background: #0d1226; color: #f0f4ff; }
        @media (max-width: 1024px) { .fp-main-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 768px)  { .fp-widgets-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}