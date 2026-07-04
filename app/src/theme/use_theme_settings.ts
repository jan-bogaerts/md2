import { useCallback, useMemo, useState } from 'react'
import type { PaletteMode } from '@mui/material'
import {
    DEFAULT_COLOR_SCHEME,
    DEFAULT_MARKDOWN_STYLE_PRESET,
    isColorSchemeConfig,
    isMarkdownStylePresetName,
    type ColorSchemeConfig,
    type MarkdownStylePresetName,
} from './theme_config'

export const THEME_MODE_STORAGE_KEY = 'md2.themeMode'
export const COLOR_SCHEME_STORAGE_KEY = 'md2.colorScheme'
export const MARKDOWN_STYLE_STORAGE_KEY = 'md2.markdownStyle'

/** The full set of persisted theme settings plus their mutators. */
export interface UseThemeSettingsResult {
    mode: PaletteMode
    colorScheme: ColorSchemeConfig
    markdownStyle: MarkdownStylePresetName
    toggleMode: () => void
    setColorScheme: (colorScheme: ColorSchemeConfig) => void
    setMarkdownStyle: (preset: MarkdownStylePresetName) => void
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

/** Resolve the initial color scheme from storage, falling back to the default scheme. */
function readInitialColorScheme(): ColorSchemeConfig {
    const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (stored === null) return DEFAULT_COLOR_SCHEME

    try {
        const parsed = JSON.parse(stored)
        if (isColorSchemeConfig(parsed)) return parsed
    } catch {
        return DEFAULT_COLOR_SCHEME
    }

    return DEFAULT_COLOR_SCHEME
}

/** Resolve the initial markdown style preset from storage, falling back to the default. */
function readInitialMarkdownStyle(): MarkdownStylePresetName {
    const stored = window.localStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)
    return isMarkdownStylePresetName(stored) ? stored : DEFAULT_MARKDOWN_STYLE_PRESET
}

/**
 * Manage the persisted theme settings — palette mode, color scheme and markdown
 * style selection — mirroring each change into localStorage so choices survive
 * restarts. This is the single source of truth consumed by the theme provider.
 */
export function useThemeSettings(): UseThemeSettingsResult {
    const [mode, setMode] = useState<PaletteMode>(readInitialMode)
    const [colorScheme, setColorSchemeState] = useState<ColorSchemeConfig>(readInitialColorScheme)
    const [markdownStyle, setMarkdownStyleState] = useState<MarkdownStylePresetName>(readInitialMarkdownStyle)

    const toggleMode = useCallback(() => {
        setMode((currentMode) => {
            const nextMode: PaletteMode = currentMode === 'light' ? 'dark' : 'light'
            window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode)
            return nextMode
        })
    }, [])

    const setColorScheme = useCallback((nextColorScheme: ColorSchemeConfig) => {
        window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, JSON.stringify(nextColorScheme))
        setColorSchemeState(nextColorScheme)
    }, [])

    const setMarkdownStyle = useCallback((preset: MarkdownStylePresetName) => {
        window.localStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, preset)
        setMarkdownStyleState(preset)
    }, [])

    return useMemo(
        () => ({ mode, colorScheme, markdownStyle, toggleMode, setColorScheme, setMarkdownStyle }),
        [mode, colorScheme, markdownStyle, toggleMode, setColorScheme, setMarkdownStyle],
    )
}
