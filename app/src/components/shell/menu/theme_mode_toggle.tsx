import { ToggleButton, Tooltip } from '@mui/material'
import WeatherNight from 'mdi-material-ui/WeatherNight'
import WeatherSunny from 'mdi-material-ui/WeatherSunny'
import { useAppTheme } from '../../../theme/use_app_theme'

/** Toggle button for the global light/dark palette mode. */
export function ThemeModeToggle() {
    const { mode, toggleMode } = useAppTheme()
    const label = mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

    return (
        <Tooltip title={label}>
            <ToggleButton aria-label={label} onChange={toggleMode} selected={mode === 'dark'} size="small" value="dark-mode">
                {mode === 'light' ? <WeatherNight fontSize="small" /> : <WeatherSunny fontSize="small" />}
            </ToggleButton>
        </Tooltip>
    )
}
