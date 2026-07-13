const FLUSH_TIMEOUT_MS = 1500
const ELECTRON_RUNTIME = 'electron_main'
const TELEMETRY_EVENTS = new Set(['electron_starting', 'electron_stop'])

let aptabaseEnabled = false
let aptabaseInitialize = null
let aptabaseTrackEvent = null
let pendingAptabaseEvents = new Set()
let sentry = null
let sentryEnabled = false

function hasValue(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function loadSentryClient() {
    try {
        return require('@sentry/electron/main')
    } catch {
        return null
    }
}

function loadAptabaseClient() {
    try {
        return require('@aptabase/electron/main')
    } catch {
        return null
    }
}

function rememberPendingEvent(event) {
    pendingAptabaseEvents.add(event)
    event.finally(() => pendingAptabaseEvents.delete(event))
}

async function settlePendingEvents(events) {
    await Promise.all(events.map(async (event) => {
        try {
            await event
        } catch {
            // Telemetry must not affect desktop shutdown or startup.
        }
    }))
}

function trackEvent(eventName) {
    if (!TELEMETRY_EVENTS.has(eventName)) throw new Error(`Unsupported telemetry event: ${eventName}`)
    if (!aptabaseEnabled || !aptabaseTrackEvent) return Promise.resolve()

    try {
        const pendingEvent = Promise.resolve(aptabaseTrackEvent(eventName, { runtime: ELECTRON_RUNTIME }))
        rememberPendingEvent(pendingEvent)

        return pendingEvent.catch(() => undefined)
    } catch {
        return Promise.resolve()
    }
}

function captureError(error) {
    if (!sentryEnabled || !sentry) return

    try {
        sentry.captureException(error)
    } catch {
        // Telemetry must not affect desktop behavior.
    }
}

async function flush(timeoutMs = FLUSH_TIMEOUT_MS) {
    const pendingEvents = [...pendingAptabaseEvents]
    await Promise.race([
        settlePendingEvents(pendingEvents),
        new Promise((resolve) => {
            setTimeout(resolve, timeoutMs)
        }),
    ])

    if (!sentryEnabled || !sentry) return

    try {
        await sentry.flush(timeoutMs)
    } catch {
        // Telemetry must not affect desktop shutdown.
    }
}

async function startElectronTelemetry(options = {}) {
    sentry = options.sentryClient ?? loadSentryClient()
    const environment = options.environment ?? process.env
    const sentryDsn = environment.MD2_SENTRY_DSN
    sentryEnabled = !options.isDevelopment && !!sentry && hasValue(sentryDsn)

    if (sentryEnabled) {
        try {
            sentry.init({ dsn: sentryDsn })
        } catch {
            sentryEnabled = false
        }
    }

    const aptabase = options.aptabaseClient ?? loadAptabaseClient()
    const aptabaseAppKey = environment.MD2_APTABASE_APP_KEY
    aptabaseEnabled = !!aptabase && hasValue(aptabaseAppKey)

    if (aptabaseEnabled) {
        aptabaseInitialize = aptabase.initialize
        aptabaseTrackEvent = aptabase.trackEvent

        try {
            await aptabaseInitialize(aptabaseAppKey)
        } catch {
            aptabaseEnabled = false
        }
    }

    await trackEvent('electron_starting')
}

function registerProcessErrorHandlers() {
    process.on('uncaughtException', captureError)
    process.on('unhandledRejection', captureError)
}

function resetTelemetryForTests() {
    aptabaseEnabled = false
    aptabaseInitialize = null
    aptabaseTrackEvent = null
    pendingAptabaseEvents = new Set()
    sentry = null
    sentryEnabled = false
}

module.exports = {
    captureError,
    flush,
    registerProcessErrorHandlers,
    resetTelemetryForTests,
    startElectronTelemetry,
    trackEvent,
}
