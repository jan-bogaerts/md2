import { IconButton, Stack, Tooltip } from '@mui/material'
import Palette from 'mdi-material-ui/Palette'
import { useState } from 'react'
import { ThemeSettingsDialog } from './theme_settings_dialog'
import { ThemeToggleButton } from './theme_toggle_button'

/** Toolbar cluster: light/dark toggle plus the theme settings dialog trigger. */
export function ThemeControls() {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false)
    const [openCount, setOpenCount] = useState(0)

    const handleOpenSettings = () => {
        setOpenCount((current) => current + 1)
        setIsSettingsOpen(true)
    }

    const handleCloseSettings = () => {
        setIsSettingsOpen(false)
    }

    return (
        <Stack direction="row" sx={{ alignItems: 'center' }}>
            <ThemeToggleButton />
            <Tooltip title="Theme settings">
                <IconButton aria-label="Theme settings" onClick={handleOpenSettings}>
                    <Palette />
                </IconButton>
            </Tooltip>
            <ThemeSettingsDialog key={openCount} onClose={handleCloseSettings} open={isSettingsOpen} />
        </Stack>
    )
}
