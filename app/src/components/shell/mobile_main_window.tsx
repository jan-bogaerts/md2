import { Box, Divider, Drawer, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { GithubAuthToolbarButton } from './github_auth_toolbar_button'
import { ThemeModeToggle } from './menu/theme_mode_toggle'

const MOBILE_DRAWER_WIDTH = 300

interface MobileMainWindowProps {
    auth: UseGithubAuthResult
    isMenuOpen: boolean
    leftPanel: ReactNode
    onCloseMenu: () => void
    rightPanel: ReactNode
    shouldShowNavigationPanel: boolean
}

/** Mobile window layout with navigation drawer and workspace content. */
export function MobileMainWindow(props: MobileMainWindowProps) {
    const { auth, isMenuOpen, leftPanel, onCloseMenu, rightPanel, shouldShowNavigationPanel } = props

    return (
        <>
            <Drawer onClose={onCloseMenu} open={isMenuOpen}>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: MOBILE_DRAWER_WIDTH }}>
                    <Box sx={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', p: 1.5 }}>
                        <Typography sx={{ fontWeight: 600 }} variant="body2">Theme</Typography>
                        <ThemeModeToggle />
                    </Box>
                    {shouldShowNavigationPanel ? (
                        <>
                            <Divider />
                            <Box sx={{ flex: 1, overflow: 'auto' }}>{leftPanel}</Box>
                        </>
                    ) : <Box sx={{ flex: 1 }} />}
                    <Divider />
                    <Box component="footer" sx={{ display: 'flex', justifyContent: 'flex-end', p: 1.5 }}>
                        <GithubAuthToolbarButton auth={auth} />
                    </Box>
                </Box>
            </Drawer>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{rightPanel}</Box>
        </>
    )
}
