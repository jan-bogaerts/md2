export interface RemoteControlStatus {
    active: boolean
    clientCount: number
    endpoint: string | null
    hostnameEndpoint?: string | null
    ipEndpoints?: string[]
}

export interface ElectronRemoteControlBridge {
    getStatus(): Promise<RemoteControlStatus>
    onStatusChange(callback: (status: RemoteControlStatus) => void): () => void
    start(): Promise<RemoteControlStatus>
    stop(): Promise<RemoteControlStatus>
}

declare global {
    interface Window {
        md2RemoteControl?: ElectronRemoteControlBridge
    }
}

export function getElectronRemoteControlBridge() {
    return window.md2RemoteControl ?? null
}
