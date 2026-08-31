import { bridgeErrorPayload, type BridgeErrorPayload } from '../../../shared/bridge_errors.mjs'
import { MISSING_WORKING_FOLDER_ERROR, MissingWorkingFolderError } from './data_types'

/**
 * Rebuilds a typed error from a transport payload.
 *
 * Electron IPC and the remote-control socket both reduce a rejection to its message text, so
 * marker properties such as `code` and `workingFolder` only survive as an explicit payload.
 */
export function rehydrateBridgeError(payload: BridgeErrorPayload): Error {
    if (payload.code === MISSING_WORKING_FOLDER_ERROR && typeof payload.fields.workingFolder === 'string') {
        return new MissingWorkingFolderError(payload.fields.workingFolder)
    }

    const error = new Error(payload.message) as Error & { code?: string }
    error.name = payload.name
    if (payload.code !== undefined) error.code = payload.code
    Object.assign(error, payload.fields)

    return error
}

/** Returns the bridge result unchanged, or throws the rehydrated error it carries. */
export function unwrapBridgeResult<T>(result: T): T {
    const payload = bridgeErrorPayload(result)
    if (!payload) return result

    throw rehydrateBridgeError(payload)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false

    return typeof (value as { then?: unknown }).then === 'function'
}

async function unwrapBridgePromise(result: PromiseLike<unknown>) {
    return unwrapBridgeResult(await result)
}

/** Wraps every method of a bridge so failures resolved as envelopes are thrown as typed errors. */
export function withBridgeErrorRehydration<T extends object>(bridge: T): T {
    const wrapped: Record<string, unknown> = {}

    for (const key of Object.keys(bridge) as (keyof T & string)[]) {
        const value = bridge[key]
        if (typeof value !== 'function') {
            wrapped[key] = value
            continue
        }

        wrapped[key] = (...parameters: unknown[]) => {
            const result = (value as (...args: unknown[]) => unknown).apply(bridge, parameters)
            if (!isPromiseLike(result)) return unwrapBridgeResult(result)

            return unwrapBridgePromise(result)
        }
    }

    return wrapped as T
}
