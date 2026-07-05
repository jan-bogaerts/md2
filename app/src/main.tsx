import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { startReactTelemetry } from './services/telemetry_bootstrap'

startReactTelemetry()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
