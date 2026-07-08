import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { navigateTo, useAppLocation } from '../../app/app_navigation'
import type { ProjectSession } from '../../app/use_app_bootstrap'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { ConfigPage } from '../config/config_page'
import { ProjectWorkspace } from '../project_workspace'
import { useProjectState } from '../hooks/use_project_state'
import { createSearchRegexpAgent, isSearchRegexpAgentAvailable } from '../../services/search/search_regexp_agent'
import { GithubAuthToolbarButton } from './github_auth_toolbar_button'
import { LeftPanelSlotProvider } from './left_panel_slot_provider'
import { LeftPanelTarget } from './left_panel_target'
import { AppMenu } from './menu/app_menu'
import { MainToolbar } from './main_toolbar'
import { ProjectToolbarMenu } from './project_toolbar_menu'
import { SearchControl } from './search/search_control'
import { SplitLayout } from './split_layout'
import { StatusBar } from './status_bar'
import type { RunningAgent } from '../../data/data_types'

const MOBILE_DRAWER_WIDTH = 300
const PANEL_PADDING = 2

interface MainWindowProps {
    agents: RunningAgent[]
    auth: UseGithubAuthResult
    bootstrapError: string | null
    session: ProjectSession | null
    toolbarAction: ReactNode
}

/** Main window: owns the global layout and switches between desktop and mobile presentations. */
export function MainWindow(props: MainWindowProps) {
    const { agents, auth, bootstrapError, session, toolbarAction } = props
    const location = useAppLocation()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [statusInfo, setStatusInfo] = useState('')
    const { hasPendingCommits } = useProjectState()
    const isConfigPage = location.pathname === '/config'
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
        <Box sx={{ p: PANEL_PADDING }}>
            <ProjectWorkspace
                bootstrapError={bootstrapError}
                key={session?.project.id ?? 'no-project'}
                onLeftPanelInteraction={handleCloseMenu}
            />
        </Box>
    )

    return (
        <LeftPanelSlotProvider>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
                <MainToolbar
                    action={(
                        <>
                            <ProjectToolbarMenu accessToken={auth.accessToken} isGithubAuthenticated={auth.isAuthenticated} />
                            <AppMenu />
                            <GithubAuthToolbarButton auth={auth} />
                            {toolbarAction}
                        </>
                    )}
                    isMobile={isMobile}
                    onOpenConfig={handleOpenConfig}
                    onOpenMenu={handleOpenMenu}
                    search={<SearchControl regexpAgent={regexpAgent} />}
                />
                {isConfigPage ? (
                    <ConfigPage hash={location.hash} />
                ) : isMobile ? (
                    <>
                        <Drawer onClose={handleCloseMenu} open={isMenuOpen}>
                            <Box sx={{ overflow: 'auto', width: MOBILE_DRAWER_WIDTH }}>{leftPanel}</Box>
                        </Drawer>
                        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{rightPanel}</Box>
                    </>
                ) : (
                    <>
                        <SplitLayout left={leftPanel} right={rightPanel} />
                        <StatusBar
                            agents={agents}
                            hasPendingCommits={hasPendingCommits}
                            info={statusInfo}
                            onInfoChange={setStatusInfo}
                        />
                    </>
                )}
            </Box>
        </LeftPanelSlotProvider>
    )
}
