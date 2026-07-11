import { Box, Button, Divider, MenuItem, Tab as MuiTab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode, SyntheticEvent } from 'react'
import { useCallback, useState } from 'react'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import CheckCircleOutline from 'mdi-material-ui/CheckCircleOutline'
import Cog from 'mdi-material-ui/Cog'
import ContentSaveOutline from 'mdi-material-ui/ContentSaveOutline'
import FileDocumentPlusOutline from 'mdi-material-ui/FileDocumentPlusOutline'
import FolderOpen from 'mdi-material-ui/FolderOpen'
import TextBoxOutline from 'mdi-material-ui/TextBoxOutline'
import { defaultModelForProfile, findAgentProfile, mergeAgentProfiles } from '../../../data/agent_profiles'
import { configService } from '../../../services/config_service'
import { writeDesktopConfigToBridge } from '../../../services/config_persistence'
import { projectSessionService } from '../../../services/project_session_service'
import { workspaceViewService, type WorkspaceViewMode } from '../../../services/workspace_view_service'
import type { UseGithubAuthResult } from '../../../auth/use_github_auth'
import { useConfigValue, useHasDesktopConfig } from '../../hooks/use_config_value'
import { useProjectState } from '../../hooks/use_project_state'
import { useWorkspaceView } from '../../hooks/use_workspace_view'
import { MainToolbar } from '../main_toolbar'
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
import { Section } from './section'
import { Tab } from './tab'

type AppMenuTab = 'home' | 'agents'
type ProjectDialogMode = 'open' | 'branch' | 'card' | 'release'

interface AppMenuProps {
    accessToken: string | null
    auth: UseGithubAuthResult
    extraActions: ReactNode
    isGithubAuthenticated: boolean
    isMobile: boolean
    onOpenConfig: () => void
    onOpenMobileMenu: () => void
    search: ReactNode
}

const MENU_TABS: { label: string; value: AppMenuTab }[] = [
    { label: 'Home', value: 'home' },
    { label: 'Agents', value: 'agents' },
]

function persistDesktopConfig() {
    if (!configService.hasDesktopConfig()) return

    writeDesktopConfigToBridge(configService.getDesktopValues())
}

