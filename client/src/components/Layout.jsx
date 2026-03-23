import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, Thermometer, Droplets, Wind, ShoppingCart,
  Activity, Shield, Train, Cpu, Menu, X, Moon, Sun,
} from 'lucide-react'

const NAV = [
  { section: 'Overview' },
  { to: '/',            label: 'Dashboard',   icon: Home },

  { section: 'Environment' },
  { to: '/temperature', label: 'Temperature', icon: Thermometer },
  { to: '/humidity',    label: 'Humidity',    icon: Droplets },
  { to: '/air-quality', label: 'Air Quality', icon: Wind },

  { section: 'Home' },
  { to: '/shopping',    label: 'Shopping',    icon: ShoppingCart },
  { to: '/activities',  label: 'Activities',  icon: Activity },

  { section: 'System' },
  { to: '/security',    label: 'Security',    icon: Shield },
  { to: '/train',       label: 'Train',       icon: Train },
  { to: '/raspi',       label: 'Raspberry Pi',icon: Cpu },
]

const SIDEBAR_W = 220
const TOPBAR_H  = 56

function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem',
      color:'var(--text-secondary)', whiteSpace:'nowrap' }}>
      {t.toLocaleDateString('it-IT',{ weekday:'short', day:'2-digit', month:'short' })}
      {' · '}
      {t.toLocaleTimeString('it-IT')}
    </span>
  )
}

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button onClick={onToggle} aria-label="Toggle theme" style={{
      width:44, height:26, borderRadius:13, border:'none', padding:0,
      cursor:'pointer', flexShrink:0, position:'relative',
      background: isDark ? 'var(--accent)' : 'var(--toggle-off)',
      transition:'background 0.3s',
    }}>
      <div style={{
        position:'absolute', top:3, left: isDark ? 21 : 3,
        width:20, height:20, borderRadius:'50%', background:'#fff',
        transition:'left 0.28s cubic-bezier(0.4,0,0.2,1)',
        boxShadow:'0 1px 3px rgba(0,0,0,0.22)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {isDark ? <Moon size={10} style={{color:'#334'}}/> : <Sun size={10} style={{color:'#c97a00'}}/>}
      </div>
    </button>
  )
}

export default function Layout({ theme, onToggleTheme }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const isDark = theme === 'dark'

  useEffect(() => setOpen(false), [location.pathname])

  const currentLabel = NAV.find(n => n.to === location.pathname)?.label || 'SmartHouse'

  return (
    <>
      {/* All layout CSS scoped here — zero global conflicts */}
      <style>{`
        .sh-root {
          display: flex;
          min-height: 100vh;
          width: 100%;
          background: var(--bg-page);
        }

        /* ── Sidebar ── */
        .sh-sidebar {
          position: fixed;
          top: 0; left: 0;
          width: ${SIDEBAR_W}px;
          height: 100vh;
          background: var(--sidebar-bg);
          border-right: 1px solid var(--sidebar-border);
          display: flex;
          flex-direction: column;
          z-index: 200;
          overflow-y: auto;
          overflow-x: hidden;
          transition: transform 0.25s ease, background 0.18s;
        }

        /* ── Main column ── */
        .sh-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          /* pushed right by sidebar on desktop */
          margin-left: ${SIDEBAR_W}px;
          /* prevent flex shrink below content width */
          min-width: 0;
        }

        /* ── Topbar ── */
        .sh-topbar {
          height: ${TOPBAR_H}px;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        /* ── Content area ── */
        .sh-content {
          flex: 1;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
          box-sizing: border-box;
        }

        /* ── Hamburger: hidden on desktop ── */
        .sh-hamburger { display: none !important; }

        /* ── Mobile overlay ── */
        .sh-overlay {
          display: none;
          position: fixed; inset: 0; z-index: 150;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(2px);
        }

        /* ── Mobile breakpoint ── */
        @media (max-width: 768px) {
          .sh-sidebar {
            transform: translateX(-100%);
          }
          .sh-sidebar.is-open {
            transform: translateX(0);
          }
          .sh-main {
            margin-left: 0;
          }
          .sh-topbar {
            padding: 0 1rem;
          }
          .sh-content {
            padding: 1rem;
          }
          .sh-hamburger {
            display: flex !important;
          }
          .sh-overlay.is-open {
            display: block;
          }
        }
      `}</style>

      <div className="sh-root">

        {/* Mobile overlay */}
        <div
          className={`sh-overlay ${open ? 'is-open' : ''}`}
          onClick={() => setOpen(false)}
        />

        {/* Sidebar */}
        <aside className={`sh-sidebar ${open ? 'is-open' : ''}`}>
          {/* Logo */}
          <NavLink to="/" style={{
            display:'flex', alignItems:'center', gap:'0.75rem',
            padding:'1.25rem 1.25rem 1rem',
            borderBottom:'1px solid var(--border)',
            textDecoration:'none',
          }}>
            <div style={{
              width:32, height:32, borderRadius:8,
              background:'var(--accent)', color:'#fff',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            }}>
              <Home size={16}/>
            </div>
            <span style={{ fontWeight:700, fontSize:'0.95rem',
              letterSpacing:'-0.3px', color:'var(--text-primary)' }}>
              Smart<span style={{ color:'var(--accent)' }}>House</span>
            </span>
          </NavLink>

          {/* Nav */}
          <nav style={{ flex:1, paddingTop:'0.5rem' }}>
            {NAV.map((item, i) => {
              if (item.section) return (
                <div key={i} style={{
                  padding:'1rem 1.25rem 0.4rem',
                  fontSize:'0.62rem', fontWeight:600,
                  letterSpacing:'0.8px', textTransform:'uppercase',
                  color:'var(--text-muted)',
                }}>
                  {item.section}
                </div>
              )
              const Icon = item.icon
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/'}
                  style={({ isActive }) => ({
                    display:'flex', alignItems:'center', gap:'0.75rem',
                    padding:'0.58rem 1.25rem',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                    borderLeft:`2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    fontWeight: isActive ? 600 : 500,
                    fontSize:'0.875rem',
                    textDecoration:'none',
                    transition:'all 0.15s',
                  })}>
                  <Icon size={16} style={{ flexShrink:0 }}/>
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div style={{
            padding:'1rem 1.25rem', borderTop:'1px solid var(--border)',
            fontSize:'0.68rem', color:'var(--text-muted)',
            fontFamily:'var(--font-mono)',
          }}>
            192.168.178.101 · v2.0
          </div>
        </aside>

        {/* Main column */}
        <div className="sh-main">

          {/* Topbar */}
          <header className="sh-topbar">
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              {/* Hamburger — mobile only */}
              <button className="sh-hamburger"
                onClick={() => setOpen(o => !o)} aria-label="Menu"
                style={{
                  background:'none', border:'none', cursor:'pointer',
                  color:'var(--text-secondary)', padding:4,
                  display:'flex', alignItems:'center',
                }}>
                {open ? <X size={20}/> : <Menu size={20}/>}
              </button>
              <span style={{ fontSize:'0.9rem', fontWeight:600,
                color:'var(--text-primary)', letterSpacing:'-0.2px' }}>
                {currentLabel}
              </span>
            </div>

            {/* Clock + theme toggle */}
            <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
              <Clock/>
              <ThemeToggle isDark={isDark} onToggle={onToggleTheme}/>
            </div>
          </header>

          {/* Page content */}
          <div className="sh-content">
            <Outlet/>
          </div>
        </div>

      </div>
    </>
  )
}