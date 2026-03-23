import { useState, useEffect } from 'react'

export function useTheme() {
  // Read saved preference from localStorage, default to 'light'
  const [theme, setTheme] = useState(
    () => localStorage.getItem('sh-theme') || 'light'
  )

  useEffect(() => {
    const root = document.documentElement

    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }

    // Save preference so it persists on reload
    localStorage.setItem('sh-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'light' ? 'dark' : 'light')

  return { theme, toggle }
}