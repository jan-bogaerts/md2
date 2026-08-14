import { afterEach, describe, expect, it } from 'vitest'
import {
    configureRemoteControlConnection,
    REMOTE_CONTROL_ENDPOINT_KEY,
    tryReadRemoteControlConnection,
} from './remote_control_connection'

describe('tryReadRemoteControlConnection', () => {
    afterEach(() => {
        window.localStorage.removeItem(REMOTE_CONTROL_ENDPOINT_KEY)
    })

    it('returns null when nothing is stored', () => {
        expect(tryReadRemoteControlConnection()).toBeNull()
    })

    it('returns endpoint-only settings when stored', () => {
        window.localStorage.setItem(REMOTE_CONTROL_ENDPOINT_KEY, 'ws://127.0.0.1:1234')

        expect(tryReadRemoteControlConnection()).toEqual({ endpoint: 'ws://127.0.0.1:1234' })
    })

    it('returns the stored settings', () => {
        configureRemoteControlConnection({ endpoint: 'ws://127.0.0.1:1234' })

        expect(tryReadRemoteControlConnection()).toEqual({ endpoint: 'ws://127.0.0.1:1234' })
        expect(window.localStorage.length).toBe(1)
    })
})
