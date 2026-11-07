export const BRIDGE_ERROR_ENVELOPE_KEY: '__md2BridgeError'
export const BRIDGE_ERROR_FIELDS: readonly string[]
export const NOT_A_GIT_REPOSITORY_ERROR: 'not-a-git-repository'

export interface BridgeErrorPayload {
    code?: string
    fields: Record<string, string>
    message: string
    name: string
}

export interface BridgeErrorEnvelope {
    __md2BridgeError: BridgeErrorPayload
}

export function serializeBridgeError(error: unknown): BridgeErrorEnvelope
export function isBridgeErrorEnvelope(value: unknown): value is BridgeErrorEnvelope
export function bridgeErrorPayload(value: unknown): BridgeErrorPayload | null
