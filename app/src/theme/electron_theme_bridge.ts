import type { PaletteMode } from '@mui/material'

/**
 * Renderer-side view of the Electron theme bridge exposed on `window`. It lets
 * the renderer push the selected palette mode into the main process so the
 * persisted store (read before the window is created) stays in sync.
 */
export interface ElectronThemeBridge {
    setThemeMode(mode: PaletteMode): void
}

declare global {
    interface Window {
        md2Theme?: ElectronThemeBridge
    }
}

export function getElectronThemeBridge(): ElectronThemeBridge | null {
    return window.md2Theme ?? null
}
