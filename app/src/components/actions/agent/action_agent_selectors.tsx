import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import {
    Box,
    Button,
    IconButton,
    ListItemText,
    Menu,
    MenuItem,
    Tooltip,
} from '@mui/material'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import {
    PERMISSION_MODE_OPTIONS,
    THINKING_LEVELS,
    supportsThinkingLevel,
    validatePermissionMode,
    validateThinkingLevel,
    type PermissionMode,
    type ThinkingLevel,
} from '../../../data/agent_profiles'
import {
    selectAgent,
    selectModel,
    selectPermissionMode,
    selectThinkingLevel,
} from '../../../data/agent_selection'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { useActionRunSettings } from '../shared/use_action_run_settings'

interface ActionAgentSelectorsProps {
    action: ActionDefinition
    context: ActionContext
    settingsStore: ActionRunSettingsStore
}

const PERMISSION_MODE_COLORS: Record<PermissionMode, string> = {
    'ask-for-approval': 'success.main',
    'approve-for-me': 'warning.main',
    'full-access': 'error.main',
}

const COMPACT_THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
    high: 'h',
    low: 'l',
    max: 'max',
    medium: 'm',
    none: 'none',
}

type AgentSettingsSubmenu = 'agent' | 'model' | 'thinkingLevel'

function selectRunStatus(run: ActionRun | null) {
    return run?.status ?? null
}

