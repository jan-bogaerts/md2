import type { DesktopConfigValues } from './config_service'

export interface ElectronConfigBridge {
    getDesktopConfig(): Partial<DesktopConfigValues>
    setDesktopConfig(values: DesktopConfigValues): void
}

declare global {
    interface Window {
        md2Config?: ElectronConfigBridge
    }
}

export function getElectronConfigBridge() {
    return window.md2Config ?? null
}
