import { AppBar, IconButton, Toolbar, Tooltip, Typography } from '@mui/material'
import type { PaletteMode } from '@mui/material'
import Menu from 'mdi-material-ui/Menu'
import WeatherNight from 'mdi-material-ui/WeatherNight'
import WeatherSunny from 'mdi-material-ui/WeatherSunny'

interface MainToolbarProps {
    isMobile: boolean
    mode: PaletteMode
    onOpenMenu: () => void
    onToggleTheme: () => void
}

/** Top application toolbar; collapses its left-panel access into a hamburger button on mobile. */
export function MainToolbar(props: MainToolbarProps) {
    const { isMobile, mode, onOpenMenu, onToggleTheme } = props
    const themeLabel = mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

    return (
        <AppBar color="default" elevation={1} position="static">
            <Toolbar variant="dense">
                {isMobile ? (
                    <IconButton aria-label="Open menu" edge="start" onClick={onOpenMenu} sx={{ mr: 1 }}>
                        <Menu />
                    </IconButton>
                ) : null}
                <Typography component="h1" sx={{ flexGrow: 1 }} variant="h6">
                    MD2
                </Typography>
                <Tooltip title={themeLabel}>
                    <IconButton aria-label={themeLabel} edge="end" onClick={onToggleTheme}>
                        {mode === 'light' ? <WeatherNight /> : <WeatherSunny />}
                    </IconButton>
                </Tooltip>
            </Toolbar>
        </AppBar>
    )
}
