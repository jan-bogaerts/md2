import { Box, MenuItem, Tab as MuiTab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent, MouseEvent as ReactMouseEvent, ReactNode, SyntheticEvent } from 'react'
import { useCallback, useState } from 'react'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import CheckCircleOutline from 'mdi-material-ui/CheckCircleOutline'
import Cog from 'mdi-material-ui/Cog'
import Delete from 'mdi-material-ui/Delete'
import FileDocumentPlusOutline from 'mdi-material-ui/FileDocumentPlusOutline'
import FolderOpen from 'mdi-material-ui/FolderOpen'
import TextBoxOutline from 'mdi-material-ui/TextBoxOutline'
import { defaultModelForProfile, findAgentProfile, mergeAgentProfiles } from '../../../data/agent_profiles'
import { configService } from '../../../services/config_service'
import { writeDesktopConfigToBridge } from '../../../services/config_persistence'
import { dataService } from '../../../services/data_service'
import { dialogService } from '../../../services/dialog_service'
import { projectSessionService } from '../../../services/project_session_service'
import { workspaceViewService, type WorkspaceViewMode } from '../../../services/workspace_view_service'
import type { UseGithubAuthResult } from '../../../auth/use_github_auth'
import { MarkdownFormatToolbarHost } from '../../editor/markdown_format_toolbar_host'
import { CardDeleteDialog } from '../../card_view/card_delete_dialog'
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
import { MenuIconButton } from './menu_icon_button'
import { MenuSelect } from './menu_select'
import { Section } from './section'
import { Tab } from './tab'
import { ThemeModeToggle } from './theme_mode_toggle'

type AppMenuTab = 'home' | 'edit' | 'format' | 'options'
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
    { label: 'Edit', value: 'edit' },
    { label: 'Format', value: 'format' },
    { label: 'Options', value: 'options' },
]

function persistDesktopConfig() {
    if (!configService.hasDesktopConfig()) return

    writeDesktopConfigToBridge(configService.getDesktopValues())
}

/** Tabbed app menu hosting project, edit, format, account and options actions. */
export function AppMenu(props: AppMenuProps) {
    const { accessToken, auth, extraActions, isGithubAuthenticated, isMobile, onOpenConfig, onOpenMobileMenu, search } = props
    const { project, snapshot } = useProjectState()
    const { selectedPath, viewMode } = useWorkspaceView()
    const [currentTab, setCurrentTab] = useState<AppMenuTab>('home')
    const [dialogMode, setDialogMode] = useState<ProjectDialogMode | null>(null)
    const [deleteCardPath, setDeleteCardPath] = useState<string | null>(null)
    const activeCards = snapshot?.activeCards ?? []
    const selectedActiveCard = activeCards.find((card) => card.path === selectedPath)
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

    const handleOpenDeleteDialog = () => {
        if (selectedActiveCard) setDeleteCardPath(selectedActiveCard.path)
    }

    const handleCloseDeleteDialog = () => {
        setDeleteCardPath(null)
    }

    const handleDeleteCard = async (path: string) => {
        try {
            await dataService.cards.deleteCard(path)
            workspaceViewService.clearSelectedPath(path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Card delete failed: ${path}` })
            throw error
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
            sx={{ minHeight: 40 }}
            value={currentTab}
            variant="scrollable"
        >
            {MENU_TABS.map((tab) => (
                <MuiTab key={tab.value} label={tab.label} sx={{ minHeight: 40, textTransform: 'none' }} value={tab.value} />
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
                        <MenuSelect
                            disabled={!actions.isProjectOpen || actions.isLoading}
                            label="Switch branch"
                            minWidth={150}
                            onChange={handleBranchChange}
                            onOpen={handleLoadBranches}
                            value={selectedBranch}
                        >
                            {branchOptions.map((branch) => (
                                <MenuItem key={branch.name} value={branch.name}>{branch.name}</MenuItem>
                            ))}
                        </MenuSelect>
                        <MenuIconButton
                            disabled={!actions.isProjectOpen || actions.activeCards.length === 0 || actions.isReleaseCompleting}
                            label="Complete release"
                            onClick={handleOpenReleaseDialog}
                        >
                            <CheckCircleOutline fontSize="small" />
                        </MenuIconButton>
                    </Section>
                    <Section label="View">
                        <ToggleButtonGroup exclusive onChange={handleViewModeChange} size="small" value={viewMode}>
                            <Tooltip title="Cards view">
                                <ToggleButton aria-label="Cards view" value="cards">
                                    <CardsOutline fontSize="small" />
                                </ToggleButton>
                            </Tooltip>
                            <Tooltip title="Text view">
                                <ToggleButton aria-label="Text view" value="text">
                                    <TextBoxOutline fontSize="small" />
                                </ToggleButton>
                            </Tooltip>
                        </ToggleButtonGroup>
                    </Section>
                    <Section label="Account">
                        <GithubAuthToolbarButton auth={auth} />
                    </Section>
                </Tab>
            </Box>
            <Box role="tabpanel" sx={{ display: currentTab === 'edit' ? 'block' : 'none' }}>
                <Tab>
                    <Section label="Card">
                        <MenuIconButton disabled={!actions.isProjectOpen} label="New card" onClick={handleOpenCardDialog}>
                            <FileDocumentPlusOutline fontSize="small" />
                        </MenuIconButton>
                        <MenuIconButton disabled={!selectedActiveCard} label="Delete card" onClick={handleOpenDeleteDialog}>
                            <Delete fontSize="small" />
                        </MenuIconButton>
                    </Section>
                </Tab>
            </Box>
            <Box role="tabpanel" sx={{ display: currentTab === 'format' ? 'block' : 'none' }}>
                <Tab>
                    <Section label="Markdown">
                        <MarkdownFormatToolbarHost />
                    </Section>
                </Tab>
            </Box>
            <Box role="tabpanel" sx={{ display: currentTab === 'options' ? 'block' : 'none' }}>
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
                        <MenuIconButton label="Config" onClick={onOpenConfig}>
                            <Cog fontSize="small" />
                        </MenuIconButton>
                        {extraActions}
                    </Section>
                    <Section label="View">
                        <ThemeModeToggle />
                    </Section>
                </Tab>
            </Box>
            <ProjectOpenDialog
                branches={actions.branches}
                isGithubAuthenticated={isGithubAuthenticated}
                isLoading={actions.isLoading}
                isLocalAvailable={actions.isLocalAvailable}
                missingWorkingFolder={actions.missingWorkingFolder}
                onBranchChange={() => undefined}
                onChooseLocalFolder={actions.chooseLocalFolder}
                onClose={actions.closeDialog}
                onCreateRemoteProject={actions.createRemoteProject}
                onCreateWorkingFolder={() => void actions.createWorkingFolder()}
                onDiscardGithubPendingCommits={handleDiscardGithubPendingCommits}
                onLoadManualBranches={actions.loadManualBranches}
                onLoadRemoteBranches={actions.loadRemoteBranches}
                onOpenGithub={actions.openGithubProject}
                onOpenLocal={(localProject, branch) => void actions.openLocalProject(localProject, branch)}
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
            <CardDeleteDialog cardPath={deleteCardPath} onClose={handleCloseDeleteDialog} onDeleteCard={handleDeleteCard} />
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
