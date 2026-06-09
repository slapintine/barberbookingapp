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

// Build marker — confirms the browser loaded the freshly deployed bundle and not
// a cached/stale shell. The values are injected at build time by vite.config.js.
try {
  // eslint-disable-next-line no-undef
  console.log("Queless frontend build:", __QUELESS_BUILD_VERSION__, "built", __QUELESS_BUILD_TIME__)
} catch {
  /* defines unavailable (e.g. tests) — ignore */
}

getFirebaseAnalyticsIfSupported().catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
