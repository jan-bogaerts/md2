import { init as initAptabase, trackEvent as trackAptabaseEvent } from '@aptabase/web'
import * as Sentry from '@sentry/react'
import { getElectronDataBridge } from '../../data/electron_data_bridge'
import { telemetryService, type TelemetryRuntime } from './telemetry_service'

let isReactTelemetryStarted = false

function getReactRuntime(): TelemetryRuntime {
    return getElectronDataBridge() ? 'react_electron' : 'react_web'
}

function getErrorPayload(event: ErrorEvent) {
    return event.error ?? new Error(event.message)
}

function getPromiseRejectionPayload(event: PromiseRejectionEvent) {
    return event.reason ?? new Error('Unhandled promise rejection')
}

function handleReactError(event: ErrorEvent) {
    telemetryService.captureError(getErrorPayload(event))
}

function handleReactPromiseRejection(event: PromiseRejectionEvent) {
    telemetryService.captureError(getPromiseRejectionPayload(event))
}

function handleReactStop() {
    telemetryService.trackEvent('react_stop')
    void telemetryService.flush()
}

/** Initializes React telemetry from app bootstrap code, not service module load. */
export function startReactTelemetry() {
    if (isReactTelemetryStarted) return

    isReactTelemetryStarted = true
    telemetryService.init({
        aptabaseAppKey: import.meta.env.APTABASE_APP_KEY,
        clients: {
            aptabase: { init: initAptabase, trackEvent: trackAptabaseEvent },
            sentry: { captureException: Sentry.captureException, flush: Sentry.flush, init: Sentry.init },
        },
        runtime: getReactRuntime(),
        sentryDsn: import.meta.env.PROD ? import.meta.env.SENTRY_DSN : undefined,
    })
    telemetryService.trackEvent('react_start')

    window.addEventListener('beforeunload', handleReactStop)
    window.addEventListener('error', handleReactError)
    window.addEventListener('unhandledrejection', handleReactPromiseRejection)
}
