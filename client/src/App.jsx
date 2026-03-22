import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTheme } from './hooks/useTheme'
import Layout from './components/Layout'

// Pages — we will create them one by one
import HomePage from './pages/HomePage'

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout theme={theme} onToggleTheme={toggle} />}>
          <Route index element={<HomePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}