import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTheme } from './hooks/useTheme'
import Layout from './components/Layout'

import HomePage        from './pages/HomePage'
import TemperaturePage from './pages/TemperaturePage'
import HumidityPage    from './pages/HumidityPage'
import TrainPage       from './pages/TrainPage'

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout theme={theme} onToggleTheme={toggle} />}>
          <Route index              element={<HomePage />} />
          <Route path="temperature" element={<TemperaturePage />} />
          <Route path="humidity"    element={<HumidityPage />} />
          <Route path="train"       element={<TrainPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}