import { useState, useLayoutEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('sh-theme') ?? 'light'
  )

  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.add('light')
    } else {
      root.classList.remove('light')
    }
    localStorage.setItem('sh-theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return { theme, toggle }
}
