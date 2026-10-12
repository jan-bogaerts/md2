import { IconButton, MenuItem, TextField, Tooltip } from '@mui/material'
import Refresh from '@mui/icons-material/Refresh';
import type { SelectChangeEvent } from '@mui/material'
import { useEffect } from 'react'
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
    SPEED_MODE_OPTIONS,
    validateSpeedMode,
} from '../../../data/agent_profiles'
import {
    projectAgentSelection,
    selectAgent,
    selectModel,
    selectPermissionMode,
    selectThinkingLevel,
    selectSpeedMode,
    type AgentSelectionState,
} from '../../../data/agent_selection'
import { configService } from '../../../services/config/config_service'
import { writeDesktopConfigToBridge } from '../../../services/config/config_persistence'
import { dialogService } from '../../../services/dialog_service'
import { useConfigValue, useHasDesktopConfig } from '../../hooks/use_config_value'
import { useAgentModelCatalog } from '../../hooks/use_agent_model_catalog';
import { agentModelOptions } from '../../../data/agent_model_options';
import { NO_DRAG_REGION } from '../drag_region'
import { MenuSelect } from './menu_select'
import { Section } from './section'

function desktopSelectionError(selection: AgentSelectionState, profiles: ReturnType<typeof mergeAgentProfiles>) {
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

/** Owns desktop-agent configuration subscriptions and controls. */
export function AgentMenuControls() {
    const agentProfiles = mergeAgentProfiles(useConfigValue('desktop.agentProfiles'))
    const agentSelection = useConfigValue('desktop.agentSelection')
    const selectedAgent = agentSelection.activeAgent
    const selectedProfile = findAgentProfile(agentProfiles, selectedAgent)
    const activeAgentSettings = agentSelection.settingsByAgent[selectedAgent]
    const selectedThinkingLevel = activeAgentSettings?.thinkingLevel ?? 'none'
    const selectedPermissionMode = agentSelection.permissionMode
    const desktopAvailable = useHasDesktopConfig()
    const selectedModel = activeAgentSettings?.model ?? ''
    const modelCatalog = useAgentModelCatalog(selectedProfile);
    const selectedModels = agentModelOptions(modelCatalog.catalog, selectedModel);
    const selectedSpeedMode = activeAgentSettings?.speedMode ?? 'default';
    const selectionError = activeAgentSettings
        ? desktopSelectionError(agentSelection, agentProfiles)
        : null;

    useEffect(() => {
        if (activeAgentSettings) return

        const error = new Error(`Missing desktop settings for active agent: ${selectedAgent}`)
        dialogService.error(error, { fallbackMessage: 'Desktop agent settings are invalid' })
    }, [activeAgentSettings, selectedAgent])

    const handleAgentChange = (event: SelectChangeEvent) => {
        configService.set('desktop.agentSelection', selectAgent(agentSelection, event.target.value, agentProfiles))
        persistDesktopConfig()
    }
    const setModel = (value: string) => {
        configService.set('desktop.agentSelection', selectModel(agentSelection, value))
        persistDesktopConfig()
    }
    const handleModelSelectChange = (event: SelectChangeEvent) => setModel(event.target.value)
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

    const handleSpeedModeChange = (event: SelectChangeEvent) => {
        configService.set('desktop.agentSelection', selectSpeedMode(agentSelection, validateSpeedMode(event.target.value, 'Default speed')));
        persistDesktopConfig();
    };

    return (
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
                {agentProfiles.map((profile) => <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>)}
            </MenuSelect>
            <MenuSelect
                disabled={!desktopAvailable}
                errorMessage={selectionError}
                label="Default model"
                minWidth={150}
                onChange={handleModelSelectChange}
                value={selectedModel}
            >
                {!selectedModel ? <MenuItem value="">Profile default</MenuItem> : null}
                {selectedModels.map(({ displayName, id }) => (
                    <MenuItem key={id} value={id}>
                        {displayName}
                    </MenuItem>
                ))}
            </MenuSelect>
            <Tooltip title={modelCatalog.error ?? (modelCatalog.loading ? 'Loading models' : 'Refresh models')}>
                <span style={NO_DRAG_REGION}>
                    <IconButton aria-label="Refresh models" disabled={!desktopAvailable}
                        onClick={modelCatalog.refresh} size="small"><Refresh fontSize="small" /></IconButton>
                </span>
            </Tooltip>
            <MenuSelect
                disabled={!desktopAvailable}
                errorMessage={selectionError}
                label="Default reasoning level"
                minWidth={120}
                onChange={handleThinkingLevelChange}
                value={selectedThinkingLevel}
            >
                {THINKING_LEVELS.map((level) => {
                    const available = !!selectedProfile && supportsThinkingLevel(selectedProfile, level);

                    return <MenuItem disabled={!available} key={level} value={level}>{level === selectedThinkingLevel && !available ? `${level} — unavailable` : level}</MenuItem>
                })}
            </MenuSelect>
            {selectedAgent === 'codex' ? (
                <MenuSelect disabled={!desktopAvailable} errorMessage={selectionError} label="Default speed"
                    minWidth={140} onChange={handleSpeedModeChange} value={selectedSpeedMode}>
                    {SPEED_MODE_OPTIONS.map(({ label, value }) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                </MenuSelect>
            ) : null}
            {selectedProfile && supportsPermissionMode(selectedProfile) ? (
                <MenuSelect
                    disabled={!desktopAvailable}
                    label="Default permission mode"
                    minWidth={190}
                    onChange={handlePermissionModeChange}
                    value={selectedPermissionMode}
                >
                    {PERMISSION_MODE_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </MenuSelect>
            ) : <TextField disabled size="small" value="Permissions unsupported" />}
        </Section>
    )
}
