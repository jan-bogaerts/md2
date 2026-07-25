import { Box, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { navigateTo, useAppLocation } from '../../app/app_navigation'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { ConfigPage } from '../config/config_page'
import { useProjectState } from '../hooks/use_project_state'
import { ProjectWorkspace } from '../project_workspace'
import { createSearchRegexpAgent, isSearchRegexpAgentAvailable } from '../../services/search/search_regexp_agent'
import { AppMenu } from './menu/app_menu'
import { SearchControl } from './search/search_control'
import { StatusBar } from './status_bar'

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

    return (
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
            ) : (
                <ProjectWorkspace
                    auth={auth}
                    isMenuOpen={isMenuOpen}
                    key={project ? `${project.id}:${project.branch}` : 'no-project'}
                    onLeftPanelInteraction={handleCloseMenu}
                />
            )}
            {!isConfigPage && !isMobile ? <StatusBar /> : null}
        </Box>
    )
}
