import { MenuItem, TextField, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { useEffect, type ChangeEvent } from 'react'
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
import { dialogService } from '../../../services/dialog_service'
import { useConfigValue, useHasDesktopConfig } from '../../hooks/use_config_value'
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
    const selectedModels = selectedProfile?.models ?? []
    const activeAgentSettings = agentSelection.settingsByAgent[selectedAgent]
    const selectedThinkingLevel = activeAgentSettings?.thinkingLevel ?? 'none'
    const selectedPermissionMode = agentSelection.permissionMode
    const desktopAvailable = useHasDesktopConfig()
    const selectedModel = activeAgentSettings?.model ?? ''
    const selectionError = activeAgentSettings ? desktopSelectionError(agentSelection, agentProfiles) : null
    const selectedModelAvailable = selectedModels.includes(selectedModel)

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
    const handleModelTextChange = (event: ChangeEvent<HTMLInputElement>) => setModel(event.target.value)
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
                    {selectedModels.map((model) => <MenuItem key={model} value={model}>{model}</MenuItem>)}
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

                    return <MenuItem disabled={!available} key={level} value={level}>{level === selectedThinkingLevel && !available ? `${level} — unavailable` : level}</MenuItem>
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
                    {PERMISSION_MODE_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </MenuSelect>
            ) : <TextField disabled size="small" value="Permissions unsupported" />}
        </Section>
    )
}
