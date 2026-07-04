import { AppBar, IconButton, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import Menu from 'mdi-material-ui/Menu'

interface MainToolbarProps {
    action: ReactNode
    isMobile: boolean
    onOpenMenu: () => void
}

/** Top application toolbar; collapses its left-panel access into a hamburger button on mobile. */
export function MainToolbar(props: MainToolbarProps) {
    const { action, isMobile, onOpenMenu } = props

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
                {action}
            </Toolbar>
        </AppBar>
    )
}
