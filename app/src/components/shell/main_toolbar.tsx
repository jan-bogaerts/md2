import { AppBar, Box, IconButton, Toolbar } from '@mui/material'
import type { ReactNode } from 'react'
import Menu from 'mdi-material-ui/Menu'
import { DRAG_REGION, NO_DRAG_REGION } from './drag_region'

interface MainToolbarProps {
    isMobile: boolean
    onOpenMenu: () => void
    panel: ReactNode
    search: ReactNode
    tabs: ReactNode
}

/**
 * Top application toolbar; hosts menu tabs, search, and the desktop drag region.
 * Interactive controls opt out of dragging so the remaining row space can move the window.
 */
export function MainToolbar(props: MainToolbarProps) {
    const { isMobile, onOpenMenu, panel, search, tabs } = props

    return (
        <AppBar color="default" elevation={1} position="static">
            <Toolbar disableGutters style={DRAG_REGION} sx={{ minHeight: 40, px: 1 }} variant="dense">
                {isMobile ? (
                    <IconButton aria-label="Open menu" edge="start" onClick={onOpenMenu} style={NO_DRAG_REGION} sx={{ mr: 1 }}>
                        <Menu />
                    </IconButton>
                ) : null}
                <Box style={NO_DRAG_REGION} sx={{ alignSelf: 'stretch', display: 'flex', flexShrink: 0 }}>
                    {tabs}
                </Box>
                <Box style={NO_DRAG_REGION} sx={{ display: 'flex', flex: isMobile ? 1 : '0 0 420px', ml: 2, minWidth: 180 }}>
                    {search}
                </Box>
                <Box sx={{ flex: 1, minWidth: 40 }} />
            </Toolbar>
            <Box style={NO_DRAG_REGION}>
                {panel}
            </Box>
        </AppBar>
    )
}
