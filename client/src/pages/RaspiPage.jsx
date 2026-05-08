import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Activity, Terminal, Shield, RefreshCw, Play, X,
  Power, RotateCcw, Cpu, Wifi, FileText, Package,
  AlertTriangle, Server, Zap, MapPin, Plus, Move, Save, Trash2,
  ZoomIn, ZoomOut, GripVertical, Maximize2,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
const D = {
  colors: {
    primary:  '#2563eb',
    secondary:'#f59e0b',
    success:  '#10b981',
    danger:   '#ef4444',
    accent:   'var(--accent)',
    muted:    '#8b5cf6',
    text: {
      primary:   'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted:     'var(--text-muted)',
    },
    bg: {
      surface:  'var(--bg-surface)',
      surface2: 'var(--bg-surface-2)',
      surface3: 'var(--bg-surface-3)',
    },
    border:      'var(--border)',
    borderStrong:'var(--border-strong)',
  },
  sp: { xs:'0.25rem', sm:'0.5rem', md:'0.75rem', lg:'1rem', xl:'1.5rem' },
  ty: {
    xs:   { size:'0.65rem', weight:500 },
    sm:   { size:'0.72rem', weight:500 },
    base: { size:'0.78rem', weight:500 },
    mono: { family:'var(--font-mono)' },
  },
  radius: { sm:'6px', md:'10px', lg:'14px', full:'99px' },
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: D.colors.bg.surface,
    border: `1px solid ${D.colors.borderStrong}`,
    borderRadius: 10,
    fontFamily: D.ty.mono.family,
    fontSize: D.ty.xs.size,
    color: D.colors.text.primary,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID LAYOUT ENGINE
// ─────────────────────────────────────────────────────────────────────────────
//
// Each widget occupies a cell in a 12-column virtual grid.
// Layout items: { id, col, row, colSpan, rowSpan }
// colSpan/rowSpan are in grid units; px sizes derive from container width.
//
// The grid uses CSS Grid with 12 equal columns and auto rows of GRID_ROW_H px.
// Drag: user grabs the drag handle → we track mouse delta → update col/row.
// Resize: user grabs the resize corner → we update colSpan/rowSpan.
//
const GRID_COLS    = 12
const GRID_ROW_H   = 60    // px per row unit
const GRID_GAP     = 12    // px
const MIN_COL_SPAN = 3
const MIN_ROW_SPAN = 2

// Persist layout to localStorage
const LAYOUT_KEY = 'raspi-grid-layout-v2'

const DEFAULT_LAYOUT = [
  // id            col  row  colSpan rowSpan
  { id:'gauges',     col:0,  row:0,  colSpan:12, rowSpan:3 },
  { id:'chart',      col:0,  row:3,  colSpan:8,  rowSpan:5 },
  { id:'devinfo',    col:8,  row:3,  colSpan:4,  rowSpan:3 },
  { id:'resources',  col:8,  row:6,  colSpan:4,  rowSpan:2 },
  { id:'floorplan',  col:0,  row:8,  colSpan:6,  rowSpan:10},
  { id:'power',      col:6,  row:8,  colSpan:3,  rowSpan:4 },
  { id:'services',   col:9,  row:8,  colSpan:3,  rowSpan:4 },
  { id:'processes',  col:6,  row:12, colSpan:6,  rowSpan:4 },
  { id:'network',    col:6,  row:16, colSpan:3,  rowSpan:4 },
  { id:'ssh',        col:0,  row:18, colSpan:12, rowSpan:5 },
  { id:'logs',       col:0,  row:23, colSpan:8,  rowSpan:5 },
  { id:'upgrade',    col:8,  row:23, colSpan:4,  rowSpan:3 },
  { id:'backup',     col:8,  row:26, colSpan:4,  rowSpan:2 },
]

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // Merge: keep default ids, apply saved positions/spans
      return DEFAULT_LAYOUT.map(def => {
        const s = saved.find(x => x.id === def.id)
        return s ? { ...def, ...s } : def
      })
    }
  } catch {}
  return DEFAULT_LAYOUT
}

