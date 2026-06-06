// SmartHouse Service Worker
// Caches static assets and selected GET API responses for offline access and faster loading.

const CACHE_NAME = 'smarthouse-v2'
const CACHE_EXPIRY = 5 * 60 * 1000

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
]

const API_CACHEABLE_PREFIXES = [
  '/api/news',
  '/api/calendar/today',
  '/api/calendar/week',
  '/api/recipe/daily',
  '/api_sensors',
  '/api/today_temperature',
  '/api/today_humidity',
  '/api/monthly_temperature',
  '/api/monthly_average_temperature',
  '/api/monthly_average_humidity',
  '/api/temperature_average',
  '/api/humidity_average',
  '/api/air_quality_monthly',
  '/api/air_quality_yearly',
  '/api/air_quality',
  '/api/last_air_quality_today',
  '/api/air_quality_today',
  '/api/gas_concentration_today',
  '/api/devices',
  '/api/shopping-list/current',
  '/api/shopping-list/history',
  '/api/shopping-list/stats',
  '/api/expenses',
  '/api/p49',
  '/api_raspberry_pi_stats',
  '/api/services',
  '/api/processes',
  '/api/network',
  '/api/logs/system',
  '/api/logs/auth',
  '/api/honeypot/',
  '/security/alarm',
]

const API_EXCLUDED_PREFIXES = ['/trains_data']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (event.request.method !== 'GET') {
    return
  }

  if (isCacheableApiRequest(url.pathname)) {
    event.respondWith(handleApiRequest(event.request, event))
    return
  }

  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/security') ||
    url.pathname.startsWith('/todolist') ||
    url.pathname.startsWith('/trains_data')
  ) {
    return
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return response
        })
      })
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (event.request.mode === 'navigate') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match('/') || caches.match('/index.html'))
  )
})

async function handleApiRequest(request, event) {
  const cache = await caches.open(CACHE_NAME)
  const cachedResponse = await cache.match(request)

  if (cachedResponse) {
    try {
      const cacheData = await cachedResponse.clone().json()
      if (!isCacheExpired(cacheData._sw_timestamp)) {
        event.waitUntil(refreshApiCache(request, cache))
        return cachedResponse
      }
    } catch {
      // Ignore malformed cache entries and continue.
    }
  }

  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const responseWithTimestamp = await addTimestampToResponse(networkResponse.clone())
      await cache.put(request, responseWithTimestamp)
      return networkResponse
    }
    throw new Error('Network response not ok')
  } catch {
    if (cachedResponse) {
      return cachedResponse
    }
    return createFallbackResponse(request.url)
  }
}

async function refreshApiCache(request, cache) {
  try {
    const networkResponse = await fetch(request)
    if (!networkResponse.ok) return
    const responseWithTimestamp = await addTimestampToResponse(networkResponse.clone())
    await cache.put(request, responseWithTimestamp)
  } catch {
    // Best effort refresh.
  }
}

function isCacheableApiRequest(pathname) {
  if (API_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return false
  }
  return API_CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

async function addTimestampToResponse(response) {
  const data = await response.json()
  data._sw_timestamp = Date.now()

  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function isCacheExpired(timestamp) {
  if (!timestamp) return true
  return Date.now() - timestamp > CACHE_EXPIRY
}

function createFallbackResponse(url) {
  let fallbackData = {
    error: true,
    offline: true,
    message: 'Dati non disponibili offline',
    _sw_timestamp: Date.now(),
  }

  if (url.includes('/api_sensors')) {
    fallbackData = {
      ...fallbackData,
      temperature: { current: '--', minMaxLast24Hours: ['--', '--'] },
      humidity: { current: '--', minMaxLast24Hours: ['--', '--'] },
    }
  } else if (url.includes('/api/p49')) {
    fallbackData = {
      ...fallbackData,
      cached_value: '--',
      P49_value: '--',
    }
  } else if (url.includes('/api/devices')) {
    fallbackData = []
  } else if (url.includes('/security/alarm')) {
    fallbackData = ['false', Date.now()]
  }

  return new Response(JSON.stringify(fallbackData), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true })
    })
  }
})