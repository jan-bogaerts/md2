import { useCallback, useMemo, useState } from 'react'
import type { PaletteMode } from '@mui/material'
import { applicationStorage } from '../services/storage/application_storage'
import {
    DEFAULT_COLOR_SCHEME,
    DEFAULT_MARKDOWN_STYLE_PRESET,
    MARKDOWN_STYLE_PRESETS,
    cloneMarkdownStyleConfig,
    isColorSchemeConfig,
    isMarkdownStyleConfig,
    isMarkdownStyleName,
    type ColorSchemeConfig,
    type MarkdownStyleConfig,
    type MarkdownStyleName,
    type MarkdownStylePresetName,
} from './theme_config'

export const THEME_MODE_STORAGE_KEY = 'md2.themeMode'
export const COLOR_SCHEME_STORAGE_KEY = 'md2.colorScheme'
export const MARKDOWN_STYLE_STORAGE_KEY = 'md2.markdownStyle'
export const CUSTOM_MARKDOWN_STYLE_STORAGE_KEY = 'md2.customMarkdownStyle'

/** The full set of persisted theme settings plus their mutators. */
export interface UseThemeSettingsResult {
    mode: PaletteMode
    colorScheme: ColorSchemeConfig
    markdownStyle: MarkdownStyleName
    markdownStyleConfig: MarkdownStyleConfig
    toggleMode: () => void
    setColorScheme: (colorScheme: ColorSchemeConfig) => void
    setMarkdownStyle: (preset: MarkdownStylePresetName) => void
    setCustomMarkdownStyle: (markdownStyleConfig: MarkdownStyleConfig) => void
}

function isPaletteMode(value: string | null): value is PaletteMode {
    return value === 'light' || value === 'dark'
}

/** Resolve the initial palette mode from storage, falling back to the OS preference. */
function readInitialMode(): PaletteMode {
    const storedMode = applicationStorage.getItem(THEME_MODE_STORAGE_KEY)
    if (isPaletteMode(storedMode)) return storedMode

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
}

/** Resolve the initial color scheme from storage, falling back to the default scheme. */
function readInitialColorScheme(): ColorSchemeConfig {
    const stored = applicationStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (stored === null) return DEFAULT_COLOR_SCHEME

    try {
        const parsed = JSON.parse(stored)
        if (isColorSchemeConfig(parsed)) return parsed
    } catch {
        return DEFAULT_COLOR_SCHEME
    }

    return DEFAULT_COLOR_SCHEME
}

interface InitialMarkdownStyle {
    config: MarkdownStyleConfig
    name: MarkdownStyleName
}

function readCustomMarkdownStyle(): MarkdownStyleConfig | null {
    const stored = applicationStorage.getItem(CUSTOM_MARKDOWN_STYLE_STORAGE_KEY)
    if (stored === null) return null

    try {
        const parsed = JSON.parse(stored)
        return isMarkdownStyleConfig(parsed) ? parsed : null
    } catch {
        return null
    }
}

/** Resolve the initial markdown style from storage, falling back to the default preset. */
function readInitialMarkdownStyle(): InitialMarkdownStyle {
    const stored = applicationStorage.getItem(MARKDOWN_STYLE_STORAGE_KEY)
    if (isMarkdownStyleName(stored)) {
        if (stored !== 'custom') return { config: MARKDOWN_STYLE_PRESETS[stored], name: stored }

        const customConfig = readCustomMarkdownStyle()
        if (customConfig) return { config: customConfig, name: stored }
    }

    return { config: MARKDOWN_STYLE_PRESETS[DEFAULT_MARKDOWN_STYLE_PRESET], name: DEFAULT_MARKDOWN_STYLE_PRESET }
}

/**
 * Manage the persisted theme settings — palette mode, color scheme and markdown
 * style selection — mirroring each change into localStorage so choices survive
 * restarts. This is the single source of truth consumed by the theme provider.
 */
export function useThemeSettings(): UseThemeSettingsResult {
    const [mode, setMode] = useState<PaletteMode>(readInitialMode)
    const [colorScheme, setColorSchemeState] = useState<ColorSchemeConfig>(readInitialColorScheme)
    const [initialMarkdownStyle] = useState<InitialMarkdownStyle>(readInitialMarkdownStyle)
    const [markdownStyle, setMarkdownStyleState] = useState<MarkdownStyleName>(initialMarkdownStyle.name)
    const [markdownStyleConfig, setMarkdownStyleConfig] = useState<MarkdownStyleConfig>(initialMarkdownStyle.config)

    const toggleMode = useCallback(() => {
        setMode((currentMode) => {
            const nextMode: PaletteMode = currentMode === 'light' ? 'dark' : 'light'
            applicationStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode)
            return nextMode
        })
    }, [])

    const setColorScheme = useCallback((nextColorScheme: ColorSchemeConfig) => {
        applicationStorage.setItem(COLOR_SCHEME_STORAGE_KEY, JSON.stringify(nextColorScheme))
        setColorSchemeState(nextColorScheme)
    }, [])

    const setMarkdownStyle = useCallback((preset: MarkdownStylePresetName) => {
        applicationStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, preset)
        setMarkdownStyleState(preset)
        setMarkdownStyleConfig(MARKDOWN_STYLE_PRESETS[preset])
    }, [])

    const setCustomMarkdownStyle = useCallback((nextMarkdownStyleConfig: MarkdownStyleConfig) => {
        const config = cloneMarkdownStyleConfig(nextMarkdownStyleConfig)
        applicationStorage.setItem(MARKDOWN_STYLE_STORAGE_KEY, 'custom')
        applicationStorage.setItem(CUSTOM_MARKDOWN_STYLE_STORAGE_KEY, JSON.stringify(config))
        setMarkdownStyleState('custom')
        setMarkdownStyleConfig(config)
    }, [])

    return useMemo(
        () => ({
            mode,
            colorScheme,
            markdownStyle,
            markdownStyleConfig,
            toggleMode,
            setColorScheme,
            setMarkdownStyle,
            setCustomMarkdownStyle,
        }),
        [
            mode,
            colorScheme,
            markdownStyle,
            markdownStyleConfig,
            toggleMode,
            setColorScheme,
            setMarkdownStyle,
            setCustomMarkdownStyle,
        ],
    )
}
