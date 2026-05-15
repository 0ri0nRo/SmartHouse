import { lazy, Suspense, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  SquarePen,
} from 'lucide-react'
import { api } from '../api'
import SensorLiveValueTag from '../components/SensorLiveValueTag'
import { resolveSensorKind } from '../features/sensors/sensorRegistry'
import { useSensorCatalog, useSensorCatalogSync, useSensorHistory } from '../features/sensors/useSensors'

const SensorHistoryChart = lazy(() => import('../features/sensors/SensorHistoryChart.jsx'))

const ROOM_LAYOUT = [
  { id: 'cucina', label: 'Kitchen', x: 6, y: 12, w: 28, h: 26 },
  { id: 'sala', label: 'Living room', x: 37, y: 12, w: 26, h: 26 },
  { id: 'corridoio', label: 'Hallway', x: 6, y: 42, w: 57, h: 16 },
  { id: 'camera1', label: 'Bedroom', x: 6, y: 62, w: 26, h: 24 },
  { id: 'bagno', label: 'Bathroom', x: 35, y: 62, w: 22, h: 24 },
  { id: 'ufficio', label: 'Office', x: 60, y: 42, w: 32, h: 44 },
]

function toRelativePosition(sensor) {
  return {
    left: `${Math.max(2, Math.min(96, Number(sensor.x ?? 50)))}%`,
    top: `${Math.max(2, Math.min(96, Number(sensor.y ?? 50)))}%`,
  }
}

function formatValue(sensor) {
  const values = []
  if (sensor.temperature != null) values.push(`${Number(sensor.temperature).toFixed(1)} °C`)
  if (sensor.humidity != null) values.push(`${Number(sensor.humidity).toFixed(0)} %`)
  if (sensor.battery != null) values.push(`${Number(sensor.battery).toFixed(0)} % battery`)
  if (sensor.signal_quality != null) values.push(`${Number(sensor.signal_quality).toFixed(0)} lqi`)
  return values.join(' · ')
}

function isOnline(sensor) {
  if (sensor.online != null) return Boolean(sensor.online)
  if (!sensor.last_seen) return false
  return Date.now() - new Date(sensor.last_seen).getTime() < 5 * 60 * 1000
}

function SensorTile({ sensor, selected, onSelect }) {
  const kind = resolveSensorKind(sensor.type)
  const Icon = kind.icon
  const online = isOnline(sensor)

  return (
    <button
      type="button"
      className={`floorplan-marker ${selected ? 'is-selected' : ''} ${online ? 'is-online' : 'is-offline'}`}
      style={{ ...toRelativePosition(sensor), borderColor: kind.color }}
      onClick={() => onSelect(sensor.id)}
      title={sensor.name}
    >
      <span className="floorplan-marker__icon" style={{ background: kind.color }}>
        <Icon size={16} />
      </span>
      <span className="floorplan-marker__meta">
        <strong>{sensor.name}</strong>
        <span>{online ? 'Online' : 'Offline'}</span>
      </span>
    </button>
  )
}