function saveLayout(layout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAGGABLE GRID WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
function GridLayout({ layout, setLayout, editMode, children }) {
  const containerRef = useRef(null)
  const dragState    = useRef(null)   // { id, type:'drag'|'resize', startX, startY, startLayout }
  const rafId        = useRef(null)

  // Convert px delta to grid units
  const pxToCol = useCallback((px) => {
    const el = containerRef.current
    if (!el) return 0
    const colW = (el.offsetWidth + GRID_GAP) / GRID_COLS
    return Math.round(px / colW)
  }, [])

  const pxToRow = useCallback((px) => {
    return Math.round(px / (GRID_ROW_H + GRID_GAP))
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!dragState.current) return
    if (rafId.current) cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => {
      const { id, type, startX, startY, startLayout } = dragState.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const item = startLayout.find(x => x.id === id)
      if (!item) return

      setLayout(prev => prev.map(x => {
        if (x.id !== id) return x
        if (type === 'drag') {
          const col = Math.max(0, Math.min(GRID_COLS - item.colSpan, item.col + pxToCol(dx)))
          const row = Math.max(0, item.row + pxToRow(dy))
          return { ...x, col, row }
        } else {
          const colSpan = Math.max(MIN_COL_SPAN, Math.min(GRID_COLS - item.col, item.colSpan + pxToCol(dx)))
          const rowSpan = Math.max(MIN_ROW_SPAN, item.rowSpan + pxToRow(dy))
          return { ...x, colSpan, rowSpan }
        }
      }))
    })
  }, [pxToCol, pxToRow, setLayout])

  const onMouseUp = useCallback(() => {
    if (!dragState.current) return
    dragState.current = null
    setLayout(prev => { saveLayout(prev); return prev })
  }, [setLayout])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const startDrag = (e, id, type) => {
    e.preventDefault()
    e.stopPropagation()
    dragState.current = {
      id, type,
      startX: e.clientX,
      startY: e.clientY,
      startLayout: layout.map(x => ({ ...x })),
    }
  }

  // Compute total rows needed
  const totalRows = layout.reduce((m, x) => Math.max(m, x.row + x.rowSpan), 0) + 1

  return (
    <div
      ref={containerRef}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
        gridTemplateRows: `repeat(${totalRows}, ${GRID_ROW_H}px)`,
        gap: GRID_GAP,
        position: 'relative',
      }}
    >
      {children(layout, (id, type) => editMode
        ? (e) => startDrag(e, id, type)
        : undefined
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET WRAPPER  (card + drag handle + resize handle)
// ─────────────────────────────────────────────────────────────────────────────
function Widget({ item, editMode, onDragStart, onResizeStart, children, style }) {
  return (
    <div
      style={{
        gridColumn: `${item.col + 1} / span ${item.colSpan}`,
        gridRow:    `${item.row + 1} / span ${item.rowSpan}`,
        position: 'relative',
        transition: editMode ? 'none' : 'box-shadow 0.2s',
        outline: editMode ? `2px dashed ${D.colors.accent}` : 'none',
        outlineOffset: 2,
        borderRadius: D.radius.lg,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Drag handle */}
      {editMode && (
        <div
          onMouseDown={onDragStart}
          title="Drag to move"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 28, zIndex: 20,
            cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${D.colors.accent}18`,
            borderBottom: `1px dashed ${D.colors.accent}44`,
          }}
        >
          <GripVertical size={14} color={D.colors.accent} />
          <span style={{
            fontFamily: D.ty.mono.family, fontSize: '0.6rem', color: D.colors.accent,
            marginLeft: 4, opacity: 0.7,
          }}>{item.id}</span>
        </div>
      )}

      {/* Content — push down when edit mode so handle doesn't cover content */}
      <div style={{ height: '100%', paddingTop: editMode ? 28 : 0, boxSizing: 'border-box' }}>
        {children}
      </div>

      {/* Resize handle */}
      {editMode && (
        <div
          onMouseDown={onResizeStart}
          title="Drag to resize"
          style={{
            position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, zIndex: 20,
            cursor: 'nwse-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${D.colors.accent}22`,
            borderTopLeftRadius: 6,
          }}
        >
          <Maximize2 size={10} color={D.colors.accent} />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS / HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const FLOOR_ROOMS = [
  { id:'camera1',   label:'Bedroom',     area:'16.11 m²', x:2.5,  y:4,  w:39, h:38 },
  { id:'ufficio',   label:'Office',      area:'2.59 m²',  x:41.5, y:4,  w:11, h:14 },
  { id:'cucina',    label:'Kitchen',     area:'23.54 m²', x:2.5,  y:42, w:39, h:30 },
  { id:'sala',      label:'Dining room', area:'21.78 m²', x:52.5, y:4,  w:45, h:54 },
  { id:'bagno',     label:'Bathroom',    area:'5.63 m²',  x:52.5, y:58, w:29, h:21 },
  { id:'camera2',   label:'Bedroom 2',   area:'6.16 m²',  x:52.5, y:79, w:45, h:18 },
  { id:'corridoio', label:'Hallway',     area:'',         x:41.5, y:18, w:11, h:54 },
]

const PLAN_TYPES = [
  { id:'temp_hum', label:'Temp + Humidity', icon:'🌡️', color:D.colors.secondary },
  { id:'temp',     label:'Temperature',     icon:'🌡️', color:D.colors.danger    },
  { id:'humidity', label:'Humidity',        icon:'💧', color:D.colors.primary   },
  { id:'motion',   label:'Motion',          icon:'👁️', color:D.colors.muted     },
  { id:'door',     label:'Door',            icon:'🚪', color:D.colors.success   },
  { id:'air',      label:'Air',             icon:'🌬️', color:'#06b6d4'          },
]
const PLAN_META = Object.fromEntries(PLAN_TYPES.map(t => [t.id, t]))

const n   = v => { const x = parseFloat(v); return isNaN(x) ? null : x }
const fmt = bytes => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS (unchanged logic, same API calls)
// ─────────────────────────────────────────────────────────────────────────────

// ── GAUGE RING ────────────────────────────────────────────────
let _gid = 0
function GaugeRing({ value, max = 100, color, size = 104, label, unit = '%', sublabel, alertColor }) {
  const uid = useRef(`g_${_gid++}`)
  const pct  = value != null ? Math.min(Math.max(value / max, 0), 1) : 0
  const r    = 34, cx = 50, cy = 50
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  const c    = alertColor || color

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: D.sp.sm }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
        <defs>
          <linearGradient id={uid.current} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor={D.colors.primary} />
            <stop offset="55%"  stopColor={c} stopOpacity="0.85" />
            <stop offset="100%" stopColor={c} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={D.colors.bg.surface3} strokeWidth={9} />
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={`url(#${uid.current})`} strokeWidth={9}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition:'stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
        <text x={cx} y={cy-5} textAnchor="middle" dominantBaseline="central"
          fontFamily={D.ty.mono.family} fontSize={18} fontWeight={700}
          fill={alertColor || D.colors.text.primary}>
          {value != null ? (value % 1 === 0 ? value : value.toFixed(1)) : '—'}
        </text>
        <text x={cx} y={cy+11} textAnchor="middle"
          fontFamily={D.ty.mono.family} fontSize={8} fontWeight={500}
          fill={D.colors.text.secondary}>{unit}</text>
      </svg>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:D.ty.xs.size, fontWeight:700, color:D.colors.text.primary, lineHeight:1.2 }}>{label}</div>
        {sublabel && <div style={{ fontSize:'0.60rem', color: alertColor || c, marginTop:2, fontWeight:600 }}>{sublabel}</div>}
      </div>
    </div>
  )
}

// ── PROGRESS ROW ──────────────────────────────────────────────
function ProgressRow({ label, value, max=100, color, unit='%', warn }) {
  const pct = value != null ? Math.min(Math.max((value / max) * 100, 0), 100) : 0
  const c   = warn ? D.colors.danger : color
  return (
    <div style={{ marginBottom: D.sp.md }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: D.sp.xs }}>
        <span style={{ fontSize:D.ty.xs.size, color:D.colors.text.secondary, fontWeight:600 }}>{label}</span>
        <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size, fontWeight:700,
          color: warn ? D.colors.danger : D.colors.text.primary }}>
          {value != null ? `${value % 1 === 0 ? value : value.toFixed(1)}${unit}` : '—'}
        </span>
      </div>
      <div style={{ height:6, background:D.colors.bg.surface3, borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:99, width:`${pct}%`,
          background:`linear-gradient(90deg, ${D.colors.primary}, ${c})`,
          transition:'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
    </div>
  )
}

// ── PANEL ─────────────────────────────────────────────────────
function Panel({ icon:Icon, title, accent=D.colors.accent, badge, action, children, style, fullHeight }) {
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column',
      height: fullHeight ? '100%' : undefined, ...style }}>
      <div className="card-header" style={{ flexShrink:0 }}>
        <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0,
          background:`${accent}14`, color:accent,
          display:'flex', alignItems:'center', justifyContent:'center',
          border:`1.5px solid ${accent}20` }}>
          <Icon size={14} />
        </div>
        <span className="card-header-title">{title}</span>
        {badge != null && (
          <span style={{ marginLeft: D.sp.sm, padding:'2px 8px', borderRadius: D.radius.full,
            background:`${accent}12`, color:accent,
            fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size, fontWeight:700,
            border:`1px solid ${accent}22` }}>{badge}</span>
        )}
        {action && <div style={{ marginLeft:'auto' }}>{action}</div>}
      </div>
      <div style={{ padding: D.sp.lg, flex: fullHeight ? 1 : undefined, overflow:'auto' }}>{children}</div>
    </div>
  )
}

// ── STATUS PILL ───────────────────────────────────────────────
function StatusPill({ active }) {
  const fg  = active ? D.colors.success : D.colors.danger
  const bg  = active ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)'
  const bdr = active ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap: D.sp.xs,
      padding:'0.15rem 0.5rem', borderRadius: D.radius.full,
      background:bg, color:fg, border:`1px solid ${bdr}`,
      fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size, fontWeight:700, flexShrink:0 }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:fg,
        animation: active ? 'led-pulse 2s infinite' : 'none' }} />
      {active ? 'active' : 'inactive'}
    </span>
  )
}

