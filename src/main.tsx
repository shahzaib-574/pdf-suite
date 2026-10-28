import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { seedHistory } from './screens/nav'
import { isWebsite } from './web/platform'
import { watchKeyboard } from './lib/keyboard'

if (isWebsite) document.documentElement.dataset.website = 'true';

seedHistory()
watchKeyboard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
