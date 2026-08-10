import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import {
    Box,
    Button,
    IconButton,
    ListItemText,
    ListSubheader,
    Menu,
    MenuItem,
    Tooltip,
} from '@mui/material'
import { useState, type MouseEvent } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import {
    DEFAULT_PERMISSION_MODE,
    PERMISSION_MODE_OPTIONS,
    THINKING_LEVELS,
    defaultModelForProfile,
    findAgentProfile,
    supportsPermissionMode,
    validatePermissionMode,
    validateThinkingLevel,
    type PermissionMode,
} from '../../../data/agent_profiles'
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

function selectRunStatus(run: ActionRun | null) {
    return run?.status ?? null
}

/** Agent run settings exposed as compact model and security menus. */
export function ActionAgentSelectors(props: ActionAgentSelectorsProps) {
    const { action, context, settingsStore } = props
    const [modelMenuAnchor, setModelMenuAnchor] = useState<HTMLElement | null>(null)
    const [securityMenuAnchor, setSecurityMenuAnchor] = useState<HTMLElement | null>(null)
    const runStatus = useActionRunSelector(action.id, context, selectRunStatus)
    const settings = useActionRunSettings(action, settingsStore)
    const currentSettings = {
        agent: settings.agent,
        model: settings.model,
        permissionMode: settings.permissionMode,
        thinkingLevel: settings.thinkingLevel,
    }
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

    const handleOpenModelMenu = (event: MouseEvent<HTMLButtonElement>) => setModelMenuAnchor(event.currentTarget)
    const handleCloseModelMenu = () => setModelMenuAnchor(null)
    const handleOpenSecurityMenu = (event: MouseEvent<HTMLButtonElement>) => setSecurityMenuAnchor(event.currentTarget)
    const handleCloseSecurityMenu = () => setSecurityMenuAnchor(null)

    const handleAgentChange = (event: MouseEvent<HTMLElement>) => {
        const agent = event.currentTarget.dataset.agent
        if (agent === undefined) throw new Error('Agent menu item is missing its agent')
        const profile = findAgentProfile(settings.agentProfiles, agent)
        const nextSettings: Parameters<ActionRunSettingsStore['setSettings']>[0] = {
            agent,
            model: profile ? defaultModelForProfile(profile) : '',
            permissionMode: profile && supportsPermissionMode(profile) ? DEFAULT_PERMISSION_MODE : '',
            thinkingLevel: 'none',
        }
        settingsStore.setSettings(nextSettings, changedWhileWaiting)
        handleCloseModelMenu()
    }

    const handleModelChange = (event: MouseEvent<HTMLElement>) => {
        const model = event.currentTarget.dataset.model
        if (model === undefined) throw new Error('Model menu item is missing its model')
        settingsStore.setSettings({ ...currentSettings, model, thinkingLevel: 'none' }, changedWhileWaiting)
        handleCloseModelMenu()
    }

    const handleThinkingLevelChange = (event: MouseEvent<HTMLElement>) => {
        const thinkingLevel = validateThinkingLevel(event.currentTarget.dataset.thinkingLevel, 'action run input')
        settingsStore.setSettings({ ...currentSettings, thinkingLevel }, changedWhileWaiting)
        handleCloseModelMenu()
    }

    const handlePermissionModeChange = (event: MouseEvent<HTMLElement>) => {
        const permissionMode = validatePermissionMode(event.currentTarget.dataset.permissionMode, 'action run input')
        settingsStore.setSettings({ ...currentSettings, permissionMode }, changedWhileWaiting)
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
                    borderColor: 'divider', color: 'text.secondary', flexShrink: 1, fontSize: 12, height: 28,
                    justifyContent: 'flex-start', minWidth: 0, overflow: 'hidden', px: 1, textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                }}
                variant="outlined"
            >
                {settings.model || 'Default'} {settings.thinkingLevel}
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
                <ListSubheader disableSticky>Agent</ListSubheader>
                {settings.agentProfiles.map((profile) => {
                    const availability = settings.agentAvailability[profile.name]

                    return (
                        <MenuItem
                            data-agent={profile.name}
                            disabled={availability?.available !== true}
                            key={profile.name}
                            onClick={handleAgentChange}
                            selected={profile.name === settings.agent}
                        >
                            <ListItemText primary={profile.name} secondary={availability?.error} />
                        </MenuItem>
                    )
                })}
                <ListSubheader disableSticky>Model</ListSubheader>
                {(settings.selectedAgentModels.length > 0 ? settings.selectedAgentModels : ['']).map((model) => (
                    <MenuItem
                        data-model={model}
                        key={model || 'default'}
                        onClick={handleModelChange}
                        selected={model === settings.model}
                    >
                        {model || 'Default'}
                    </MenuItem>
                ))}
                <ListSubheader disableSticky>Thinking level</ListSubheader>
                {THINKING_LEVELS.map((thinkingLevel) => (
                    <MenuItem
                        data-thinking-level={thinkingLevel}
                        key={thinkingLevel}
                        onClick={handleThinkingLevelChange}
                        selected={thinkingLevel === settings.thinkingLevel}
                    >
                        {thinkingLevel}
                    </MenuItem>
                ))}
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
