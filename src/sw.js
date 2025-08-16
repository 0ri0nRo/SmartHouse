// sw.js - Service Worker Base per Smart Home Dashboard

const CACHE_NAME = 'smart-home-v1';
const urlsToCache = [
  '/',
  '/static/favicon.ico'
  // Aggiungi altre risorse se necessario
];

// Installazione - Cache delle risorse essenziali
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache opened');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.log('Service Worker: Cache failed', err);
      })
  );
});

// Attivazione - Pulizia cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch - Strategia di cache per le API
self.addEventListener('fetch', event => {
  // Solo per le tue API
  if (event.request.url.includes('/api_sensors') || 
      event.request.url.includes('/api/p48') ||
      event.request.url.includes('/api/devices')) {
    
    event.respondWith(
      // Network First: prova la rete, se fallisce usa la cache
      fetch(event.request)
        .then(response => {
          // Salva la risposta in cache
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseClone);
              });
          }
          return response;
        })
        .catch(() => {
          // Se la rete fallisce, usa la cache
          return caches.match(event.request)
            .then(response => {
              if (response) {
                console.log('Service Worker: Serving from cache', event.request.url);
                return response;
              }
              // Se non c'è in cache, restituisci dati di fallback
              return new Response(JSON.stringify({
                error: 'Offline',
                message: 'No cached data available'
              }), {
                headers: { 'Content-Type': 'application/json' }
              });
            });
        })
    );
  }
  
  // Per tutto il resto, passa attraverso normalmente
});

// Gestione messaggi dal client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});