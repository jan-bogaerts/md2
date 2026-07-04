import { IconButton, Tooltip } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import WeatherNight from 'mdi-material-ui/WeatherNight'
import WeatherSunny from 'mdi-material-ui/WeatherSunny'

interface ThemeToggleButtonProps {
    onToggleTheme: () => void
}

export function ThemeToggleButton(props: ThemeToggleButtonProps) {
    const { onToggleTheme } = props
    const theme = useTheme()
    const themeLabel = theme.palette.mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'

    return (
        <Tooltip title={themeLabel}>
            <IconButton aria-label={themeLabel} edge="end" onClick={onToggleTheme}>
                {theme.palette.mode === 'light' ? <WeatherNight /> : <WeatherSunny />}
            </IconButton>
        </Tooltip>
    )
}
