import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Monitor, Smartphone, ChevronRight, RefreshCw } from 'lucide-react'

interface NetworkDevice {
  ip: string
  mac: string
  hostname: string
  vendor: string
  status: 'up' | 'down'
}

function deviceIcon(device: NetworkDevice) {
  const h = (device.hostname + device.vendor).toLowerCase()

  if (
    h.includes('phone') ||
    h.includes('iphone') ||
    h.includes('android') ||
    h.includes('samsung') ||
    h.includes('pixel') ||
    h.includes('xiaomi') ||
    h.includes('redmi')
  ) {
    return <Smartphone size={11} />
  }

  return <Monitor size={11} />
}

function shortHostname(hostname: string, ip: string): string {
  if (!hostname || hostname === 'unknown' || hostname.trim() === '') {
    return ip
  }

  return hostname
    .replace(/\.(local|lan|home)$/i, '')
    .replace(/-2\.4ghz|-5ghz/gi, '')
    .trim()
}

export default function NetworkDevicesWidget() {
  const [devices, setDevices] = useState<NetworkDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const [scanning, setScanning] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setScanning(true)

    setError(null)

    try {
      const res = await fetch('/api/devices') // ← updated endpoint

      if (!res.ok) throw new Error('Scan failed')

      const data: NetworkDevice[] = await res.json()

      setDevices(data)
      setLastScan(new Date())
    } catch (e: any) {
      setError(e.message || 'Network scan failed')
    } finally {
      setLoading(false)
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    load()

    const id = setInterval(() => load(true), 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [load])

  const onlineDevices = devices.filter(d => d.status === 'up')

  // ── LOADING ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 140,
        height: '100%',
      }}>
        <span className="spinner" />
      </div>
    )
  }

  // ── ERROR ────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        height: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <WifiOff size={16} style={{ color: 'var(--text-muted)' }} />
          <span style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--text-secondary)'
          }}>
            Network Devices
          </span>
        </div>

        <div style={{
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)'
        }}>
          {error}
        </div>

        <button
          className="btn btn--ghost btn--sm"
          onClick={() => load()}
          style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}
        >
          <RefreshCw size={11} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color var(--transition)',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >

      {/* HEADER */}
      <div style={{ padding: '1.1rem 1.1rem 0' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.6rem'
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: 'var(--card-raspi-bg)',
            color: 'var(--card-raspi-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Wifi size={18} />
          </div>

          <button
            onClick={() => load(true)}
            disabled={scanning}
            style={{
              background: 'none',
              border: 'none',
              cursor: scanning ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw
              size={13}
              style={{
                animation: scanning ? 'spin 0.8s linear infinite' : 'none'
              }}
            />
          </button>
        </div>

        <div style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          color: 'var(--text-primary)'
        }}>
          Network Devices
        </div>

        <div style={{
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          marginTop: '0.2rem'
        }}>
          {lastScan
            ? `Scanned ${lastScan.toLocaleTimeString('it-IT')}`
            : 'Local network'}
        </div>
      </div>

      {/* COUNT */}
      <div style={{
        flex: 1,
        padding: '0.9rem 1.1rem 1.25rem',
        display: 'flex',
        alignItems: 'flex-end'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2.2rem',
            fontWeight: 500,
            color: 'var(--color-success)',
          }}>
            {onlineDevices.length}
          </span>

          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            / {devices.length} devices
          </span>
        </div>
      </div>

      {/* TOGGLE */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          background: 'var(--bg-surface-2)',
          border: 'none',
          borderTop: '1px solid var(--border)',
          padding: '0.5rem 1.1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>Device list</span>
        <ChevronRight
          size={12}
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s'
          }}
        />
      </button>

      {/* DEVICE LIST */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface-2)',
          maxHeight: 240,
          overflowY: 'auto'
        }}>
          {onlineDevices.length === 0 ? (
            <div style={{
              padding: '0.75rem 1.1rem',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)'
            }}>
              No devices found
            </div>
          ) : (
            onlineDevices.map((d, i) => (
              <div
                key={d.mac || d.ip}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.45rem 1.1rem',
                  borderBottom: i < onlineDevices.length - 1
                    ? '1px solid var(--border)'
                    : 'none',
                }}
              >
                <span style={{ color: 'var(--color-success)' }}>
                  {deviceIcon(d)}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {shortHostname(d.hostname, d.ip)}
                  </div>

                  {d.vendor && d.vendor !== 'unknown' && (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.6rem',
                      color: 'var(--text-muted)'
                    }}>
                      {d.vendor}
                    </div>
                  )}
                </div>

                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  color: 'var(--text-muted)',
                }}>
                  {d.ip}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg) }
        }
      `}</style>
    </div>
  )
}