/** Tabbed app menu hosting project, account and agent actions. */
export function AppMenu(props: AppMenuProps) {
    const { accessToken, auth, extraActions, isGithubAuthenticated, isMobile, onOpenConfig, onOpenMobileMenu, search } = props
    const { hasPendingPush, hasPendingSave, project } = useProjectState()
    const { viewMode } = useWorkspaceView()
    const [currentTab, setCurrentTab] = useState<AppMenuTab>('home')
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(null)
    const agentProfiles = mergeAgentProfiles(useConfigValue('desktop.agentProfiles'))
    const selectedAgent = useConfigValue('desktop.agent')
    const selectedProfile = findAgentProfile(agentProfiles, selectedAgent)
    const selectedModels = selectedProfile?.models ?? []
    const configuredModel = useConfigValue('desktop.model')
    const desktopAvailable = useHasDesktopConfig()
    const selectedModel = configuredModel || (selectedProfile ? defaultModelForProfile(selectedProfile) : '')
    const projectBranch = project?.branch ?? ''

    const closeDialog = useCallback(() => {
        setDialogMode(null)
    }, [])

    const openDialog = useCallback((mode: ProjectDialogMode) => {
        setDialogMode(mode)
    }, [])

    const actions = useProjectToolbarMenuActions({
        accessToken,
        isGithubAuthenticated,
        onCloseDialog: closeDialog,
        onOpenDialog: openDialog,
    })
    const branchOptions = actions.branches.length > 0 ? actions.branches : (project ? [{ name: project.branch }] : [])
    const selectedBranch = branchOptions.some((branch) => branch.name === actions.switchBranch) ? actions.switchBranch : projectBranch

    const handleTabChange = (_event: SyntheticEvent, value: AppMenuTab) => {
        setCurrentTab(value)
    }

    const handleOpenProject = () => {
        actions.openProjectDialog()
    }

    const handleCreateProjectFolders = (projectFolder: string) => {
        void actions.createProjectFolders(projectFolder)
    }

    const handleLoadBranches = () => {
        void actions.loadSwitchBranches()
    }

    const handleBranchChange = (event: SelectChangeEvent) => {
        void actions.switchProjectBranch(event.target.value)
    }

    const handleOpenReleaseDialog = () => {
        openDialog('release')
    }

    const handleOpenCardDialog = () => {
        openDialog('card')
    }

    const handleSave = async () => {
        try {
            await actions.push()
        } catch {
            // ProjectSessionService emits the user-visible error.
        }
    }

    const handleViewModeChange = (_event: ReactMouseEvent<HTMLElement>, nextMode: WorkspaceViewMode | null) => {
        if (!nextMode) return

        workspaceViewService.setViewMode(nextMode)
    }

    const handleAgentChange = (event: SelectChangeEvent) => {
        const profile = findAgentProfile(agentProfiles, event.target.value)
        const nextModel = profile ? defaultModelForProfile(profile) : ''
        configService.set('desktop.agent', event.target.value)
        configService.set('desktop.model', nextModel)
        persistDesktopConfig()
    }

    const setModel = (value: string) => {
        configService.set('desktop.model', value)
        persistDesktopConfig()
    }

    const handleModelSelectChange = (event: SelectChangeEvent) => {
        setModel(event.target.value)
    }

    const handleModelTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        setModel(event.target.value)
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

    const menuPanel = (
        <Menu>
            <Box role="tabpanel" sx={{ display: currentTab === 'home' ? 'block' : 'none' }}>
                <Tab>
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
                        {actions.pushMode === 'manual' ? (
                            <MenuIconButton
                                disabled={!actions.isProjectOpen || actions.isLoading || (!hasPendingPush && !hasPendingSave)}
                                label="Push"
                                onClick={handleSave}
                            >
                                <ContentSaveOutline fontSize="small" />
                            </MenuIconButton>
                        ) : null}
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Settings">
                        <MenuIconButton label="Config" onClick={onOpenConfig}>
                            <Cog fontSize="small" />
                        </MenuIconButton>
                        {extraActions}
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
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
                        </ToggleButtonGroup>
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <MenuIconButton
                        disabled={!actions.isProjectOpen || actions.activeCards.length === 0 || actions.isReleaseCompleting}
                        label="Complete release"
                        onClick={handleOpenReleaseDialog}
                    >
                        <CheckCircleOutline fontSize="small" />
                    </MenuIconButton>
                    <Button
                        disabled={!actions.isProjectOpen}
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
                </Tab>
            </Box>
            <Box role="tabpanel" sx={{ display: currentTab === 'agents' ? 'block' : 'none' }}>
                <Tab>
                    <Section label="Setup">
                        <MenuSelect
                            disabled={!desktopAvailable}
                            label="Default agent"
                            minWidth={130}
                            onChange={handleAgentChange}
                            value={selectedAgent}
                        >
                            {agentProfiles.map((profile) => (
                                <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>
                            ))}
                        </MenuSelect>
                        {selectedModels.length > 0 ? (
                            <MenuSelect
                                disabled={!desktopAvailable}
                                label="Default model"
                                minWidth={150}
                                onChange={handleModelSelectChange}
                                value={selectedModel}
                            >
                                {selectedModels.map((model) => (
                                    <MenuItem key={model} value={model}>{model}</MenuItem>
                                ))}
                            </MenuSelect>
                        ) : (
                            <Tooltip title="Default model">
                                <TextField
                                    disabled={!desktopAvailable}
                                    onChange={handleModelTextChange}
                                    size="small"
                                    slotProps={{ htmlInput: { 'aria-label': 'Default model' } }}
                                    style={NO_DRAG_REGION}
                                    sx={{ width: 150 }}
                                    value={selectedModel}
                                />
                            </Tooltip>
                        )}
                        <Button disabled size="small" variant="outlined">Add chatbot</Button>
                    </Section>
                </Tab>
            </Box>
            <ProjectOpenDialog
                branches={actions.branches}
                isDesktopMode={actions.isDesktopMode}
                isGithubAuthenticated={isGithubAuthenticated}
                isLoading={actions.isLoading}
                onCreateProjectFolders={handleCreateProjectFolders}
                projectOpenResolution={actions.projectOpenResolution}
                onBranchChange={() => undefined}
                onClose={actions.closeDialog}
                onCreateRemoteProject={actions.createRemoteProject}
                onCreateWorkingFolder={() => void actions.createWorkingFolder()}
                onDiscardGithubPendingCommits={handleDiscardGithubPendingCommits}
                onLoadManualBranches={actions.loadManualBranches}
                onLoadRemoteBranches={actions.loadRemoteBranches}
                onOpenGithub={actions.openGithubProject}
                onOpenRemote={actions.openRemoteProject}
                onRepositoryChange={actions.loadRepositoryBranches}
                onSourceChange={actions.clearOpenDialogState}
                onUseWorkingFolder={(folder) => void actions.openWorkingFolder(folder)}
                open={dialogMode === 'open'}
                pendingGithubConflictProject={actions.pendingGithubConflictProject}
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
                isLoading={actions.isLoading}
                onClose={actions.closeDialog}
                onCompleteRelease={actions.completeRelease}
                open={dialogMode === 'release'}
            />
            <NewCardDialog
                cardTypes={actions.cardTypes}
                isLoading={actions.isLoading}
                isProjectOpen={actions.isProjectOpen}
                onClose={actions.closeDialog}
                onCreateCard={actions.createCard}
                open={dialogMode === 'card'}
            />
        </Menu>
    )

    return (
        <MainToolbar
            isMobile={isMobile}
            onOpenMenu={onOpenMobileMenu}
            panel={menuPanel}
            search={search}
            tabs={menuTabs}
        />
    )
}
