import { Box, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { navigateTo, useAppLocation } from '../../app/app_navigation'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { ConfigPage } from '../config/config_page'
import { useProjectReference } from '../hooks/use_project_reference'
import { ProjectWorkspace } from '../project_workspace'
import { createSearchRegexpAgent, isSearchRegexpAgentAvailable } from '../../services/search/search_regexp_agent'
import { GLOBAL_SEARCH_SHORTCUT_BINDING } from '../../services/search/search_open_service'
import { keyboardShortcutService } from '../../services/shortcuts/keyboard_shortcut_service'
import { AppMenu } from './menu/app_menu'
import { SearchControl } from './search/search_control'
import { StatusBar } from './status_bar'
import type { ProjectOpenResolution } from '../../services/project/project_session_service'

interface MainWindowProps {
    auth: UseGithubAuthResult
    initialProjectOpenResolution: ProjectOpenResolution | null
    toolbarAction: ReactNode
}

/** Main window: owns the global layout and switches between desktop and mobile presentations. */
export function MainWindow(props: MainWindowProps) {
    const { auth, initialProjectOpenResolution, toolbarAction } = props
    const location = useAppLocation()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const project = useProjectReference()
    const isConfigOpen = location.pathname === '/config'
    const regexpAgent = useMemo(
        () => isSearchRegexpAgentAvailable() ? createSearchRegexpAgent() : undefined,
        [],
    )

    useEffect(() => keyboardShortcutService.register(GLOBAL_SEARCH_SHORTCUT_BINDING), [])

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
                initialProjectOpenResolution={initialProjectOpenResolution}
                isGithubAuthenticated={auth.isAuthenticated}
                isMobile={isMobile}
                onOpenConfig={handleOpenConfig}
                onOpenMobileMenu={handleOpenMenu}
                search={<SearchControl isMobile={isMobile} regexpAgent={regexpAgent} />}
            />
            <ProjectWorkspace
                auth={auth}
                isMenuOpen={isMenuOpen}
                key={project ? `${project.id}:${project.branch}` : 'no-project'}
                onLeftPanelInteraction={handleCloseMenu}
            />
            {!isMobile ? <StatusBar /> : null}
            {isConfigOpen ? <ConfigPage hash={location.hash} /> : null}
        </Box>
    )
}
