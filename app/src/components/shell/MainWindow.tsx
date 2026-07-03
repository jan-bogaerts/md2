import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material'
import type { PaletteMode } from '@mui/material'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { MainToolbar } from './MainToolbar'
import { SplitLayout } from './SplitLayout'
import { StatusBar } from './StatusBar'
import type { RunningAgent } from './runningAgentTypes'

const MOBILE_DRAWER_WIDTH = 300

interface MainWindowProps {
    agents: RunningAgent[]
    leftPanel: ReactNode
    mode: PaletteMode
    onStatusInfoChange: (info: string) => void
    onToggleTheme: () => void
    rightPanel: ReactNode
    statusInfo: string
}

/** Main window: owns the global layout and switches between desktop and mobile presentations. */
export function MainWindow(props: MainWindowProps) {
    const { agents, leftPanel, mode, onStatusInfoChange, onToggleTheme, rightPanel, statusInfo } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    const handleOpenMenu = () => {
        setIsMenuOpen(true)
    }

    const handleCloseMenu = () => {
        setIsMenuOpen(false)
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <MainToolbar isMobile={isMobile} mode={mode} onOpenMenu={handleOpenMenu} onToggleTheme={onToggleTheme} />
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
                    <StatusBar agents={agents} info={statusInfo} onInfoChange={onStatusInfoChange} />
                </>
            )}
        </Box>
    )
}
