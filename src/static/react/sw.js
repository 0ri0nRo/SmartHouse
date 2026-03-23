// SmartHouse Service Worker
// Caches static assets for offline access and faster loading

const CACHE_NAME = 'smarthouse-v1'

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
]

// ── Install: cache static assets ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

// ── Activate: clean old caches ────────────────────────────
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

// ── Fetch: network-first for API, cache-first for assets ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Always go network for API calls
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/security') ||
    url.pathname.startsWith('/todolist') ||
    url.pathname.startsWith('/trains_data')
  ) {
    return // let browser handle normally
  }

  // Cache-first for static assets (JS, CSS, images)
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

  // Network-first for HTML pages (React routes)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache the index.html response
        if (event.request.mode === 'navigate') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline fallback: serve cached index.html
        return caches.match('/') || caches.match('/index.html')
      })
  )
})