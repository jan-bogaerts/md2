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

interface AptabaseClient {
    init(appKey: string): void
    trackEvent(eventName: string, properties: Record<string, string>): Promise<void> | void
}

interface SentryClient {
    captureException(error: unknown): void
    flush(timeoutMs?: number): Promise<boolean>
    init(options: { dsn: string }): void
}

interface TelemetryClients {
    aptabase: AptabaseClient
    sentry: SentryClient
}

interface TelemetryInitOptions {
    aptabaseAppKey?: string
    clients: TelemetryClients
    runtime: TelemetryRuntime
    sentryDsn?: string
}

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
    private clients: TelemetryClients | null
    private pendingEvents: Set<Promise<void>>
    private runtime: TelemetryRuntime
    private sentryEnabled: boolean

    constructor() {
        this.aptabaseEnabled = false
        this.clients = null
        this.pendingEvents = new Set()
        this.runtime = 'react_web'
        this.sentryEnabled = false
        register('telemetryService', this)
    }

    init(options: TelemetryInitOptions) {
        this.clients = options.clients
        this.runtime = options.runtime
        this.aptabaseEnabled = hasValue(options.aptabaseAppKey)
        this.sentryEnabled = hasValue(options.sentryDsn)

        if (this.sentryEnabled) {
            try {
                this.clients.sentry.init({ dsn: options.sentryDsn as string })
            } catch {
                this.sentryEnabled = false
            }
        }

        if (this.aptabaseEnabled) {
            try {
                this.clients.aptabase.init(options.aptabaseAppKey as string)
            } catch {
                this.aptabaseEnabled = false
            }
        }
    }

    trackEvent(eventName: TelemetryEventName) {
        if (!TELEMETRY_EVENTS.has(eventName)) throw new Error(`Unsupported telemetry event: ${eventName}`)
        if (!this.clients || !this.aptabaseEnabled) return

        try {
            const pendingEvent = Promise.resolve(this.clients.aptabase.trackEvent(eventName, { runtime: this.runtime }))
            this.pendingEvents.add(pendingEvent)
            pendingEvent.finally(() => this.pendingEvents.delete(pendingEvent))
        } catch {
            // Telemetry must not affect application behavior.
        }
    }

    captureError(error: unknown) {
        if (!this.clients || !this.sentryEnabled) return

        try {
            this.clients.sentry.captureException(error)
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

        if (!this.clients || !this.sentryEnabled) return

        try {
            await this.clients.sentry.flush(timeoutMs)
        } catch {
            // Telemetry must not affect application behavior.
        }
    }
}

export const telemetryService = new TelemetryService()
