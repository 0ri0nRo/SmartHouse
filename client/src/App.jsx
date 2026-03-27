import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTheme } from './hooks/useTheme'
import Layout        from './components/Layout'
import LoadingScreen from './components/LoadingScreen'

import HomePage        from './pages/HomePage'
import TemperaturePage from './pages/TemperaturePage'
import HumidityPage    from './pages/HumidityPage'
import TrainPage       from './pages/TrainPage'
import ShoppingPage    from './pages/ShoppingPage'
import SecurityPage    from './pages/SecurityPage'
import RaspiPage       from './pages/RaspiPage'
import AirQualityPage  from './pages/AirQualityPage'
import NotFoundPage    from './pages/NotFoundPage'
import CalendarPage     from './pages/CalendarPage'

export default function App() {
  const { theme, toggle } = useTheme()

  return (
    <>
      <LoadingScreen/>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout theme={theme} onToggleTheme={toggle}/>}>
            <Route index              element={<HomePage />} />
            <Route path="temperature" element={<TemperaturePage />} />
            <Route path="humidity"    element={<HumidityPage />} />
            <Route path="train"       element={<TrainPage />} />
            <Route path="shopping"    element={<ShoppingPage />} />
            <Route path="security"    element={<SecurityPage />} />
            <Route path="raspi"       element={<RaspiPage />} />
            <Route path="air-quality" element={<AirQualityPage />} />
            <Route path="*"           element={<NotFoundPage />} />
            <Route path="calendar"      element={<CalendarPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}