/** Agent run settings exposed as compact model and security menus. */
export function ActionAgentSelectors(props: ActionAgentSelectorsProps) {
    const { action, context, settingsStore } = props
    const [modelMenuAnchor, setModelMenuAnchor] = useState<HTMLElement | null>(null)
    const [submenuAnchor, setSubmenuAnchor] = useState<HTMLElement | null>(null)
    const [submenu, setSubmenu] = useState<AgentSettingsSubmenu | null>(null)
    const [securityMenuAnchor, setSecurityMenuAnchor] = useState<HTMLElement | null>(null)
    const runStatus = useActionRunSelector(action.id, context, selectRunStatus)
    const settings = useActionRunSettings(action, settingsStore)
    const disabled = !settings.desktopConfigAvailable
        || settings.availabilityLoading
        || settings.settingsLoading
        || runStatus === 'queued'
        || runStatus === 'running'
    const changedWhileWaiting = runStatus === 'waitingForInput'
    const permissionOption = PERMISSION_MODE_OPTIONS.find(({ value }) => value === settings.permissionMode)
    const securityTooltip = settings.permissionModeSupported
        ? permissionOption?.label ?? 'Security'
        : 'Permission controls are unsupported by this agent'
    const selectedProfile = settings.agentProfiles.find(({ name }) => name === settings.agent) ?? null
    const selectedModelAvailable = settings.selectedAgentModels.includes(settings.model)

    const handleOpenModelMenu = (event: MouseEvent<HTMLButtonElement>) => setModelMenuAnchor(event.currentTarget)
    const handleCloseSubmenu = () => {
        const anchor = submenuAnchor
        setSubmenu(null)
        setSubmenuAnchor(null)
        anchor?.focus()
    }
    const handleCloseModelMenu = () => {
        setSubmenu(null)
        setSubmenuAnchor(null)
        setModelMenuAnchor(null)
    }
    const handleOpenSecurityMenu = (event: MouseEvent<HTMLButtonElement>) => setSecurityMenuAnchor(event.currentTarget)
    const handleCloseSecurityMenu = () => setSecurityMenuAnchor(null)

    const openSubmenu = (anchor: HTMLElement) => {
        const nextSubmenu = anchor.dataset.submenu as AgentSettingsSubmenu | undefined
        if (!nextSubmenu) throw new Error('Agent settings menu item is missing its submenu')
        setSubmenu(nextSubmenu)
        setSubmenuAnchor(anchor)
    }

    const handleOpenSubmenu = (event: MouseEvent<HTMLElement>) => openSubmenu(event.currentTarget)

    const handleSubmenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowRight') return
        event.preventDefault()
        openSubmenu(event.currentTarget)
    }

    const handleNestedMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowLeft') return
        event.preventDefault()
        event.stopPropagation()
        handleCloseSubmenu()
    }

    const handleAgentChange = (event: MouseEvent<HTMLElement>) => {
        const agent = event.currentTarget.dataset.agent
        if (agent === undefined) throw new Error('Agent menu item is missing its agent')
        const nextSettings = selectAgent(settings.selection, agent, settings.agentProfiles, settings.selectionSources)
        settingsStore.setSettings(nextSettings, changedWhileWaiting)
        handleCloseModelMenu()
    }

    const handleModelChange = (event: MouseEvent<HTMLElement>) => {
        const model = event.currentTarget.dataset.model
        if (model === undefined) throw new Error('Model menu item is missing its model')
        settingsStore.setSettings(selectModel(settings.selection, model), changedWhileWaiting)
        handleCloseModelMenu()
    }

    const handleThinkingLevelChange = (event: MouseEvent<HTMLElement>) => {
        const thinkingLevel = validateThinkingLevel(event.currentTarget.dataset.thinkingLevel, 'action run input')
        settingsStore.setSettings(selectThinkingLevel(settings.selection, thinkingLevel), changedWhileWaiting)
        handleCloseModelMenu()
    }

    const handlePermissionModeChange = (event: MouseEvent<HTMLElement>) => {
        const permissionMode = validatePermissionMode(event.currentTarget.dataset.permissionMode, 'action run input')
        settingsStore.setSettings(selectPermissionMode(settings.selection, permissionMode), changedWhileWaiting)
        handleCloseSecurityMenu()
    }

    return (
        <Box aria-label="Agent settings" role="group" sx={{ alignItems: 'center', display: 'flex', flexShrink: 1, gap: 0.5, minWidth: 0 }}>
            <Button
                aria-controls={modelMenuAnchor ? 'action-agent-model-menu' : undefined}
                aria-expanded={!!modelMenuAnchor}
                aria-haspopup="menu"
                aria-label="Model"
                disabled={disabled}
                onClick={handleOpenModelMenu}
                size="small"
                sx={{
                    borderColor: 'divider', color: 'text.secondary', flexShrink: 1, fontSize: 12, gap: 0.5, height: 28,
                    justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden', px: 1, textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                }}
                variant="outlined"
            >
                <Box
                    component="span"
                    data-model-label
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                    {settings.model || 'Default'}
                </Box>
                <Box component="span" data-thinking-level sx={{ flexShrink: 0 }}>
                    <Box
                        component="span"
                        data-full-thinking-level
                        sx={{ '@container (max-width: 420px)': { display: 'none' } }}
                    >
                        {settings.thinkingLevel}
                    </Box>
                    <Box
                        component="span"
                        data-compact-thinking-level
                        sx={{ display: 'none', '@container (max-width: 420px)': { display: 'inline' } }}
                    >
                        {COMPACT_THINKING_LEVEL_LABELS[settings.thinkingLevel]}
                    </Box>
                </Box>
            </Button>
            <Tooltip title={securityTooltip}>
                <span>
                    <IconButton
                        aria-controls={securityMenuAnchor ? 'action-agent-security-menu' : undefined}
                        aria-expanded={!!securityMenuAnchor}
                        aria-haspopup="menu"
                        aria-label="Permission mode"
                        data-permission-mode={settings.permissionMode || 'unsupported'}
                        disabled={disabled || !settings.permissionModeSupported}
                        onClick={handleOpenSecurityMenu}
                        size="small"
                        sx={{
                            border: '1px solid', borderColor: 'divider', borderRadius: 1,
                            color: settings.permissionModeSupported
                                ? PERMISSION_MODE_COLORS[settings.permissionMode as PermissionMode]
                                : 'custom.text4',
                            height: 28, width: 28,
                            '&:hover': { bgcolor: 'custom.track', borderColor: 'custom.borderHover' },
                        }}
                    >
                        <ShieldOutlined sx={{ fontSize: 18 }} />
                    </IconButton>
                </span>
            </Tooltip>
            <Menu
                anchorEl={modelMenuAnchor}
                id="action-agent-model-menu"
                onClose={handleCloseModelMenu}
                open={!!modelMenuAnchor}
                slotProps={{ list: { 'aria-label': 'Agent model settings' } }}
            >
                <MenuItem
                    aria-haspopup="menu"
                    data-submenu="agent"
                    onClick={handleOpenSubmenu}
                    onKeyDown={handleSubmenuKeyDown}
                >
                    <ListItemText>Agent</ListItemText>
                    <ChevronRight fontSize="small" />
                </MenuItem>
                <MenuItem
                    aria-haspopup="menu"
                    data-submenu="model"
                    onClick={handleOpenSubmenu}
                    onKeyDown={handleSubmenuKeyDown}
                >
                    <ListItemText>Model</ListItemText>
                    <ChevronRight fontSize="small" />
                </MenuItem>
                <MenuItem
                    aria-haspopup="menu"
                    data-submenu="thinkingLevel"
                    onClick={handleOpenSubmenu}
                    onKeyDown={handleSubmenuKeyDown}
                >
                    <ListItemText>Thinking level</ListItemText>
                    <ChevronRight fontSize="small" />
                </MenuItem>
            </Menu>
            <Menu
                anchorEl={submenuAnchor}
                anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
                onClose={handleCloseSubmenu}
                open={submenu === 'agent'}
                slotProps={{ list: { 'aria-label': 'Agent choices', onKeyDown: handleNestedMenuKeyDown } }}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            >
                {!selectedProfile ? (
                    <MenuItem data-agent={settings.agent} disabled selected>
                        <ListItemText primary={`${settings.agent} — unavailable`} secondary={settings.selectionValidationError} />
                    </MenuItem>
                ) : null}
                {settings.agentProfiles.map((profile) => {
                    const availability = settings.agentAvailability[profile.name]
                    const available = availability?.available === true

                    return (
                        <MenuItem
                            data-agent={profile.name}
                            disabled={!available}
                            key={profile.name}
                            onClick={handleAgentChange}
                            selected={profile.name === settings.agent}
                        >
                            <ListItemText
                                primary={available ? profile.name : `${profile.name} — unavailable`}
                                secondary={availability?.error}
                            />
                        </MenuItem>
                    )
                })}
            </Menu>
            <Menu
                anchorEl={submenuAnchor}
                anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
                onClose={handleCloseSubmenu}
                open={submenu === 'model'}
                slotProps={{ list: { 'aria-label': 'Model choices', onKeyDown: handleNestedMenuKeyDown } }}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            >
                {(!selectedModelAvailable ? [settings.model] : []).concat(
                    settings.selectedAgentModels.length > 0 ? settings.selectedAgentModels : [''],
                ).map((model) => (
                    <MenuItem
                        data-model={model}
                        disabled={model === settings.model && !selectedModelAvailable}
                        key={model || 'default'}
                        onClick={handleModelChange}
                        selected={model === settings.model}
                    >
                        {model === settings.model && !selectedModelAvailable
                            ? `${model || 'Default'} — unavailable`
                            : model || 'Default'}
                    </MenuItem>
                ))}
            </Menu>
            <Menu
                anchorEl={submenuAnchor}
                anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
                onClose={handleCloseSubmenu}
                open={submenu === 'thinkingLevel'}
                slotProps={{ list: { 'aria-label': 'Thinking level choices', onKeyDown: handleNestedMenuKeyDown } }}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            >
                {THINKING_LEVELS.map((thinkingLevel) => {
                    const available = !!selectedProfile && supportsThinkingLevel(selectedProfile, thinkingLevel)

                    return (
                        <MenuItem
                            data-thinking-level={thinkingLevel}
                            disabled={!available}
                            key={thinkingLevel}
                            onClick={handleThinkingLevelChange}
                            selected={thinkingLevel === settings.thinkingLevel}
                        >
                            {thinkingLevel === settings.thinkingLevel && !available
                                ? `${thinkingLevel} — unavailable`
                                : thinkingLevel}
                        </MenuItem>
                    )
                })}
            </Menu>
            <Menu
                anchorEl={securityMenuAnchor}
                id="action-agent-security-menu"
                onClose={handleCloseSecurityMenu}
                open={!!securityMenuAnchor}
                slotProps={{ list: { 'aria-label': 'Security settings' } }}
            >
                {PERMISSION_MODE_OPTIONS.map(({ description, label, value }) => (
                    <MenuItem
                        data-permission-mode={value}
                        key={value}
                        onClick={handlePermissionModeChange}
                        selected={value === settings.permissionMode}
                    >
                        <ListItemText primary={label} secondary={description} />
                    </MenuItem>
                ))}
            </Menu>
        </Box>
    )
}
