import { init as initAptabase, trackEvent as trackAptabaseEvent } from '@aptabase/web'
import * as Sentry from '@sentry/react'
import { getElectronDataBridge } from '../../data/electron_data_bridge'
import { register } from '../service_injector'

export type TelemetryRuntime = 'react_web' | 'react_electron'

export type TelemetryEventName =
    | 'complete_release'
    | 'create_card'
    | 'create_project'
    | 'external_file_import'
    | 'navigation'
    | 'open_project'
    | 'react_start'
    | 'react_stop'
    | 'remarkable_import'

const FLUSH_TIMEOUT_MS = 1500
const TELEMETRY_EVENTS = new Set<TelemetryEventName>([
    'complete_release',
    'create_card',
    'create_project',
    'external_file_import',
    'navigation',
    'open_project',
    'react_start',
    'react_stop',
    'remarkable_import',
])

function hasValue(value: string | undefined) {
    return typeof value === 'string' && value.trim().length > 0
}

function getRuntime(): TelemetryRuntime {
    return getElectronDataBridge() ? 'react_electron' : 'react_web'
}

function settlePendingEvents(events: Promise<void>[]) {
    return Promise.all(events.map(async (event) => {
        try {
            await event
        } catch {
            // Telemetry must not affect application behavior.
        }
    }))
}

/** Owns React telemetry setup and keeps outbound usage payloads detail-free. */
export class TelemetryService {
    private aptabaseEnabled: boolean
    private isStarted: boolean
    private pendingEvents: Set<Promise<void>>
    private runtime: TelemetryRuntime
    private sentryEnabled: boolean

    constructor() {
        this.aptabaseEnabled = false
        this.isStarted = false
        this.pendingEvents = new Set()
        this.runtime = 'react_web'
        this.sentryEnabled = false
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this)
        register('telemetryService', this)
    }

    /** Initializes renderer telemetry once during application startup. */
    start() {
        if (this.isStarted) return

        this.isStarted = true
        this.runtime = getRuntime()
        this.aptabaseEnabled = hasValue(import.meta.env.MD2_APTABASE_APP_KEY)
        this.sentryEnabled = import.meta.env.PROD && hasValue(import.meta.env.MD2_SENTRY_DSN)

        if (this.sentryEnabled) {
            try {
                Sentry.init({ dsn: import.meta.env.MD2_SENTRY_DSN })
            } catch {
                this.sentryEnabled = false
            }
        }

        if (this.aptabaseEnabled) {
            try {
                initAptabase(import.meta.env.MD2_APTABASE_APP_KEY)
            } catch {
                this.aptabaseEnabled = false
            }
        }

        this.trackEvent('react_start')
        window.addEventListener('beforeunload', this.handleBeforeUnload)
    }

    trackEvent(eventName: TelemetryEventName) {
        if (!TELEMETRY_EVENTS.has(eventName)) throw new Error(`Unsupported telemetry event: ${eventName}`)
        if (!this.aptabaseEnabled) return

        try {
            const pendingEvent = Promise.resolve(trackAptabaseEvent(eventName, { runtime: this.runtime }))
            this.pendingEvents.add(pendingEvent)
            pendingEvent.finally(() => this.pendingEvents.delete(pendingEvent))
        } catch {
            // Telemetry must not affect application behavior.
        }
    }

    captureError(error: unknown) {
        if (!this.sentryEnabled) return

        try {
            Sentry.captureException(error)
        } catch {
            // Telemetry must not affect application behavior.
        }
    }

    async flush(timeoutMs = FLUSH_TIMEOUT_MS) {
        const pendingEvents = [...this.pendingEvents]
        await Promise.race([
            settlePendingEvents(pendingEvents),
            new Promise<void>((resolve) => {
                window.setTimeout(resolve, timeoutMs)
            }),
        ])

        if (!this.sentryEnabled) return

        try {
            await Sentry.flush(timeoutMs)
        } catch {
            // Telemetry must not affect application behavior.
        }
    }

    private handleBeforeUnload() {
        this.trackEvent('react_stop')
        void this.flush()
    }
}

export const telemetryService = new TelemetryService()
