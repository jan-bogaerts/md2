import { describe, expect, it } from 'vitest'
import { buildRemoteConnectUrl, deriveAutoConnectSettings, parseRemoteConnectString } from './remote_connect_string'

describe('remote connect string', () => {
    it('round-trips a fragment-free URL into endpoint-only settings', () => {
        const url = buildRemoteConnectUrl('desktop.local', 8123)

        expect(url).toBe('http://desktop.local:8123/')
        expect(parseRemoteConnectString(url)).toEqual({ endpoint: 'ws://desktop.local:8123' })
    })

    it('maps https connect strings to wss and tolerates surrounding whitespace', () => {
        expect(parseRemoteConnectString('  https://10.0.0.5:9000/  ')).toEqual({ endpoint: 'wss://10.0.0.5:9000' })
    })

    it('returns null for non-http values', () => {
        expect(parseRemoteConnectString('ws://desktop.local:8123/')).toBeNull()
        expect(parseRemoteConnectString('http://desktop.local:8123/#legacy-token')).toBeNull()
        expect(parseRemoteConnectString('not a url')).toBeNull()
    })

    it('derives a same-origin endpoint without a URL fragment', () => {
        expect(deriveAutoConnectSettings('desktop.local:8123', 'http:'))
            .toEqual({ endpoint: 'ws://desktop.local:8123' })
        expect(deriveAutoConnectSettings('desktop.local:8123', 'https:'))
            .toEqual({ endpoint: 'wss://desktop.local:8123' })
    })

    it('returns null when there is no host', () => {
        expect(deriveAutoConnectSettings('', 'http:')).toBeNull()
    })
})
