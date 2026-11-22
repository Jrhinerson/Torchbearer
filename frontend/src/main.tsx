import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/styles.css'
import { initializeTheme } from './app/theme'
import App from './app/App'

initializeTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
