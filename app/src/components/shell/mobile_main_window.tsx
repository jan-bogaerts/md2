import { Box, Divider, Drawer, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { GithubAuthToolbarButton } from './github_auth_toolbar_button'
import { ThemeModeToggle } from './menu/theme_mode_toggle'

const MOBILE_DRAWER_WIDTH = 300

interface MobileMainWindowProps {
    auth: UseGithubAuthResult
    isMenuOpen: boolean
    leftPanel: ReactNode
    onCloseMenu: () => void
    rightPanel: ReactNode
    showNavigationInCards: boolean
}

/** Mobile window layout with navigation drawer and workspace content. */
export function MobileMainWindow(props: MobileMainWindowProps) {
    const { auth, isMenuOpen, leftPanel, onCloseMenu, rightPanel, showNavigationInCards } = props
    const navigationElementRef = useRef<HTMLDivElement>(null)
    const handleNavigationElement = useCallback((element: HTMLDivElement | null) => {
        navigationElementRef.current = element
        if (!element) return

        const isTextView = workspaceViewService.getSnapshot().viewMode === 'text'
        element.style.display = isTextView || showNavigationInCards ? 'flex' : 'none'
    }, [showNavigationInCards])

    useEffect(() => {
        const updateNavigationVisibility = () => {
            const navigationElement = navigationElementRef.current
            if (!navigationElement) return

            const isTextView = workspaceViewService.getSnapshot().viewMode === 'text'
            navigationElement.style.display = isTextView || showNavigationInCards ? 'flex' : 'none'
        }

        updateNavigationVisibility()
        workspaceViewService.addEventListener('changed', updateNavigationVisibility)

        return () => workspaceViewService.removeEventListener('changed', updateNavigationVisibility)
    }, [showNavigationInCards])

    return (
        <>
            <Drawer onClose={onCloseMenu} open={isMenuOpen}>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: MOBILE_DRAWER_WIDTH }}>
                    <Box sx={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', p: 1.5 }}>
                        <Typography sx={{ fontWeight: 600 }} variant="body2">Theme</Typography>
                        <ThemeModeToggle />
                    </Box>
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                        <Box ref={handleNavigationElement} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Divider />
                            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{leftPanel}</Box>
                        </Box>
                    </Box>
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
