import { AppBar, IconButton, Toolbar, Tooltip, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import Cog from 'mdi-material-ui/Cog'
import Menu from 'mdi-material-ui/Menu'

interface MainToolbarProps {
    action: ReactNode
    isMobile: boolean
    onOpenConfig: () => void
    onOpenMenu: () => void
}

/** Top application toolbar; collapses its left-panel access into a hamburger button on mobile. */
export function MainToolbar(props: MainToolbarProps) {
    const { action, isMobile, onOpenConfig, onOpenMenu } = props

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
                <Tooltip title="Config">
                    <IconButton aria-label="Open config" onClick={onOpenConfig}>
                        <Cog />
                    </IconButton>
                </Tooltip>
                {action}
            </Toolbar>
        </AppBar>
    )
}
