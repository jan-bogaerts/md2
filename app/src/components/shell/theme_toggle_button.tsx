import { IconButton, Tooltip } from '@mui/material'
import WeatherNight from 'mdi-material-ui/WeatherNight'
import WeatherSunny from 'mdi-material-ui/WeatherSunny'
import { useAppTheme } from '../../theme/use_app_theme'

/** Toolbar button that toggles the palette mode through the global theme service. */
export function ThemeToggleButton() {
    const { mode, toggleMode } = useAppTheme()
    const themeLabel = mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

    return (
        <Tooltip title={themeLabel}>
            <IconButton aria-label={themeLabel} edge="end" onClick={toggleMode}>
                {mode === 'light' ? <WeatherNight /> : <WeatherSunny />}
            </IconButton>
        </Tooltip>
    )
}
