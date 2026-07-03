import { createTheme, type PaletteMode, type Theme } from '@mui/material'

/**
 * Build the MUI theme for the given palette mode. Kept intentionally minimal;
 * the full theme/design is detailed in a separate feature.
 */
export function createAppTheme(mode: PaletteMode): Theme {
    return createTheme({ palette: { mode } })
}
