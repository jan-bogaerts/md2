import { describe, expect, it } from 'vitest'
import { buildRemoteConnectUrl, deriveAutoConnectSettings, parseRemoteConnectString } from './remote_connect_string'

describe('remote connect string', () => {
    it('round-trips build then parse into endpoint + token', () => {
        const url = buildRemoteConnectUrl('desktop.local', 8123, 'abc123')

        expect(url).toBe('http://desktop.local:8123/#abc123')
        expect(parseRemoteConnectString(url)).toEqual({ endpoint: 'ws://desktop.local:8123', token: 'abc123' })
    })

    it('maps https connect strings to wss and tolerates surrounding whitespace', () => {
        expect(parseRemoteConnectString('  https://10.0.0.5:9000/#tok  ')).toEqual({ endpoint: 'wss://10.0.0.5:9000', token: 'tok' })
    })

    it('returns null for strings without a token fragment or non-http scheme', () => {
        expect(parseRemoteConnectString('http://desktop.local:8123/')).toBeNull()
        expect(parseRemoteConnectString('ws://desktop.local:8123/#tok')).toBeNull()
        expect(parseRemoteConnectString('not a url')).toBeNull()
    })

    it('derives a same-origin ws endpoint from a token fragment', () => {
        expect(deriveAutoConnectSettings('desktop.local:8123', '#abc123', 'http:'))
            .toEqual({ endpoint: 'ws://desktop.local:8123', token: 'abc123' })
        expect(deriveAutoConnectSettings('desktop.local:8123', '#abc123', 'https:'))
            .toEqual({ endpoint: 'wss://desktop.local:8123', token: 'abc123' })
    })

    it('returns null when there is no token fragment or host', () => {
        expect(deriveAutoConnectSettings('desktop.local:8123', '', 'http:')).toBeNull()
        expect(deriveAutoConnectSettings('desktop.local:8123', '#', 'http:')).toBeNull()
        expect(deriveAutoConnectSettings('', '#abc123', 'http:')).toBeNull()
    })
})
