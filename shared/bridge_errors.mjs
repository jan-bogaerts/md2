/**
 * Error transport for remote boundaries (Electron IPC, remote-control WebSocket).
 *
 * Both boundaries reduce a rejected call to its message text, which destroys the marker properties
 * that the renderer uses to recognise recoverable conditions such as a missing working folder.
 * The main process therefore resolves with an envelope instead of rejecting, and the renderer
 * rebuilds a typed error from it.
 */

const BRIDGE_ERROR_ENVELOPE_KEY = '__md2BridgeError'
const BRIDGE_ERROR_FIELDS = ['workingFolder']

function errorFields(error) {
    const fields = {}

    for (const field of BRIDGE_ERROR_FIELDS) {
        const value = error[field]
        if (typeof value === 'string') fields[field] = value
    }

    return fields
}

/** Build the transport payload for an error, keeping its `code` and declared extra fields. */
export function serializeBridgeError(error) {
    if (!(error instanceof Error)) {
        return { [BRIDGE_ERROR_ENVELOPE_KEY]: { fields: {}, message: String(error), name: 'Error' } }
    }

    const payload = { fields: errorFields(error), message: error.message, name: error.name }
    if (typeof error.code === 'string') payload.code = error.code

    return { [BRIDGE_ERROR_ENVELOPE_KEY]: payload }
}

/** True when a resolved bridge result actually carries a failure. */
export function isBridgeErrorEnvelope(value) {
    if (!value || typeof value !== 'object') return false

    const payload = value[BRIDGE_ERROR_ENVELOPE_KEY]

    return !!payload
        && typeof payload === 'object'
        && (payload.code === undefined || typeof payload.code === 'string')
        && !!payload.fields
        && typeof payload.fields === 'object'
        && !Array.isArray(payload.fields)
        && Object.values(payload.fields).every((field) => typeof field === 'string')
        && typeof payload.message === 'string'
        && typeof payload.name === 'string'
}

/** Read the payload out of an envelope, or null when the value is an ordinary result. */
export function bridgeErrorPayload(value) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, BRIDGE_ERROR_ENVELOPE_KEY)) return null
    if (!isBridgeErrorEnvelope(value)) throw new Error('Invalid bridge error envelope')

    return value[BRIDGE_ERROR_ENVELOPE_KEY]
}

export { BRIDGE_ERROR_ENVELOPE_KEY, BRIDGE_ERROR_FIELDS }
