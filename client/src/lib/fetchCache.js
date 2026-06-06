const _cache = new Map()

function _now() { return Date.now() }

export async function fetchJson(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    const res = await fetch(url, opts)
    if (!res.ok) throw new Error('Network error')
    return await res.json()
  }

  const key = url
  const entry = _cache.get(key)
  if (entry && entry.expiry > _now()) {
    return entry.data
  }

  const res = await fetch(url, opts)
  if (!res.ok) return null
  const data = await res.json()
  // Default TTL: 5 seconds for GETs — components can opt-out by using fetch directly
  _cache.set(key, { data, expiry: _now() + 5000 })
  return data
}

export function clearCache(url) {
  if (url) _cache.delete(url)
  else _cache.clear()
}
