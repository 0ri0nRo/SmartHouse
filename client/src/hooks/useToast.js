import { useState, useRef, useCallback } from 'react'

export function useToast() {
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const timer = useRef(null)

  const showToast = useCallback((message, type = 'success') => {
    clearTimeout(timer.current)
    setToast({ show: true, message, type })
    timer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3500)
  }, [])

  return { toast, showToast }
}