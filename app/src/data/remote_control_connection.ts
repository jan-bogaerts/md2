export const REMOTE_CONTROL_ENDPOINT_KEY = 'md2.remoteControl.endpoint'

export interface RemoteControlConnectionSettings {
    endpoint: string
}

export function configureRemoteControlConnection(settings: RemoteControlConnectionSettings) {
    window.localStorage.setItem(REMOTE_CONTROL_ENDPOINT_KEY, settings.endpoint)
}

export function tryReadRemoteControlConnection(): RemoteControlConnectionSettings | null {
    const endpoint = window.localStorage.getItem(REMOTE_CONTROL_ENDPOINT_KEY)
    if (!endpoint) return null

    return { endpoint }
}

export function readRemoteControlConnection(): RemoteControlConnectionSettings {
    const endpoint = window.localStorage.getItem(REMOTE_CONTROL_ENDPOINT_KEY)
    if (!endpoint) throw new Error('Missing remote-control endpoint')

    return { endpoint }
}
