import { AppBar, Box, IconButton, Toolbar, Tooltip, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import Cog from 'mdi-material-ui/Cog'
import Menu from 'mdi-material-ui/Menu'
import { DRAG_REGION, NO_DRAG_REGION } from './drag_region'

interface MainToolbarProps {
    action: ReactNode
    isMobile: boolean
    onOpenConfig: () => void
    onOpenMenu: () => void
    search: ReactNode
}

/**
 * Top application toolbar; collapses its left-panel access into a hamburger button on mobile.
 * The bar itself is a draggable region for the borderless desktop window, while all interactive
 * controls (menu, search, config, action) opt out of dragging.
 */
export function MainToolbar(props: MainToolbarProps) {
    const { action, isMobile, onOpenConfig, onOpenMenu, search } = props

    return (
        <AppBar color="default" elevation={1} position="static">
            <Toolbar style={DRAG_REGION} variant="dense">
                {isMobile ? (
                    <IconButton aria-label="Open menu" edge="start" onClick={onOpenMenu} style={NO_DRAG_REGION} sx={{ mr: 1 }}>
                        <Menu />
                    </IconButton>
                ) : null}
                <Typography component="h1" sx={{ mr: 2 }} variant="h6">
                    MD2
                </Typography>
                <Box style={NO_DRAG_REGION} sx={{ display: 'flex', flexGrow: 1, justifyContent: 'center', mr: 2 }}>
                    {search}
                </Box>
                <Box style={NO_DRAG_REGION} sx={{ alignItems: 'center', display: 'flex' }}>
                    <Tooltip title="Config">
                        <IconButton aria-label="Open config" onClick={onOpenConfig}>
                            <Cog />
                        </IconButton>
                    </Tooltip>
                    {action}
                </Box>
            </Toolbar>
        </AppBar>
    )
}
