import { useContext } from 'react'
import { useDialogError } from '../components/hooks/use_dialog_error'
import { AppThemeContext, type AppThemeContextValue } from './theme_context'
import {
    DEFAULT_COLOR_SCHEME,
    DEFAULT_MARKDOWN_STYLE_PRESET,
    MARKDOWN_STYLE_PRESETS,
} from './theme_config'
import { buildMarkdownContentSx } from '../components/editor/markdown_style_sx'

const ignoreThemeChange = () => undefined
const FALLBACK_APP_THEME: AppThemeContextValue = {
    colorScheme: DEFAULT_COLOR_SCHEME,
    markdownStyle: DEFAULT_MARKDOWN_STYLE_PRESET,
    markdownStyleConfig: MARKDOWN_STYLE_PRESETS[DEFAULT_MARKDOWN_STYLE_PRESET],
    markdownContentSx: buildMarkdownContentSx(MARKDOWN_STYLE_PRESETS[DEFAULT_MARKDOWN_STYLE_PRESET]),
    mode: 'light',
    setColorScheme: ignoreThemeChange,
    setCustomMarkdownStyle: ignoreThemeChange,
    setMarkdownStyle: ignoreThemeChange,
    toggleMode: ignoreThemeChange,
}

/** Access the global theme service with a safe fallback outside its provider. */
export function useAppTheme(): AppThemeContextValue {
    const value = useContext(AppThemeContext)
    const error = value === null ? new Error('useAppTheme must be used within an AppThemeProvider') : null
    useDialogError(error, 'Application theme is unavailable')

    return value ?? FALLBACK_APP_THEME
}
