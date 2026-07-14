import type { RemoteControlConnectionSettings } from './remote_control_connection'

/**
 * Self-contained connect string shared via copy/QR: the Electron-served page URL with the token in
 * the fragment (`http://<host>:<port>/#<token>`, see F-043 / F-045). Building it here mirrors the
 * desktop `buildConnectUrl`; parsing lets the web connect dialog fill endpoint + token in one paste.
 */
export function buildRemoteConnectUrl(host: string, port: number, token: string): string {
    return `http://${host}:${port}/#${token}`
}

/** Derives the shareable connect URL from a `ws(s)://host:port` endpoint plus its token. */
export function connectUrlFromEndpoint(endpoint: string, token: string): string | null {
    let url: URL
    try {
        url = new URL(endpoint)
    } catch {
        return null
    }

    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null
    const scheme = url.protocol === 'wss:' ? 'https' : 'http'

    return `${scheme}://${url.host}/#${token}`
}

/**
 * Auto-connect settings for the Electron-served web app: when the page loaded with a `#<token>`
 * fragment, derive a same-origin WebSocket endpoint from `window.location` (F-045). Plain-http page
 * yields `ws://`, matching the non-secure context that permits it.
 */
export function deriveAutoConnectSettings(host: string, hash: string, protocol: string): RemoteControlConnectionSettings | null {
    const token = hash.startsWith('#') ? hash.slice(1) : ''
    if (!token || !host) return null

    const scheme = protocol === 'https:' ? 'wss' : 'ws'

    return { endpoint: `${scheme}://${host}`, token }
}

/** Turns a connect URL back into a WebSocket endpoint + token, or null when the input is not one. */
export function parseRemoteConnectString(value: string): RemoteControlConnectionSettings | null {
    const trimmed = value.trim()
    let url: URL
    try {
        url = new URL(trimmed)
    } catch {
        return null
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const token = url.hash.startsWith('#') ? url.hash.slice(1) : ''
    if (!token || !url.host) return null

    const scheme = url.protocol === 'https:' ? 'wss' : 'ws'

    return { endpoint: `${scheme}://${url.host}`, token }
}