// ── SSH PANEL ─────────────────────────────────────────────────
function SshPanel() {
  const { toast, showToast } = useToast()
  const [mode,       setMode]       = useState('server')
  const [port,       setPort]       = useState('2244')
  const [keyFile,    setKeyFile]    = useState(null)
  const [keyName,    setKeyName]    = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [command,    setCommand]    = useState('')
  const [lines,      setLines]      = useState([])
  const [loading,    setLoading]    = useState(false)
  const termRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [lines])

  const addLine = (type, text) =>
    setLines(p => [...p, { type, text, ts: new Date().toLocaleTimeString('it-IT') }])

  const run = async () => {
    if (!command.trim()) { showToast('Enter a command', 'error'); return }
    const portNum = parseInt(port, 10)
    if (!portNum || portNum < 1 || portNum > 65535) { showToast('Invalid port', 'error'); return }
    setLoading(true)
    addLine('info', `$ ${command}`)
    try {
      let res
      if (mode === 'server') {
        res = await fetch('/api/ssh_exec_host', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ command, port: portNum }),
        })
      } else {
        const keyText = await keyFile.text()
        res = await fetch('/api/ssh_exec', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ ip:'192.168.178.101', port:portNum, username:'orion',
            privateKey:keyText, passphrase: passphrase || undefined, command }),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'SSH error')
      addLine('output', data.output || '(no output)')
    } catch (e) { addLine('error', e.message) }
    finally { setLoading(false) }
  }

  const LINE_COLOR = { info: D.colors.accent, output:'#7a9ac0', error: D.colors.danger }
  const QUICK = ['df -h','free -h','uptime','who','top -bn1 | head -5']

  return (
    <Panel icon={Terminal} title="SSH Terminal" accent={D.colors.accent} fullHeight
      action={
        lines.length > 0
          ? <button onClick={() => setLines([])} className="btn btn--ghost btn--sm"
              style={{ fontSize:D.ty.xs.size, display:'flex', alignItems:'center', gap: D.sp.xs }}>
              <X size={10}/> Clear
            </button>
          : null
      }>
      <div style={{ display:'flex', flexDirection:'column', gap: D.sp.md }}>
        <div style={{ display:'flex', gap: D.sp.sm, alignItems:'center', flexWrap:'wrap' }}>
          {[{id:'server',label:'🔑 Server key'},{id:'upload',label:'📂 Upload key'}].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`btn btn--sm ${mode===m.id?'btn--primary':'btn--ghost'}`}
              style={{ fontSize:D.ty.xs.size }}>{m.label}</button>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap: D.sp.sm }}>
            <span style={{ fontSize:'0.62rem', color:D.colors.text.secondary, fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.06em' }}>Port</span>
            <input className="input input--mono" type="number" min="1" max="65535"
              value={port} onChange={e => setPort(e.target.value)}
              style={{ width:68, textAlign:'center', fontSize:D.ty.xs.size, padding:'0.25rem 0.5rem' }}/>
          </div>
        </div>

        {mode === 'server' && (
          <div style={{ padding:'0.55rem 0.75rem', borderRadius: D.radius.md,
            background: D.colors.bg.surface2, borderLeft:`3px solid ${D.colors.accent}`,
            fontSize:D.ty.xs.size, color:D.colors.text.secondary, fontFamily:D.ty.mono.family }}>
            Using <span style={{ color:D.colors.accent }}>/run/secrets/id_rsa</span>
            {' '}· port <span style={{ color:D.colors.accent }}>{port}</span>
          </div>
        )}

        {mode === 'upload' && (
          <>
            <div style={{ display:'flex', gap: D.sp.sm, alignItems:'center' }}>
              <input ref={fileRef} type="file" style={{ display:'none' }} accept=".pem,.key,*"
                onChange={e => { const f = e.target.files?.[0]; if(f){setKeyFile(f);setKeyName(f.name)} }}/>
              <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}
                style={{ fontSize:D.ty.xs.size }}>Choose file</button>
              <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size,
                color: keyName ? D.colors.text.secondary : 'var(--text-muted)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                {keyName || 'No file selected'}
              </span>
              {keyFile && (
                <button className="btn btn--ghost btn--sm"
                  onClick={() => { setKeyFile(null); setKeyName(''); fileRef.current.value='' }}>
                  <X size={12}/>
                </button>
              )}
            </div>
            <input type="password" className="input input--mono" value={passphrase}
              onChange={e => setPassphrase(e.target.value)} placeholder="Passphrase (optional)"/>
          </>
        )}

        <div style={{ display:'flex', gap: D.sp.sm }}>
          <input className="input input--mono" value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={e => e.key==='Enter' && !loading && run()}
            placeholder="ls -la" style={{ flex:1 }}/>
          <button className="btn btn--primary" onClick={run} disabled={loading} style={{ flexShrink:0 }}>
            {loading ? <RefreshCw size={14} style={{ animation:'spin 0.8s linear infinite' }}/> : <Play size={14}/>}
          </button>
        </div>

        <div style={{ display:'flex', gap: D.sp.xs, flexWrap:'wrap' }}>
          {QUICK.map(cmd => (
            <button key={cmd} onClick={() => setCommand(cmd)}
              className="btn btn--ghost btn--sm"
              style={{ fontSize:'0.65rem', fontFamily:D.ty.mono.family, padding:'2px 7px' }}>{cmd}</button>
          ))}
        </div>

        <div ref={termRef} style={{ background:'#080f24', borderRadius: D.radius.md,
          padding:'0.8rem 1rem', fontFamily:D.ty.mono.family, fontSize:'0.73rem', lineHeight:1.7,
          maxHeight:220, minHeight:72, overflowY:'auto',
          border:'1px solid rgba(37,99,235,0.15)' }}>
          {lines.length === 0
            ? <span style={{ color:'rgba(255,255,255,0.14)' }}>Ready · type a command and press ↵</span>
            : lines.map((l,i) => (
              <div key={i}>
                <span style={{ color:'rgba(255,255,255,0.18)', marginRight: D.sp.sm, userSelect:'none' }}>{l.ts}</span>
                <span style={{ color: LINE_COLOR[l.type]||'#c8e0f8', whiteSpace:'pre-wrap' }}>{l.text}</span>
              </div>
            ))}
        </div>
      </div>
      <Toast toast={toast}/>
    </Panel>
  )
}