function FloorplanStats({ summary }) {
  const cards = [
    { label: 'Total', value: summary?.total ?? 0 },
    { label: 'Online', value: summary?.online ?? 0 },
    { label: 'Alerts', value: summary?.alerts ?? 0 },
    { label: 'Avg temp', value: summary?.avg_temp != null ? `${summary.avg_temp} °C` : '—' },
    { label: 'Avg hum', value: summary?.avg_hum != null ? `${summary.avg_hum} %` : '—' },
  ]

  return (
    <div className="floorplan-stats">
      {cards.map((card) => (
        <article key={card.label} className="floorplan-stat-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  )
}

function FilterBar({ filters, roomOptions, typeOptions, onChange, onRefresh }) {
  return (
    <div className="floorplan-filters">
      <label>
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder="Search sensors, rooms, topics"
        />
      </label>
      <label>
        <Filter size={16} />
        <select value={filters.room} onChange={(event) => onChange({ room: event.target.value })}>
          <option value="all">All rooms</option>
          {roomOptions.map((room) => (
            <option key={room} value={room}>
              {room}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Settings2 size={16} />
        <select value={filters.type} onChange={(event) => onChange({ type: event.target.value })}>
          <option value="all">All types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        <SlidersHorizontal size={16} />
        <select value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
          <option value="all">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
      </label>
      <button type="button" className="floorplan-filters__refresh" onClick={onRefresh}>
        <RefreshCw size={16} />
        Refresh
      </button>
    </div>
  )
}

function SensorDetails({ sensor, historyHours, onMove, onSetHistoryHours, onRefreshHistory }) {
  if (!sensor) {
    return (
      <section className="floorplan-sidebar__empty">
        <MapPin size={18} />
        <h3>Select a sensor</h3>
        <p>Choose a device from the map or the list to inspect its live values and history.</p>
      </section>
    )
  }

  const kind = resolveSensorKind(sensor.type)
  const online = isOnline(sensor)
  const liveSummary = formatValue(sensor)
  const liveApi = sensor.live_api

  return (
    <section className="floorplan-sidebar__card">
      <div className="floorplan-sidebar__card-header">
        <div>
          <p>{kind.label}</p>
          <h3>{sensor.name}</h3>
        </div>
        <span className={online ? 'status-pill status-pill--online' : 'status-pill status-pill--offline'}>
          {online ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <p className="floorplan-sidebar__description">{sensor.room_name || sensor.room_id || 'Unassigned room'}</p>
      <div className="floorplan-sidebar__metrics">
        <div>
          <span>Topic</span>
          <strong>{sensor.topic || '—'}</strong>
        </div>
        <div>
          <span>Live values</span>
          <strong>{liveSummary || '—'}</strong>
        </div>
        <div>
          <span>Last seen</span>
          <strong>{sensor.last_seen ? new Date(sensor.last_seen).toLocaleString() : '—'}</strong>
        </div>
        {liveApi?.endpoint ? (
          <div>
            <span>Live API</span>
            <SensorLiveValueTag liveApi={liveApi} compact showUnit />
          </div>
        ) : null}
      </div>
      <div className="floorplan-sidebar__actions">
        <button type="button" onClick={() => onRefreshHistory(sensor.id)}>
          <RefreshCw size={16} />
          Refresh history
        </button>
        <button type="button" onClick={() => onSetHistoryHours(historyHours === 6 ? 24 : 6)}>
          <ArrowRight size={16} />
          {historyHours === 6 ? '24h history' : '6h history'}
        </button>
      </div>
      <div className="floorplan-sidebar__position">
        <div>
          <span>Position</span>
          <strong>
            {Math.round(Number(sensor.x ?? 0))}% / {Math.round(Number(sensor.y ?? 0))}%
          </strong>
        </div>
        <button
          type="button"
          onClick={() => onMove(sensor.id, Math.max(0, Math.min(100, Number(sensor.x ?? 0) + 4)), Math.max(0, Math.min(100, Number(sensor.y ?? 0) + 4)))}
        >
          <SquarePen size={16} />
          Move slightly
        </button>
      </div>
    </section>
  )
}

export default function FloorplanPage() {
  const navigate = useNavigate()
  useSensorCatalogSync()
  const { selectedSensor, selectedSensorId, setSelectedSensorId, historyHours, setHistoryHours, filters, setFilters, filteredSensors, filterOptions, summary, isLoading, error } = useSensorCatalog()
  const { history, refresh: refreshHistory } = useSensorHistory(selectedSensor?.id ?? null, historyHours)

  useEffect(() => {
    if (!selectedSensorId && filteredSensors.length > 0) {
      setSelectedSensorId(filteredSensors[0].id)
    }
  }, [filteredSensors, selectedSensorId, setSelectedSensorId])

  const activeSensor = selectedSensor || filteredSensors[0] || null

  const handleMoveSensor = async (sensorId, x, y) => {
    try {
      await api.updateSensorPosition(sensorId, { x, y })
      await refreshHistory()
    } catch (moveError) {
      console.error(moveError)
    }
  }

  return (
    <div className="floorplan-page animate-fade">
      <header className="floorplan-header">
        <div>
          <p className="floorplan-header__eyebrow">Unified sensor hub</p>
          <h1>Floorplan</h1>
          <p>All Zigbee and generic sensors are managed from a single room map with live values, history, and status.</p>
        </div>
        <div className="floorplan-header__actions">
          <button type="button" onClick={() => navigate('/sensors')}>
            <MapPin size={16} />
            Sensor registry
          </button>
          <button type="button" onClick={() => refreshHistory()}>
            <RefreshCw size={16} />
            Refresh selected
          </button>
        </div>
      </header>

      <FloorplanStats summary={summary} />

      <FilterBar
        filters={filters}
        roomOptions={filterOptions.roomOptions}
        typeOptions={filterOptions.typeOptions}
        onChange={(partial) => setFilters(partial)}
        onRefresh={() => refreshHistory()}
      />

      {error ? <div className="floorplan-banner floorplan-banner--error">{error}</div> : null}
      {isLoading ? <div className="floorplan-banner">Loading sensors…</div> : null}

      <div className="floorplan-grid">
        <section className="floorplan-map">
          <div className="floorplan-map__grid">
            {ROOM_LAYOUT.map((room) => (
              <article
                key={room.id}
                className="floorplan-room"
                style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }}
              >
                <strong>{room.label}</strong>
              </article>
            ))}

            {filteredSensors.map((sensor) => (
              <SensorTile
                key={sensor.id}
                sensor={sensor}
                selected={sensor.id === activeSensor?.id}
                onSelect={setSelectedSensorId}
              />
            ))}
          </div>
        </section>

        <aside className="floorplan-sidebar">
          <SensorDetails
            sensor={activeSensor}
            historyHours={historyHours}
            onMove={handleMoveSensor}
            onSetHistoryHours={setHistoryHours}
            onRefreshHistory={refreshHistory}
          />

          <div className="floorplan-list">
            <div className="floorplan-list__header">
              <h3>Visible sensors</h3>
              <span>{filteredSensors.length}</span>
            </div>
            {filteredSensors.map((sensor) => {
              const kind = resolveSensorKind(sensor.type)
              const online = isOnline(sensor)
              return (
                <button
                  type="button"
                  key={sensor.id}
                  className={`floorplan-list__item ${sensor.id === activeSensor?.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedSensorId(sensor.id)}
                >
                  <span className="floorplan-list__item-dot" style={{ background: kind.color }} />
                  <span className="floorplan-list__item-content">
                    <strong>{sensor.name}</strong>
                    <span>
                      {sensor.room_name || sensor.room_id || 'No room'} · {online ? 'online' : 'offline'}
                    </span>
                  </span>
                  <span className="floorplan-list__item-value">{formatValue(sensor) || '—'}</span>
                </button>
              )
            })}
            {!filteredSensors.length ? <p className="floorplan-list__empty">No sensors match the current filters.</p> : null}
          </div>
        </aside>
      </div>

      <Suspense fallback={<div className="sensor-history-panel sensor-history-panel--loading">Loading history…</div>}>
        {selectedSensor ? <SensorHistoryChart sensor={selectedSensor} history={history} hours={historyHours} /> : null}
      </Suspense>
    </div>
  )
}
