export interface ElectronClipboardBridge {
    onCopyAsTextRequested(callback: () => void): () => void
}

declare global {
    interface Window {
        md2Clipboard?: ElectronClipboardBridge
    }
}

export function getElectronClipboardBridge() {
    return window.md2Clipboard ?? null
}
