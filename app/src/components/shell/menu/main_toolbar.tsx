import { Box, Tab as MuiTab, Tabs, Toolbar } from '@mui/material';
import { useLayoutEffect, useRef, useSyncExternalStore, type SyntheticEvent } from 'react';
import type { EmptyDiagramChoice } from '../../../services/diagrams/empty_diagram_factory';
import type { SearchRegexpAgent } from '../../../services/search/search_types';
import { DRAG_REGION, NO_DRAG_REGION } from '../drag_region';
import { SearchControl } from '../search/search_control';
import { ThemeToggleButton } from '../theme_toggle_button';
import { MobileCreateMenu } from './mobile_create_menu';
import { MobileMenuButton } from './mobile_menu_button';
import { ProjectNameLabel } from './project_name_label';
import { mainToolbarLayoutService, subscribeToolbarLayout } from './main_toolbar_layout_service';

const MENU_ROW_HEIGHT = 44;
const MINIMUM_TRAILING_SPACE = 144;
const APPLICATION_ICON_SOURCE = `${import.meta.env.BASE_URL}favicon.svg`;

interface MainToolbarProps {
    availableTabs: { label: string; value: string }[];
    currentTab: string;
    isCompact: boolean;
    isMobile: boolean;
    isNewActionDisabled: boolean;
    isNewCardDisabled: boolean;
    isNewDiagramDisabled: boolean;
    onCreateAction: () => void | Promise<void>;
    onCreateCard: () => void;
    onCreateDiagram: (choice: EmptyDiagramChoice) => void | Promise<void>;
    onOpenMenu: () => void;
    onTabChange: (value: string) => void;
    regexpAgent?: SearchRegexpAgent;
}

/** Shared header layout uses native window geometry; feature code does not branch by operating system. */
export function MainToolbar(props: MainToolbarProps) {
    const {
        availableTabs, currentTab, isCompact, isMobile, isNewActionDisabled, isNewCardDisabled, isNewDiagramDisabled,
        onCreateAction, onCreateCard, onCreateDiagram, onOpenMenu, onTabChange, regexpAgent,
    } = props;
    const toolbarElement = useRef<HTMLDivElement | null>(null);
    const safeAreaElement = useRef<HTMLDivElement | null>(null);
    const navigationElement = useRef<HTMLDivElement | null>(null);
    const projectElement = useRef<HTMLDivElement | null>(null);
    const utilitiesElement = useRef<HTMLDivElement | null>(null);
    const searchElement = useRef<HTMLDivElement | null>(null);
    const layout = useSyncExternalStore(subscribeToolbarLayout, mainToolbarLayoutService.getSnapshot, mainToolbarLayoutService.getSnapshot);
    const handleTabChange = (_event: SyntheticEvent, value: string) => onTabChange(value);

    useLayoutEffect(() => {
        const toolbar = toolbarElement.current;
        const safeArea = safeAreaElement.current;
        const navigation = navigationElement.current;
        const project = projectElement.current;
        const utilities = utilitiesElement.current;
        const search = searchElement.current;
        if (!toolbar || !safeArea || !navigation || !project || !utilities || !search) throw new Error('Header layout elements are missing');
        mainToolbarLayoutService.connect({ navigation, project, safeArea, search, toolbar, utilities });

        return () => mainToolbarLayoutService.disconnect();
    }, [isCompact]);

    return (
        <Toolbar
            data-testid="main-toolbar"
            disableGutters
            ref={toolbarElement}
            style={DRAG_REGION}
            sx={{ height: MENU_ROW_HEIGHT, minHeight: `${MENU_ROW_HEIGHT}px !important`, position: 'relative' }}
            variant="dense"
        >
            <Box
                data-testid="toolbar-safe-area"
                ref={safeAreaElement}
                sx={{ height: '100%', left: 'env(titlebar-area-x, 0px)', position: 'absolute', width: 'env(titlebar-area-width, 100%)' }}
            >
                <Box
                    data-testid="toolbar-navigation"
                    ref={navigationElement}
                    sx={{
                        alignItems: 'center', display: 'flex', gap: 0.5, height: '100%', left: (theme) => theme.spacing(1.5),
                        maxWidth: `calc(100% - ${MINIMUM_TRAILING_SPACE}px)`, position: 'absolute',
                    }}
                >
                    {isMobile ? <MobileMenuButton onOpenMenu={onOpenMenu} /> : null}
                    <Box
                        alt="MD² application icon" component="img" src={APPLICATION_ICON_SOURCE}
                        sx={{ flexShrink: 0, height: 24, width: 24 }}
                    />
                    <Box style={NO_DRAG_REGION} sx={{ alignSelf: 'stretch', display: 'flex', minWidth: 0 }}>
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
                                    key={tab.value} label={tab.label}
                                    sx={{ fontSize: 13.5, minHeight: MENU_ROW_HEIGHT, minWidth: 0, px: 1.5, textTransform: 'none' }}
                                    value={tab.value}
                                />
                            ))}
                        </Tabs>
                    </Box>
                </Box>
                <Box
                    data-testid="project-name-region"
                    ref={projectElement}
                    sx={{
                        alignItems: 'center', display: isCompact ? 'none' : 'flex', height: '100%', justifyContent: 'center',
                        left: layout.titleLeft, minWidth: 0, overflow: 'hidden', position: 'absolute', width: layout.titleWidth,
                        '& .MuiTypography-root': { maxWidth: '100%', width: 'max-content' },
                    }}
                >
                    {!isCompact ? <ProjectNameLabel /> : null}
                </Box>
                <Box
                    sx={{ alignItems: 'center', display: 'flex', gap: 1, height: '100%', position: 'absolute', right: (theme) => theme.spacing(1.5) }}
                >
                    <Box ref={utilitiesElement} style={NO_DRAG_REGION}>
                        {isMobile && currentTab === 'home' ? (
                            <MobileCreateMenu
                                isNewActionDisabled={isNewActionDisabled} isNewCardDisabled={isNewCardDisabled}
                                isNewDiagramDisabled={isNewDiagramDisabled} onCreateAction={onCreateAction}
                                onCreateCard={onCreateCard} onCreateDiagram={onCreateDiagram}
                            />
                        ) : !isMobile ? <ThemeToggleButton /> : null}
                    </Box>
                    <Box ref={searchElement} style={NO_DRAG_REGION} sx={{ flexShrink: 0, width: isCompact ? 32 : layout.searchWidth }}>
                        <SearchControl isMobile={isCompact} presentation={layout.searchPresentation} regexpAgent={regexpAgent} />
                    </Box>
                </Box>
            </Box>
        </Toolbar>
    );
}
