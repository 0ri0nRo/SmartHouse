import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import AppLoader from './components/AppLoader'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppLoader duration={1000}>
      <App />
    </AppLoader>
  </StrictMode>
)