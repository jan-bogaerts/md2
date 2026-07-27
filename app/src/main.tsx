// Must stay the first import: it publishes the `Prism` global before the
// prismjs language components in the same chunk evaluate.
import './prism_bootstrap'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { applicationStartupService } from './services/application_startup_service'
import { startReactTelemetry } from './services/telemetry/telemetry_bootstrap'

startReactTelemetry()
void applicationStartupService.start()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
