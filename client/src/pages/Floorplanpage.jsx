import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Thermometer, Droplets, Plus, X, Move, MapPin, Settings,
  RefreshCw, Wifi, AlertTriangle, Edit2, Trash2, Save,
  ZoomIn, ZoomOut, Home, Layers, Grid3x3, Map as MapIcon,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { create } from 'zustand'

// ════════════════════════════════════════════════════════════════════════════
// ║ ZUSTAND STORE - Centralized state management
// ════════════════════════════════════════════════════════════════════════════

const useFloorplanStore = create((set) => ({
  sensors: [],
  setSensors: (sensors) => set({ sensors }),
  updateSensor: (id, updates) => set((s) => ({
    sensors: s.sensors.map((sensor) => sensor.id === id ? { ...sensor, ...updates } : sensor),
  })),
  removeSensor: (id) => set((s) => ({
    sensors: s.sensors.filter((s) => s.id !== id),
  })),
}))

// ════════════════════════════════════════════════════════════════════════════
// ║ CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const ROOMS = [
  { id: 'camera1', label: 'Bedroom', area: '16.11 m²', x: 2.5, y: 4, w: 39, h: 38 },
  { id: 'ufficio', label: 'Office', area: '2.59 m²', x: 41.5, y: 4, w: 11, h: 14 },
  { id: 'cucina', label: 'Kitchen', area: '23.54 m²', x: 2.5, y: 42, w: 39, h: 30 },
  { id: 'sala', label: 'Dining room', area: '21.78 m²', x: 52.5, y: 4, w: 45, h: 54 },
  { id: 'bagno', label: 'Bathroom', area: '5.63 m²', x: 52.5, y: 58, w: 29, h: 21 },
  { id: 'camera2', label: 'Bedroom 2', area: '6.16 m²', x: 52.5, y: 79, w: 45, h: 18 },
  { id: 'corridoio', label: 'Hallway', area: '', x: 41.5, y: 18, w: 11, h: 54 },
]

const SENSOR_TYPES = [
  { id: 'temp_hum', label: 'Temp + Humidity', icon: '🌡️', color: '#f59e0b' },
  { id: 'temp', label: 'Temperature', icon: '🌡️', color: '#ef4444' },
  { id: 'humidity', label: 'Humidity', icon: '💧', color: '#2563eb' },
  { id: 'motion', label: 'Motion', icon: '👁️', color: '#8b5cf6' },
  { id: 'door', label: 'Door/Window', icon: '🚪', color: '#10b981' },
  { id: 'air', label: 'Air quality', icon: '🌬️', color: '#06b6d4' },
]

const TYPE_META = Object.fromEntries(SENSOR_TYPES.map((t) => [t.id, t]))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ════════════════════════════════════════════════════════════════════════════
// ║ COMPONENTS - Modular, reusable
// ════════════════════════════════════════════════════════════════════════════

