export interface UpdateInfo {
    downloadUrl: string
    version: string
}

export interface DownloadProgress {
    received: number
    total: number
}

export interface ElectronUpdateBridge {
    downloadUpdate(downloadUrl: string): Promise<void>
    onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void
    onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void
}

declare global {
    interface Window {
        md2Updates?: ElectronUpdateBridge
    }
}

export function getElectronUpdateBridge() {
    return window.md2Updates ?? null
}
