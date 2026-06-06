import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, MapPin, Wind, ShoppingCart,
  Activity, Shield, Train, Cpu, Menu, X, House,
} from 'lucide-react'

const NAV = [
  { section: 'Overview' },
  { to: '/',            label: 'Dashboard',   icon: Home },

  { section: 'Environment' },
  { to: '/floorplan',   label: 'Sensors',     icon: MapPin },
  { to: '/air-quality', label: 'Air Quality', icon: Wind },

  { section: 'Home' },
  { to: '/shopping',    label: 'Shopping',    icon: ShoppingCart },
  { to: '/calendar',    label: 'Calendar',    icon: Activity },

  { section: 'System' },
  { to: '/security',    label: 'Security',    icon: Shield },
  { to: '/train',       label: 'Train',       icon: Train },
  { to: '/raspi',       label: 'Raspberry Pi',icon: Cpu },
]

function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="topbar-time">
      {t.toLocaleDateString('it-IT',{ weekday:'short', day:'2-digit', month:'short' })}
      {' · '}
      {t.toLocaleTimeString('it-IT')}
    </span>
  )
}

function ThemeToggle({ isDark, onToggle }) {
  return (
    <button onClick={onToggle} className="theme-toggle" aria-label="Toggle theme">
      <span className="theme-toggle__icon" aria-hidden="true" />
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb" />
      </span>
      <span className="theme-toggle__label">{isDark ? 'Dark' : 'Light'}</span>
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
    <div className="layout-shell">
      <div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <House size={16} />
          </div>
          <span className="sidebar-logo-text">
            Smart<span>House</span>
          </span>
        </NavLink>

        <nav className="sidebar-nav">
          {NAV.map((item, index) => {
            if (item.section) {
              return (
                <div key={`${item.section}-${index}`} className="sidebar-section">
                  {item.section}
                </div>
              )
            }

            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div>192.168.178.101</div>
          <div>v2.0</div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-menu-btn"
              onClick={() => setOpen((value) => !value)}
              aria-label="Open menu"
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>

            <div className="topbar-heading">
              <div className="topbar-title">{currentLabel}</div>
              <div className="topbar-subtitle">SmartHouse control center</div>
            </div>
          </div>

          <div className="topbar-right">
            <Clock />
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          </div>
        </header>

        <main className="page page-full">
          <Outlet />
        </main>
      </div>
    </div>
  )
}