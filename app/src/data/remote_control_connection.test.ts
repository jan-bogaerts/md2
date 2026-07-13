import { afterEach, describe, expect, it } from 'vitest'
import {
    configureRemoteControlConnection,
    REMOTE_CONTROL_ENDPOINT_KEY,
    REMOTE_CONTROL_TOKEN_KEY,
    tryReadRemoteControlConnection,
} from './remote_control_connection'

describe('tryReadRemoteControlConnection', () => {
    afterEach(() => {
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
        window.localStorage.removeItem(REMOTE_CONTROL_TOKEN_KEY)
    })

    it('returns null when nothing is stored', () => {
        expect(tryReadRemoteControlConnection()).toBeNull()
    })

    it('returns null when only the endpoint is stored', () => {
        window.localStorage.setItem(REMOTE_CONTROL_ENDPOINT_KEY, 'ws://127.0.0.1:1234')

        expect(tryReadRemoteControlConnection()).toBeNull()
    })

    it('returns the stored settings', () => {
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })

        expect(tryReadRemoteControlConnection()).toEqual({ endpoint: 'ws://127.0.0.1:1234', token: 'token-1' })
    })
})
