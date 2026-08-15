import { AppBar, Box, Toolbar } from '@mui/material'
import type { ReactNode } from 'react'
import { DRAG_REGION, NO_DRAG_REGION } from '../drag_region'
import { ThemeToggleButton } from '../theme_toggle_button'
import { isElectron } from '../../../services/electron_lifecycle_bridge'
import { ProjectNameLabel } from './project_name_label'
import { MobileMenuButton } from './mobile_menu_button'

const MENU_ROW_HEIGHT = 44
const SEARCH_WIDTH = 286
const PROJECT_NAME_MAX_WIDTH = 240
const APPLICATION_ICON_SOURCE = `${import.meta.env.BASE_URL}favicon.svg`

interface MainToolbarProps {
    isMobile: boolean
    mobileAction: ReactNode
    onOpenMenu: () => void
    panel: ReactNode
    search: ReactNode
    tabs: ReactNode
}

/**
 * Top application toolbar; hosts menu tabs, search, and the desktop drag region.
 * Interactive controls opt out of dragging so the remaining row space can move the window.
 */
export function MainToolbar(props: MainToolbarProps) {
    const { isMobile, mobileAction, onOpenMenu, panel, search, tabs } = props

    return (
        <AppBar
            color="default"
            elevation={0}
            position="static"
            sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
        >
            <Toolbar
                disableGutters
                style={DRAG_REGION}
                sx={{ gap: 0.5, height: MENU_ROW_HEIGHT, minHeight: `${MENU_ROW_HEIGHT}px !important`, px: 1.5 }}
                variant="dense"
            >
                {isMobile ? (
                    <MobileMenuButton onOpenMenu={onOpenMenu} />
                ) : null}
                <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0 }}>
                    <Box
                        alt="MD² application icon"
                        component="img"
                        src={APPLICATION_ICON_SOURCE}
                        sx={{
                            height: 24,
                            width: 24,
                        }}
                    />
                </Box>
                <Box style={NO_DRAG_REGION} sx={{ alignSelf: 'stretch', display: 'flex', flexShrink: 0 }}>
                    {tabs}
                </Box>
                <Box
                    data-testid="project-name-region"
                    sx={{ alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center', minWidth: 16, overflow: 'hidden' }}
                >
                    <Box sx={{ maxWidth: PROJECT_NAME_MAX_WIDTH, minWidth: 0 }}>
                        <ProjectNameLabel />
                    </Box>
                </Box>
                {isMobile ? (
                    <Box style={NO_DRAG_REGION}>
                        {mobileAction}
                    </Box>
                ) : null}
                {isMobile ? (
                    <Box style={NO_DRAG_REGION}>
                        {search}
                    </Box>
                ) : (
                    <Box style={NO_DRAG_REGION}>
                        <ThemeToggleButton />
                    </Box>
                )}
                {!isMobile ? (
                    <Box
                        style={NO_DRAG_REGION}
                        sx={{ display: 'flex', flex: `0 0 ${SEARCH_WIDTH}px`, ml: 0.5, minWidth: 180, mr: isElectron() ? '130px' : 0 }}
                    >
                        {search}
                    </Box>
                ) : null}
            </Toolbar>
            <Box style={NO_DRAG_REGION}>
                {panel}
            </Box>
        </AppBar>
    )
}
