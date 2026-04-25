import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

if (typeof document !== 'undefined') {
  document.body.dataset.lineupTheme = 'dark'
  document.body.dataset.cutzTheme = 'dark'
  document.documentElement.style.background = '#190019'
  document.body.style.background = '#190019'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