// ── Sensor Badge Card ──────────────────────────────────────────────────────
const SensorCard = ({ sensor, isSelected, onSelect, onDelete, onEdit, inert }) => {
  const meta = TYPE_META[sensor.type] || TYPE_META['temp_hum']
  const hasAlert = sensor.temperature > 28 || sensor.humidity > 75

  return (
    <motion.div
      layoutId={`sensor-${sensor.id}`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2 }}
      onClick={() => !inert && onSelect(sensor)}
      className="sensor-card"
      style={{
        background: 'var(--bg-surface)',
        border: `2px solid ${isSelected ? meta.color : 'var(--border)'}`,
        borderRadius: 12,
        padding: '1rem',
        cursor: inert ? 'default' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      whileHover={!inert ? { scale: 1.02 } : {}}
      whileTap={!inert ? { scale: 0.98 } : {}}
    >
      {/* Alert indicator */}
      {hasAlert && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: '#ef4444',
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.6rem' }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sensor.name}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {meta.label} · {sensor.room_name || '—'}
          </div>
        </div>
      </div>

      {/* Readings grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          marginBottom: '0.75rem',
        }}
      >
        {sensor.temperature != null && (
          <div
            style={{
              background: 'rgba(239,68,68,0.08)',
              borderRadius: 8,
              padding: '0.5rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 600, marginBottom: 2 }}>
              TEMP
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                fontWeight: 700,
                color: sensor.temperature > 28 ? '#ef4444' : 'var(--text-primary)',
              }}
            >
              {sensor.temperature.toFixed(1)}°
            </div>
          </div>
        )}

        {sensor.humidity != null && (
          <div
            style={{
              background: 'rgba(37,99,235,0.08)',
              borderRadius: 8,
              padding: '0.5rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.6rem', color: '#2563eb', fontWeight: 600, marginBottom: 2 }}>
              HUM
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                fontWeight: 700,
                color: sensor.humidity > 75 ? '#ef4444' : 'var(--text-primary)',
              }}
            >
              {sensor.humidity.toFixed(0)}%
            </div>
          </div>
        )}
      </div>

      {/* Timestamp */}
      {sensor.last_seen && (
        <div
          style={{
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginBottom: '0.75rem',
          }}
        >
          {new Date(sensor.last_seen).toLocaleTimeString('en-US')}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(sensor.id)
          }}
          className="btn btn--sm"
          style={{
            color: '#ef4444',
            borderColor: 'rgba(239,68,68,0.25)',
            background: 'rgba(239,68,68,0.06)',
            fontSize: '0.68rem',
            flex: 1,
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  )
}

// ── Sensor Form Modal ──────────────────────────────────────────────────────
const SensorFormModal = ({ sensor, pendingPos, onSave, onClose }) => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isValid },
  } = useForm({
    defaultValues: {
      name: sensor?.name || '',
      type: sensor?.type || 'temp_hum',
      room_id: sensor?.room_id || '',
      topic: sensor?.topic || '',
    },
    mode: 'onChange',
  })

  const typeValue = watch('type')

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          style={{ maxWidth: 440 }}
        >
          <button className="modal-close" onClick={onClose}>
            <X size={14} />
          </button>

          <div className="modal-title" style={{ marginBottom: '1.25rem' }}>
            {sensor ? '✏️ Edit Sensor' : '➕ New Sensor'}
            {pendingPos && (
              <div
                style={{
                  fontSize: '0.63rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  fontWeight: 400,
                  marginTop: 4,
                }}
              >
                Position: x={pendingPos.x.toFixed(1)}% · y={pendingPos.y.toFixed(1)}%
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit((data) => onSave({ ...data, ...pendingPos }))}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
              {/* Name */}
              <div className="field">
                <label className="field-label">Sensor name *</label>
                <input
                  className="input"
                  {...register('name', { required: 'Name is required', minLength: 2 })}
                  placeholder="e.g., Living room north"
                  autoFocus
                />
                {errors.name && <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>{errors.name.message}</span>}
              </div>

              {/* Type selector */}
              <div className="field">
                <label className="field-label">Sensor type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {SENSOR_TYPES.map((t) => (
                    <motion.button
                      key={t.id}
                      type="button"
                      onClick={() => register('type').onChange({ target: { value: t.id } })}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        padding: '0.6rem 0.3rem',
                        borderRadius: 10,
                        border: `2px solid ${typeValue === t.id ? t.color : 'var(--border)'}`,
                        background: typeValue === t.id ? `${t.color}13` : 'var(--bg-surface-2)',
                        cursor: 'pointer',
                        fontSize: '0.62rem',
                        color: typeValue === t.id ? t.color : 'var(--text-secondary)',
                        fontWeight: typeValue === t.id ? 700 : 400,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
                      {t.label}
                    </motion.button>
                  ))}
                </div>
                <input type="hidden" {...register('type')} />
              </div>

              {/* Room */}
              <div className="field">
                <label className="field-label">Room *</label>
                <select className="select" {...register('room_id', { required: 'Room is required' })}>
                  <option value="">-- Select room --</option>
                  {ROOMS.filter((r) => r.area).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {errors.room_id && (
                  <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>{errors.room_id.message}</span>
                )}
              </div>

              {/* MQTT Topic */}
              <div className="field">
                <label className="field-label">
                  MQTT Topic <span style={{ fontWeight: 400, fontSize: '0.70rem' }}>(optional)</span>
                </label>
                <input
                  className="input input--mono"
                  {...register('topic')}
                  placeholder="home/sala/temperatura"
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button type="button" onClick={onClose} className="btn btn--ghost" style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" style={{ flex: 1 }} disabled={!isValid}>
                <Save size={14} /> {sensor ? 'Update' : 'Add'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── SVG Floorplan Map ──────────────────────────────────────────────────────
const FloorplanMap = ({ sensors, selectedId, onSelectSensor, onDragSensor, bgImage, zoom, onZoom, editMode, addMode, onAddClick }) => {
  const svgRef = useRef(null)
  const dragRef = useRef(null)

  const getSvgCoords = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: clamp(x, 1.5, 98.5), y: clamp(y, 1.5, 98.5) }
  }, [])

  const handleDragStart = (e, sensor) => {
    if (!editMode) return
    e.preventDefault()
    dragRef.current = { sensor, offset: getSvgCoords(e) }
  }

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragRef.current || !editMode) return
      const coords = getSvgCoords(e)
      onDragSensor(dragRef.current.sensor.id, coords)
    },
    [editMode, getSvgCoords, onDragSensor]
  )

  const handleMouseUp = () => {
    dragRef.current = null
  }

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove])

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, background: '#f3f6fb' }}>
      {/* Mode indicator */}
      <AnimatePresence>
        {(addMode || editMode) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 15,
              background: addMode ? 'rgba(37,99,235,0.92)' : 'rgba(245,158,11,0.92)',
              color: addMode ? '#fff' : '#0d1b3e',
              textAlign: 'center',
              padding: '0.5rem',
              fontSize: '0.78rem',
              fontWeight: 600,
            }}
          >
            {addMode ? '📍 Click the floorplan to place a sensor' : '✋ Drag to reposition sensors'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 10,
          display: 'flex',
          gap: '0.3rem',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          borderRadius: 10,
          padding: '0.4rem',
          border: '1px solid var(--border)',
        }}
      >
        <button
          className="btn btn--ghost"
          style={{ padding: '4px', display: 'flex', alignItems: 'center' }}
          onClick={() => onZoom(-0.2)}
        >
          <ZoomOut size={14} />
        </button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', minWidth: 32, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="btn btn--ghost"
          style={{ padding: '4px', display: 'flex', alignItems: 'center' }}
          onClick={() => onZoom(0.2)}
        >
          <ZoomIn size={14} />
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 0.2rem' }} />
        <button
          className="btn btn--ghost"
          style={{ padding: '4px 6px', fontSize: '0.68rem' }}
          onClick={() => onZoom(0, true)}
        >
          1:1
        </button>
      </div>

      {/* SVG Map */}
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        style={{
          width: '100%',
          aspectRatio: '1.06/1',
          display: 'block',
          cursor: addMode ? 'crosshair' : 'default',
          userSelect: 'none',
        }}
        onClick={(e) => {
          if (!addMode) return
          const coords = getSvgCoords(e)
          onAddClick(coords)
        }}
      >
        <g transform={`scale(${zoom})`} style={{ transformOrigin: '50px 50px' }}>
          {/* Background */}
          <rect x={0} y={0} width={100} height={100} fill="#f3f6fb" />

          {/* Custom bg image */}
          {bgImage && (
            <image href={bgImage} x={0} y={0} width={100} height={100} preserveAspectRatio="xMidYMid meet" opacity={0.65} />
          )}

          {/* Rooms */}
          {ROOMS.map((room) => (
            <g key={room.id}>
              <rect
                x={room.x}
                y={room.y}
                width={room.w}
                height={room.h}
                fill={bgImage ? 'rgba(255,255,255,0.08)' : 'white'}
                stroke="#bdd0e8"
                strokeWidth={0.45}
                rx={0.6}
              />
              {room.area ? (
                <>
                  <text
                    x={room.x + room.w / 2}
                    y={room.y + room.h / 2 - 2.2}
                    textAnchor="middle"
                    fontSize={2.6}
                    fill="#0d1b3e"
                    fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif"
                    fontWeight="700"
                  >
                    {room.label}
                  </text>
                  <text
                    x={room.x + room.w / 2}
                    y={room.y + room.h / 2 + 2.8}
                    textAnchor="middle"
                    fontSize={1.8}
                    fill="#6a8aaa"
                    fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif"
                  >
                    {room.area}
                  </text>
                </>
              ) : (
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={2}
                  fill="#9ab0cc"
                  fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif"
                  transform={`rotate(-90, ${room.x + room.w / 2}, ${room.y + room.h / 2})`}
                >
                  Hallway
                </text>
              )}
            </g>
          ))}

          {/* Outer walls */}
          <rect x={2.5} y={4} width={94.5} height={93} fill="none" stroke="#7a96b4" strokeWidth={0.75} rx={1} />

          {/* Sensor pins */}
          {sensors.map((sensor) => {
            const meta = TYPE_META[sensor.type] || TYPE_META['temp_hum']
            const isSelected = selectedId === sensor.id
            const hasAlert = sensor.temperature > 28 || sensor.humidity > 75

            return (
              <g key={sensor.id} transform={`translate(${sensor.x}, ${sensor.y})`} style={{ cursor: editMode ? 'grab' : 'pointer' }}>
                {/* Pulse ring */}
                {!editMode && (
                  <circle r={2.7} fill={meta.color} opacity={0.12}>
                    <animate attributeName="r" values="1.7;2.7;1.7" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Selected ring */}
                {isSelected && <circle r={2.5} fill="none" stroke={meta.color} strokeWidth={0.6} opacity={0.35} />}

                {/* Main circle */}
                <circle
                  r={1.7}
                  fill={isSelected ? meta.color : 'white'}
                  stroke={meta.color}
                  strokeWidth={isSelected ? 0 : 0.6}
                  style={{
                    filter: isSelected ? `drop-shadow(0 0 6px ${meta.color})` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                    transition: 'fill 0.15s',
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectSensor(sensor)
                  }}
                  onMouseDown={(e) => handleDragStart(e, sensor)}
                />

                {/* Alert badge */}
                {hasAlert && <circle cx={1.8} cy={-1.8} r={0.7} fill="#ef4444" stroke="white" strokeWidth={0.25} />}

                {/* Name label */}
                {!editMode && !isSelected && (
                  <g transform="translate(2.3, -3.3)">
                    <rect
                      x={0}
                      y={0}
                      width={sensor.name.length * 1.27 + 2}
                      height={3.7}
                      rx={2.5}
                      fill="white"
                      stroke={meta.color}
                      strokeWidth={0.9}
                      style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.10))' }}
                    />
                    <text x={1} y={2.5} fontSize={1.7} fill="#0d1b3e" fontFamily="'DM Sans', 'Plus Jakarta Sans', sans-serif" fontWeight="600">
                      {sensor.name}
                    </text>
                  </g>
                )}

                {/* Icon */}
                <text textAnchor="middle" dominantBaseline="central" fontSize={1.7} style={{ userSelect: 'none' }}>
                  {meta.icon}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, unit, icon, color, trend }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.92 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.2 }}
    style={{
      background: 'var(--bg-surface)',
      border: `2px solid ${color}25`,
      borderTop: `3px solid ${color}`,
      borderRadius: 12,
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
    </div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
      {value != null ? `${value}${unit}` : '—'}
    </div>
    {trend && <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{trend}</div>}
  </motion.div>
)

// ════════════════════════════════════════════════════════════════════════════
// ║ MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function FloorplanPage() {
  const { toast, showToast } = useToast()
  const { sensors, setSensors, updateSensor, removeSensor } = useFloorplanStore()
  const fileRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [selectedSensor, setSelectedSensor] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [modal, setModal] = useState(null)
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('fp-bg-image') || '')
  const [mapZoom, setMapZoom] = useState(1)
  const [viewMode, setViewMode] = useState('map') // 'map' | 'grid'

  // ── Load sensors ──────────────────────────────────────────
  const loadSensors = useCallback(async () => {
    try {
      const data = await fetch('/api/sensors').then((r) => r.json())
      setSensors(Array.isArray(data) ? data : [])
    } catch {
      showToast('Error loading sensors', 'error')
    } finally {
      setLoading(false)
    }
  }, [setSensors, showToast])

  useEffect(() => {
    loadSensors()
    const id = setInterval(loadSensors, 10000)
    return () => clearInterval(id)
  }, [loadSensors])

  // ── Save sensor (add or edit) ─────────────────────────────
  const saveSensor = useCallback(
    async (data) => {
      try {
        if (modal?.sensor) {
          const res = await fetch(`/api/sensors/${modal.sensor.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
          if (!res.ok) throw new Error()
          updateSensor(modal.sensor.id, data)
          showToast('Sensor updated', 'success')
        } else {
          const res = await fetch('/api/sensors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          })
          if (!res.ok) throw new Error()
          showToast('Sensor added', 'success')
          await loadSensors()
        }
        setModal(null)
        setSelectedSensor(null)
      } catch {
        showToast('Error saving sensor', 'error')
      }
    },
    [modal, updateSensor, loadSensors, showToast]
  )

  // ── Delete sensor ─────────────────────────────────────────
  const deleteSensor = useCallback(
    async (id) => {
      if (!window.confirm('Delete this sensor?')) return
      try {
        await fetch(`/api/sensors/${id}`, { method: 'DELETE' })
        removeSensor(id)
        setSelectedSensor(null)
        showToast('Sensor deleted', 'success')
      } catch {
        showToast('Error deleting sensor', 'error')
      }
    },
    [removeSensor, showToast]
  )

  // ── Upload floorplan ──────────────────────────────────────
  const uploadBg = useCallback(
    (file) => {
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const url = typeof reader.result === 'string' ? reader.result : ''
        if (url) {
          setBgImage(url)
          localStorage.setItem('fp-bg-image', url)
          showToast('Floorplan uploaded', 'success')
        }
      }
      reader.readAsDataURL(file)
    },
    [showToast]
  )

  // ── Drag sensor on map ────────────────────────────────────
  const handleDragSensor = useCallback((id, coords) => {
    updateSensor(id, coords)
  }, [updateSensor])

  // ── Save sensor position ──────────────────────────────────
  const handleMouseUpSensor = useCallback(async (sensor) => {
    try {
      await fetch(`/api/sensors/${sensor.id}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: sensor.x, y: sensor.y }),
      })
    } catch {
      showToast('Error saving position', 'error')
    }
  }, [showToast])

  // ── Zoom map ──────────────────────────────────────────────
  const handleZoom = useCallback((delta, reset) => {
    if (reset) {
      setMapZoom(1)
    } else {
      setMapZoom((p) => parseFloat(clamp(p + delta, 0.5, 3).toFixed(2)))
    }
  }, [])

  // ── Computed stats ────────────────────────────────────────
  const withTemp = sensors.filter((s) => s.temperature != null)
  const withHum = sensors.filter((s) => s.humidity != null)
  const alerts = sensors.filter((s) => s.temperature > 28 || s.humidity > 75)
  const avgTemp = withTemp.length ? (withTemp.reduce((a, s) => a + s.temperature, 0) / withTemp.length).toFixed(1) : null
  const avgHum = withHum.length ? (withHum.reduce((a, s) => a + s.humidity, 0) / withHum.length).toFixed(0) : null
  const hottest = withTemp.length ? withTemp.reduce((a, b) => (a.temperature > b.temperature ? a : b)) : null
  const wettest = withHum.length ? withHum.reduce((a, b) => (a.humidity > b.humidity ? a : b)) : null

  const roomMap = Object.fromEntries(ROOMS.map((r) => [r.id, r]))

  return (
    <div className="page animate-fade fp">
      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div
        className="fp-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="page-title">
            Floorplan <span style={{ color: 'var(--accent)' }}>Smart</span>
          </h1>
          <p className="page-subtitle">Real-time sensor monitoring · Updates every 10 seconds</p>
        </div>

        <div className="fp-header-actions">
          {alerts.length > 0 && (
            <motion.span
              className="badge badge--danger"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <AlertTriangle size={10} /> {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
            </motion.span>
          )}

          <span className="badge badge--muted" style={{ fontFamily: 'var(--font-mono)' }}>
            {sensors.length} sensor{sensors.length !== 1 ? 's' : ''}
          </span>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-surface-2)', borderRadius: 8, padding: '0.2rem' }}>
            <button
              onClick={() => setViewMode('map')}
              className={`btn btn--sm ${viewMode === 'map' ? 'btn--primary' : 'btn--ghost'}`}
              style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              title="Map view"
            >
              <MapIcon size={12} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`btn btn--sm ${viewMode === 'grid' ? 'btn--primary' : 'btn--ghost'}`}
              style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              title="Grid view"
            >
              <Grid3x3 size={12} />
            </button>
          </div>

          {/* Edit mode */}
          <button
            onClick={() => {
              setEditMode((e) => !e)
              setAddMode(false)
              setSelectedSensor(null)
            }}
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}
          >
            <Move size={13} /> {editMode ? 'Done' : 'Move'}
          </button>

          {/* Add mode */}
          <button
            onClick={() => {
              setAddMode((a) => !a)
              setEditMode(false)
              setSelectedSensor(null)
            }}
            className={`btn btn--sm ${addMode ? 'btn--primary' : 'btn--ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}
          >
            <Plus size={13} /> {addMode ? 'Cancel' : 'Add'}
          </button>

          {/* Upload floorplan */}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadBg(e.target.files?.[0])} />
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => fileRef.current?.click()}
            style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Home size={13} /> Floorplan
          </button>

          {bgImage && (
            <button
              className="btn btn--ghost btn--sm"
              style={{ color: '#ef4444', fontSize: '0.72rem' }}
              onClick={() => {
                setBgImage('')
                localStorage.removeItem('fp-bg-image')
              }}
            >
              <X size={13} />
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={loadSensors}
            className="btn btn--ghost btn--sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </motion.div>

      {/* ── Alert strip ──────────────────────────────────────── */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div
            className="fp-alerts"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {alerts.map((s) => (
              <motion.div
                key={s.id}
                className="fp-alert-chip"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <AlertTriangle size={11} />
                <strong>{s.name}</strong>
                {s.temperature > 28 && <span>{s.temperature.toFixed(1)}°C</span>}
                {s.humidity > 75 && <span>{s.humidity.toFixed(0)}%</span>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content grid ──────────────────────────────────────– */}
      {viewMode === 'map' ? (
        <motion.div
          className="fp-bento"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* Map */}
          <div className="fp-map-section">
            <FloorplanMap
              sensors={sensors}
              selectedId={selectedSensor?.id}
              onSelectSensor={(s) => setSelectedSensor(s)}
              onDragSensor={handleDragSensor}
              bgImage={bgImage}
              zoom={mapZoom}
              onZoom={handleZoom}
              editMode={editMode}
              addMode={addMode}
              onAddClick={(pos) => setModal({ pendingPos: pos })}
            />
          </div>

          {/* Sidebar */}
          <motion.div
            className="fp-sidebar"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {/* Legend */}
            <div className="card" style={{ padding: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Layers size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Sensor types</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {SENSOR_TYPES.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0, boxShadow: `0 0 5px ${t.color}60` }} />
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {t.icon} {t.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sensor list */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                <Wifi size={14} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Active sensors</span>
                <span className="badge badge--muted" style={{ marginLeft: 'auto', fontSize: '0.60rem' }}>
                  {sensors.length}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <div className="loading-box" style={{ padding: '1.5rem' }}>
                      <span className="spinner" />
                    </div>
                  ) : sensors.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      No sensors.<br />
                      <button className="btn btn--ghost btn--sm" style={{ marginTop: '0.5rem', fontSize: '0.70rem' }} onClick={() => setAddMode(true)}>
                        + Add the first one
                      </button>
                    </div>
                  ) : (
                    sensors.map((s) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        onClick={() => {
                          setSelectedSensor(s)
                          setEditMode(false)
                          setAddMode(false)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.6rem 0.75rem',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: selectedSensor?.id === s.id ? 'var(--accent-light)' : 'transparent',
                          borderLeft: selectedSensor?.id === s.id ? '3px solid var(--accent)' : '3px solid transparent',
                          transition: 'background 0.15s',
                        }}
                        whileHover={{ background: 'var(--bg-surface-2)' }}
                      >
                        <span style={{ fontSize: '1rem', flexShrink: 0 }}>{TYPE_META[s.type]?.icon || '📡'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.name}
                          </div>
                          <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{roomMap[s.room_id]?.label || '—'}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {s.temperature != null && <span style={{ color: s.temperature > 28 ? '#ef4444' : 'var(--text-primary)' }}>{s.temperature.toFixed(1)}°</span>}
                          {s.humidity != null && <span style={{ color: s.humidity > 75 ? '#ef4444' : 'var(--text-secondary)' }}>{s.humidity.toFixed(0)}%</span>}
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : (
        /* ── GRID VIEW ──────────────────────────────────────– */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="loading-box" style={{ gridColumn: '1/-1', padding: '2rem' }}>
                <span className="spinner" />
              </div>
            ) : sensors.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <p>No sensors yet</p>
                <button className="btn btn--primary btn--sm" style={{ marginTop: '0.75rem' }} onClick={() => setAddMode(true)}>
                  + Add first sensor
                </button>
              </div>
            ) : (
              sensors.map((s) => (
                <SensorCard key={s.id} sensor={s} isSelected={selectedSensor?.id === s.id} onSelect={setSelectedSensor} onDelete={deleteSensor} onEdit={(sensor) => setModal({ sensor })} />
              ))
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── KPI Row ──────────────────────────────────────────– */}
      <motion.div
        className="fp-kpi-row"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <KpiCard label="Total" icon="📡" value={sensors.length} unit="" color="var(--accent)" />
        <KpiCard label="Alerts" icon="⚠️" value={alerts.length} unit="" color={alerts.length > 0 ? '#ef4444' : '#10b981'} />
        {avgTemp && <KpiCard label="Avg Temp" icon="🌡️" value={avgTemp} unit="°C" color={parseFloat(avgTemp) > 26 ? '#ef4444' : '#f59e0b'} />}
        {avgHum && <KpiCard label="Avg Humidity" icon="💧" value={avgHum} unit="%" color={parseFloat(avgHum) > 70 ? '#ef4444' : '#2563eb'} />}
        {hottest && <KpiCard label="Warmest" icon="🔥" value={hottest.temperature.toFixed(1)} unit="°C" color="#ef4444" trend={`@ ${hottest.name}`} />}
        {wettest && <KpiCard label="Most humid" icon="💦" value={wettest.humidity.toFixed(0)} unit="%" color="#2563eb" trend={`@ ${wettest.name}`} />}
      </motion.div>

      {/* ── Modal ───────────────────────────────────────────– */}
      {modal && <SensorFormModal sensor={modal.sensor} pendingPos={modal.pendingPos} onSave={saveSensor} onClose={() => setModal(null)} />}

      <Toast toast={toast} />

      {/* ── Styles ──────────────────────────────────────────– */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes led-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }

        .fp-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .fp-header-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.4rem;
        }

        .fp-alerts {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          margin-bottom: 1.25rem;
        }

        .fp-alert-chip {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.45rem 0.9rem;
          border-radius: var(--radius-full);
          background: rgba(239, 68, 68, 0.09);
          border: 1.5px solid rgba(239, 68, 68, 0.28);
          font-size: 0.73rem;
          color: #ef4444;
          font-family: var(--font-mono);
          font-weight: 600;
        }

        .fp-bento {
          display: grid;
          grid-template-columns: 1fr 260px;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
        }

        .fp-map-section {
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-surface);
        }

        .fp-sidebar {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: calc(100vh - 240px);
          position: sticky;
          top: 80px;
        }

        .fp-kpi-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1rem;
        }

        .sensor-card {
          transition: all 0.2s;
        }

        @media (max-width: 1024px) {
          .fp-bento {
            grid-template-columns: 1fr;
          }

          .fp-sidebar {
            position: static;
            max-height: none;
          }
        }

        @media (max-width: 768px) {
          .fp-header {
            flex-direction: column;
            gap: 0.75rem;
          }

          .fp-header-actions {
            width: 100%;
            justify-content: flex-start;
          }

          .fp-kpi-row {
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 0.75rem;
          }

          .sensor-card {
            padding: 0.85rem;
          }
        }

        @media (max-width: 480px) {
          .fp-header-actions {
            gap: 0.3rem;
          }

          .fp-kpi-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .fp-alerts {
            gap: 0.4rem;
          }

          .fp-alert-chip {
            padding: 0.35rem 0.7rem;
            font-size: 0.65rem;
          }
        }
      `}</style>
    </div>
  )
}
