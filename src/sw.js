// sw.js - Service Worker per Smart Home Dashboard
// Versione: 1.0

const CACHE_NAME = 'smart-home-dashboard-v1';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minuti in millisecondi

// Risorse da cachare immediatamente
const STATIC_CACHE = [
  '/',
  '/static/favicon.ico'
];

// API che vogliamo cachare
const API_PATTERNS = [
  '/api_sensors',
  '/api/p48',
  '/api/devices',
  '/security/alarm'
];

// Installazione del Service Worker
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching static resources');
        return cache.addAll(STATIC_CACHE);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        return self.skipWaiting(); // Attiva immediatamente
      })
      .catch(err => {
        console.error('❌ Service Worker: Installation failed', err);
      })
  );
});

// Attivazione e pulizia cache vecchie
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating...');
  
  event.waitUntil(
    Promise.all([
      // Pulizia cache vecchie
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Prendi il controllo di tutte le pagine
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker: Activation complete');
    })
  );
});

// Gestione delle richieste di rete
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Solo per richieste GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Controlla se è una delle nostre API
  const isAPI = API_PATTERNS.some(pattern => url.pathname.includes(pattern));
  
  if (isAPI) {
    // Strategia per API: Network First con cache fallback
    event.respondWith(handleAPIRequest(event.request));
  } else if (url.origin === location.origin) {
    // Strategia per risorse statiche: Cache First
    event.respondWith(handleStaticRequest(event.request));
  }
});

// Gestione richieste API con strategia Network First
async function handleAPIRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // Prova prima la rete
    console.log('🌐 Fetching from network:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Salva la risposta in cache con timestamp
      const responseClone = networkResponse.clone();
      const responseWithTimestamp = await addTimestampToResponse(responseClone);
      await cache.put(request, responseWithTimestamp);
      
      console.log('✅ API cached:', request.url);
      return networkResponse;
    }
    
    throw new Error('Network response not ok');
    
  } catch (error) {
    // Se la rete fallisce, usa la cache
    console.log('🔄 Network failed, trying cache for:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      const cacheData = await cachedResponse.clone().json();
      const isExpired = isCacheExpired(cacheData._sw_timestamp);
      
      if (!isExpired) {
        console.log('📦 Serving fresh cached data for:', request.url);
        return cachedResponse;
      } else {
        console.log('⏰ Cached data expired for:', request.url);
      }
    }
    
    // Fallback: risposta di errore personalizzata
    return createFallbackResponse(request.url);
  }
}

// Gestione richieste statiche con strategia Cache First
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('📦 Serving from cache:', request.url);
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('❌ Failed to fetch:', request.url);
    throw error;
  }
}

// Aggiunge timestamp alla risposta per il controllo scadenza
async function addTimestampToResponse(response) {
  const data = await response.json();
  data._sw_timestamp = Date.now();
  
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

// Controlla se i dati in cache sono scaduti
function isCacheExpired(timestamp) {
  if (!timestamp) return true;
  return Date.now() - timestamp > CACHE_EXPIRY;
}

// Crea una risposta di fallback quando tutto fallisce
function createFallbackResponse(url) {
  let fallbackData = {
    error: true,
    offline: true,
    message: 'Dati non disponibili offline',
    _sw_timestamp: Date.now()
  };
  
  // Fallback specifici per API
  if (url.includes('/api_sensors')) {
    fallbackData = {
      ...fallbackData,
      temperature: { current: '--', minMaxLast24Hours: ['--', '--'] },
      humidity: { current: '--', minMaxLast24Hours: ['--', '--'] }
    };
  } else if (url.includes('/api/p48')) {
    fallbackData = {
      ...fallbackData,
      cached_value: '--',
      P48_value: '--'
    };
  } else if (url.includes('/api/devices')) {
    fallbackData = [];
  } else if (url.includes('/security/alarm')) {
    fallbackData = ['false', Date.now()];
  }
  
  console.log('🔄 Serving fallback data for:', url);
  
  return new Response(JSON.stringify(fallbackData), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Gestione messaggi dal client
self.addEventListener('message', event => {
  console.log('💬 Service Worker received message:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('🗑️ Cache cleared by user request');
      event.ports[0].postMessage({ success: true });
    });
  }
});

// Log quando il Service Worker è pronto
self.addEventListener('activate', () => {
  console.log('🏠 Smart Home Service Worker is ready!');
});