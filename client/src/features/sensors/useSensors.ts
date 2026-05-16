import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { resolveSensorKind } from './sensorRegistry'
import { useSensorStore } from './sensorStore'

const CATALOG_REFRESH_MS = 15000
const HISTORY_REFRESH_MS = 20000

function normalizeNumber(value: unknown) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function flattenHistoryRow(row: Record<string, any>) {
  const flattened: Record<string, any> = { ...row }
  if (row?.extra && typeof row.extra === 'object') {
    Object.entries(row.extra).forEach(([key, value]) => {
      if (flattened[key] == null) {
        const numeric = normalizeNumber(value)
        flattened[key] = numeric ?? value
      }
    })
  }
  flattened.timestamp = row.recorded_at || row.timestamp || row.created_at || null
  return flattened
}

export function useSensorCatalogSync() {
  const setSensors = useSensorStore((state) => state.setSensors)
  const setSummary = useSensorStore((state) => state.setSummary)
  const setLoading = useSensorStore((state) => state.setLoading)
  const setError = useSensorStore((state) => state.setError)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let mounted = true
    let intervalId: number | undefined

    const refresh = async () => {
      setLoading(true)
      setError(null)
      try {
        const [sensors, summary] = await Promise.all([
          api.getSensorCatalog(),
          api.getSensorsSummary().catch(() => null),
        ])

        if (!mounted) return
        setSensors(Array.isArray(sensors) ? sensors : [])
        setSummary(summary)
      } catch (error) {
        if (!mounted) return
        setError(error instanceof Error ? error.message : 'Failed to load sensors')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    refresh()
    intervalId = window.setInterval(refresh, CATALOG_REFRESH_MS)
    return () => {
      mounted = false
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [refreshToken, setError, setLoading, setSensors, setSummary])

  return { refresh: () => setRefreshToken((value) => value + 1) }
}

export function useSensorHistory(sensorId: number | null, hours: number) {
  const setHistoryLoading = useSensorStore((state) => state.setHistoryLoading)
  const setHistoryError = useSensorStore((state) => state.setHistoryError)
  const [history, setHistory] = useState<any[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!sensorId) {
      setHistory([])
      setHistoryError(null)
      setHistoryLoading(false)
      return undefined
    }

    let mounted = true
    let intervalId: number | undefined

    const refresh = async () => {
      setHistoryLoading(true)
      setHistoryError(null)
      try {
        const rows = await api.getSensorHistory(sensorId, hours, 500)
        if (!mounted) return
        setHistory(Array.isArray(rows) ? rows.map(flattenHistoryRow) : [])
      } catch (error) {
        if (!mounted) return
        setHistoryError(error instanceof Error ? error.message : 'Failed to load history')
      } finally {
        if (mounted) setHistoryLoading(false)
      }
    }

    refresh()
    intervalId = window.setInterval(refresh, HISTORY_REFRESH_MS)
    return () => {
      mounted = false
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [sensorId, hours, refreshKey, setHistoryError, setHistoryLoading])

  return {
    history,
    refresh: () => setRefreshKey((value) => value + 1),
  }
}

export function useSensorCatalog() {
  const sensors = useSensorStore((state) => state.sensors)
  const summary = useSensorStore((state) => state.summary)
  const selectedSensorId = useSensorStore((state) => state.selectedSensorId)
  const historyHours = useSensorStore((state) => state.historyHours)
  const filters = useSensorStore((state) => state.filters)
  const isLoading = useSensorStore((state) => state.isLoading)
  const error = useSensorStore((state) => state.error)
  const setSelectedSensorId = useSensorStore((state) => state.setSelectedSensorId)
  const setHistoryHours = useSensorStore((state) => state.setHistoryHours)
  const setFilters = useSensorStore((state) => state.setFilters)

  const selectedSensor = useMemo(
    () => sensors.find((sensor) => sensor.id === selectedSensorId) ?? sensors[0] ?? null,
    [selectedSensorId, sensors],
  )

  const filterOptions = useMemo(() => {
    const roomOptions = Array.from(new Set(sensors.map((sensor) => sensor.room_name || sensor.room_id || '').filter(Boolean))).sort()
    const typeOptions = Array.from(new Set(sensors.map((sensor) => sensor.type || '').filter(Boolean))).sort()
    return { roomOptions, typeOptions }
  }, [sensors])

  const filteredSensors = useMemo(() => {
    const search = filters.query.trim().toLowerCase()
    return sensors.filter((sensor) => {
      const kind = resolveSensorKind(sensor.type)
      const roomLabel = String(sensor.room_name || sensor.room_id || '').toLowerCase()
      const name = String(sensor.name || '').toLowerCase()
      const topic = String(sensor.topic || '').toLowerCase()
      const deviceName = String(sensor.device_name || '').toLowerCase()
      const matchesSearch = !search || [name, topic, deviceName, roomLabel, kind.label.toLowerCase()].some((value) => value.includes(search))
      const matchesRoom = filters.room === 'all' || roomLabel === filters.room.toLowerCase()
      const matchesType = filters.type === 'all' || String(sensor.type || '').toLowerCase() === filters.type.toLowerCase()
      const sensorOnline = Boolean(sensor.online || (sensor.last_seen && Date.now() - new Date(sensor.last_seen).getTime() < 5 * 60 * 1000))
      const matchesStatus = filters.status === 'all' || (filters.status === 'online' ? sensorOnline : !sensorOnline)
      return matchesSearch && matchesRoom && matchesType && matchesStatus
    })
  }, [filters, sensors])

  return {
    sensors,
    summary,
    selectedSensor,
    selectedSensorId,
    setSelectedSensorId,
    historyHours,
    setHistoryHours,
    filters,
    setFilters,
    filteredSensors,
    filterOptions,
    isLoading,
    error,
  }
}
