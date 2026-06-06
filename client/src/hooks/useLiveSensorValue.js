import { useState, useEffect, useCallback } from 'react'

export function resolvePath(obj, path) {
  if (!path || obj == null) return obj
  return path.split('.').reduce((acc, key) => {
    if (acc == null) return null
    const arrMatch = key.match(/^(\w+)\[(\d+)\]$/)
    if (arrMatch) return acc[arrMatch[1]]?.[parseInt(arrMatch[2])]
    return acc[key]
  }, obj)
}

export function formatLiveValue(value) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60)
  const n = parseFloat(value)
  if (!isNaN(n)) return n % 1 === 0 ? String(n) : n.toFixed(2)
  return String(value)
}

export function useLiveSensorValue(liveApi) {
  const [value, setValue] = useState(null)
  const [timestamp, setTimestamp] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const doFetch = useCallback(async () => {
    if (!liveApi?.endpoint) {
      setValue(null)
      setTimestamp(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(liveApi.endpoint, { cache: 'no-cache' })
      const json = await res.json()
      let extracted = null
      let ts = null

      if (liveApi.mode === 'array') {
        const raw = liveApi.array_key ? resolvePath(json, liveApi.array_key) : json
        const arr = Array.isArray(raw) ? raw : null
        if (arr && arr.length > 0) {
          const sortKey = liveApi.sort_by || 'created_at'
          const sorted = [...arr].sort((a, b) => new Date(b[sortKey]) - new Date(a[sortKey]))
          const latest = sorted[0]
          ts = latest[sortKey] || null
          extracted = liveApi.value_path ? resolvePath(latest, liveApi.value_path) : latest.message
        }
      } else {
        extracted = liveApi.value_path ? resolvePath(json, liveApi.value_path) : json
        ts = new Date().toISOString()
      }

      setValue(extracted === undefined ? null : extracted)
      setTimestamp(ts)
    } catch {
      setError('Fetch failed')
    } finally {
      setLoading(false)
    }
  }, [liveApi?.endpoint, liveApi?.mode, liveApi?.array_key, liveApi?.sort_by, liveApi?.value_path])

  useEffect(() => {
    doFetch()
    if (!liveApi?.endpoint) return undefined
    const id = setInterval(doFetch, liveApi?.refresh_ms || 15000)
    return () => clearInterval(id)
  }, [doFetch, liveApi?.endpoint, liveApi?.refresh_ms])

  return { value, timestamp, loading, error, refetch: doFetch }
}
