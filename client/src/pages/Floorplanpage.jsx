import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, X, Move, MapPin,
  RefreshCw, Wifi, AlertTriangle, Trash2, Save,
  ZoomIn, ZoomOut, Home, Layers, Grid3x3, Map as MapIcon,
  Settings, Radio, CheckCircle2, XCircle,
} from 'lucide-react'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { create } from 'zustand'

// ════════════════════════════════════════════════════════════════════════════
// ║ ZUSTAND STORE
// ════════════════════════════════════════════════════════════════════════════

const useFloorplanStore = create((set) => ({
  sensors: [],
  setSensors: (sensors) => set({ sensors }),
  updateSensor: (id, updates) => set((s) => ({
    sensors: s.sensors.map((sensor) => sensor.id === id ? { ...sensor, ...updates } : sensor),
  })),
  removeSensor: (id) => set((s) => ({
    sensors: s.sensors.filter((sensor) => sensor.id !== id),
  })),
}))

// ════════════════════════════════════════════════════════════════════════════
// ║ CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const ROOMS = [
  { id: 'camera1',   label: 'Bedroom',    area: '16.11 m²', x: 2.5,  y: 4,  w: 39, h: 38 },
  { id: 'ufficio',   label: 'Office',     area: '2.59 m²',  x: 41.5, y: 4,  w: 11, h: 14 },
  { id: 'cucina',    label: 'Kitchen',    area: '23.54 m²', x: 2.5,  y: 42, w: 39, h: 30 },
  { id: 'sala',      label: 'Dining room',area: '21.78 m²', x: 52.5, y: 4,  w: 45, h: 54 },
  { id: 'bagno',     label: 'Bathroom',   area: '5.63 m²',  x: 52.5, y: 58, w: 29, h: 21 },
  { id: 'camera2',   label: 'Bedroom 2',  area: '6.16 m²',  x: 52.5, y: 79, w: 45, h: 18 },
  { id: 'corridoio', label: 'Hallway',    area: '',         x: 41.5, y: 18, w: 11, h: 54 },
]

const SENSOR_TYPES = [
  { id: 'temp_hum', label: 'Temp + Humidity', icon: '🌡️', color: '#f59e0b' },
  { id: 'temp',     label: 'Temperature',     icon: '🌡️', color: '#ef4444' },
  { id: 'humidity', label: 'Humidity',        icon: '💧', color: '#2563eb' },
  { id: 'motion',   label: 'Motion',          icon: '👁️', color: '#8b5cf6' },
  { id: 'door',     label: 'Door/Window',     icon: '🚪', color: '#10b981' },
  { id: 'air',      label: 'Air quality',     icon: '🌬️', color: '#06b6d4' },
]

const TYPE_META = Object.fromEntries(SENSOR_TYPES.map((t) => [t.id, t]))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// ════════════════════════════════════════════════════════════════════════════
// ║ UTILITIES
// ════════════════════════════════════════════════════════════════════════════

// Resolve dot-notation path inside an object. Supports "array[0].key" syntax.
function resolvePath(obj, path) {
  if (!path || obj == null) return obj
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return null
    const arrMatch = key.match(/^(\w+)\[(\d+)\]$/)
    if (arrMatch) return acc[arrMatch[1]]?.[parseInt(arrMatch[2])]
    return acc[key]
  }, obj)
}

// Format a raw value for display (trim floats, handle objects).
function fmtLive(value) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60)
  const n = parseFloat(value)
  if (!isNaN(n)) return n % 1 === 0 ? String(n) : n.toFixed(2)
  return String(value)
}

// Human-readable relative timestamp.
function relativeTs(isoString) {
  if (!isoString) return ''
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
  if (diff < 5)    return 'just now'
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return new Date(isoString).toLocaleTimeString()
}

// ════════════════════════════════════════════════════════════════════════════
// ║ HOOK — useLiveValue
// Fetches and parses a live value based on a sensor's live_api config.
// ════════════════════════════════════════════════════════════════════════════

