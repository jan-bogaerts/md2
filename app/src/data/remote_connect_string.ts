import type { RemoteControlConnectionSettings } from './remote_control_connection'

/**
 * Stable connect URL shared via copy/QR. Parsing lets the web connect dialog accept the same URL.
 */
export function buildRemoteConnectUrl(host: string, port: number): string {
    return `http://${host}:${port}/`
}

/** Derives the shareable connect URL from a `ws(s)://host:port` endpoint. */
export function connectUrlFromEndpoint(endpoint: string): string | null {
    let url: URL
    try {
        url = new URL(endpoint)
    } catch {
        return null
    }

    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return null
    const scheme = url.protocol === 'wss:' ? 'https' : 'http'

    return `${scheme}://${url.host}/`
}

/**
 * Auto-connect settings for the Electron-served web app. Plain HTTP yields same-origin `ws://`.
 */
export function deriveAutoConnectSettings(host: string, protocol: string): RemoteControlConnectionSettings | null {
    if (!host) return null

    const scheme = protocol === 'https:' ? 'wss' : 'ws'

    return { endpoint: `${scheme}://${host}` }
}

/** Turns an HTTP connect URL back into a WebSocket endpoint, or null when input is not one. */
export function parseRemoteConnectString(value: string): RemoteControlConnectionSettings | null {
    const trimmed = value.trim()
    let url: URL
    try {
        url = new URL(trimmed)
    } catch {
        return null
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.host || url.hash.length > 0) return null

    const scheme = url.protocol === 'https:' ? 'wss' : 'ws'

    return { endpoint: `${scheme}://${url.host}` }
}
