export interface ElectronApplicationStateBridge {
    read(key?: string | null): Promise<Record<string, string> | string | null>
    remove(key: string): Promise<void>
    write(key: string, value: string): Promise<string>
}

declare global {
    interface Window {
        md2ApplicationState?: ElectronApplicationStateBridge
    }
}

export function getElectronApplicationStateBridge() {
    return window.md2ApplicationState ?? null
}
