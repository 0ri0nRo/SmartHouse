import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Home, Thermometer, Droplets, Wind, ShoppingCart,
  Receipt, Activity, Shield, Train, Cpu, Menu, X, Moon, Sun
} from 'lucide-react'

const NAV = [
  { section: 'Overview' },
  { to: '/',              label: 'Dashboard',    icon: Home },

  { section: 'Environment' },
  { to: '/temperature',   label: 'Temperature',  icon: Thermometer },
  { to: '/humidity',      label: 'Humidity',     icon: Droplets },
  { to: '/air-quality',   label: 'Air Quality',  icon: Wind },

  { section: 'Home' },
  { to: '/shopping',      label: 'Shopping',     icon: ShoppingCart },
  { to: '/expenses',      label: 'Expenses',     icon: Receipt },
  { to: '/receipts',      label: 'Receipts',     icon: Receipt },
  { to: '/activities',    label: 'Activities',   icon: Activity },

  { section: 'System' },
  { to: '/security',      label: 'Security',     icon: Shield },
  { to: '/train',         label: 'Train',        icon: Train },
  { to: '/raspi',         label: 'Raspberry Pi', icon: Cpu },
]

// Clock component — updates every second
function Clock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="topbar-time">
      {time.toLocaleDateString('it-IT', {
        weekday: 'short', day: '2-digit', month: 'short'
      })}
      {' · '}
      {time.toLocaleTimeString('it-IT')}
    </span>
  )
}

export default function Layout({ theme, onToggleTheme }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Find current page label for topbar
  const currentPage = NAV.find(n => n.to === location.pathname)

  return (
    <div className="layout">

      {/* Mobile overlay — closes sidebar on outside tap */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 99
          }}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <NavLink to="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Home size={16} />
          </div>
          <span className="sidebar-logo-text">
            Smart<span>House</span>
          </span>
        </NavLink>

        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            // Section label
            if (item.section) {
              return (
                <div key={i} className="sidebar-section">
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
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={16} />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          192.168.178.101 · v2.0
        </div>
      </aside>

      {/* Main content */}
      <div className="layout-content">

        {/* Topbar */}
        <header className="topbar">
          <div className="flex gap-sm" style={{ alignItems: 'center' }}>
            {/* Hamburger — visible only on mobile via CSS */}
            <button
              className="btn btn--ghost btn--sm hamburger"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="topbar-title">
              {currentPage?.label || 'SmartHouse'}
            </span>
          </div>

          <div className="topbar-right">
            <Clock />
            {/* iOS-style theme toggle */}
            <button
              className={`theme-toggle ${theme === 'dark' ? 'dark' : ''}`}
              onClick={onToggleTheme}
              aria-label="Toggle theme"
            />
          </div>
        </header>

        {/* Page content rendered here */}
        <Outlet />
      </div>

      {/* Hide hamburger on desktop */}
      <style>{`
        .hamburger { display: none; }
        @media (max-width: 768px) {
          .hamburger { display: inline-flex; }
        }
      `}</style>
    </div>
  )
}