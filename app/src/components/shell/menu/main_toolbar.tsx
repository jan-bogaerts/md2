import { Box, Tab as MuiTab, Tabs, Toolbar } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { EmptyDiagramChoice } from '../../../services/diagrams/empty_diagram_factory'
import { isElectron } from '../../../services/electron_lifecycle_bridge'
import type { SearchRegexpAgent } from '../../../services/search/search_types'
import { DRAG_REGION, NO_DRAG_REGION } from '../drag_region'
import { SearchControl } from '../search/search_control'
import { ThemeToggleButton } from '../theme_toggle_button'
import { MobileCreateMenu } from './mobile_create_menu'
import { MobileMenuButton } from './mobile_menu_button'
import { ProjectNameLabel } from './project_name_label'

const MENU_ROW_HEIGHT = 44
const SEARCH_WIDTH = 286
const PROJECT_NAME_MAX_WIDTH = 240
const APPLICATION_ICON_SOURCE = `${import.meta.env.BASE_URL}favicon.svg`

interface MainToolbarProps {
    availableTabs: { label: string; value: string }[]
    currentTab: string
    isMobile: boolean
    isNewActionDisabled: boolean
    isNewCardDisabled: boolean
    isNewDiagramDisabled: boolean
    onCreateAction: () => void | Promise<void>
    onCreateCard: () => void
    onCreateDiagram: (choice: EmptyDiagramChoice) => void | Promise<void>
    onOpenMenu: () => void
    onTabChange: (value: string) => void
    regexpAgent?: SearchRegexpAgent
}

/** Top application toolbar row; feature controls receive data and callbacks, never JSX slots. */
export function MainToolbar(props: MainToolbarProps) {
    const {
        availableTabs,
        currentTab,
        isMobile,
        isNewActionDisabled,
        isNewCardDisabled,
        isNewDiagramDisabled,
        onCreateAction,
        onCreateCard,
        onCreateDiagram,
        onOpenMenu,
        onTabChange,
        regexpAgent,
    } = props
    const handleTabChange = (_event: SyntheticEvent, value: string) => onTabChange(value)

    return (
        <Toolbar
            disableGutters
            style={DRAG_REGION}
            sx={{ gap: 0.5, height: MENU_ROW_HEIGHT, minHeight: `${MENU_ROW_HEIGHT}px !important`, px: 1.5 }}
            variant="dense"
        >
            {isMobile ? <MobileMenuButton onOpenMenu={onOpenMenu} /> : null}
            <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0 }}>
                <Box alt="MD² application icon" component="img" src={APPLICATION_ICON_SOURCE} sx={{ height: 24, width: 24 }} />
            </Box>
            <Box style={NO_DRAG_REGION} sx={{ alignSelf: 'stretch', display: 'flex', flexShrink: 0 }}>
                <Tabs
                    aria-label="Application menu"
                    onChange={handleTabChange}
                    scrollButtons={false}
                    sx={{ minHeight: MENU_ROW_HEIGHT, '& .MuiTabs-indicator': { height: 2 } }}
                    value={currentTab}
                    variant="scrollable"
                >
                    {availableTabs.map((tab) => (
                        <MuiTab
                            key={tab.value}
                            label={tab.label}
                            sx={{ fontSize: 13.5, minHeight: MENU_ROW_HEIGHT, minWidth: 0, px: 1.5, textTransform: 'none' }}
                            value={tab.value}
                        />
                    ))}
                </Tabs>
            </Box>
            {!isMobile ? (
                <Box
                    data-testid="project-name-region"
                    sx={{ alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center', minWidth: 16, overflow: 'hidden' }}
                >
                    <Box sx={{ maxWidth: PROJECT_NAME_MAX_WIDTH, minWidth: 0 }}>
                        <ProjectNameLabel />
                    </Box>
                </Box>
            ) : null}
            {isMobile && currentTab === 'home' ? (
                <Box style={NO_DRAG_REGION}>
                    <MobileCreateMenu
                        isNewActionDisabled={isNewActionDisabled}
                        isNewCardDisabled={isNewCardDisabled}
                        isNewDiagramDisabled={isNewDiagramDisabled}
                        onCreateAction={onCreateAction}
                        onCreateCard={onCreateCard}
                        onCreateDiagram={onCreateDiagram}
                    />
                </Box>
            ) : null}
            {isMobile ? (
                <Box style={NO_DRAG_REGION}>
                    <SearchControl isMobile regexpAgent={regexpAgent} />
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
                    <SearchControl isMobile={false} regexpAgent={regexpAgent} />
                </Box>
            ) : null}
        </Toolbar>
    )
}
