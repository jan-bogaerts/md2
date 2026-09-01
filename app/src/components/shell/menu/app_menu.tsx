import { Box, Button, Divider, MenuItem, Tab as MuiTab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode, SyntheticEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import CardsOutline from 'mdi-material-ui/CardsOutline'
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
import {
    findAgentProfile,
    mergeAgentProfiles,
    PERMISSION_MODE_OPTIONS,
    supportsPermissionMode,
    supportsThinkingLevel,
    THINKING_LEVELS,
    validateAgentSelection,
    validatePermissionMode,
    validateThinkingLevel,
} from '../../../data/agent_profiles'
import {
    projectAgentSelection,
    selectAgent,
    selectModel,
    selectPermissionMode,
    selectThinkingLevel,
    type AgentSelectionState,
} from '../../../data/agent_selection'
import { configService } from '../../../services/config/config_service'
import { writeDesktopConfigToBridge } from '../../../services/config/config_persistence'
import {
    projectSessionService,
    type ProjectFolderValues,
    type ProjectOpenResolution,
} from '../../../services/project/project_session_service'
import { workspaceViewService, type WorkspaceViewMode } from '../../../services/project/workspace_view_service'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { actionService } from '../../../services/actions/action_service'
import { dialogService } from '../../../services/dialog_service'
import { keyboardShortcutService } from '../../../services/shortcuts/keyboard_shortcut_service'
import { projectContext } from '../../../data/action_context'
import type { UseGithubAuthResult } from '../../../auth/use_github_auth'
import { useConfigValue, useHasDesktopConfig } from '../../hooks/use_config_value'
import { useProjectState } from '../../hooks/use_project_state'
import { useProjectPersistence } from '../../hooks/use_project_persistence'
import { useProjectConfig } from '../../hooks/use_project_config'
import { useProjectReadOnly } from '../../hooks/use_project_read_only'
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
import { MenuSelect } from './menu_select'
import { MobileCreateMenu } from './mobile_create_menu'
import { Section } from './section'
import { Tab } from './tab'

type AppMenuTab = 'home' | 'agents'
type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release'

interface AppMenuProps {
    accessToken: string | null
    auth: UseGithubAuthResult
    extraActions: ReactNode
    initialProjectOpenResolution: ProjectOpenResolution | null
    isGithubAuthenticated: boolean
    isMobile: boolean
    onOpenConfig: () => void
    onOpenMobileMenu: () => void
    search: ReactNode
}

const MENU_TABS: { label: string; value: AppMenuTab }[] = [
    { label: 'Home', value: 'home' },
    { label: 'Run', value: 'agents' },
]
const PROJECT_CONTEXT = projectContext()

function desktopSelectionError(
    selection: AgentSelectionState,
    profiles: ReturnType<typeof mergeAgentProfiles>,
) {
    try {
        validateAgentSelection(profiles, projectAgentSelection(selection, profiles), 'desktop agent selection')

        return null
    } catch (error) {
        return error instanceof Error ? error.message : 'Invalid desktop agent selection'
    }
}

function persistDesktopConfig() {
    if (!configService.hasDesktopConfig()) return

    writeDesktopConfigToBridge(configService.getDesktopValues())
}

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
        search,
    } = props
    const { project } = useProjectState()
    const { hasPendingPush, hasPendingSave } = useProjectPersistence()
    const primaryWorktreeStatus = usePrimaryWorktreeStatus()
    const projectConfig = useProjectConfig()
    const { viewMode } = useWorkspaceView()
    const [currentTab, setCurrentTab] = useState<AppMenuTab>('home')
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(initialProjectOpenResolution ? 'open' : null)
    const agentProfiles = mergeAgentProfiles(useConfigValue('desktop.agentProfiles'))
    const agentSelection = useConfigValue('desktop.agentSelection')
    const selectedAgent = agentSelection.activeAgent
    const selectedProfile = findAgentProfile(agentProfiles, selectedAgent)
    const selectedModels = selectedProfile?.models ?? []
    const activeAgentSettings = agentSelection.settingsByAgent[selectedAgent]
    const hasActiveAgentSettings = !!activeAgentSettings
    const selectedThinkingLevel = activeAgentSettings?.thinkingLevel ?? 'none'
    const selectedPermissionMode = agentSelection.permissionMode
    const desktopAvailable = useHasDesktopConfig()
    const selectedModel = activeAgentSettings?.model ?? ''
    const selectionError = hasActiveAgentSettings ? desktopSelectionError(agentSelection, agentProfiles) : null
    const selectedModelAvailable = selectedModels.includes(selectedModel)
    const projectBranch = project?.branch ?? ''
    const readOnly = useProjectReadOnly()

    useEffect(() => {
        if (!hasActiveAgentSettings) {
            const error = new Error(`Missing desktop settings for active agent: ${selectedAgent}`)
            dialogService.error(error, { fallbackMessage: 'Desktop agent settings are invalid' })
        }
    }, [hasActiveAgentSettings, selectedAgent])

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

    const handleTabChange = (_event: SyntheticEvent, value: AppMenuTab) => {
        setCurrentTab(value)
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

    const handleOpenReleaseDialog = () => {
        void actions.openReleaseDialog()
    }

    const handleOpenCardDialog = () => {
        actions.openNewCardDialog()
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

    const handleAgentChange = (event: SelectChangeEvent) => {
        configService.set('desktop.agentSelection', selectAgent(agentSelection, event.target.value, agentProfiles))
        persistDesktopConfig()
    }

    const setModel = (value: string) => {
        configService.set('desktop.agentSelection', selectModel(agentSelection, value))
        persistDesktopConfig()
    }

    const handleModelSelectChange = (event: SelectChangeEvent) => {
        setModel(event.target.value)
    }

    const handleModelTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        setModel(event.target.value)
    }

    const handleThinkingLevelChange = (event: SelectChangeEvent) => {
        const thinkingLevel = validateThinkingLevel(event.target.value, 'Default reasoning level')
        configService.set('desktop.agentSelection', selectThinkingLevel(agentSelection, thinkingLevel))
        persistDesktopConfig()
    }

    const handlePermissionModeChange = (event: SelectChangeEvent) => {
        const permissionMode = validatePermissionMode(event.target.value, 'Default permission mode')
        configService.set('desktop.agentSelection', selectPermissionMode(agentSelection, permissionMode))
        persistDesktopConfig()
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

    const handleDiscardGithubPendingCommits = () => {
        if (!actions.pendingGithubConflictProject) return

        projectSessionService.discardGithubPendingCommits(actions.pendingGithubConflictProject, accessToken)
    }

    const menuTabs = (
        <Tabs
            aria-label="Application menu"
            onChange={handleTabChange}
            scrollButtons={false}
            sx={{
                minHeight: 44,
                '& .MuiTabs-indicator': { height: 2 },
            }}
            value={currentTab}
            variant="scrollable"
        >
            {MENU_TABS.map((tab) => (
                <MuiTab
                    key={tab.value}
                    label={tab.label}
                    sx={{ fontSize: 13.5, minHeight: 44, minWidth: 0, px: 1.5, textTransform: 'none' }}
                    value={tab.value}
                />
            ))}
        </Tabs>
    )

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
            <Box role="tabpanel" sx={{ display: currentTab === 'home' ? 'block' : 'none' }}>
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
                            <Button disabled={!project || readOnly} onClick={handleCreateAction} size="small" variant="outlined">New action</Button>
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
                            <Box sx={{ flex: 1 }} />
                            <Section label="Account">
                                <GithubAuthToolbarButton auth={auth} />
                            </Section>
                        </>
                    ) : null}
                </Tab>
            </Box>
            <Box role="tabpanel" sx={{ display: currentTab === 'agents' ? 'block' : 'none' }}>
                <Tab>
                    <Section label="Setup">
                        <MenuSelect
                            disabled={!desktopAvailable}
                            errorMessage={selectionError}
                            label="Default agent"
                            minWidth={130}
                            onChange={handleAgentChange}
                            value={selectedAgent}
                        >
                            {!selectedProfile ? <MenuItem disabled value={selectedAgent}>{selectedAgent} — unavailable</MenuItem> : null}
                            {agentProfiles.map((profile) => (
                                <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>
                            ))}
                        </MenuSelect>
                        {selectedModels.length > 0 ? (
                            <MenuSelect
                                disabled={!desktopAvailable}
                                errorMessage={selectionError}
                                label="Default model"
                                minWidth={150}
                                onChange={handleModelSelectChange}
                                value={selectedModel}
                            >
                                {!selectedModelAvailable ? <MenuItem disabled value={selectedModel}>{selectedModel || 'Default'} — unavailable</MenuItem> : null}
                                {selectedModels.map((model) => (
                                    <MenuItem key={model} value={model}>{model}</MenuItem>
                                ))}
                            </MenuSelect>
                        ) : (
                            <Tooltip title={selectionError ?? 'Default model'}>
                                <TextField
                                    disabled={!desktopAvailable}
                                    error={!!selectionError}
                                    helperText={selectionError ? 'Unavailable' : undefined}
                                    onChange={handleModelTextChange}
                                    size="small"
                                    slotProps={{ htmlInput: { 'aria-label': 'Default model' } }}
                                    style={NO_DRAG_REGION}
                                    sx={{ width: 150 }}
                                    value={selectedModel}
                                />
                            </Tooltip>
                        )}
                        <MenuSelect
                            disabled={!desktopAvailable}
                            errorMessage={selectionError}
                            label="Default reasoning level"
                            minWidth={120}
                            onChange={handleThinkingLevelChange}
                            value={selectedThinkingLevel}
                        >
                            {THINKING_LEVELS.map((level) => {
                                const available = !!selectedProfile && supportsThinkingLevel(selectedProfile, level)

                                return (
                                    <MenuItem disabled={!available} key={level} value={level}>
                                        {level === selectedThinkingLevel && !available ? `${level} — unavailable` : level}
                                    </MenuItem>
                                )
                            })}
                        </MenuSelect>
                        {selectedProfile && supportsPermissionMode(selectedProfile) ? (
                            <MenuSelect
                                disabled={!desktopAvailable}
                                label="Default permission mode"
                                minWidth={190}
                                onChange={handlePermissionModeChange}
                                value={selectedPermissionMode}
                            >
                                {PERMISSION_MODE_OPTIONS.map(({ label, value }) => (
                                    <MenuItem key={value} value={value}>{label}</MenuItem>
                                ))}
                            </MenuSelect>
                        ) : <TextField disabled size="small" value="Permissions unsupported" />}
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Actions">
                        <ActionEntryPoints context={PROJECT_CONTEXT} variant="icons" visibility="explicit-context" />
                        <MenuIconButton
                            disabled={readOnly || !actions.isProjectOpen || actions.activeCards.length === 0 || actions.isReleaseCompleting}
                            label="Complete release"
                            onClick={handleOpenReleaseDialog}
                        >
                            <CheckCircleOutline fontSize="small" />
                        </MenuIconButton>
                    </Section>
                </Tab>
            </Box>
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
                onRepositoryChange={actions.loadRepositoryBranches}
                onSourceChange={actions.clearOpenDialogState}
                open={dialogMode === 'open'}
                pendingGithubConflictProject={actions.pendingGithubConflictProject}
                recentLocalRepositories={actions.recentLocalRepositories}
                repositories={actions.repositories}
            />
            <BranchSwitchDialog
                branches={actions.branches}
                isLoading={actions.isLoading}
                onBranchChange={actions.setSwitchBranch}
                onClose={actions.closeDialog}
                onSwitchBranch={(branch) => void actions.switchProjectBranch(branch)}
                open={dialogMode === 'branch'}
                selectedBranch={actions.switchBranch}
            />
            <CompleteReleaseDialog
                branchCandidates={actions.releaseBranchCandidates}
                defaultSelectAll={actions.releaseSelectAllDefault}
                isLoading={actions.isLoading}
                key={dialogMode === 'release' ? 'release-open' : 'release-closed'}
                onClose={actions.closeDialog}
                onCompleteRelease={actions.completeRelease}
                onSelectAllDefaultChange={actions.setReleaseSelectAllDefault}
                open={dialogMode === 'release'}
            />
            <NewCardDialog
                cardTypes={actions.cardTypes}
                initialTargetStatus={actions.newCardInitialStatus}
                isLoading={actions.isLoading}
                isProjectOpen={actions.isProjectOpen}
                onClose={actions.closeDialog}
                onCreateCard={actions.createCard}
                open={dialogMode === 'card'}
                states={actions.states}
            />
        </Menu>
    )

    return (
        <MainToolbar
            isMobile={isMobile}
            mobileAction={isMobile && currentTab === 'home' ? (
                <MobileCreateMenu
                    isNewActionDisabled={!project || readOnly}
                    isNewCardDisabled={!actions.isProjectOpen || readOnly}
                    onCreateAction={handleCreateAction}
                    onCreateCard={handleOpenCardDialog}
                />
            ) : null}
            onOpenMenu={onOpenMobileMenu}
            panel={menuPanel}
            search={search}
            tabs={menuTabs}
        />
    )
}
