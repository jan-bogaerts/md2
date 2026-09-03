import { Box, Divider, Drawer, Typography } from '@mui/material'
import type { ReactNode, RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { GithubAuthToolbarButton } from './github_auth_toolbar_button'
import { ThemeModeToggle } from './menu/theme_mode_toggle'
import { MobileProjectStatus } from './mobile_project_status'

const MOBILE_DRAWER_WIDTH = 300

interface MobileMainWindowProps {
    auth: UseGithubAuthResult
    cardNavigation: ReactNode | null
    isMenuOpen: boolean
    leftPanel: ReactNode
    onCloseMenu: () => void
    rightPanel: ReactNode
    rightPanelContainerRef: RefObject<HTMLDivElement | null>
    showNavigationInCards: boolean
}

/** Mobile window layout with navigation drawer and workspace content. */
export function MobileMainWindow(props: MobileMainWindowProps) {
    const { auth, cardNavigation, isMenuOpen, leftPanel, onCloseMenu } = props
    const { rightPanel, rightPanelContainerRef, showNavigationInCards } = props
    const cardNavigationElementRef = useRef<HTMLDivElement>(null)
    const navigationElementRef = useRef<HTMLDivElement>(null)
    const updateDrawerVisibility = useCallback(() => {
        const viewMode = workspaceViewService.getSnapshot().viewMode
        const isTextView = viewMode === 'text'
        const isFullWorkspaceView = viewMode === 'diagrams' || viewMode === 'stats'
        if (navigationElementRef.current) {
            navigationElementRef.current.style.display = !isFullWorkspaceView && (isTextView || showNavigationInCards) ? 'flex' : 'none'
        }
        if (cardNavigationElementRef.current) {
            cardNavigationElementRef.current.style.display = !isFullWorkspaceView && !isTextView && !showNavigationInCards ? 'block' : 'none'
        }
    }, [showNavigationInCards])
    const handleNavigationElement = useCallback((element: HTMLDivElement | null) => {
        navigationElementRef.current = element
        updateDrawerVisibility()
    }, [updateDrawerVisibility])
    const handleCardNavigationElement = useCallback((element: HTMLDivElement | null) => {
        cardNavigationElementRef.current = element
        updateDrawerVisibility()
    }, [updateDrawerVisibility])

    useEffect(() => {
        updateDrawerVisibility()
        workspaceViewService.addEventListener('changed', updateDrawerVisibility)

        return () => workspaceViewService.removeEventListener('changed', updateDrawerVisibility)
    }, [updateDrawerVisibility])

    return (
        <>
            <Drawer onClose={onCloseMenu} open={isMenuOpen}>
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: MOBILE_DRAWER_WIDTH }}>
                    <Box sx={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', p: 1.5 }}>
                        <Typography sx={{ fontWeight: 600 }} variant="body2">Theme</Typography>
                        <ThemeModeToggle />
                    </Box>
                    <Box data-testid="mobile-navigation-region" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                        <Box
                            data-testid="mobile-card-navigation-scroll-region"
                            ref={handleCardNavigationElement}
                            sx={{ height: '100%', overflowX: 'hidden', overflowY: 'auto' }}
                        >
                            {cardNavigation}
                        </Box>
                        <Box ref={handleNavigationElement} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Divider />
                            <Box data-testid="mobile-navigation-scroll-region" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{leftPanel}</Box>
                        </Box>
                    </Box>
                    <Divider />
                    <MobileProjectStatus />
                    <Divider />
                    <Box component="footer" sx={{ display: 'flex', justifyContent: 'flex-end', p: 1.5 }}>
                        <GithubAuthToolbarButton auth={auth} />
                    </Box>
                </Box>
            </Drawer>
            <Box ref={rightPanelContainerRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{rightPanel}</Box>
        </>
    )
}
