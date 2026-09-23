import { AppBar, Box, Button, Divider, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import BugOutline from 'mdi-material-ui/BugOutline'
import CheckCircleOutline from 'mdi-material-ui/CheckCircleOutline'
import CloudArrowDownOutline from 'mdi-material-ui/CloudArrowDownOutline'
import CloudArrowUpOutline from 'mdi-material-ui/CloudArrowUpOutline'
import Cog from 'mdi-material-ui/Cog'
import ContentSaveOutline from 'mdi-material-ui/ContentSaveOutline'
import FileDocumentPlusOutline from 'mdi-material-ui/FileDocumentPlusOutline'
import FolderOpen from 'mdi-material-ui/FolderOpen'
import TextBoxOutline from 'mdi-material-ui/TextBoxOutline'
import BarChartOutlined from '@mui/icons-material/BarChartOutlined'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import PlaylistAddOutlined from '@mui/icons-material/PlaylistAddOutlined'
import {
    projectSessionService,
    type ProjectFolderValues,
    type ProjectOpenResolution,
} from '../../../services/project/project_session_service'
import { workspaceViewService, type WorkspaceViewMode } from '../../../services/project/workspace_view_service'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { actionService } from '../../../services/actions/action_service'
import { dialogService } from '../../../services/dialog_service'
import { diagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { EmptyDiagramChoice } from '../../../services/diagrams/empty_diagram_factory'
import { diagramViewService } from '../../../services/diagrams/diagram_view_service'
import { sentryImportService } from '../../../services/sentry/sentry_import_service'
import { isSentryConfigurationComplete } from '../../../services/sentry/sentry_types'
import { keyboardShortcutService } from '../../../services/shortcuts/keyboard_shortcut_service'
import { projectContext } from '../../../data/action_context'
import type { UseGithubAuthResult } from '../../../auth/use_github_auth'
import { useProjectReference } from '../../hooks/use_project_reference'
import { useProjectPersistence } from '../../hooks/use_project_persistence'
import { useProjectConfig } from '../../hooks/use_project_config'
import { useProjectReadOnly } from '../../hooks/use_project_read_only'
import { useSentryConnection } from '../../hooks/use_sentry_connection'
import { useSentryImport } from '../../hooks/use_sentry_import'
import { usePrimaryWorktreeStatus } from '../../hooks/use_worktrees'
import { useWorkspaceView } from '../../hooks/use_workspace_view'
import { ActionEntryPoints } from '../../actions/run/trigger/action_entry_points'
import { MainToolbar } from './main_toolbar'
import { GithubAuthToolbarButton } from '../github_auth_toolbar_button'
import { NO_DRAG_REGION } from '../drag_region'
import { BranchSwitchDialog } from '../project/branch_switch_dialog'
import { CompleteReleaseDialog } from '../project/complete_release_dialog'
import { NewCardDialog } from '../project/new_card_dialog'
import { ProjectOpenDialog } from '../project/project_open_dialog'
import { useProjectToolbarMenuActions } from '../project/use_project_toolbar_menu_actions'
import { Menu } from './menu'
import { BranchMenuSelect } from './branch_menu_select'
import { MenuIconButton } from './menu_icon_button'
import { NewDiagramMenu } from './new_diagram_menu'
import { Section } from './section'
import { Tab } from './tab'
import { DiagramMenuTab } from '../../diagram_view/diagram_menu_tab'
import { StatsMenuTab } from '../../stats_view/stats_menu_tab'
import { ActiveSchedulesDialog } from '../../actions/run/schedule/active_schedules_dialog'
import { DIAGRAM_EDITOR_ROOT_ATTRIBUTE } from '../../diagram_view/use_diagram_delete_key'
import { hasActiveScheduleBackend, hasSequenceScheduleBackend } from '../../../data/electron_action_bridge'
import { cardSequenceDraftService } from '../../actions/run/sequence/card_sequence_draft_service'
import type { SearchRegexpAgent } from '../../../services/search/search_types'
import { AgentMenuControls } from './agent_menu_controls'

type AppMenuTab = 'home' | 'agents' | 'diagram' | 'stats'
type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release' | 'schedules'

interface AppMenuProps {
    accessToken: string | null
    auth: UseGithubAuthResult
    extraActions: ReactNode
    initialProjectOpenResolution: ProjectOpenResolution | null
    isGithubAuthenticated: boolean
    isMobile: boolean
    onOpenConfig: () => void
    onOpenMobileMenu: () => void
    regexpAgent?: SearchRegexpAgent
}

const MENU_TABS: { label: string; value: AppMenuTab }[] = [
    { label: 'Home', value: 'home' },
    { label: 'Run', value: 'agents' },
]
const DIAGRAM_MENU_TAB: { label: string; value: AppMenuTab } = { label: 'Diagram', value: 'diagram' }
const STATS_MENU_TAB: { label: string; value: AppMenuTab } = { label: 'Stats', value: 'stats' }
/** View mode each view-scoped tab belongs to; such a tab is offered, and stays selected, only in that view. */
const VIEW_SCOPED_TABS: { tab: { label: string; value: AppMenuTab }; viewMode: WorkspaceViewMode }[] = [
    { tab: DIAGRAM_MENU_TAB, viewMode: 'diagrams' },
    { tab: STATS_MENU_TAB, viewMode: 'stats' },
]

function scopedTabViewMode(tab: AppMenuTab) {
    return VIEW_SCOPED_TABS.find((entry) => entry.tab.value === tab)?.viewMode ?? null
}
const PROJECT_CONTEXT = projectContext()

/** Tabbed app menu hosting project, account and agent actions. */
export function AppMenu(props: AppMenuProps) {
    const {
        accessToken,
        auth,
        extraActions,
        initialProjectOpenResolution,
        isGithubAuthenticated,
        isMobile,
        onOpenConfig,
        onOpenMobileMenu,
        regexpAgent,
    } = props
    const project = useProjectReference()
    const { hasPendingPush, hasPendingSave } = useProjectPersistence()
    const primaryWorktreeStatus = usePrimaryWorktreeStatus()
    const projectConfig = useProjectConfig()
    const { viewMode } = useWorkspaceView()
    const [currentTab, setCurrentTab] = useState<AppMenuTab>('home')
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(initialProjectOpenResolution ? 'open' : null)
    const [isCreatingDiagram, setIsCreatingDiagram] = useState(false)
    const projectBranch = project?.branch ?? ''
    const readOnly = useProjectReadOnly()
    const sentryConnection = useSentryConnection()
    const sentryImport = useSentryImport()
    const canShowSentryImport = !!project
        && sentryConnection.isAuthenticated
        && isSentryConfigurationComplete(sentryConnection.settings)
    const currentTabViewMode = scopedTabViewMode(currentTab)
    const isCurrentTabOutOfView = !!currentTabViewMode && currentTabViewMode !== viewMode
    const visibleCurrentTab = isCurrentTabOutOfView ? 'home' : currentTab
    const availableMenuTabs = [
        ...MENU_TABS,
        ...VIEW_SCOPED_TABS.filter((entry) => entry.viewMode === viewMode).map((entry) => entry.tab),
    ]

    useEffect(() => {
        if (!isCurrentTabOutOfView) return

        queueMicrotask(() => setCurrentTab('home'))
    }, [isCurrentTabOutOfView])


    const closeDialog = useCallback(() => {
        setDialogMode(null)
    }, [])

    const openDialog = useCallback((mode: ProjectDialogMode) => {
        setDialogMode(mode)
    }, [])

    const actions = useProjectToolbarMenuActions({
        accessToken,
        initialProjectOpenResolution,
        isGithubAuthenticated,
        onCloseDialog: closeDialog,
        onOpenDialog: openDialog,
    })
    const branchOptions = actions.branches.length > 0 ? actions.branches : (project ? [{ name: project.branch }] : [])
    const selectedBranch = branchOptions.some((branch) => branch.name === actions.switchBranch) ? actions.switchBranch : projectBranch
    const canCommit = !readOnly && actions.isProjectOpen && !actions.isLoading && hasPendingSave

    const handleTabChange = (value: string) => {
        setCurrentTab(value as AppMenuTab)
    }

    const handleOpenProject = () => {
        actions.openProjectDialog()
    }

    const handleConfirmProjectFolderSetup = (values: ProjectFolderValues) => {
        void actions.confirmProjectFolderSetup(values)
    }

    const handleLoadBranches = () => {
        void actions.loadSwitchBranches()
    }

    const handleBranchChange = (event: SelectChangeEvent) => {
        void actions.switchProjectBranch(event.target.value)
    }

    const handleImportSentryIssues = () => {
        void sentryImportService.importNow()
    }

    const handleOpenReleaseDialog = () => {
        void actions.openReleaseDialog()
    }

    const handleOpenCardDialog = () => {
        actions.openNewCardDialog()
    }

    const handleOpenActiveSchedules = () => {
        openDialog('schedules')
    }

    const handleOpenCardSequence = () => {
        cardSequenceDraftService.open()
    }

    const handleCommit = useCallback(async () => {
        try {
            await projectSessionService.commit()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }, [])

    useEffect(() => {
        return keyboardShortcutService.register({
            alt: false,
            id: 'commit',
            key: 's',
            mod: true,
            run: () => {
                if (canCommit) void handleCommit()
            },
            shift: false,
        })
    }, [canCommit, handleCommit])

    const handlePush = async () => {
        try {
            await actions.push()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const handlePull = async () => {
        try {
            await actions.pull()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const handleViewModeChange = (_event: ReactMouseEvent<HTMLElement>, nextMode: WorkspaceViewMode | null) => {
        if (!nextMode) return

        workspaceViewService.setViewMode(nextMode)
    }


    const handleCreateAction = async () => {
        try {
            if (!projectConfig) throw new Error('Cannot create an action before project config is loaded')

            const { definition, path } = actionService.createDefinition(projectConfig.actionsFolder)
            await actionService.saveDefinition(path, definition)
            workspaceViewService.setViewMode('text')
            workspaceNavigationService.open(path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Action creation failed' })
        }
    }

    const handleCreateDiagram = async (choice: EmptyDiagramChoice) => {
        if (diagramEditSessionService.getDirtySnapshot()) {
            dialogService.warning('Save or discard current diagram changes before creating another diagram.', {title: 'Unsaved diagram changes'})

            return
        }
        setIsCreatingDiagram(true)
        try {
            await diagramViewService.open()
            const record = await diagramViewService.createEmptyDiagram(choice)
            workspaceViewService.setViewMode('diagrams')
            diagramEditSessionService.startCreation(record.id)
            queueMicrotask(() => document.querySelector<HTMLElement>(`[${DIAGRAM_EDITOR_ROOT_ATTRIBUTE}]`)?.focus())
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Diagram could not be created' })
        } finally {
            setIsCreatingDiagram(false)
        }
    }

    const handleDiscardGithubPendingCommits = () => {
        if (!actions.pendingGithubConflictProject) return

        projectSessionService.discardGithubPendingCommits(actions.pendingGithubConflictProject, accessToken)
    }

    const viewSection = (
        <Section label="View">
            <ToggleButtonGroup
                exclusive
                onChange={handleViewModeChange}
                size="small"
                sx={{
                    bgcolor: 'action.selected',
                    borderRadius: 1,
                    gap: 0.25,
                    p: 0.375,
                    '& .MuiToggleButtonGroup-grouped': { border: 0, borderRadius: '6px !important', height: 28, px: 1.25 },
                    '& .Mui-selected': { bgcolor: 'background.paper', boxShadow: '0 1px 2px rgba(16,24,40,0.1)' },
                }}
                value={viewMode}
            >
                <Tooltip title="Cards view">
                    <ToggleButton aria-label="Cards view" value="cards">
                        <CardsOutline fontSize="small" />
                        <Box component="span" sx={{ ml: 0.75 }}>Board</Box>
                    </ToggleButton>
                </Tooltip>
                <Tooltip title="Text view">
                    <ToggleButton aria-label="Text view" value="text">
                        <TextBoxOutline fontSize="small" />
                        <Box component="span" sx={{ ml: 0.75 }}>List</Box>
                    </ToggleButton>
                </Tooltip>
                <Tooltip title="Diagrams view">
                    <ToggleButton aria-label="Diagrams view" value="diagrams">
                        <AccountTreeOutlined fontSize="small" />
                        <Box component="span" sx={{ ml: 0.75 }}>Diagrams</Box>
                    </ToggleButton>
                </Tooltip>
                <Tooltip title="Stats view">
                    <ToggleButton aria-label="Stats view" value="stats">
                        <BarChartOutlined fontSize="small" />
                        <Box component="span" sx={{ ml: 0.75 }}>Stats</Box>
                    </ToggleButton>
                </Tooltip>
            </ToggleButtonGroup>
        </Section>
    )

    const menuPanel = (
        <Menu>
            <Box role="tabpanel" sx={{ display: visibleCurrentTab === 'home' ? 'block' : 'none' }}>
                <Tab>
                    {isMobile ? (
                        <>
                            {viewSection}
                            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                        </>
                    ) : null}
                    <Section label="Project">
                        <MenuIconButton label="Open project" onClick={handleOpenProject}>
                            <FolderOpen fontSize="small" />
                        </MenuIconButton>
                        <BranchMenuSelect
                            branches={branchOptions}
                            disabled={!actions.isProjectOpen || actions.isLoading}
                            onChange={handleBranchChange}
                            onOpen={handleLoadBranches}
                            value={selectedBranch}
                        />
                        <MenuIconButton
                            disabled={!canCommit}
                            label="Commit"
                            onClick={handleCommit}
                            tooltip="Commit (Ctrl+S)"
                        >
                            <ContentSaveOutline fontSize="small" />
                        </MenuIconButton>
                        <MenuIconButton
                            disabled={
                                !actions.isProjectOpen
                                || readOnly
                                || actions.isLoading
                                || (!hasPendingPush && (primaryWorktreeStatus?.ahead ?? 0) <= 0)
                            }
                            label="Push"
                            onClick={handlePush}
                        >
                            <CloudArrowUpOutline fontSize="small" />
                        </MenuIconButton>
                        <MenuIconButton
                            disabled={
                                !actions.isProjectOpen
                                || readOnly
                                || actions.isLoading
                                || hasPendingSave
                                || hasPendingPush
                                || !primaryWorktreeStatus?.hasUpstream
                                || primaryWorktreeStatus.dirty
                                || primaryWorktreeStatus.ahead > 0
                                || primaryWorktreeStatus.behind <= 0
                            }
                            label="Pull"
                            onClick={handlePull}
                        >
                            <CloudArrowDownOutline fontSize="small" />
                        </MenuIconButton>
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Settings">
                        <MenuIconButton label="Config" onClick={onOpenConfig}>
                            <Cog fontSize="small" />
                        </MenuIconButton>
                        {extraActions}
                    </Section>
                    {!isMobile ? (
                        <>
                            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                            {viewSection}
                            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                            <NewDiagramMenu
                                disabled={!actions.isProjectOpen || readOnly || isCreatingDiagram}
                                onCreateDiagram={handleCreateDiagram}
                            />
                            <Button
                                disabled={!actions.isProjectOpen || readOnly}
                                onClick={handleOpenCardDialog}
                                size="small"
                                startIcon={<FileDocumentPlusOutline fontSize="small" />}
                                sx={{ height: 34, px: 1.75 }}
                                variant="contained"
                            >
                                New card
                            </Button>
                            <Button disabled={!project || readOnly} onClick={handleCreateAction} size="small" variant="outlined">New action</Button>
                            <Box sx={{ flex: 1 }} />
                            <Section label="Account">
                                <GithubAuthToolbarButton auth={auth} />
                            </Section>
                        </>
                    ) : null}
                </Tab>
            </Box>
            <Box role="tabpanel" sx={{ display: visibleCurrentTab === 'agents' ? 'block' : 'none' }}>
                <Tab>
                    <AgentMenuControls />
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Actions">
                        <ActionEntryPoints context={PROJECT_CONTEXT} variant="icons" visibility="explicit-context" />
                        <MenuIconButton
                            disabled={readOnly || !actions.isProjectOpen || !hasSequenceScheduleBackend()}
                            label="Add sequence"
                            onClick={handleOpenCardSequence}
                        >
                            <PlaylistAddOutlined fontSize="small" />
                        </MenuIconButton>
                        <MenuIconButton
                            disabled={!actions.isProjectOpen || !hasActiveScheduleBackend()}
                            label="View active schedules"
                            onClick={handleOpenActiveSchedules}
                        >
                            <ScheduleOutlined fontSize="small" />
                        </MenuIconButton>
                        <MenuIconButton
                            disabled={readOnly || !actions.isProjectOpen || actions.activeCardCount === 0 || actions.isReleaseCompleting}
                            label="Complete release"
                            onClick={handleOpenReleaseDialog}
                        >
                            <CheckCircleOutline fontSize="small" />
                        </MenuIconButton>
                        {canShowSentryImport ? (
                            <MenuIconButton
                                disabled={readOnly || sentryImport.isPolling}
                                label="Import Sentry issues"
                                onClick={handleImportSentryIssues}
                                tooltip={sentryImport.isPolling ? 'Checking Sentry...' : 'Import Sentry issues'}
                            >
                                <BugOutline fontSize="small" />
                            </MenuIconButton>
                        ) : null}
                    </Section>
                </Tab>
            </Box>
            {viewMode === 'diagrams' ? (
                <Box role="tabpanel" sx={{ display: visibleCurrentTab === 'diagram' ? 'block' : 'none' }}>
                    <DiagramMenuTab />
                </Box>
            ) : null}
            {viewMode === 'stats' ? (
                <Box role="tabpanel" sx={{ display: visibleCurrentTab === 'stats' ? 'block' : 'none' }}>
                    <StatsMenuTab />
                </Box>
            ) : null}
            {dialogMode === 'open' ? (
                <ProjectOpenDialog
                    branches={actions.branches}
                    initialSource={actions.initialProjectSource}
                    isDesktopMode={actions.isDesktopMode}
                    isGithubAuthenticated={isGithubAuthenticated}
                    isLoading={actions.isLoading}
                    onBrowseProjectSubFolder={actions.isDesktopMode ? actions.browseProjectSubFolder : null}
                    onChooseLocalFolder={actions.chooseLocalProjectFolder}
                    onConfirmProjectFolderSetup={handleConfirmProjectFolderSetup}
                    projectOpenResolution={actions.projectOpenResolution}
                    onBranchChange={() => undefined}
                    onClose={actions.closeDialog}
                    onCreateRemoteProject={actions.createRemoteProject}
                    onDiscardGithubPendingCommits={handleDiscardGithubPendingCommits}
                    onLoadManualBranches={actions.loadManualBranches}
                    onLoadRemoteBranches={actions.loadRemoteBranches}
                    onOpenGithub={actions.openGithubProject}
                    onOpenLocal={actions.openLocalProject}
                    onOpenRemote={actions.openRemoteProject}
                    onRemoveRecentLocal={actions.removeRecentLocalProject}
                    onRepositoryChange={actions.loadRepositoryBranches}
                    onSourceChange={actions.clearOpenDialogState}
                    open
                    pendingGithubConflictProject={actions.pendingGithubConflictProject}
                    recentLocalRepositories={actions.recentLocalRepositories}
                    repositories={actions.repositories}
                />
            ) : null}
            {dialogMode === 'schedules' ? (
                <ActiveSchedulesDialog
                    onClose={closeDialog}
                    open
                    readOnly={readOnly}
                />
            ) : null}
            {dialogMode === 'branch' ? (
                <BranchSwitchDialog
                    branches={actions.branches}
                    isLoading={actions.isLoading}
                    onBranchChange={actions.setSwitchBranch}
                    onClose={actions.closeDialog}
                    onSwitchBranch={(branch) => void actions.switchProjectBranch(branch)}
                    open
                    selectedBranch={actions.switchBranch}
                />
            ) : null}
            {dialogMode === 'release' ? (
                <CompleteReleaseDialog
                    branchCandidates={actions.releaseBranchCandidates}
                    defaultSelectAll={actions.releaseSelectAllDefault}
                    isLoading={actions.isLoading}
                    key={dialogMode === 'release' ? 'release-open' : 'release-closed'}
                    onClose={actions.closeDialog}
                    onCompleteRelease={actions.completeRelease}
                    onSelectAllDefaultChange={actions.setReleaseSelectAllDefault}
                    open
                />
            ) : null}
            {dialogMode === 'card' ? (
                <NewCardDialog
                    cardTypes={actions.cardTypes}
                    initialTargetStatus={actions.newCardInitialStatus}
                    isLoading={actions.isLoading}
                    isProjectOpen={actions.isProjectOpen}
                    onClose={actions.closeDialog}
                    onCreateCard={actions.createCard}
                    open
                    states={actions.states}
                />
            ) : null}
        </Menu>
    )

    return (
        <AppBar
            color="default"
            elevation={0}
            position="static"
            sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
        >
            <MainToolbar
                availableTabs={availableMenuTabs}
                currentTab={visibleCurrentTab}
                isMobile={isMobile}
                isNewActionDisabled={!project || readOnly}
                isNewCardDisabled={!actions.isProjectOpen || readOnly}
                isNewDiagramDisabled={!actions.isProjectOpen || readOnly || isCreatingDiagram}
                onCreateAction={handleCreateAction}
                onCreateCard={handleOpenCardDialog}
                onCreateDiagram={handleCreateDiagram}
                onOpenMenu={onOpenMobileMenu}
                onTabChange={handleTabChange}
                regexpAgent={regexpAgent}
            />
            <Box style={NO_DRAG_REGION}>{menuPanel}</Box>
        </AppBar>
    )
}
