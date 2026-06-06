import { formatLiveValue, useLiveSensorValue } from '../hooks/useLiveSensorValue'

export default function SensorLiveValueTag({
  liveApi,
  offsetX = 0,
  offsetY = -6,
  compact = false,
  theme = 'dark',
  showUnit = false,
}) {
  const { value, loading, error } = useLiveSensorValue(liveApi)

  if (!liveApi?.endpoint) return null

  const text = error ? 'ERR' : loading && value === null ? '...' : formatLiveValue(value)
  const label = `${text}${showUnit && liveApi.unit ? ` ${liveApi.unit}` : ''}`
  const fontSize = compact ? 1.45 : 1.75
  const paddingX = compact ? 1.35 : 1.6
  const pillHeight = compact ? 4.4 : 5.0
  const pillWidth = Math.max(compact ? 7.0 : 11, label.length * (compact ? 1.42 : 1.9) + paddingX * 2)
  const fill = theme === 'dark'
    ? (error ? '#7f1d1d' : '#0b1731')
    : (error ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)')
  const stroke = theme === 'dark'
    ? (error ? '#fca5a5' : '#3e4f6f')
    : (error ? 'rgba(239,68,68,0.28)' : 'rgba(16,185,129,0.28)')
  const color = theme === 'dark' ? '#ffffff' : (error ? '#dc2626' : 'var(--text-primary)')

  return (
    <g transform={`translate(${offsetX}, ${offsetY})`} pointerEvents="none">
      <rect
        x={-pillWidth / 2}
        y={-pillHeight / 2}
        width={pillWidth}
        height={pillHeight}
        rx={pillHeight / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={0.58}
        style={{ filter: theme === 'dark' ? 'drop-shadow(0 5px 10px rgba(8,26,58,0.34))' : 'none' }}
      />
      <text
        x={0}
        y={0.65}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-mono)"
        fontSize={fontSize}
        fontWeight={700}
        fill={color}
      >
        {label}
      </text>
    </g>
  )
}
