export type ElectronCloseReason = 'app-quit' | 'window-close'

export interface ElectronFlushRequest {
    reason: ElectronCloseReason
    requestId: string
}

export interface ElectronFlushResult {
    requestId: string
    success: boolean
}

export interface ElectronLifecycleBridge {
    onFlushRequested(callback: (request: ElectronFlushRequest) => void): () => void
    reportFlushResult(result: ElectronFlushResult): void
}

declare global {
    interface Window {
        md2Lifecycle?: ElectronLifecycleBridge
    }
}

export function getElectronLifecycleBridge() {
    return window.md2Lifecycle ?? null
}


export const isElectron = () => {
    return window.md2Lifecycle ?? null
}
