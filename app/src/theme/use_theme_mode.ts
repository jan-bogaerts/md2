import { useCallback, useState } from 'react'
import type { PaletteMode } from '@mui/material'

export const THEME_MODE_STORAGE_KEY = 'md2.themeMode'

interface UseThemeModeResult {
    mode: PaletteMode
    toggleMode: () => void
}

function isPaletteMode(value: string | null): value is PaletteMode {
    return value === 'light' || value === 'dark'
}

/** Resolve the initial palette mode from storage, falling back to the OS preference. */
function readInitialMode(): PaletteMode {
    const storedMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY)
    if (isPaletteMode(storedMode)) return storedMode

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
}

/** Manage the light/dark palette mode and persist the user's choice across restarts. */
export function useThemeMode(): UseThemeModeResult {
    const [mode, setMode] = useState<PaletteMode>(readInitialMode)

    const toggleMode = useCallback(() => {
        setMode((currentMode) => {
            const nextMode: PaletteMode = currentMode === 'light' ? 'dark' : 'light'
            window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode)
            return nextMode
        })
    }, [])

    return { mode, toggleMode }
}
