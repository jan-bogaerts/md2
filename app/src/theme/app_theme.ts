import { createTheme, type PaletteMode, type Theme } from '@mui/material'
import { DEFAULT_COLOR_SCHEME, type ColorSchemeConfig } from './theme_config'

/** Corner radius applied theme-wide so every surface reads as round-cornered. */
const APP_BORDER_RADIUS = 12

/**
 * Build the full MUI theme for the given palette mode and color scheme.
 *
 * Applies the app design language: a flat look (no elevation/shadows), round
 * corners, and no borders by default — buttons reveal a border on hover and
 * inputs reveal an underline on hover/focus. Components read colors, spacing,
 * fonts and radii from this theme and never branch on the color mode.
 */
export function createAppTheme(mode: PaletteMode, colorScheme: ColorSchemeConfig = DEFAULT_COLOR_SCHEME): Theme {
    return createTheme({
        palette: {
            mode,
            primary: {
                light: colorScheme.primary.light,
                main: colorScheme.primary.regular,
                dark: colorScheme.primary.dark,
            },
            secondary: {
                light: colorScheme.secondary.light,
                main: colorScheme.secondary.regular,
                dark: colorScheme.secondary.dark,
            },
        },
        shape: { borderRadius: APP_BORDER_RADIUS },
        components: {
            MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
            MuiAppBar: { defaultProps: { elevation: 0 } },
            MuiButton: {
                defaultProps: { disableElevation: true },
                styleOverrides: {
                    root: {
                        border: '1px solid transparent',
                        '&:hover': { borderColor: 'currentColor' },
                    },
                },
            },
            MuiTextField: { defaultProps: { variant: 'standard' } },
            MuiInput: {
                styleOverrides: {
                    root: {
                        '&:before': { borderBottom: '1px solid transparent' },
                        '&:hover:not(.Mui-disabled, .Mui-error):before': { borderBottomColor: 'currentColor' },
                    },
                },
            },
        },
    })
}
