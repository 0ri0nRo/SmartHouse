/**
 * useNotifications.js
 * Sends browser notifications when alarm or boiler state changes.
 * Works on desktop Chrome/Firefox and on iOS PWA (Safari 16.4+).
 */
import { useEffect, useRef, useState } from 'react'

export function useNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  const request = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }

  const send = (title, body, options = {}) => {
    if (permission !== 'granted') return
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: options.tag || 'smarthouse',
        renotify: true,
        ...options,
      })
    } catch (e) {
      console.warn('Notification failed:', e)
    }
  }

  return { permission, request, send }
}

/**
 * useStateChangeNotifier
 * Watches a value and fires a notification when it changes.
 * Skips the first render (no notification on page load).
 */
export function useStateChangeNotifier(value, getTitle, getBody, deps = []) {
  const { permission, send } = useNotifications()
  const prevRef   = useRef(undefined)
  const mountedRef = useRef(false)

  useEffect(() => {
    // Skip first render
    if (!mountedRef.current) {
      mountedRef.current = true
      prevRef.current = value
      return
    }
    if (value === undefined || value === null) return
    if (value === prevRef.current) return

    const title = getTitle(value, prevRef.current)
    const body  = getBody(value, prevRef.current)
    send(title, body)
    prevRef.current = value
  }, [value, ...deps])
}