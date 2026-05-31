import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'
import { getFirebaseAnalyticsIfSupported } from './firebase.js'

if (typeof document !== 'undefined') {
  let savedTheme = 'light'
  try {
    const userSetTheme = localStorage.getItem('queless-theme-user-set') === 'true'
    const storedTheme = localStorage.getItem('queless-theme')
    savedTheme = userSetTheme && (storedTheme === 'light' || storedTheme === 'dark') ? storedTheme : 'light'
  } catch {
    savedTheme = 'light'
  }
  document.documentElement.dataset.theme = savedTheme
  document.body.dataset.theme = savedTheme
  document.body.dataset.lineupTheme = savedTheme
  document.body.dataset.cutzTheme = savedTheme
}

getFirebaseAnalyticsIfSupported().catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
