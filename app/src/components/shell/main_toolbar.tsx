import { AppBar, Box, IconButton, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import Menu from 'mdi-material-ui/Menu'
import { DRAG_REGION, NO_DRAG_REGION } from './drag_region'
import { ThemeToggleButton } from './theme_toggle_button'

const MENU_ROW_HEIGHT = 44
const SEARCH_WIDTH = 286

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
        <AppBar
            color="default"
            elevation={0}
            position="static"
            sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
        >
            <Toolbar
                disableGutters
                style={DRAG_REGION}
                sx={{ gap: 0.5, height: MENU_ROW_HEIGHT, minHeight: `${MENU_ROW_HEIGHT}px !important`, px: 1.5 }}
                variant="dense"
            >
                {isMobile ? (
                    <IconButton aria-label="Open menu" edge="start" onClick={onOpenMenu} style={NO_DRAG_REGION} sx={{ mr: 1 }}>
                        <Menu />
                    </IconButton>
                ) : null}
                <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 1, mr: 1.5 }}>
                    <Box
                        sx={{
                            bgcolor: 'primary.main',
                            borderRadius: 0.75,
                            color: 'primary.contrastText',
                            display: 'grid',
                            fontSize: 11,
                            fontWeight: 700,
                            height: 24,
                            placeItems: 'center',
                            width: 24,
                        }}
                    >
                        M²
                    </Box>
                    <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 14, fontWeight: 600 }}>
                        MD²
                    </Typography>
                </Box>
                <Box style={NO_DRAG_REGION} sx={{ alignSelf: 'stretch', display: 'flex', flexShrink: 0 }}>
                    {tabs}
                </Box>
                <Box sx={{ flex: 1, minWidth: 16 }} />
                <Box style={NO_DRAG_REGION}>
                    <ThemeToggleButton />
                </Box>
                <Box
                    style={NO_DRAG_REGION}
                    sx={{ display: 'flex', flex: isMobile ? 1 : `0 0 ${SEARCH_WIDTH}px`, ml: 0.5, minWidth: 180 }}
                >
                    {search}
                </Box>
            </Toolbar>
            <Box style={NO_DRAG_REGION}>
                {panel}
            </Box>
        </AppBar>
    )
}
