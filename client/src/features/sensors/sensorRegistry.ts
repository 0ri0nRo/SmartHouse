import type { LucideIcon } from 'lucide-react'
import { Activity, Droplets, Eye, Gauge, Lightbulb, MapPin, Thermometer, Wind, Zap, DoorOpen } from 'lucide-react'

export interface SensorSeriesDefinition {
  key: string
  label: string
  color: string
  unit?: string
}

export interface SensorKindDefinition {
  id: string
  label: string
  description: string
  color: string
  unit: string
  icon: LucideIcon
  series: SensorSeriesDefinition[]
}

export const SENSOR_KIND_REGISTRY: Record<string, SensorKindDefinition> = {
  temp_hum: {
    id: 'temp_hum',
    label: 'Temperature / Humidity',
    description: 'Combined temperature and humidity sensor',
    color: '#ef7f1a',
    unit: '°C / %',
    icon: Thermometer,
    series: [
      { key: 'temperature', label: 'Temperature', color: '#f97316', unit: '°C' },
      { key: 'humidity', label: 'Humidity', color: '#0ea5e9', unit: '%' },
    ],
  },
  temperature: {
    id: 'temperature',
    label: 'Temperature',
    description: 'Temperature-only sensor',
    color: '#f97316',
    unit: '°C',
    icon: Thermometer,
    series: [{ key: 'temperature', label: 'Temperature', color: '#f97316', unit: '°C' }],
  },
  humidity: {
    id: 'humidity',
    label: 'Humidity',
    description: 'Humidity-only sensor',
    color: '#38bdf8',
    unit: '%',
    icon: Droplets,
    series: [{ key: 'humidity', label: 'Humidity', color: '#38bdf8', unit: '%' }],
  },
  air_quality: {
    id: 'air_quality',
    label: 'Air Quality',
    description: 'Air quality sensor',
    color: '#14b8a6',
    unit: 'AQI',
    icon: Wind,
    series: [{ key: 'value', label: 'AQI', color: '#14b8a6', unit: 'AQI' }],
  },
  motion: {
    id: 'motion',
    label: 'Motion',
    description: 'Motion detector',
    color: '#8b5cf6',
    unit: 'state',
    icon: Activity,
    series: [{ key: 'value', label: 'Motion', color: '#8b5cf6', unit: 'state' }],
  },
  presence: {
    id: 'presence',
    label: 'Presence',
    description: 'Presence detector',
    color: '#a855f7',
    unit: 'state',
    icon: Eye,
    series: [{ key: 'value', label: 'Presence', color: '#a855f7', unit: 'state' }],
  },
  light: {
    id: 'light',
    label: 'Light',
    description: 'Illuminance sensor',
    color: '#f59e0b',
    unit: 'lux',
    icon: Lightbulb,
    series: [{ key: 'value', label: 'Light', color: '#f59e0b', unit: 'lux' }],
  },
  door: {
    id: 'door',
    label: 'Door / Window',
    description: 'Contact sensor',
    color: '#22c55e',
    unit: 'state',
    icon: DoorOpen,
    series: [{ key: 'value', label: 'Contact', color: '#22c55e', unit: 'state' }],
  },
  power: {
    id: 'power',
    label: 'Power',
    description: 'Power or energy sensor',
    color: '#f59e0b',
    unit: 'W',
    icon: Zap,
    series: [{ key: 'value', label: 'Power', color: '#f59e0b', unit: 'W' }],
  },
  generic: {
    id: 'generic',
    label: 'Sensor',
    description: 'Generic sensor node',
    color: '#94a3b8',
    unit: '',
    icon: MapPin,
    series: [{ key: 'value', label: 'Value', color: '#94a3b8' }],
  },
  default: {
    id: 'default',
    label: 'Sensor',
    description: 'Fallback sensor kind',
    color: '#94a3b8',
    unit: '',
    icon: Gauge,
    series: [{ key: 'value', label: 'Value', color: '#94a3b8' }],
  },
}

export function resolveSensorKind(type?: string | null) {
  if (!type) return SENSOR_KIND_REGISTRY.default
  const normalized = String(type).toLowerCase()
  return SENSOR_KIND_REGISTRY[normalized] ?? SENSOR_KIND_REGISTRY.generic
}
