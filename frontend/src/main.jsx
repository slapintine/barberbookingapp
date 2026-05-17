import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'

if (typeof document !== 'undefined') {
  let savedTheme = 'dark'
  try {
    const storedTheme = localStorage.getItem('queless-theme')
    savedTheme = storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark'
  } catch {
    savedTheme = 'dark'
  }
  document.documentElement.dataset.theme = savedTheme
  document.body.dataset.theme = savedTheme
  document.body.dataset.lineupTheme = savedTheme
  document.body.dataset.cutzTheme = savedTheme
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