function useLiveValue(liveApi) {
  const [value,   setValue]   = useState(null)
  const [timestamp, setTs]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const doFetch = useCallback(async () => {
    if (!liveApi?.endpoint) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(liveApi.endpoint)
      const json = await res.json()
      let extracted = null
      let ts        = null

      if (liveApi.mode === 'array') {
        // Array / logs mode — sort descending by sort_by, take the newest item
        const raw = liveApi.array_key ? resolvePath(json, liveApi.array_key) : json
        const arr = Array.isArray(raw) ? raw : null
        if (arr && arr.length > 0) {
          const sortKey = liveApi.sort_by || 'created_at'
          const sorted  = [...arr].sort((a, b) => new Date(b[sortKey]) - new Date(a[sortKey]))
          const latest  = sorted[0]
          ts        = latest[sortKey] || null
          extracted = liveApi.value_path ? resolvePath(latest, liveApi.value_path) : latest.message
        }
      } else {
        // Direct object mode — follow value_path
        extracted = liveApi.value_path ? resolvePath(json, liveApi.value_path) : json
        ts = new Date().toISOString()
      }

      setValue(extracted)
      setTs(ts)
    } catch {
      setError('Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [liveApi?.endpoint, liveApi?.mode, liveApi?.array_key, liveApi?.sort_by, liveApi?.value_path])

  useEffect(() => {
    doFetch()
    const id = setInterval(doFetch, liveApi?.refresh_ms || 15000)
    return () => clearInterval(id)
  }, [doFetch, liveApi?.refresh_ms])

  return { value, timestamp, loading, error, refetch: doFetch }
}

// ════════════════════════════════════════════════════════════════════════════
// ║ API CONFIG MODAL
// Per-sensor configuration of the live data source.
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_API_CONFIG = {
  endpoint:   '',
  mode:       'direct',   // 'direct' | 'array'
  array_key:  'logs',
  sort_by:    'created_at',
  value_path: '',
  unit:       '',
  refresh_ms: 15000,
}

const QUICK_PRESETS = [
  { label: '🌡️ Temperature',      config: { endpoint: '/api_sensors', mode: 'direct', value_path: 'temperature.current', unit: '°C', refresh_ms: 15000 } },
  { label: '💧 Humidity',         config: { endpoint: '/api_sensors', mode: 'direct', value_path: 'humidity.current',    unit: '%',  refresh_ms: 15000 } },
  { label: '📈 Temp avg 24h',     config: { endpoint: '/api_sensors', mode: 'direct', value_path: 'temperature.minMaxLast24Hours', unit: '', refresh_ms: 30000 } },
  { label: '🌬️ Latest log msg',   config: { endpoint: '/api/pico-logs?limit=20', mode: 'array', array_key: 'logs', sort_by: 'created_at', value_path: 'message', unit: '', refresh_ms: 30000 } },
  { label: '📊 AQI sensor_data',  config: { endpoint: '/api/pico-logs?limit=20', mode: 'array', array_key: 'logs', sort_by: 'created_at', value_path: 'sensor_data.aqi', unit: 'AQI', refresh_ms: 30000 } },
]

function ApiConfigModal({ sensor, onSave, onClose }) {
  const [cfg, setCfg]         = useState({ ...DEFAULT_API_CONFIG, ...(sensor.live_api || {}) })
  const [preview, setPreview] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testOk,  setTestOk]  = useState(null) // true | false | null

  const upd = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  const testApi = async () => {
    if (!cfg.endpoint) return
    setTesting(true); setTestOk(null); setPreview(null)
    try {
      const res  = await fetch(cfg.endpoint)
      const json = await res.json()
      let extracted = null
      if (cfg.mode === 'array') {
        const raw  = cfg.array_key ? resolvePath(json, cfg.array_key) : json
        const arr  = Array.isArray(raw) ? raw : null
        if (arr && arr.length > 0) {
          const sorted = [...arr].sort((a, b) => new Date(b[cfg.sort_by]) - new Date(a[cfg.sort_by]))
          extracted = cfg.value_path ? resolvePath(sorted[0], cfg.value_path) : sorted[0]
        }
      } else {
        extracted = cfg.value_path ? resolvePath(json, cfg.value_path) : json
      }
      setPreview(extracted); setTestOk(true)
    } catch {
      setPreview('ERROR — could not reach endpoint'); setTestOk(false)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <button className="modal-close" onClick={onClose}><X size={14} /></button>

        <div className="modal-title" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Radio size={16} style={{ color: 'var(--accent)' }} />
            Live API Config
          </div>
          <div style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--text-secondary)', marginTop: 3 }}>
            {sensor.name}
          </div>
        </div>

        {/* Quick presets */}
        <div style={{ marginBottom: '1rem' }}>
          <div className="field-label" style={{ marginBottom: '0.4rem' }}>Quick presets</div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {QUICK_PRESETS.map(p => (
              <button key={p.label} className="btn btn--ghost btn--sm"
                onClick={() => setCfg(c => ({ ...c, ...p.config }))}
                style={{ fontSize: '0.63rem' }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Endpoint */}
          <div className="field">
            <label className="field-label">API Endpoint URL</label>
            <input className="input input--mono" value={cfg.endpoint}
              onChange={e => upd('endpoint', e.target.value)}
              placeholder="https://smarthouse.local:4443/api_sensors" />
          </div>

          {/* Mode */}
          <div className="field">
            <label className="field-label">Response mode</label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[
                { id: 'direct', label: '📦 Direct object', sub: 'JSON object, value at a path' },
                { id: 'array',  label: '📋 Array / Logs',  sub: 'Sort desc → take newest item' },
              ].map(m => (
                <button key={m.id} onClick={() => upd('mode', m.id)} style={{
                  flex: 1, padding: '0.55rem 0.5rem', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${cfg.mode === m.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: cfg.mode === m.id ? 'var(--accent-light)' : 'var(--bg-surface-2)',
                  textAlign: 'left', transition: 'all 0.14s',
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700,
                    color: cfg.mode === m.id ? 'var(--accent)' : 'var(--text-primary)' }}>{m.label}</div>
                  <div style={{ fontSize: '0.60rem', color: 'var(--text-secondary)', marginTop: 2 }}>{m.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Array-specific fields */}
          {cfg.mode === 'array' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
              padding: '0.75rem', borderRadius: 10, background: 'var(--bg-surface-2)',
              border: '1px solid var(--border)' }}>
              <div className="field">
                <label className="field-label">Array key in response</label>
                <input className="input input--mono" value={cfg.array_key}
                  onChange={e => upd('array_key', e.target.value)}
                  placeholder="logs" />
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Leave blank if root is array</span>
              </div>
              <div className="field">
                <label className="field-label">Sort by (descending)</label>
                <input className="input input--mono" value={cfg.sort_by}
                  onChange={e => upd('sort_by', e.target.value)}
                  placeholder="created_at" />
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>ISO timestamp field</span>
              </div>
            </div>
          )}

          {/* Value path */}
          <div className="field">
            <label className="field-label">
              Value path <span style={{ fontWeight: 400, textTransform: 'none', fontSize: '0.70rem' }}>(dot notation)</span>
            </label>
            <input className="input input--mono" value={cfg.value_path}
              onChange={e => upd('value_path', e.target.value)}
              placeholder={cfg.mode === 'array' ? 'sensor_data.aqi  or  message' : 'temperature.current'} />
            <span style={{ fontSize: '0.60rem', color: 'var(--text-muted)' }}>
              {cfg.mode === 'direct'
                ? 'e.g. temperature.current · humidity.average · humidity.minMaxLast24Hours[0]'
                : 'Field inside the latest array item — leave blank to use message field'}
            </span>
          </div>

          {/* Unit + refresh */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div className="field">
              <label className="field-label">Display unit</label>
              <input className="input" value={cfg.unit}
                onChange={e => upd('unit', e.target.value)}
                placeholder="°C, %, ppm, AQI…" />
            </div>
            <div className="field">
              <label className="field-label">Refresh interval (ms)</label>
              <input className="input input--mono" type="number" min={5000} step={1000} value={cfg.refresh_ms}
                onChange={e => upd('refresh_ms', parseInt(e.target.value) || 15000)} />
            </div>
          </div>

          {/* Test result */}
          {preview !== null && (
            <div style={{
              padding: '0.65rem 0.875rem', borderRadius: 10,
              background: testOk ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
              border: `1px solid ${testOk ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            }}>
              {testOk
                ? <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0, marginTop: 1 }} />
                : <XCircle     size={14} style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }} />}
              <div>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, marginBottom: 3,
                  color: testOk ? '#10b981' : '#ef4444' }}>
                  {testOk ? 'Success — extracted value:' : 'Error'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
                  color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {typeof preview === 'object' ? JSON.stringify(preview) : String(preview)}
                  {testOk && cfg.unit && <span style={{ color: 'var(--text-secondary)' }}> {cfg.unit}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.25rem' }}>
            <button className="btn btn--ghost btn--sm" onClick={testApi}
              disabled={!cfg.endpoint || testing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}>
              {testing
                ? <RefreshCw size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                : '🔍'} Test API
            </button>
            <button onClick={onClose} className="btn btn--ghost" style={{ flex: 1 }}>Cancel</button>
            <button onClick={() => onSave(cfg)} className="btn btn--primary" style={{ flex: 1 }}>
              <Save size={14} /> Save config
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ LIVE VALUE BADGE
// Shows fetched API value inside a SensorCard.
// ════════════════════════════════════════════════════════════════════════════

function LiveValueBadge({ liveApi }) {
  const { value, timestamp, loading, error, refetch } = useLiveValue(liveApi)
  const hasValue = value !== null && !error

  return (
    <div style={{
      borderRadius: 10, padding: '0.6rem 0.75rem',
      background: hasValue ? 'rgba(16,185,129,0.07)' : 'var(--bg-surface-2)',
      border: `1px solid ${hasValue ? 'rgba(16,185,129,0.22)' : 'var(--border)'}`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.28rem' }}>
          <Radio size={9} style={{ color: hasValue ? '#10b981' : 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.55rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.5px', color: hasValue ? '#10b981' : 'var(--text-muted)' }}>
            {liveApi.endpoint?.split('/').pop()?.split('?')[0] || 'Live API'}
          </span>
        </div>
        <button onClick={refetch} disabled={loading}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--text-muted)', lineHeight: 1 }}>
          <RefreshCw size={9} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Value */}
      {error ? (
        <div style={{ fontSize: '0.68rem', color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{error}</div>
      ) : loading && value === null ? (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Fetching…</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 800,
            color: 'var(--text-primary)', lineHeight: 1 }}>
            {fmtLive(value)}
          </span>
          {liveApi.unit && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.70rem',
              color: 'var(--text-secondary)', fontWeight: 500 }}>
              {liveApi.unit}
            </span>
          )}
        </div>
      )}

      {/* Footer: path + timestamp */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.22rem' }}>
        <span style={{ fontSize: '0.55rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
          {liveApi.value_path || 'root'}
        </span>
        {timestamp && (
          <span style={{ fontSize: '0.55rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {relativeTs(timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ SENSOR CARD (grid view)
// ════════════════════════════════════════════════════════════════════════════

const SensorCard = ({ sensor, isSelected, onSelect, onDelete, onConfigureApi }) => {
  const meta     = TYPE_META[sensor.type] || TYPE_META['temp_hum']
  const hasAlert = sensor.temperature > 28 || sensor.humidity > 75
  const hasApi   = !!sensor.live_api?.endpoint

  return (
    <motion.div
      layoutId={`sensor-${sensor.id}`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect(sensor)}
      className="sensor-card"
      style={{
        background: 'var(--bg-surface)',
        border: `2px solid ${isSelected ? meta.color : 'var(--border)'}`,
        borderRadius: 14, padding: '1rem', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
      }}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.98 }}>

      {/* Alert stripe */}
      {hasAlert && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#ef4444' }} />
      )}

      {/* API indicator pill */}
      {hasApi && (
        <div style={{
          position: 'absolute', top: hasAlert ? 8 : 5, right: 5,
          display: 'inline-flex', alignItems: 'center', gap: '0.22rem',
          padding: '1px 6px', borderRadius: 99, fontSize: '0.52rem', fontWeight: 700,
          color: '#10b981', fontFamily: 'var(--font-mono)',
          background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.25)',
        }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#10b981',
            animation: 'led-pulse 2s infinite', display: 'inline-block' }} />
          API
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
        marginBottom: '0.75rem', paddingRight: hasApi ? '2.5rem' : 0 }}>
        <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sensor.name}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {meta.label} · {sensor.room_name || '—'}
          </div>
        </div>
      </div>

      {/* Live API value */}
      {hasApi && (
        <div style={{ marginBottom: '0.75rem' }}>
          <LiveValueBadge liveApi={sensor.live_api} />
        </div>
      )}

      {/* Static readings (shown when no API configured) */}
      {!hasApi && (sensor.temperature != null || sensor.humidity != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {sensor.temperature != null && (
            <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '0.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: '#ef4444', fontWeight: 600, marginBottom: 2 }}>TEMP</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700,
                color: sensor.temperature > 28 ? '#ef4444' : 'var(--text-primary)' }}>
                {sensor.temperature.toFixed(1)}°
              </div>
            </div>
          )}
          {sensor.humidity != null && (
            <div style={{ background: 'rgba(37,99,235,0.08)', borderRadius: 8, padding: '0.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.58rem', color: '#2563eb', fontWeight: 600, marginBottom: 2 }}>HUM</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700,
                color: sensor.humidity > 75 ? '#ef4444' : 'var(--text-primary)' }}>
                {sensor.humidity.toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last seen (static fallback) */}
      {!hasApi && sensor.last_seen && (
        <div style={{ fontSize: '0.60rem', color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)', marginBottom: '0.75rem' }}>
          {relativeTs(sensor.last_seen)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button onClick={e => { e.stopPropagation(); onConfigureApi(sensor) }}
          className="btn btn--sm" title="Configure live API source"
          style={{
            flex: 1, fontSize: '0.68rem',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            color: hasApi ? '#10b981' : 'var(--text-secondary)',
            borderColor: hasApi ? 'rgba(16,185,129,0.28)' : 'var(--border)',
            background: hasApi ? 'rgba(16,185,129,0.07)' : 'transparent',
          }}>
          <Settings size={11} />{hasApi ? 'Edit API' : 'Set API'}
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(sensor.id) }}
          className="btn btn--sm"
          style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)',
            background: 'rgba(239,68,68,0.06)', fontSize: '0.68rem', padding: '0.4rem 0.6rem' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ║ SENSOR FORM MODAL (add / edit basic sensor info)
// ════════════════════════════════════════════════════════════════════════════

const SensorFormModal = ({ sensor, pendingPos, onSave, onClose }) => {
  const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm({
    defaultValues: {
      name:    sensor?.name    || '',
      type:    sensor?.type    || 'temp_hum',
      room_id: sensor?.room_id || '',
      topic:   sensor?.topic   || '',
    },
    mode: 'onChange',
  })
  const typeValue = watch('type')

  return (
    <AnimatePresence>
      <motion.div className="modal-overlay" onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.div className="modal" onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          style={{ maxWidth: 440 }}>
          <button className="modal-close" onClick={onClose}><X size={14} /></button>

          <div className="modal-title" style={{ marginBottom: '1.25rem' }}>
            {sensor ? '✏️ Edit Sensor' : '➕ New Sensor'}
            {pendingPos && (
              <div style={{ fontSize: '0.63rem', fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)', fontWeight: 400, marginTop: 4 }}>
                Position: x={pendingPos.x.toFixed(1)}% · y={pendingPos.y.toFixed(1)}%
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit(data => onSave({ ...data, ...pendingPos }))}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>

              <div className="field">
                <label className="field-label">Sensor name *</label>
                <input className="input"
                  {...register('name', { required: 'Name is required', minLength: 2 })}
                  placeholder="e.g. Living room north" autoFocus />
                {errors.name && <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>{errors.name.message}</span>}
              </div>

              <div className="field">
                <label className="field-label">Sensor type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                  {SENSOR_TYPES.map(t => (
                    <motion.button key={t.id} type="button"
                      onClick={() => register('type').onChange({ target: { value: t.id } })}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                      style={{
                        padding: '0.6rem 0.3rem', borderRadius: 10, cursor: 'pointer',
                        border: `2px solid ${typeValue === t.id ? t.color : 'var(--border)'}`,
                        background: typeValue === t.id ? `${t.color}13` : 'var(--bg-surface-2)',
                        fontSize: '0.62rem', color: typeValue === t.id ? t.color : 'var(--text-secondary)',
                        fontWeight: typeValue === t.id ? 700 : 400,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all 0.14s',
                      }}>
                      <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
                      {t.label}
                    </motion.button>
                  ))}
                </div>
                <input type="hidden" {...register('type')} />
              </div>

              <div className="field">
                <label className="field-label">Room *</label>
                <select className="select" {...register('room_id', { required: 'Room is required' })}>
                  <option value="">-- Select room --</option>
                  {ROOMS.filter(r => r.area).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                {errors.room_id && <span style={{ fontSize: '0.68rem', color: '#ef4444' }}>{errors.room_id.message}</span>}
              </div>

              <div className="field">
                <label className="field-label">
                  MQTT Topic <span style={{ fontWeight: 400, fontSize: '0.70rem' }}>(optional)</span>
                </label>
                <input className="input input--mono" {...register('topic')} placeholder="home/sala/temperatura" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button type="button" onClick={onClose} className="btn btn--ghost" style={{ flex: 1 }}>Cancel</button>
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

// ════════════════════════════════════════════════════════════════════════════
// ║ FLOORPLAN MAP SVG
// ════════════════════════════════════════════════════════════════════════════

const FloorplanMap = ({ sensors, selectedId, onSelectSensor, onDragSensor, bgImage, zoom, onZoom, editMode, addMode, onAddClick }) => {
  const svgRef = useRef(null)
  const dragRef = useRef(null)

  const getSvgCoords = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: clamp(x, 1.5, 98.5), y: clamp(y, 1.5, 98.5) }
  }, [])

  const handleDragStart = (e, sensor) => {
    if (!editMode) return
    e.preventDefault()
    dragRef.current = { sensor, offset: getSvgCoords(e) }
  }

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current || !editMode) return
    onDragSensor(dragRef.current.sensor.id, getSvgCoords(e))
  }, [editMode, getSvgCoords, onDragSensor])

  const handleMouseUp = () => { dragRef.current = null }

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
      <AnimatePresence>
        {(addMode || editMode) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15,
              background: addMode ? 'rgba(37,99,235,0.92)' : 'rgba(245,158,11,0.92)',
              color: addMode ? '#fff' : '#0d1b3e',
              textAlign: 'center', padding: '0.5rem', fontSize: '0.78rem', fontWeight: 600,
            }}>
            {addMode ? '📍 Click to place sensor' : '✋ Drag to reposition'}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom controls */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12, zIndex: 10,
        display: 'flex', gap: '0.25rem', alignItems: 'center',
        background: 'var(--bg-surface)', borderRadius: 10, padding: '0.35rem',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
      }}>
        <button className="btn btn--ghost btn--xs" onClick={() => onZoom(-0.2)}><ZoomOut size={12} /></button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', minWidth: 30, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button className="btn btn--ghost btn--xs" onClick={() => onZoom(0.2)}><ZoomIn size={12} /></button>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <button className="btn btn--ghost btn--xs" onClick={() => onZoom(0, true)}>1:1</button>
      </div>

      <svg ref={svgRef} viewBox="0 0 100 100"
        style={{ width: '100%', aspectRatio: '1.06/1', display: 'block',
          cursor: addMode ? 'crosshair' : 'default', userSelect: 'none' }}
        onClick={e => { if (addMode) onAddClick(getSvgCoords(e)) }}>
        <g transform={`scale(${zoom})`} style={{ transformOrigin: '50px 50px' }}>
          <rect x={0} y={0} width={100} height={100} fill="#f3f6fb" />
          {bgImage && <image href={bgImage} x={0} y={0} width={100} height={100}
            preserveAspectRatio="xMidYMid meet" opacity={0.65} />}

          {ROOMS.map(room => (
            <g key={room.id}>
              <rect x={room.x} y={room.y} width={room.w} height={room.h}
                fill={bgImage ? 'rgba(255,255,255,0.08)' : 'white'}
                stroke="#bdd0e8" strokeWidth={0.45} rx={0.6} />
              {room.area ? (
                <>
                  <text x={room.x + room.w / 2} y={room.y + room.h / 2 - 2.2}
                    textAnchor="middle" fontSize={2.6} fill="#0d1b3e"
                    fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif" fontWeight="700">{room.label}</text>
                  <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 2.8}
                    textAnchor="middle" fontSize={1.8} fill="#6a8aaa"
                    fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif">{room.area}</text>
                </>
              ) : (
                <text x={room.x + room.w / 2} y={room.y + room.h / 2}
                  textAnchor="middle" dominantBaseline="central" fontSize={2} fill="#9ab0cc"
                  fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif"
                  transform={`rotate(-90, ${room.x + room.w / 2}, ${room.y + room.h / 2})`}>
                  Hallway
                </text>
              )}
            </g>
          ))}

          <rect x={2.5} y={4} width={94.5} height={93} fill="none" stroke="#7a96b4" strokeWidth={0.75} rx={1} />

          {sensors.map(sensor => {
            const meta       = TYPE_META[sensor.type] || TYPE_META['temp_hum']
            const isSelected = selectedId === sensor.id
            const hasAlert   = sensor.temperature > 28 || sensor.humidity > 75
            const hasApi     = !!sensor.live_api?.endpoint
            return (
              <g key={sensor.id} transform={`translate(${sensor.x}, ${sensor.y})`}
                style={{ cursor: editMode ? 'grab' : 'pointer' }}>
                {!editMode && (
                  <circle r={2.7} fill={meta.color} opacity={0.12}>
                    <animate attributeName="r" values="1.7;2.7;1.7" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}
                {isSelected && <circle r={2.5} fill="none" stroke={meta.color} strokeWidth={0.6} opacity={0.35} />}
                <circle r={1.7}
                  fill={isSelected ? meta.color : 'white'}
                  stroke={meta.color} strokeWidth={isSelected ? 0 : 0.6}
                  style={{ filter: isSelected ? `drop-shadow(0 0 6px ${meta.color})` : 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                  onClick={e => { e.stopPropagation(); onSelectSensor(sensor) }}
                  onMouseDown={e => handleDragStart(e, sensor)} />
                {/* Status dot: red = alert, green = has live API */}
                {hasAlert && <circle cx={1.8} cy={-1.8} r={0.7} fill="#ef4444" stroke="white" strokeWidth={0.25} />}
                {hasApi && !hasAlert && <circle cx={1.8} cy={-1.8} r={0.6} fill="#10b981" stroke="white" strokeWidth={0.2} />}
                {!editMode && !isSelected && (
                  <g transform="translate(2.3, -3.3)">
                    <rect x={0} y={0} width={sensor.name.length * 1.27 + 2} height={3.7}
                      rx={2.5} fill="white" stroke={meta.color} strokeWidth={0.9}
                      style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.10))' }} />
                    <text x={1} y={2.5} fontSize={1.7} fill="#0d1b3e"
                      fontFamily="'DM Sans','Plus Jakarta Sans',sans-serif" fontWeight="600">
                      {sensor.name}
                    </text>
                  </g>
                )}
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

// ════════════════════════════════════════════════════════════════════════════
// ║ KPI CARD
// ════════════════════════════════════════════════════════════════════════════

const KpiCard = ({ label, value, unit, icon, color, trend }) => (
  <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}
    style={{ background: 'var(--bg-surface)', border: `2px solid ${color}25`,
      borderTop: `3px solid ${color}`, borderRadius: 12, padding: '1rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    </div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 800,
      color: 'var(--text-primary)', lineHeight: 1 }}>
      {value != null ? `${value}${unit}` : '—'}
    </div>
    {trend && <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{trend}</div>}
  </motion.div>
)

// ════════════════════════════════════════════════════════════════════════════
// ║ MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function FloorplanPage() {
  const { toast, showToast }                               = useToast()
  const { sensors, setSensors, updateSensor, removeSensor } = useFloorplanStore()
  const fileRef = useRef(null)

  const [loading, setLoading]               = useState(true)
  const [selectedSensor, setSelectedSensor] = useState(null)
  const [editMode, setEditMode]             = useState(false)
  const [addMode, setAddMode]               = useState(false)
  const [modal, setModal]                   = useState(null)  // { sensor? } | { pendingPos }
  const [apiModal, setApiModal]             = useState(null)  // sensor to configure
  const [bgImage, setBgImage]               = useState(() => localStorage.getItem('fp-bg-image') || '')
  const [mapZoom, setMapZoom]               = useState(1)
  const [viewMode, setViewMode]             = useState('map') // 'map' | 'grid'

  // ── Load sensors ──────────────────────────────────────────
  const loadSensors = useCallback(async () => {
    try {
      const data = await fetch('/api/sensors').then(r => r.json())
      setSensors(Array.isArray(data) ? data : [])
    } catch { showToast('Error loading sensors', 'error') }
    finally { setLoading(false) }
  }, [setSensors, showToast])

  useEffect(() => {
    loadSensors()
    const id = setInterval(loadSensors, 10000)
    return () => clearInterval(id)
  }, [loadSensors])

  // ── Save sensor basic info ────────────────────────────────
  const saveSensor = useCallback(async (data) => {
    try {
      if (modal?.sensor) {
        const res = await fetch(`/api/sensors/${modal.sensor.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error()
        updateSensor(modal.sensor.id, data)
        showToast('Sensor updated', 'success')
      } else {
        const res = await fetch('/api/sensors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error()
        showToast('Sensor added', 'success')
        await loadSensors()
      }
      setModal(null); setSelectedSensor(null)
    } catch { showToast('Error saving sensor', 'error') }
  }, [modal, updateSensor, loadSensors, showToast])

  // ── Save live API config for a sensor ────────────────────
  const saveApiConfig = useCallback(async (liveApiConfig) => {
    if (!apiModal) return
    try {
      const payload = { ...apiModal, live_api: liveApiConfig }
      const res = await fetch(`/api/sensors/${apiModal.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      updateSensor(apiModal.id, { live_api: liveApiConfig })
      showToast('API config saved', 'success')
    } catch { showToast('Error saving API config', 'error') }
    finally { setApiModal(null) }
  }, [apiModal, updateSensor, showToast])

  // ── Delete sensor ─────────────────────────────────────────
  const deleteSensor = useCallback(async (id) => {
    if (!window.confirm('Delete this sensor?')) return
    try {
      await fetch(`/api/sensors/${id}`, { method: 'DELETE' })
      removeSensor(id); setSelectedSensor(null)
      showToast('Sensor deleted', 'success')
    } catch { showToast('Error deleting sensor', 'error') }
  }, [removeSensor, showToast])

  // ── Upload floorplan bg ───────────────────────────────────
  const uploadBg = useCallback((file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      if (url) { setBgImage(url); localStorage.setItem('fp-bg-image', url); showToast('Floorplan uploaded', 'success') }
    }
    reader.readAsDataURL(file)
  }, [showToast])

  const handleDragSensor = useCallback((id, coords) => updateSensor(id, coords), [updateSensor])
  const handleZoom = useCallback((delta, reset) => {
    if (reset) setMapZoom(1)
    else setMapZoom(p => parseFloat(clamp(p + delta, 0.5, 3).toFixed(2)))
  }, [])

  // ── Computed stats ────────────────────────────────────────
  const withTemp   = sensors.filter(s => s.temperature != null)
  const withHum    = sensors.filter(s => s.humidity    != null)
  const alerts     = sensors.filter(s => s.temperature > 28 || s.humidity > 75)
  const apiSensors = sensors.filter(s => s.live_api?.endpoint)
  const avgTemp    = withTemp.length ? (withTemp.reduce((a, s) => a + s.temperature, 0) / withTemp.length).toFixed(1) : null
  const avgHum     = withHum.length  ? (withHum.reduce((a, s) => a + s.humidity,    0) / withHum.length).toFixed(0)  : null
  const hottest    = withTemp.length ? withTemp.reduce((a, b) => a.temperature > b.temperature ? a : b) : null
  const wettest    = withHum.length  ? withHum.reduce((a, b) => a.humidity > b.humidity ? a : b) : null

  return (
    <div className="page animate-fade fp">

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div className="fp-header"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div>
          <h1 className="page-title">
            Floorplan <span style={{ color: 'var(--accent)' }}>Smart</span>
          </h1>
          <p className="page-subtitle">Real-time sensor monitoring · 10s auto-refresh</p>
        </div>

        <div className="fp-header-actions">
          {alerts.length > 0 && (
            <span className="badge badge--danger"><AlertTriangle size={10} /> {alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
          )}
          <span className="badge badge--muted" style={{ fontFamily: 'var(--font-mono)' }}>
            {sensors.length} sensor{sensors.length !== 1 ? 's' : ''}
          </span>
          {apiSensors.length > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
              fontFamily: 'var(--font-mono)', color: '#10b981',
              background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981',
                animation: 'led-pulse 2s infinite', display: 'inline-block' }} />
              {apiSensors.length} live
            </span>
          )}

          <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-surface-2)', borderRadius: 8, padding: '0.2rem' }}>
            <button onClick={() => setViewMode('map')}
              className={`btn btn--sm ${viewMode === 'map' ? 'btn--primary' : 'btn--ghost'}`}
              style={{ fontSize: '0.68rem' }} title="Map view"><MapIcon size={12} /></button>
            <button onClick={() => setViewMode('grid')}
              className={`btn btn--sm ${viewMode === 'grid' ? 'btn--primary' : 'btn--ghost'}`}
              style={{ fontSize: '0.68rem' }} title="Grid view"><Grid3x3 size={12} /></button>
          </div>

          <button onClick={() => { setEditMode(e => !e); setAddMode(false); setSelectedSensor(null) }}
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}>
            <Move size={13} /> {editMode ? 'Done' : 'Move'}
          </button>

          <button onClick={() => { setAddMode(a => !a); setEditMode(false); setSelectedSensor(null) }}
            className={`btn btn--sm ${addMode ? 'btn--primary' : 'btn--ghost'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}>
            <Plus size={13} /> {addMode ? 'Cancel' : 'Add'}
          </button>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => uploadBg(e.target.files?.[0])} />
          <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}
            style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Home size={13} /> Floorplan
          </button>
          {bgImage && (
            <button className="btn btn--ghost btn--sm" style={{ color: '#ef4444' }}
              onClick={() => { setBgImage(''); localStorage.removeItem('fp-bg-image') }}>
              <X size={13} />
            </button>
          )}
          <button onClick={loadSensors} className="btn btn--ghost btn--sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem' }}>
            <RefreshCw size={12} />
          </button>
        </div>
      </motion.div>

      {/* ── Alert strip ──────────────────────────────────────── */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div className="fp-alerts"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            {alerts.map(s => (
              <motion.div key={s.id} className="fp-alert-chip"
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <AlertTriangle size={11} />
                <strong>{s.name}</strong>
                {s.temperature > 28 && <span>{s.temperature.toFixed(1)}°C</span>}
                {s.humidity    > 75 && <span>{s.humidity.toFixed(0)}%</span>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAP view ─────────────────────────────────────────── */}
      {viewMode === 'map' ? (
        <motion.div className="fp-bento"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>

          <div className="fp-map-section">
            <FloorplanMap
              sensors={sensors} selectedId={selectedSensor?.id}
              onSelectSensor={s => setSelectedSensor(s)}
              onDragSensor={handleDragSensor}
              bgImage={bgImage} zoom={mapZoom} onZoom={handleZoom}
              editMode={editMode} addMode={addMode}
              onAddClick={pos => setModal({ pendingPos: pos })}
            />
          </div>

          <motion.div className="fp-sidebar"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>

            {/* Legend */}
            <div className="card" style={{ padding: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <Layers size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Sensor types</span>
              </div>
              {SENSOR_TYPES.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.color,
                    flexShrink: 0, boxShadow: `0 0 5px ${t.color}60` }} />
                  <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{t.icon} {t.label}</span>
                </div>
              ))}
              <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)',
                display: 'flex', gap: '1rem', fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.28rem' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Live API connected
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.28rem' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                  Alert
                </div>
              </div>
            </div>

            {/* Sensor list */}
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.65rem 0.875rem', borderBottom: '1px solid var(--border)' }}>
                <Wifi size={13} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>Sensors</span>
                <span className="badge badge--muted" style={{ marginLeft: 'auto', fontSize: '0.58rem' }}>
                  {sensors.length}
                </span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <div className="loading-box" style={{ padding: '1.5rem' }}><span className="spinner" /></div>
                  ) : sensors.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center',
                      color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      No sensors yet.<br />
                      <button className="btn btn--ghost btn--sm"
                        style={{ marginTop: '0.5rem', fontSize: '0.70rem' }}
                        onClick={() => setAddMode(true)}>+ Add the first one</button>
                    </div>
                  ) : sensors.map(s => {
                    const meta       = TYPE_META[s.type] || TYPE_META['temp_hum']
                    const isSelected = selectedSensor?.id === s.id
                    const hasApi     = !!s.live_api?.endpoint
                    return (
                      <motion.div key={s.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                        onClick={() => { setSelectedSensor(s); setEditMode(false); setAddMode(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.55rem 0.875rem', borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--accent-light)' : 'transparent',
                          borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                          transition: 'background 0.15s',
                        }}
                        whileHover={{ background: 'var(--bg-surface-2)' }}>
                        <span style={{ fontSize: '0.95rem', flexShrink: 0 }}>{meta.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                          <div style={{ fontSize: '0.60rem', color: 'var(--text-secondary)' }}>{s.room_name || '—'}</div>
                        </div>
                        {hasApi && (
                          <span style={{ fontSize: '0.52rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                            color: '#10b981', padding: '1px 5px', borderRadius: 99, flexShrink: 0,
                            background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.22)' }}>
                            API
                          </span>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                          gap: 2, fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {s.temperature != null && <span style={{ color: s.temperature > 28 ? '#ef4444' : 'var(--text-primary)' }}>{s.temperature.toFixed(1)}°</span>}
                          {s.humidity    != null && <span style={{ color: s.humidity > 75    ? '#ef4444' : 'var(--text-secondary)' }}>{s.humidity.toFixed(0)}%</span>}
                        </div>
                        {/* API config shortcut */}
                        <button onClick={e => { e.stopPropagation(); setApiModal(s) }}
                          title="Configure API source"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                            color: hasApi ? '#10b981' : 'var(--text-muted)', lineHeight: 1, flexShrink: 0 }}>
                          <Settings size={11} />
                        </button>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : (
        /* ── GRID view ─────────────────────────────────────── */
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '1rem', marginBottom: '1.5rem' }}>
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="loading-box" style={{ gridColumn: '1/-1', padding: '2rem' }}><span className="spinner" /></div>
            ) : sensors.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                <p>No sensors yet</p>
                <button className="btn btn--primary btn--sm" style={{ marginTop: '0.75rem' }} onClick={() => setAddMode(true)}>
                  + Add first sensor
                </button>
              </div>
            ) : sensors.map(s => (
              <SensorCard key={s.id} sensor={s}
                isSelected={selectedSensor?.id === s.id}
                onSelect={setSelectedSensor}
                onDelete={deleteSensor}
                onConfigureApi={sensor => setApiModal(sensor)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── KPI row ──────────────────────────────────────────── */}
      <motion.div className="fp-kpi-row"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        {avgTemp && <KpiCard label="Avg Temp"     icon="🌡️" value={avgTemp} unit="°C" color={parseFloat(avgTemp) > 26 ? '#ef4444' : '#f59e0b'} />}
        {avgHum  && <KpiCard label="Avg Humidity" icon="💧" value={avgHum}  unit="%"  color={parseFloat(avgHum) > 70  ? '#ef4444' : '#2563eb'} />}
        {hottest && <KpiCard label="Warmest"      icon="🔥" value={hottest.temperature.toFixed(1)} unit="°C" color="#ef4444" trend={`@ ${hottest.name}`} />}
        {wettest && <KpiCard label="Most humid"   icon="💦" value={wettest.humidity.toFixed(0)} unit="%" color="#2563eb" trend={`@ ${wettest.name}`} />}
      </motion.div>

      {/* ── Modals ──────────────────────────────────────────── */}
      {modal && (
        <SensorFormModal
          sensor={modal.sensor} pendingPos={modal.pendingPos}
          onSave={saveSensor} onClose={() => setModal(null)} />
      )}
      {apiModal && (
        <ApiConfigModal
          sensor={apiModal}
          onSave={saveApiConfig}
          onClose={() => setApiModal(null)} />
      )}

      <Toast toast={toast} />

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes led-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

        .fp-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;
        }
        .fp-header-actions {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.4rem;
        }
        .fp-alerts {
          display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 1.25rem; overflow: hidden;
        }
        .fp-alert-chip {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.45rem 0.9rem; border-radius: var(--radius-full);
          background: rgba(239,68,68,0.09); border: 1.5px solid rgba(239,68,68,0.28);
          font-size: 0.73rem; color: #ef4444; font-family: var(--font-mono); font-weight: 600;
        }
        .fp-bento {
          display: grid; grid-template-columns: 1fr 268px;
          gap: 1.25rem; margin-bottom: 1.5rem;
        }
        .fp-map-section { border-radius: 12px; overflow: hidden; background: var(--bg-surface); }
        .fp-sidebar {
          display: flex; flex-direction: column; gap: 0.875rem;
          max-height: calc(100vh - 240px); position: sticky; top: 80px;
        }
        .fp-kpi-row {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem;
        }

        @media (max-width: 1024px) {
          .fp-bento { grid-template-columns: 1fr; }
          .fp-sidebar { position: static; max-height: none; }
        }
        @media (max-width: 768px) {
          .fp-header { flex-direction: column; gap: 0.75rem; }
          .fp-header-actions { width: 100%; }
          .fp-kpi-row { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
        }
        @media (max-width: 480px) {
          .fp-kpi-row { grid-template-columns: repeat(2, 1fr); }
          .fp-alerts { gap: 0.4rem; }
          .fp-alert-chip { font-size: 0.65rem; padding: 0.35rem 0.7rem; }
        }
      `}</style>
    </div>
  )
}