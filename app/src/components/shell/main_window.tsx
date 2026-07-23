import { Box, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { navigateTo, useAppLocation } from '../../app/app_navigation'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { ConfigPage } from '../config/config_page'
import { useProjectState } from '../hooks/use_project_state'
import { ProjectWorkspace } from '../project_workspace'
import { useWorkspaceView } from '../hooks/use_workspace_view'
import { createSearchRegexpAgent, isSearchRegexpAgentAvailable } from '../../services/search/search_regexp_agent'
import { LeftPanelSlotProvider } from './left_panel_slot_provider'
import { LeftPanelTarget } from './left_panel_target'
import { AppMenu } from './menu/app_menu'
import { MobileMainWindow } from './mobile_main_window'
import { SearchControl } from './search/search_control'
import { SplitLayout } from './split_layout'
import { StatusBar } from './status_bar'

const PANEL_PADDING = 2

interface MainWindowProps {
    auth: UseGithubAuthResult
    toolbarAction: ReactNode
}

/** Main window: owns the global layout and switches between desktop and mobile presentations. */
export function MainWindow(props: MainWindowProps) {
    const { auth, toolbarAction } = props
    const location = useAppLocation()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const { project } = useProjectState()
    const { viewMode } = useWorkspaceView()
    const isConfigPage = location.pathname === '/config'
    const shouldShowNavigationPanel = !project || viewMode === 'text'
    const regexpAgent = useMemo(
        () => isSearchRegexpAgentAvailable() ? createSearchRegexpAgent() : undefined,
        [],
    )

    const handleOpenMenu = useCallback(() => {
        setIsMenuOpen(true)
    }, [])

    const handleCloseMenu = useCallback(() => {
        setIsMenuOpen(false)
    }, [])

    const handleOpenConfig = useCallback(() => {
        navigateTo('/config')
    }, [])

    const leftPanel = (
        <LeftPanelTarget fallback="No project navigation available." />
    )
    const rightPanel = (
        <Box
            sx={{
                boxSizing: 'border-box',
                display: 'flex',
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                p: viewMode === 'cards' ? 0 : PANEL_PADDING,
            }}
        >
            <ProjectWorkspace
                key={project ? `${project.id}:${project.branch}` : 'no-project'}
                onLeftPanelInteraction={handleCloseMenu}
            />
        </Box>
    )

    return (
        <LeftPanelSlotProvider>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
                <AppMenu
                    accessToken={auth.accessToken}
                    auth={auth}
                    extraActions={toolbarAction}
                    isGithubAuthenticated={auth.isAuthenticated}
                    isMobile={isMobile}
                    onOpenConfig={handleOpenConfig}
                    onOpenMobileMenu={handleOpenMenu}
                    search={<SearchControl isMobile={isMobile} regexpAgent={regexpAgent} />}
                />
                {isConfigPage ? (
                    <ConfigPage hash={location.hash} />
                ) : isMobile ? (
                    <MobileMainWindow
                        auth={auth}
                        isMenuOpen={isMenuOpen}
                        leftPanel={leftPanel}
                        onCloseMenu={handleCloseMenu}
                        rightPanel={rightPanel}
                        shouldShowNavigationPanel={shouldShowNavigationPanel}
                    />
                ) : (
                    <>
                        {shouldShowNavigationPanel ? (
                            <SplitLayout left={leftPanel} right={rightPanel} />
                        ) : (
                            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{rightPanel}</Box>
                        )}
                        <StatusBar />
                    </>
                )}
            </Box>
        </LeftPanelSlotProvider>
    )
}
