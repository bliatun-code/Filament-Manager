import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppUpdateProvider } from './lib/app_update_provider'
import { initThemeMode } from './lib/theme_mode'
import { I18nProvider } from './lib/i18n_provider'
import { startPackagedDesktopE2eBootstrap } from './lib/packaged_desktop_e2e_bootstrap'

startPackagedDesktopE2eBootstrap()
initThemeMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AppUpdateProvider>
        <App />
      </AppUpdateProvider>
    </I18nProvider>
  </StrictMode>,
)
