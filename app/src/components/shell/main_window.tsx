import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material'
import { useState, type ReactNode } from 'react'
import type { ProjectSession } from '../../app/use_app_bootstrap'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { GithubAuthPanel } from '../github_auth_panel'
import { ProjectWorkspace } from '../project_workspace'
import { MainToolbar } from './main_toolbar'
import { SplitLayout } from './split_layout'
import { StatusBar } from './status_bar'
import type { RunningAgent } from './running_agent_types'

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
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [statusInfo, setStatusInfo] = useState('')

    const handleOpenMenu = () => {
        setIsMenuOpen(true)
    }

    const handleCloseMenu = () => {
        setIsMenuOpen(false)
    }

    const leftPanel = (
        <Box sx={{ p: PANEL_PADDING }}>
            <GithubAuthPanel {...auth} />
        </Box>
    )
    const rightPanel = (
        <Box sx={{ p: PANEL_PADDING }}>
            <ProjectWorkspace
                key={session?.project.id ?? 'no-project'}
                accessToken={auth.accessToken}
                isGithubAuthenticated={auth.isAuthenticated}
            />
        </Box>
    )

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <MainToolbar action={toolbarAction} isMobile={isMobile} onOpenMenu={handleOpenMenu} />
            {isMobile ? (
                <>
                    <Drawer onClose={handleCloseMenu} open={isMenuOpen}>
                        <Box sx={{ overflow: 'auto', width: MOBILE_DRAWER_WIDTH }}>{leftPanel}</Box>
                    </Drawer>
                    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{rightPanel}</Box>
                </>
            ) : (
                <>
                    <SplitLayout left={leftPanel} right={rightPanel} />
                    <StatusBar agents={agents} info={statusInfo} onInfoChange={setStatusInfo} />
                </>
            )}
        </Box>
    )
}
