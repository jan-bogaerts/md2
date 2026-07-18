// Must stay the first import: it publishes the `Prism` global before the
// prismjs language components in the same chunk evaluate.
import './prism_bootstrap'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { startReactTelemetry } from './services/telemetry/telemetry_bootstrap'

startReactTelemetry()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
