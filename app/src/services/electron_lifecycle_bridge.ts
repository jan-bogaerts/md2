export interface ElectronLifecycleBridge {
    confirmFlush(requestId: string): void
    onFlushRequested(callback: (requestId: string) => void): () => void
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