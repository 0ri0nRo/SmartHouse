/**
 * src/components/ChartCard.jsx
 * Reusable wrapper for all chart sections.
 * Used by TemperaturePage, HumidityPage, and any future data page.
 */

import { Droplets } from 'lucide-react'

/**
 * @param {string}    title       — card header title
 * @param {Component} icon        — lucide icon component
 * @param {string}    iconSection — section key for color vars (temp|hum|air|etc.)
 * @param {string}    badge       — optional badge text (e.g. "Real-time")
 * @param {ReactNode} controls    — optional controls row rendered below header
 * @param {number}    height      — chart area height in px (default 280)
 * @param {ReactNode} children    — the chart itself
 */
export default function ChartCard({
  title,
  icon: Icon = Droplets,
  iconSection = 'hum',
  badge,
  controls,
  height = 280,
  children,
}) {
  return (
    <div className="card">
      {/* Header */}
      <div className="card-header">
        <div
          className="card-header-icon"
          style={{
            background: `var(--card-${iconSection}-bg)`,
            color:      `var(--card-${iconSection}-accent)`,
          }}
        >
          <Icon size={15} />
        </div>
        <span className="card-header-title">{title}</span>
        {badge && (
          <span className="badge badge--accent" style={{ marginLeft: 'auto' }}>
            {badge}
          </span>
        )}
      </div>

      {/* Optional controls row */}
      {controls && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface-2)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'flex-end',
          }}
        >
          {controls}
        </div>
      )}

      {/* Chart area */}
      <div className="card-body" style={{ height }}>
        {children}
      </div>
    </div>
  )
}