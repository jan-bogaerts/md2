export const REMOTE_CONTROL_ENDPOINT_KEY = 'md2.remoteControl.endpoint'
export const REMOTE_CONTROL_TOKEN_KEY = 'md2.remoteControl.token'

export interface RemoteControlConnectionSettings {
    endpoint: string
    token: string
}

export function configureRemoteControlConnection(settings: RemoteControlConnectionSettings) {
    window.localStorage.setItem(REMOTE_CONTROL_ENDPOINT_KEY, settings.endpoint)
    window.localStorage.setItem(REMOTE_CONTROL_TOKEN_KEY, settings.token)
}

export function readRemoteControlConnection(): RemoteControlConnectionSettings {
    const endpoint = window.localStorage.getItem(REMOTE_CONTROL_ENDPOINT_KEY)
    const token = window.localStorage.getItem(REMOTE_CONTROL_TOKEN_KEY)
    if (!endpoint) throw new Error('Missing remote-control endpoint')
    if (!token) throw new Error('Missing remote-control token')

    return { endpoint, token }
}
