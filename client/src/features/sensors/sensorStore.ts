import { create } from 'zustand'

export interface SensorFilters {
  query: string
  room: string
  type: string
  status: 'all' | 'online' | 'offline'
}

export interface SensorStoreState {
  sensors: any[]
  summary: Record<string, any> | null
  selectedSensorId: number | null
  historyHours: number
  filters: SensorFilters
  isLoading: boolean
  isHistoryLoading: boolean
  error: string | null
  historyError: string | null
  setSensors: (sensors: any[]) => void
  setSummary: (summary: Record<string, any> | null) => void
  setSelectedSensorId: (sensorId: number | null) => void
  setHistoryHours: (hours: number) => void
  setFilters: (filters: Partial<SensorFilters>) => void
  setLoading: (loading: boolean) => void
  setHistoryLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setHistoryError: (error: string | null) => void
}

const DEFAULT_FILTERS: SensorFilters = {
  query: '',
  room: 'all',
  type: 'all',
  status: 'all',
}

export const useSensorStore = create<SensorStoreState>((set) => ({
  sensors: [],
  summary: null,
  selectedSensorId: null,
  historyHours: 24,
  filters: DEFAULT_FILTERS,
  isLoading: false,
  isHistoryLoading: false,
  error: null,
  historyError: null,
  setSensors: (sensors) => set({ sensors }),
  setSummary: (summary) => set({ summary }),
  setSelectedSensorId: (selectedSensorId) => set({ selectedSensorId }),
  setHistoryHours: (historyHours) => set({ historyHours }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  setLoading: (isLoading) => set({ isLoading }),
  setHistoryLoading: (isHistoryLoading) => set({ isHistoryLoading }),
  setError: (error) => set({ error }),
  setHistoryError: (historyError) => set({ historyError }),
}))
