/**
 * src/api/index.js
 * Single source of truth for all backend API calls.
 * Every page imports from here — never writes fetch() directly.
 */

const BASE = ''  // same origin, proxied by Vite in dev

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
  return res.json()
}

// ── Sensors ───────────────────────────────────────────────
export const api = {
  getSensors:          ()         => get('/api_sensors'),

  // Temperature
  getTodayTemp:        ()         => get('/api/today_temperature'),
  getMonthlyTemp:      (y)        => get(`/api/monthly_average_temperature/${y}`),
  getDailyTemp:        (m, y)     => get(`/api/monthly_average_temperature/${m}/${y}`),
  getRangeTemp:        (s, e)     => get(`/api/temperature_average/${s}/${e}`),

  // Humidity
  getTodayHum:         ()         => get('/api/today_humidity'),
  getMonthlyHum:       (y)        => get(`/api/monthly_average_humidity/${y}`),
  getDailyHum:         (m, y)     => get(`/api/monthly_average_humidity/${m}/${y}`),
  getRangeHum:         (s, e)     => get(`/api/humidity_average/${s}/${e}`),

  // Boiler & thermostat
  getBoilerStatus:     ()         => get('/api/boiler/status'),
  manualBoiler:        (on)       => post('/api/boiler/manual', { turn_on: on }),
  getThermostatFull:   ()         => get('/api/thermostat/status/full'),
  thermostatOn:        ()         => post('/api/thermostat/on', {}),
  thermostatOff:       ()         => post('/api/thermostat/off', {}),
  thermostatSync:      ()         => post('/api/thermostat/sync', {}),
  getTargetTemp:       ()         => get('/api/target_temperature'),
  setTargetTemp:       (t)        => post('/api/target_temperature', { target_temperature: t }),

  // Schedules (Shelly)
  getSchedules:        ()         => get('/api/shelly/schedules'),
  createSchedule:      (b)        => post('/api/shelly/schedule/create', b),
  deleteSchedule:      (id)       => post('/api/shelly/schedule/delete', { id }),

  // Air quality
  getAirQuality:       ()         => get('/api/last_air_quality_today'),
  getAirQualityHistory:()         => get('/api/air_quality/history'),

  // Security & alarm
  getAlarm:            ()         => get('/security/alarm'),
  toggleAlarm:         (status)   => post('/security/alarm', { status }),

  // Train
  getTrains:           (dest)     => get(`/trains_data/${dest}`),

  // Raspberry Pi
  getRaspiStats:       ()         => get('/api/system/stats'),

  // Activities
  getActivities:       ()         => get('/api/activity/all'),
  addActivity:         (b)        => post('/api/activity/add', b),
  deleteActivity:      (id)       => post(`/api/activity/delete/${id}`, {}),

  // Shopping list
  getShopping:         ()         => get('/api/shopping/list'),
  addShoppingItem:     (b)        => post('/api/shopping/add', b),
  deleteShoppingItem:  (id)       => post(`/api/shopping/delete/${id}`, {}),
  toggleShoppingItem:  (id)       => post(`/api/shopping/toggle/${id}`, {}),

  // Expenses
  getExpenses:         ()         => get('/api/expenses/list'),
  addExpense:          (b)        => post('/api/expenses/add', b),
  deleteExpense:       (id)       => post(`/api/expenses/delete/${id}`, {}),

  // Receipts
  getReceipts:         ()         => get('/api/receipts/list'),
}