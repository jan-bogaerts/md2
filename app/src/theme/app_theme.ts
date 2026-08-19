import { createTheme, type PaletteMode, type Theme } from '@mui/material'
import { DEFAULT_COLOR_SCHEME, type ColorSchemeConfig } from './theme_config'
import type { ProjectBackgroundShade } from './project_background_shade'

const APP_BORDER_RADIUS = 8

const LIGHT_PROJECT_BACKGROUNDS: Record<ProjectBackgroundShade, { default: string; paper: string }> = {
    amber: { default: '#faf7ef', paper: '#fffefa' },
    blue: { default: '#f1f5fa', paper: '#fbfdff' },
    green: { default: '#f1f7f3', paper: '#fbfefc' },
    neutral: { default: '#f4f6f8', paper: '#ffffff' },
    purple: { default: '#f7f3fa', paper: '#fefcff' },
    red: { default: '#faf3f3', paper: '#fffdfd' },
}

const DARK_PROJECT_BACKGROUNDS: Record<ProjectBackgroundShade, { default: string; paper: string }> = {
    amber: { default: '#1b1812', paper: '#242016' },
    blue: { default: '#101821', paper: '#19232e' },
    green: { default: '#111a17', paper: '#1a2521' },
    neutral: { default: '#10151c', paper: '#1a212b' },
    purple: { default: '#19151d', paper: '#231d29' },
    red: { default: '#1b1416', paper: '#261d20' },
}

const LIGHT_PALETTE = {
    divider: '#e3e8ef',
    text: { disabled: '#9aa4b2', primary: '#1c2536', secondary: '#4b5565' },
}

const DARK_PALETTE = {
    divider: '#2a3441',
    text: { disabled: '#697586', primary: '#e6eaf0', secondary: '#9aa4b2' },
}

function paletteForMode(mode: PaletteMode, colorScheme: ColorSchemeConfig, backgroundShade: ProjectBackgroundShade) {
    const isDark = mode === 'dark'
    const modePalette = isDark ? DARK_PALETTE : LIGHT_PALETTE
    const background = isDark ? DARK_PROJECT_BACKGROUNDS[backgroundShade] : LIGHT_PROJECT_BACKGROUNDS[backgroundShade]
    const track = isDark ? '#151c25' : '#eceff3'
    const primaryBackground = isDark ? '#202a36' : '#f0f3f7'

    return {
        ...modePalette,
        background,
        action: {
            hover: track,
            selected: primaryBackground,
        },
        custom: {
            borderHover: modePalette.text.disabled,
            borderStrong: modePalette.divider,
            chartPalette: isDark
                ? ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#f7768e', '#73daca', '#c0caf5']
                : ['#3366cc', '#2e8b57', '#d97706', '#7c3aed', '#0284c7', '#dc2626', '#0f766e', '#64748b'],
            colHead: modePalette.text.secondary,
            primaryBg: primaryBackground,
            text3: modePalette.text.secondary,
            text4: modePalette.text.disabled,
            track,
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
export function createAppTheme(
    mode: PaletteMode,
    colorScheme: ColorSchemeConfig = DEFAULT_COLOR_SCHEME,
    backgroundShade: ProjectBackgroundShade = 'neutral',
): Theme {
    const isDark = mode === 'dark'

    return createTheme({
        palette: paletteForMode(mode, colorScheme, backgroundShade),
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
            MuiMenuItem: { defaultProps: { dense: true } },
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
