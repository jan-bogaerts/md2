import { Box, Divider, Drawer, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { navigateTo, useAppLocation } from '../../app/app_navigation'
import type { ProjectSession } from '../../app/use_app_bootstrap'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { ConfigPage } from '../config/config_page'
import { ProjectWorkspace } from '../project_workspace'
import { useProjectState } from '../hooks/use_project_state'
import { useProjectSession } from '../hooks/use_project_session'
import { useWorkspaceView } from '../hooks/use_workspace_view'
import { createSearchRegexpAgent, isSearchRegexpAgentAvailable } from '../../services/search/search_regexp_agent'
import { LeftPanelSlotProvider } from './left_panel_slot_provider'
import { LeftPanelTarget } from './left_panel_target'
import { AppMenu } from './menu/app_menu'
import { ThemeModeToggle } from './menu/theme_mode_toggle'
import { SearchControl } from './search/search_control'
import { SplitLayout } from './split_layout'
import { StatusBar } from './status_bar'
import type { RunningAgent } from '../../data/data_types'

const MOBILE_DRAWER_WIDTH = 300
const PANEL_PADDING = 2

interface MainWindowProps {
    agents: RunningAgent[]
    auth: UseGithubAuthResult
    session: ProjectSession | null
    toolbarAction: ReactNode
}

/** Main window: owns the global layout and switches between desktop and mobile presentations. */
export function MainWindow(props: MainWindowProps) {
    const { agents, auth, session, toolbarAction } = props
    const location = useAppLocation()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const { hasPendingPush, hasPendingSave, project, snapshot } = useProjectState()
    const { isPushing } = useProjectSession()
    const { viewMode } = useWorkspaceView()
    const isConfigPage = location.pathname === '/config'
    const shouldShowNavigationPanel = !project || viewMode === 'text'
    const activeCardCount = snapshot?.activeCards.length ?? 0
    const totalCardCount = activeCardCount + (snapshot?.backgroundCards.length ?? 0)
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
                key={session ? `${session.project.id}:${session.project.branch}` : 'no-project'}
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
                    <>
                        <Drawer onClose={handleCloseMenu} open={isMenuOpen}>
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
                                ) : null}
                            </Box>
                        </Drawer>
                        <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{rightPanel}</Box>
                    </>
                ) : (
                    <>
                        {shouldShowNavigationPanel ? (
                            <SplitLayout left={leftPanel} right={rightPanel} />
                        ) : (
                            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{rightPanel}</Box>
                        )}
                        <StatusBar
                            activeCardCount={activeCardCount}
                            agents={agents}
                            hasPendingPush={hasPendingPush}
                            hasPendingSave={hasPendingSave}
                            isPushing={isPushing}
                            totalCardCount={totalCardCount}
                        />
                    </>
                )}
            </Box>
        </LeftPanelSlotProvider>
    )
}
