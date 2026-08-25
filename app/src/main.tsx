// Must stay the first import: it publishes the `Prism` global before the
// prismjs language components in the same chunk evaluate.
import './prism_bootstrap'
import { StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { applicationStartupService } from './services/application_startup_service'
import { applicationStorage } from './services/storage/application_storage'
import { telemetryService } from './services/telemetry/telemetry_service'

function renderApplication(content: ReactNode) {
    createRoot(document.getElementById('root')!).render(content)
}

async function bootstrap() {
    try {
        await applicationStorage.initialize()
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Application state could not be loaded'
        renderApplication(<main role="alert">Application state could not be loaded: {message}</main>)

        return
    }

    telemetryService.start()
    void applicationStartupService.start()
    renderApplication(
        <StrictMode>
            <App />
        </StrictMode>,
    )
}

void bootstrap()