// ── POWER PANEL ───────────────────────────────────────────────
function PowerPanel() {
  const { toast, showToast } = useToast()
  const [confirm, setConfirm] = useState(null)
  const [loading, setLoading] = useState(null)

  const execute = async (action) => {
    setLoading(action)
    try {
      const res  = await fetch(`/api/system/${action}`, { method:'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(null); setConfirm(null) }
  }

  return (
    <Panel icon={Power} title="Power" accent={D.colors.danger} fullHeight>
      <div style={{ display:'flex', flexDirection:'column', gap: D.sp.md }}>
        <div style={{ padding:'0.45rem 0.65rem', borderRadius: D.radius.md,
          background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.18)',
          fontSize:D.ty.xs.size, color:'#b45309', fontWeight:500 }}>
          ⚠ Physical actions on the device
        </div>
        {[
          { action:'reboot',   icon:RotateCcw, label:'Reboot',   color:D.colors.secondary },
          { action:'shutdown', icon:Power,     label:'Shutdown',  color:D.colors.danger    },
        ].map(({ action, icon:Icon, label, color }) =>
          confirm === action ? (
            <div key={action} style={{ display:'flex', gap: D.sp.sm, alignItems:'center' }}>
              <span style={{ fontSize:D.ty.xs.size, color:'#b45309', flex:1, fontWeight:500 }}>Confirm {label.toLowerCase()}?</span>
              <button className="btn btn--danger btn--sm" onClick={() => execute(action)} disabled={loading===action}>
                {loading===action ? <RefreshCw size={11} style={{ animation:'spin 0.8s linear infinite' }}/> : 'Yes'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>No</button>
            </div>
          ) : (
            <button key={action} className="btn btn--ghost btn--full"
              style={{ color, borderColor:`${color}30`, background:`${color}07`,
                justifyContent:'flex-start', gap: D.sp.sm, fontSize:D.ty.base.size }}
              onClick={() => setConfirm(action)}>
              <Icon size={13}/> {label}
            </button>
          )
        )}
      </div>
      <Toast toast={toast}/>
    </Panel>
  )
}

// ── SERVICES PANEL ────────────────────────────────────────────
function ServicesPanel() {
  const { toast, showToast } = useToast()
  const [services, setServices] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState(null)

  const load = async () => {
    try {
      const data = await fetch('/api/services').then(r => r.json())
      setServices(Array.isArray(data) ? data : (data.services ?? []))
    } catch { showToast('Error loading services', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const act = async (service, action) => {
    const key = `${service}:${action}`
    setActing(key)
    try {
      const res  = await fetch(`/api/services/${service}/action`, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${service} ${action}ed`, 'success')
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setActing(null) }
  }

  return (
    <Panel icon={Server} title="Services" accent={D.colors.primary}
      badge={services.length || undefined} fullHeight
      action={
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ fontSize:'0.62rem', padding:'2px 6px' }}>
          <RefreshCw size={10}/>
        </button>
      }>
      {loading ? (
        <div className="loading-box"><span className="spinner"/></div>
      ) : services.length === 0 ? (
        <div className="empty-state"><Server size={22}/><div>No services</div></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: D.sp.xs }}>
          {services.map(svc => (
            <div key={svc.service} style={{ display:'flex', alignItems:'center', gap: D.sp.sm,
              padding:'0.45rem 0.6rem', borderRadius: D.radius.md,
              background: D.colors.bg.surface2, border:`1px solid ${D.colors.border}` }}>
              <StatusPill active={svc.isActive}/>
              <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size, flex:1,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{svc.service}</span>
              <div style={{ display:'flex', gap:'0.2rem' }}>
                {['start','stop','restart'].map(action => {
                  const key = `${svc.service}:${action}`
                  return (
                    <button key={action} className="btn btn--ghost btn--sm"
                      style={{ fontSize:'0.58rem', padding:'2px 5px' }}
                      disabled={acting===key} onClick={() => act(svc.service, action)}>
                      {acting===key ? <RefreshCw size={9} style={{ animation:'spin 0.8s linear infinite' }}/> : action}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <Toast toast={toast}/>
    </Panel>
  )
}

// ── PROCESSES PANEL ───────────────────────────────────────────
function ProcessesPanel() {
  const { toast, showToast } = useToast()
  const [procs,   setProcs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [killing, setKilling] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/processes').then(r => r.json())
      setProcs(Array.isArray(data) ? data : [])
    } catch { showToast('Error loading processes', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const kill = async (pid, name) => {
    if (!window.confirm(`Terminare ${name} (PID ${pid})?`)) return
    setKilling(pid)
    try {
      const res  = await fetch(`/api/processes/${pid}/kill`, { method:'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message, 'success')
      await load()
    } catch (e) { showToast(e.message, 'error') }
    finally { setKilling(null) }
  }

  const MiniBar = ({ pct, color }) => (
    <div style={{ width:38, height:4, background:D.colors.bg.surface3, borderRadius:3, overflow:'hidden', flexShrink:0 }}>
      <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', background:color, borderRadius:3, transition:'width 0.4s' }}/>
    </div>
  )

  return (
    <Panel icon={Activity} title="Processes" accent={D.colors.muted} fullHeight
      action={
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ fontSize:'0.62rem', padding:'2px 6px' }}>
          <RefreshCw size={10}/>
        </button>
      }>
      <div className="table-wrap">
        <table>
          <thead><tr><th>PID</th><th>Name</th><th>CPU</th><th>RAM</th><th></th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign:'center', padding: D.sp.lg }}><span className="spinner"/></td></tr>
            ) : procs.slice(0,10).map(p => (
              <tr key={p.pid}>
                <td className="td-mono td-muted" style={{ fontSize:'0.68rem' }}>{p.pid}</td>
                <td style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size,
                  maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap: D.sp.xs }}>
                    <MiniBar pct={p.cpu} color={p.cpu>50 ? D.colors.danger : D.colors.primary}/>
                    <span style={{ fontSize:'0.65rem', fontFamily:D.ty.mono.family,
                      color: p.cpu>50 ? D.colors.danger : D.colors.text.secondary }}>{p.cpu.toFixed(1)}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap: D.sp.xs }}>
                    <MiniBar pct={p.mem} color={D.colors.muted}/>
                    <span style={{ fontSize:'0.65rem', fontFamily:D.ty.mono.family,
                      color:D.colors.text.secondary }}>{p.mem.toFixed(1)}</span>
                  </div>
                </td>
                <td>
                  <button className="btn btn--ghost btn--sm"
                    style={{ fontSize:'0.58rem', padding:'1px 5px', color:D.colors.danger }}
                    disabled={killing===p.pid} onClick={() => kill(p.pid, p.name)}>
                    {killing===p.pid ? <RefreshCw size={9} style={{ animation:'spin 0.8s linear infinite' }}/> : <X size={9}/>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast toast={toast}/>
    </Panel>
  )
}

// ── NETWORK PANEL ─────────────────────────────────────────────
function NetworkPanel() {
  const [ifaces,  setIfaces]  = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/network').then(r => r.json())
      setIfaces(Array.isArray(data) ? data : [])
    } catch {} finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <Panel icon={Wifi} title="Network" accent={D.colors.success}
      badge={ifaces.length || undefined} fullHeight
      action={
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ fontSize:'0.62rem', padding:'2px 6px' }}>
          <RefreshCw size={10}/>
        </button>
      }>
      {loading ? (
        <div className="loading-box"><span className="spinner"/></div>
      ) : ifaces.length === 0 ? (
        <div className="empty-state"><Wifi size={22}/><div>No interfaces</div></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap: D.sp.sm }}>
          {ifaces.map(iface => (
            <div key={iface.interface} style={{ padding:'0.55rem 0.7rem', borderRadius: D.radius.md,
              background: D.colors.bg.surface2, border:`1px solid ${D.colors.border}`,
              borderLeft:`3px solid ${iface.isUp ? D.colors.success : D.colors.border}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom: D.sp.xs }}>
                <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.sm.size, fontWeight:700 }}>{iface.interface}</span>
                <span style={{ fontSize:'0.60rem', fontFamily:D.ty.mono.family, fontWeight:700,
                  color: iface.isUp ? D.colors.success : D.colors.text.secondary }}>
                  {iface.isUp ? '● UP' : '○ DOWN'}
                </span>
              </div>
              <div style={{ display:'flex', gap: D.sp.lg, flexWrap:'wrap' }}>
                {[['IP', iface.ip||'—'],['↑', fmt(iface.bytesSent)],['↓', fmt(iface.bytesRecv)]].map(([k,v]) => (
                  <div key={k}>
                    <span style={{ fontSize:'0.58rem', color:D.colors.text.secondary,
                      textTransform:'uppercase', fontFamily:D.ty.mono.family }}>{k} </span>
                    <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.sm.size }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ── LOGS PANEL ────────────────────────────────────────────────
function LogsPanel() {
  const [tab,     setTab]     = useState('system')
  const [lines,   setLines]   = useState([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  const load = async (t=tab) => {
    setLoading(true)
    try {
      const data = await fetch(
        t==='auth' ? '/api/logs/auth' : '/api/logs/system?lines=60'
      ).then(r => r.json())
      setLines(data.lines || [])
      setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, 50)
    } catch { setLines(['Error loading logs']) }
    finally { setLoading(false) }
  }
  useEffect(() => { load(tab) }, [tab])

  return (
    <Panel icon={FileText} title="System Logs" accent="#5a6a8a" fullHeight
      action={
        <div style={{ display:'flex', gap: D.sp.xs }}>
          {['system','auth'].map(t => (
            <button key={t} className={`btn btn--sm ${tab===t?'btn--primary':'btn--ghost'}`}
              onClick={() => setTab(t)} style={{ fontSize:D.ty.xs.size }}>
              {t==='auth' ? 'Auth' : 'System'}
            </button>
          ))}
          <button className="btn btn--ghost btn--sm" onClick={() => load(tab)}
            style={{ fontSize:'0.62rem', padding:'2px 6px' }}>
            <RefreshCw size={10}/>
          </button>
        </div>
      }>
      <div ref={boxRef} style={{ background:'#080f24', borderRadius: D.radius.md,
        padding:'0.75rem 0.9rem', fontFamily:D.ty.mono.family, fontSize:'0.68rem', lineHeight:1.65,
        height:'calc(100% - 2rem)', minHeight:120, overflowY:'auto',
        border:'1px solid rgba(37,99,235,0.12)', color:'#7a9ac0' }}>
        {loading
          ? <span style={{ color:D.colors.text.secondary }}>Loading…</span>
          : lines.map((l,i) => <div key={i}>{l}</div>)}
      </div>
    </Panel>
  )
}

// ── UPGRADE PANEL ─────────────────────────────────────────────
function UpgradePanel() {
  const { toast, showToast } = useToast()
  const [state,   setState]   = useState(null)
  const [polling, setPolling] = useState(false)
  const boxRef = useRef(null)

  const startUpgrade = async () => {
    try {
      const res  = await fetch('/api/system/upgrade/start', { method:'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPolling(true)
    } catch (e) { showToast(e.message, 'error') }
  }

  useEffect(() => {
    if (!polling) return
    const id = setInterval(async () => {
      try {
        const data = await fetch('/api/system/upgrade/status').then(r => r.json())
        setState(data)
        setTimeout(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight }, 50)
        if (data.done) {
          setPolling(false)
          showToast(data.error ? 'Update failed' : 'Completed', data.error ? 'error' : 'success')
        }
      } catch { setPolling(false) }
    }, 1500)
    return () => clearInterval(id)
  }, [polling])

  return (
    <Panel icon={Package} title="Updates" accent={D.colors.secondary} fullHeight>
      <div style={{ display:'flex', flexDirection:'column', gap: D.sp.md }}>
        <div style={{ padding:'0.45rem 0.65rem', borderRadius: D.radius.md,
          background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.18)',
          fontSize:D.ty.xs.size, color:'#b45309', fontFamily:D.ty.mono.family }}>
          <code style={{ background:D.colors.bg.surface2, padding:'1px 5px', borderRadius:4 }}>apt update && upgrade -y</code>
        </div>
        <button className="btn btn--warning btn--full" onClick={startUpgrade} disabled={polling}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap: D.sp.md }}>
          {polling
            ? <><RefreshCw size={13} style={{ animation:'spin 0.8s linear infinite' }}/> In progress…</>
            : <><Package size={13}/> Start upgrade</>}
        </button>
        {state && (
          <div ref={boxRef} style={{ background:'#080f24', borderRadius: D.radius.md,
            padding:'0.75rem 0.9rem', fontFamily:D.ty.mono.family, fontSize:'0.68rem', lineHeight:1.65,
            maxHeight:200, overflowY:'auto', border:'1px solid rgba(37,99,235,0.12)', color:'#7a9ac0' }}>
            {state.output.map((l,i) => <div key={i}>{l}</div>)}
            {state.done && !state.error && <div style={{ color:D.colors.success, marginTop: D.sp.sm }}>✓ Completed.</div>}
            {state.error && <div style={{ color:D.colors.danger, marginTop: D.sp.sm }}>✗ {state.error}</div>}
          </div>
        )}
      </div>
      <Toast toast={toast}/>
    </Panel>
  )
}

// ── FLOORPLAN PANEL ───────────────────────────────────────────
function FloorplanPanel() {
  const { toast, showToast } = useToast()
  const svgRef  = useRef(null)
  const fileRef = useRef(null)
  const dragOffset = useRef({ x:0, y:0 })

  const [sensors,    setSensors]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [editMode,   setEditMode]   = useState(false)
  const [addMode,    setAddMode]    = useState(false)
  const [dragging,   setDragging]   = useState(null)
  const [pendingPos, setPendingPos] = useState(null)
  const [form,       setForm]       = useState({ name:'', type:'temp_hum', room_id:'', topic:'' })
  const [bgImage,    setBgImage]    = useState(() => localStorage.getItem('raspi-floorplan-image') || '')
  const [mapZoom,    setMapZoom]    = useState(1)

  const selectedSensor = sensors.find(s => s.id === selectedId) || null

  const loadSensors = async () => {
    try {
      const data = await fetch('/api/sensors').then(r => r.json())
      setSensors(Array.isArray(data) ? data : [])
    } catch { showToast('Error loading sensors', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadSensors() }, [])

  const uploadFloorplan = file => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) return
      setBgImage(dataUrl)
      localStorage.setItem('raspi-floorplan-image', dataUrl)
      showToast('Floorplan uploaded', 'success')
    }
    reader.onerror = () => showToast('Error reading image', 'error')
    reader.readAsDataURL(file)
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const getSvgCoords = e => {
    const svg = svgRef.current; if (!svg) return { x:0, y:0 }
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
    const { x, y } = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: parseFloat(clamp(x,1.2,98.8).toFixed(2)), y: parseFloat(clamp(y,1.2,98.8).toFixed(2)) }
  }

  const onSvgClick = e => {
    if (!addMode) { setSelectedId(null); return }
    const pos = getSvgCoords(e)
    setPendingPos(pos)
    setForm({ name:'', type:'temp_hum', room_id:'', topic:'' })
    setAddMode(false)
  }

  const onPinMouseDown = (e, sensor) => {
    if (!editMode) return
    e.preventDefault()
    const { x, y } = getSvgCoords(e)
    dragOffset.current = { x: x - sensor.x, y: y - sensor.y }
    setDragging(sensor.id)
  }

  const handleMove = useCallback(e => {
    if (!dragging) return
    const { x, y } = getSvgCoords(e)
    setSensors(prev => prev.map(s =>
      s.id === dragging
        ? { ...s, x: clamp(parseFloat((x - dragOffset.current.x).toFixed(2)), 1.2, 98.8),
                  y: clamp(parseFloat((y - dragOffset.current.y).toFixed(2)), 1.2, 98.8) }
        : s
    ))
  }, [dragging])

  const handleUp = useCallback(async () => {
    if (!dragging) return
    const s = sensors.find(i => i.id === dragging)
    setDragging(null)
    if (!s) return
    try {
      await fetch(`/api/sensors/${s.id}/position`, {
        method:'PATCH', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ x:s.x, y:s.y }),
      })
    } catch { showToast('Error saving position', 'error') }
  }, [dragging, sensors])

  useEffect(() => {
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp) }
  }, [handleMove, handleUp])

  const saveNewSensor = async () => {
    if (!pendingPos || !form.name.trim()) { showToast('Sensor name is required', 'error'); return }
    try {
      const res = await fetch('/api/sensors', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ ...form, ...pendingPos, name:form.name.trim() }),
      })
      if (!res.ok) throw new Error()
      showToast('Sensor added', 'success')
      setPendingPos(null)
      await loadSensors()
    } catch { showToast('Error adding sensor', 'error') }
  }

  const deleteSensor = async () => {
    if (!selectedSensor || !window.confirm(`Delete ${selectedSensor.name}?`)) return
    try {
      const res = await fetch(`/api/sensors/${selectedSensor.id}`, { method:'DELETE' })
      if (!res.ok) throw new Error()
      setSelectedId(null)
      showToast('Sensor deleted', 'success')
      await loadSensors()
    } catch { showToast('Error deleting sensor', 'error') }
  }

  const MAP_ZOOM_MIN=0.5, MAP_ZOOM_MAX=3.0, MAP_ZOOM_STEP=0.1
  const SENSOR_PIN_RADIUS=4, SENSOR_PULSE_RADIUS=9

  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="card-header" style={{ flexShrink:0 }}>
        <div style={{ width:30, height:30, borderRadius:'50%', flexShrink:0,
          background:`${D.colors.primary}14`, color:D.colors.primary,
          display:'flex', alignItems:'center', justifyContent:'center',
          border:`1.5px solid ${D.colors.primary}18` }}>
          <MapPin size={14}/>
        </div>
        <span className="card-header-title">Home Map</span>
        <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size,
          color:D.colors.text.secondary, marginLeft: D.sp.xs }}>{sensors.length} sensors</span>
        <div style={{ marginLeft:'auto', display:'flex', gap: D.sp.xs, flexWrap:'wrap' }}>
          <button className={`btn btn--sm ${addMode?'btn--primary':'btn--ghost'}`}
            onClick={() => { setAddMode(v => !v); setEditMode(false); setPendingPos(null) }}
            style={{ fontSize:D.ty.xs.size }}>
            <Plus size={11}/> {addMode ? 'Click…' : 'Add'}
          </button>
          <button className={`btn btn--sm ${editMode?'btn--primary':'btn--ghost'}`}
            onClick={() => { setEditMode(v => !v); setAddMode(false); setPendingPos(null) }}
            style={{ fontSize:D.ty.xs.size }}>
            <Move size={11}/> Move
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
            onChange={e => uploadFloorplan(e.target.files?.[0])}/>
          <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()}
            style={{ fontSize:D.ty.xs.size }} title="Upload floorplan">
            <MapPin size={11}/>
          </button>
          {bgImage && (
            <button className="btn btn--ghost btn--sm"
              style={{ fontSize:D.ty.xs.size, color:D.colors.danger }}
              onClick={() => { setBgImage(''); localStorage.removeItem('raspi-floorplan-image') }}>
              <X size={11}/>
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={loadSensors} style={{ fontSize:D.ty.xs.size }}>
            <RefreshCw size={11}/>
          </button>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap: D.sp.sm, justifyContent:'space-between',
        padding:`0.35rem ${D.sp.lg}`, background:D.colors.bg.surface2,
        borderBottom:`1px solid ${D.colors.border}`, flexShrink:0 }}>
        <div style={{ fontSize:D.ty.xs.size, fontWeight:600,
          color: addMode ? D.colors.accent : editMode ? D.colors.secondary : 'transparent',
          transition:'color 0.15s' }}>
          {addMode ? '📍 Click to add' : editMode ? '✋ Drag to move' : '·'}
        </div>
        <div style={{ display:'flex', gap:'0.2rem', alignItems:'center' }}>
          <button className="btn btn--ghost btn--sm" style={{ padding:'2px 6px' }}
            onClick={() => setMapZoom(p => Math.max(MAP_ZOOM_MIN, p-0.2))}><ZoomOut size={11}/></button>
          <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size, minWidth:'2.2rem', textAlign:'center' }}>
            {Math.round(mapZoom*100)}%
          </span>
          <button className="btn btn--ghost btn--sm" style={{ padding:'2px 6px' }}
            onClick={() => setMapZoom(p => Math.min(MAP_ZOOM_MAX, p+0.2))}><ZoomIn size={11}/></button>
          <button className="btn btn--ghost btn--sm" style={{ fontSize:'0.60rem', padding:'2px 6px' }}
            onClick={() => setMapZoom(1)}>Reset</button>
        </div>
      </div>

      <svg ref={svgRef} viewBox="0 0 100 100"
        style={{ width:'100%', flex:1, display:'block',
          cursor: addMode ? 'crosshair' : 'default', userSelect:'none', background:'#f7f9ff' }}
        onClick={onSvgClick}
        onWheel={e => {
          e.preventDefault()
          setMapZoom(p => Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, p+(e.deltaY>0?-1:1)*MAP_ZOOM_STEP)))
        }}>
        <g transform={`scale(${mapZoom})`} style={{ transformOrigin:'50px 50px', transformBox:'fill-box' }}>
          <rect x={0} y={0} width={100} height={100} fill="#f7f9ff"/>
          {bgImage && <image href={bgImage} x={0} y={0} width={100} height={100} preserveAspectRatio="xMidYMid meet" opacity={0.7}/>}
          {FLOOR_ROOMS.map(room => (
            <g key={room.id}>
              <rect x={room.x} y={room.y} width={room.w} height={room.h}
                fill={bgImage ? 'transparent' : '#ffffff'} stroke="#c0d0ee" strokeWidth={0.5} rx={0.8}/>
              {room.area ? (
                <>
                  <text x={room.x+room.w/2} y={room.y+room.h/2-1.8} textAnchor="middle"
                    fontSize={2.4} fill="#0d1b3e" fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="700">{room.label}</text>
                  <text x={room.x+room.w/2} y={room.y+room.h/2+2.7} textAnchor="middle"
                    fontSize={1.6} fill="#7a8faa" fontFamily="'Plus Jakarta Sans', sans-serif">{room.area}</text>
                </>
              ) : (
                <text x={room.x+room.w/2} y={room.y+room.h/2} textAnchor="middle"
                  dominantBaseline="central" fontSize={1.8} fill="#9ab0cc"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  transform={`rotate(-90, ${room.x+room.w/2}, ${room.y+room.h/2})`}>Hallway</text>
              )}
            </g>
          ))}
          <rect x={2.5} y={4} width={94.5} height={93} fill="none" stroke="#8096b8" strokeWidth={0.8} rx={1}/>
          {sensors.map(sensor => {
            const meta     = PLAN_META[sensor.type] || PLAN_META.temp_hum
            const selected = selectedId === sensor.id
            return (
              <g key={sensor.id} transform={`translate(${sensor.x}, ${sensor.y})`}
                style={{ cursor: editMode ? 'grab' : 'pointer' }}
                onMouseDown={e => onPinMouseDown(e, sensor)}
                onClick={e => { e.stopPropagation(); if (!editMode) setSelectedId(sensor.id) }}>
                {!editMode && (
                  <circle r={SENSOR_PULSE_RADIUS} fill={meta.color} opacity={0.10}>
                    <animate attributeName="r" values={`${SENSOR_PIN_RADIUS};${SENSOR_PULSE_RADIUS};${SENSOR_PIN_RADIUS}`} dur="2.5s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.15;0.04;0.15" dur="2.5s" repeatCount="indefinite"/>
                  </circle>
                )}
                <circle r={SENSOR_PIN_RADIUS} fill={selected ? meta.color : '#fff'}
                  stroke={meta.color} strokeWidth={selected ? 0 : 1}/>
                <text textAnchor="middle" dominantBaseline="central" fontSize={5.5}>{meta.icon}</text>
              </g>
            )
          })}
        </g>
      </svg>

      {pendingPos && (
        <div style={{ padding:`0.65rem ${D.sp.lg}`, borderTop:`1px solid ${D.colors.border}`,
          background:D.colors.bg.surface2, display:'grid',
          gridTemplateColumns:'1.2fr 1fr 1fr auto', gap: D.sp.md, alignItems:'center', flexShrink:0 }}>
          <input className="input" placeholder="Sensor name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name:e.target.value }))}/>
          <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type:e.target.value }))}>
            {PLAN_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select className="input" value={form.room_id} onChange={e => setForm(f => ({ ...f, room_id:e.target.value }))}>
            <option value="">Room</option>
            {FLOOR_ROOMS.filter(r => r.area).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <div style={{ display:'flex', gap: D.sp.xs }}>
            <button className="btn btn--primary btn--sm" onClick={saveNewSensor}><Save size={12}/></button>
            <button className="btn btn--ghost btn--sm" onClick={() => setPendingPos(null)}><X size={12}/></button>
          </div>
        </div>
      )}

      {selectedSensor && (
        <div style={{ padding:`0.65rem ${D.sp.lg}`, borderTop:`1px solid ${D.colors.border}`,
          background:D.colors.bg.surface, display:'flex', alignItems:'center', gap: D.sp.md, flexShrink:0 }}>
          <span style={{ fontSize:'1rem' }}>{(PLAN_META[selectedSensor.type]||PLAN_META.temp_hum).icon}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:D.ty.base.size, fontWeight:700 }}>{selectedSensor.name}</div>
            <div style={{ fontSize:D.ty.xs.size, color:D.colors.text.secondary, fontFamily:D.ty.mono.family }}>
              {selectedSensor.room_name||'—'}
              {selectedSensor.temperature != null ? ` · ${selectedSensor.temperature.toFixed(1)}°C` : ''}
              {selectedSensor.humidity    != null ? ` · ${selectedSensor.humidity.toFixed(0)}%`     : ''}
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => setSelectedId(null)}><X size={12}/></button>
          <button className="btn btn--ghost btn--sm" onClick={deleteSensor}
            style={{ color:D.colors.danger, borderColor:'rgba(239,68,68,0.25)' }}><Trash2 size={12}/></button>
        </div>
      )}
      <Toast toast={toast}/>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GAUGES ROW  (internal 4-col sub-grid — fills widget height)
