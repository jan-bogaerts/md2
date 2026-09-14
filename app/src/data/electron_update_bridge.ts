export type UpdateState = 'idle' | 'available' | 'downloading' | 'launching' | 'error'

export interface UpdateSnapshot {
    error: string | null
    received: number
    state: UpdateState
    total: number | null
    version: string | null
}

export interface ElectronUpdateBridge {
    dismiss(): Promise<void>
    getSnapshot(): Promise<UpdateSnapshot>
    install(): Promise<void>
    onChanged(callback: (snapshot: UpdateSnapshot) => void): () => void
}

declare global {
    interface Window {
        md2Updates?: ElectronUpdateBridge
    }
}

export function getElectronUpdateBridge() {
    return window.md2Updates ?? null
}
