import { createContext } from 'react'
import type { PaletteMode } from '@mui/material'
import type { ColorSchemeConfig, MarkdownStyleConfig, MarkdownStylePresetName } from './theme_config'

/** Everything the global theme service exposes to components through context. */
export interface AppThemeContextValue {
    mode: PaletteMode
    colorScheme: ColorSchemeConfig
    markdownStyle: MarkdownStylePresetName
    markdownStyleConfig: MarkdownStyleConfig
    toggleMode: () => void
    setColorScheme: (colorScheme: ColorSchemeConfig) => void
    setMarkdownStyle: (preset: MarkdownStylePresetName) => void
}

/** Null default forces consumers to render inside AppThemeProvider. */
export const AppThemeContext = createContext<AppThemeContextValue | null>(null)