// ─────────────────────────────────────────────────────────────────────────────
function GaugesWidget({ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, diskUsed, memUsed, loading }) {
  const GAUGES = [
    { value:cpu,     max:100, color:D.colors.primary,   label:'CPU',         unit:'%',  sublabel: cpuHigh  ? '⚠ High' : 'Normal', alertColor: cpuHigh  ? D.colors.danger : undefined },
    { value:temp,    max:85,  color:D.colors.secondary, label:'Temperature', unit:'°C', sublabel: tempHigh ? '⚠ Risk' : 'OK',     alertColor: tempHigh ? D.colors.danger : undefined },
    { value:diskPct != null ? parseFloat(diskPct.toFixed(1)) : null,
      max:100, color:D.colors.success, label:'Disk',   unit:'%', sublabel: diskUsed != null ? `${diskUsed.toFixed(1)} GB` : null },
    { value:memPct  != null ? parseFloat(memPct.toFixed(1))  : null,
      max:100, color:D.colors.muted,   label:'Memory', unit:'%', sublabel: memUsed  != null ? `${memUsed.toFixed(1)} GB`  : null },
  ]

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', height:'100%' }}>
      {GAUGES.map((g,i) => (
        <div key={i} className="card rp-gauge-card"
          style={{ borderColor: g.alertColor ? 'rgba(239,68,68,0.28)' : undefined,
            boxShadow: g.alertColor ? '0 0 0 3px rgba(239,68,68,0.07),var(--shadow-sm)' : undefined }}>
          <div style={{ padding:'1.1rem 1rem', display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', height:'100%' }}>
            {loading
              ? <div className="loading-box"><span className="spinner"/></div>
              : <GaugeRing {...g} size={108}/>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE INFO WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function DeviceInfoWidget({ stats, diskTotal, memTotal }) {
  const rows = [
    ['IP',     '192.168.178.101'],
    ['Host',   'raspberrypi'],
    ['SSH',    '2244'],
    ['Disk',   diskTotal ? `${(diskTotal/1024).toFixed(0)} GB` : '—'],
    ['RAM',    memTotal  ? `${(memTotal/1024).toFixed(1)} GB`  : '—'],
    ['Load',   stats?.loadAvg ? `${stats.loadAvg['1m']} / ${stats.loadAvg['5m']} / ${stats.loadAvg['15m']}` : '—'],
    ['Uptime', stats?.uptime || '—'],
  ]
  return (
    <div className="card" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:`${D.sp.md} ${D.sp.lg}`, borderBottom:`1px solid ${D.colors.border}`,
        fontSize:D.ty.xs.size, fontWeight:700, color:D.colors.text.muted,
        textTransform:'uppercase', letterSpacing:'0.9px', fontFamily:D.ty.mono.family }}>Device Info</div>
      <div style={{ padding: D.sp.lg, flex:1, overflow:'auto' }}>
        {rows.map(([k,v]) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline',
            padding:'0.22rem 0', borderBottom:`1px solid ${D.colors.border}` }}>
            <span style={{ fontSize:D.ty.xs.size, color:D.colors.text.muted,
              fontFamily:D.ty.mono.family, textTransform:'uppercase', letterSpacing:'0.5px' }}>{k}</span>
            <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.sm.size,
              color:D.colors.text.primary, fontWeight:700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCES WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function ResourcesWidget({ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, loading }) {
  return (
    <div className="card" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:`${D.sp.md} ${D.sp.lg}`, borderBottom:`1px solid ${D.colors.border}`,
        display:'flex', alignItems:'center', gap: D.sp.sm, flexShrink:0 }}>
        <Cpu size={13} style={{ color:D.colors.accent }}/>
        <span style={{ fontSize:D.ty.sm.size, fontWeight:600 }}>Live resources</span>
        <span style={{ marginLeft:'auto', fontSize:D.ty.xs.size, fontFamily:D.ty.mono.family,
          color:D.colors.success, fontWeight:700, display:'flex', alignItems:'center', gap:'0.25rem' }}>
          <span style={{ width:4, height:4, borderRadius:'50%', background:D.colors.success,
            animation:'led-pulse 2s infinite' }}/>live
        </span>
      </div>
      <div style={{ padding: D.sp.lg, flex:1, overflow:'auto' }}>
        {loading ? <div className="loading-box"><span className="spinner"/></div> : (
          <>
            <ProgressRow label="CPU"         value={cpu}     max={100} color={D.colors.primary}   unit="%" warn={cpuHigh}/>
            <ProgressRow label="Temperature" value={temp}    max={85}  color={D.colors.secondary} unit="°C" warn={tempHigh}/>
            <ProgressRow label="Disk"        value={diskPct} max={100} color={D.colors.success}   unit="%" warn={diskPct!=null&&diskPct>85}/>
            <ProgressRow label="Memory"      value={memPct}  max={100} color={D.colors.muted}     unit="%" warn={memPct!=null&&memPct>90}/>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHART WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function ChartWidget({ history }) {
  return (
    <div className="card" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <div className="card-header" style={{ flexShrink:0 }}>
        <div style={{ width:30, height:30, borderRadius:'50%',
          background:'rgba(245,158,11,0.10)', color:D.colors.secondary,
          display:'flex', alignItems:'center', justifyContent:'center', border:'1.5px solid rgba(245,158,11,0.18)' }}>
          <Activity size={14}/>
        </div>
        <span className="card-header-title">Live Trends</span>
        <div style={{ display:'flex', gap: D.sp.lg, marginLeft: D.sp.md }}>
          {[{label:'CPU %',color:D.colors.primary},{label:'Temp °C',color:D.colors.secondary}].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap: D.sp.xs }}>
              <div style={{ width:14, height:3, borderRadius:2, background:l.color }}/>
              <span style={{ fontSize:D.ty.xs.size, color:D.colors.text.secondary, fontFamily:D.ty.mono.family }}>{l.label}</span>
            </div>
          ))}
        </div>
        <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap: D.sp.xs,
          fontFamily:D.ty.mono.family, fontSize:'0.62rem', color:D.colors.success, fontWeight:700 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:D.colors.success, animation:'led-pulse 2s infinite' }}/>5s
        </span>
      </div>
      <div style={{ flex:1, padding:'0.5rem 0.25rem 0.75rem 0', minHeight:0 }}>
        {history.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ left:-16, right:8 }}>
              <defs>
                <linearGradient id="gcpu2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={D.colors.primary} stopOpacity={0.18}/>
                  <stop offset="95%" stopColor={D.colors.primary} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gtemp2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={D.colors.secondary} stopOpacity={0.14}/>
                  <stop offset="95%" stopColor={D.colors.secondary} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke={D.colors.border} vertical={false}/>
              <XAxis dataKey="ts" tick={{ fontFamily:D.ty.mono.family, fontSize:8, fill:D.colors.text.muted }}
                axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis tick={{ fontFamily:D.ty.mono.family, fontSize:9, fill:D.colors.text.muted }}
                axisLine={false} tickLine={false} width={30} domain={[0,'auto']}/>
              <Tooltip {...TOOLTIP_STYLE}
                formatter={(v,name) => [`${parseFloat(v).toFixed(1)}${name==='cpu'?'%':'°C'}`, name==='cpu'?'CPU':'Temp']}/>
              <Area type="monotone" dataKey="cpu"  stroke={D.colors.primary}   fill="url(#gcpu2)"  strokeWidth={2.5} dot={false}/>
              <Area type="monotone" dataKey="temp" stroke={D.colors.secondary} fill="url(#gtemp2)" strokeWidth={2.5} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="loading-box"><span className="spinner"/></div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKUP WIDGET
// ─────────────────────────────────────────────────────────────────────────────
function BackupWidget({ onBackup, backing }) {
  return (
    <Panel icon={Shield} title="Backup" accent={D.colors.success} fullHeight>
      <div style={{ display:'flex', flexDirection:'column', gap: D.sp.md }}>
        <div style={{ padding:'0.45rem 0.65rem', borderRadius: D.radius.md,
          background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.18)',
          fontSize:D.ty.xs.size, color:'#b45309', lineHeight:1.5 }}>
          Snapshot of configuration, user data, packages, and settings.
        </div>
        <button className="btn btn--success btn--full" onClick={onBackup} disabled={backing}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap: D.sp.md }}>
          {backing
            ? <><RefreshCw size={13} style={{ animation:'spin 0.8s linear infinite' }}/> In progress…</>
            : <><Shield size={13}/> Start backup</>}
        </button>
      </div>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function RaspiPage() {
  const { toast, showToast } = useToast()
  const [stats,      setStats]      = useState(null)
  const [history,    setHistory]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [backing,    setBacking]    = useState(false)
  const [layout,     setLayout]     = useState(loadLayout)
  const [editMode,   setEditMode]   = useState(false)

  // ── Load stats ──
  const loadStats = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)
    try {
      const d = await fetch('/api_raspberry_pi_stats').then(r => r.json())
      setStats(d)
      setHistory(prev => [...prev.slice(-39), {
        ts:   new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
        cpu:  n(d.cpuUsage)    ?? 0,
        temp: n(d.temperature) ?? 0,
      }])
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => {
    loadStats()
    const id = setInterval(() => loadStats(true), 5000)
    return () => clearInterval(id)
  }, [])

  const backup = async () => {
    setBacking(true)
    try {
      await fetch('/api_run_backup', { method:'POST' })
      showToast('Backup started', 'success')
    } catch { showToast('Backup error', 'error') }
    finally { setBacking(false) }
  }

  // Derived stats
  const cpu       = stats ? n(stats.cpuUsage)    : null
  const temp      = stats ? n(stats.temperature) : null
  const diskUsed  = stats ? n(stats.diskUsed)    : null
  const diskFree  = stats ? n(stats.diskFree)    : null
  const diskTotal = stats ? (n(stats.diskTotal) ?? (diskUsed != null && diskFree != null ? diskUsed + diskFree : null)) : null
  const diskPct   = diskTotal && diskUsed != null ? (diskUsed / diskTotal) * 100 : null
  const memUsed   = stats ? n(stats.memoryUsed)  : null
  const memTotal  = stats ? n(stats.memoryTotal) : null
  const memPct    = memTotal && memUsed != null ? (memUsed / memTotal) * 100 : null
  const cpuHigh   = cpu  != null && cpu  > 80
  const tempHigh  = temp != null && temp > 70

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT)
    saveLayout(DEFAULT_LAYOUT)
  }

  // Map widget id → component
  const renderWidget = (id) => {
    switch (id) {
      case 'gauges':    return <GaugesWidget {...{ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, diskUsed, memUsed, loading }}/>
      case 'chart':     return <ChartWidget history={history}/>
      case 'devinfo':   return <DeviceInfoWidget stats={stats} diskTotal={diskTotal} memTotal={memTotal}/>
      case 'resources': return <ResourcesWidget {...{ cpu, temp, diskPct, memPct, cpuHigh, tempHigh, loading }}/>
      case 'floorplan': return <FloorplanPanel/>
      case 'power':     return <PowerPanel/>
      case 'services':  return <ServicesPanel/>
      case 'processes': return <ProcessesPanel/>
      case 'network':   return <NetworkPanel/>
      case 'ssh':       return <SshPanel/>
      case 'logs':      return <LogsPanel/>
      case 'upgrade':   return <UpgradePanel/>
      case 'backup':    return <BackupWidget onBackup={backup} backing={backing}/>
      default:          return null
    }
  }

  return (
    <div className="page animate-fade rp">

      {/* ── Header ── */}
      <div className="rp-header">
        <div>
          <h1 className="page-title">
            Raspberry <span style={{ color:'var(--accent)', fontWeight:400 }}>Pi</span>
          </h1>
          <p className="page-subtitle">System monitoring · Remote control</p>
        </div>
        <div className="rp-badges">
          {tempHigh && <span className="badge badge--danger"><AlertTriangle size={10}/> High temp</span>}
          {cpuHigh  && <span className="badge badge--warning"><Zap size={10}/> High CPU</span>}
          <span className="rp-online-pill">
            <span className="rp-online-dot"/>Online
          </span>
          {stats?.uptime && (
            <span style={{ fontFamily:D.ty.mono.family, fontSize:D.ty.xs.size, color:D.colors.text.secondary }}>
              ↑ {stats.uptime}
            </span>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => loadStats(true)} disabled={refreshing}
            style={{ display:'flex', alignItems:'center', gap: D.sp.xs }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
            5s
          </button>

          {/* Layout edit toggle */}
          <button
            className={`btn btn--sm ${editMode ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setEditMode(v => !v)}
            style={{ display:'flex', alignItems:'center', gap: D.sp.xs }}
            title="Toggle layout edit mode"
          >
            <Move size={13}/>
            {editMode ? 'Done' : 'Edit layout'}
          </button>
          {editMode && (
            <button className="btn btn--ghost btn--sm" onClick={resetLayout}
              style={{ fontSize:D.ty.xs.size, color:D.colors.danger }}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Edit mode banner ── */}
      {editMode && (
        <div style={{ marginBottom:'1rem', padding:'0.6rem 1rem', borderRadius: D.radius.md,
          background:'rgba(var(--accent-rgb,37,99,235),0.06)',
          border:`1px dashed ${D.colors.accent}`,
          fontSize:D.ty.xs.size, color:D.colors.accent, fontFamily:D.ty.mono.family,
          display:'flex', alignItems:'center', gap: D.sp.sm }}>
          <GripVertical size={13}/>
          <span><strong>Layout edit mode:</strong> drag the top bar of any widget to move it · drag the bottom-right corner to resize · click <strong>Done</strong> when finished</span>
        </div>
      )}

      {/* ── Grid ── */}
      <GridLayout layout={layout} setLayout={setLayout} editMode={editMode}>
        {(laidOut, getHandlers) =>
          laidOut.map(item => (
            <Widget
              key={item.id}
              item={item}
              editMode={editMode}
              onDragStart={getHandlers(item.id, 'drag')}
              onResizeStart={getHandlers(item.id, 'resize')}
            >
              {renderWidget(item.id)}
            </Widget>
          ))
        }
      </GridLayout>

      <Toast toast={toast}/>

      <style>{`
        @keyframes spin      { to { transform: rotate(360deg); } }
        @keyframes led-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .rp-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;
        }
        .rp-badges {
          display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.4rem;
        }
        .rp-online-pill {
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.22rem 0.7rem; border-radius: 99px;
          background: rgba(16,185,129,0.10); border: 1px solid rgba(16,185,129,0.22);
          color: #10b981; font-family: var(--font-mono); font-size: 0.65rem; font-weight: 700;
        }
        .rp-online-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #10b981; animation: led-pulse 2s infinite;
        }
        .rp-gauge-card {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border-radius: 12px; transition: box-shadow 0.2s;
        }
        .rp-gauge-card:hover { box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
        .rp .table-wrap { overflow-x: auto; }
        .rp table { min-width: 320px; }

        @media (max-width: 900px) {
          /* On small screens collapse to single-column stacking */
          .rp [style*="gridColumn"] {
            grid-column: 1 / -1 !important;
            grid-row: auto !important;
          }
        }
      `}</style>
    </div>
  )
}