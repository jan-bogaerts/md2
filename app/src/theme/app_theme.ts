import { createTheme, type PaletteMode, type Theme } from '@mui/material'
import { DEFAULT_COLOR_SCHEME, type ColorSchemeConfig } from './theme_config'

const APP_BORDER_RADIUS = 8

const LIGHT_PALETTE = {
    background: { default: '#f4f6f8', paper: '#ffffff' },
    divider: '#e3e8ef',
    text: { disabled: '#9aa4b2', primary: '#1c2536', secondary: '#4b5565' },
}

const DARK_PALETTE = {
    background: { default: '#10151c', paper: '#1a212b' },
    divider: '#2a3441',
    text: { disabled: '#697586', primary: '#e6eaf0', secondary: '#9aa4b2' },
}

function paletteForMode(mode: PaletteMode, colorScheme: ColorSchemeConfig) {
    const isDark = mode === 'dark'
    const modePalette = isDark ? DARK_PALETTE : LIGHT_PALETTE

    return {
        ...modePalette,
        action: {
            hover: isDark ? '#151c25' : '#eceff3',
            selected: isDark ? '#202a36' : '#f0f3f7',
        },
        info: { main: isDark ? '#4fc3f7' : '#29a8e0' },
        mode,
        primary: {
            contrastText: isDark ? '#0d1420' : '#ffffff',
            dark: colorScheme.primary.dark,
            light: colorScheme.primary.light,
            main: isDark ? colorScheme.primary.light : colorScheme.primary.regular,
        },
        secondary: {
            dark: colorScheme.secondary.dark,
            light: colorScheme.secondary.light,
            main: isDark ? colorScheme.secondary.light : colorScheme.secondary.regular,
        },
        success: { main: isDark ? '#43a047' : '#2e7d32' },
        warning: { dark: '#ed6c02', main: '#f9a825' },
    }
}

/** Build the complete shared MUI theme for the selected palette mode. */
export function createAppTheme(mode: PaletteMode, colorScheme: ColorSchemeConfig = DEFAULT_COLOR_SCHEME): Theme {
    const isDark = mode === 'dark'

    return createTheme({
        palette: paletteForMode(mode, colorScheme),
        shape: { borderRadius: APP_BORDER_RADIUS },
        typography: {
            button: { fontWeight: 600, textTransform: 'none' },
            fontFamily: 'Inter, "Segoe UI", Roboto, sans-serif',
            fontSize: 13,
        },
        components: {
            MuiAppBar: { defaultProps: { elevation: 0 } },
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: { root: { borderRadius: APP_BORDER_RADIUS } },
            },
            MuiCssBaseline: {
                styleOverrides: {
                    ':root': {
                        '--md2-card-drag-shadow': isDark ? '0 0 0 1px #455263' : '0 12px 24px rgba(16,24,40,0.18)',
                        '--md2-card-hover-shadow': isDark ? 'none' : '0 4px 12px rgba(16,24,40,0.12)',
                        '--md2-card-shadow': isDark ? 'none' : '0 1px 2px rgba(16,24,40,0.05)',
                    },
                },
            },
            MuiIconButton: { styleOverrides: { root: { borderRadius: APP_BORDER_RADIUS } } },
            MuiInput: {
                styleOverrides: {
                    root: {
                        '&:before': { borderBottom: '1px solid transparent' },
                        '&:hover:not(.Mui-disabled, .Mui-error):before': { borderBottomColor: 'currentColor' },
                    },
                },
            },
            MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
            MuiTextField: { defaultProps: { variant: 'standard' } },
            MuiTooltip: { defaultProps: { arrow: true } },
        },
    })
}
