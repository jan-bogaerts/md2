import { MenuItem, Stack, TextField } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import { mergeAgentProfiles } from '../../data/agent_profiles'
import type { RawActionDefinition } from '../../data/action_types'
import { agentCapabilitiesService, type AgentCapabilitiesService } from '../../services/agent_capabilities_service'
import { useAgentCapabilities } from '../hooks/use_agent_capabilities'
import { useConfigValue } from '../hooks/use_config_value'

interface ActionAgentCapabilityFieldsProps {
    definition: RawActionDefinition
    errors: Partial<Record<keyof RawActionDefinition, string>>
    onChange: (definition: RawActionDefinition) => void
    service?: AgentCapabilitiesService
}

export function ActionAgentCapabilityFields(props: ActionAgentCapabilityFieldsProps) {
    const { definition, errors, onChange, service = agentCapabilitiesService } = props
    const profiles = mergeAgentProfiles(useConfigValue('desktop.agentProfiles'))
    const { availability, models, thinkingLevels } = useAgentCapabilities(service)

    useEffect(() => {
        if (definition.agent) void service.loadModels(definition.agent)
        else service.clear()
    }, [definition.agent, service])

    useEffect(() => {
        if (definition.agent && definition.model) {
            void service.loadThinkingLevels(definition.agent, definition.model)
        }
    }, [definition.agent, definition.model, service])

    const handleAgentChange = (event: ChangeEvent<HTMLInputElement>) => {
        const agent = event.target.value
        onChange({
            ...definition,
            agent: agent || undefined,
            model: undefined,
            thinkingLevel: undefined,
        })
    }

    const handleModelChange = (event: ChangeEvent<HTMLInputElement>) => {
        const model = event.target.value
        onChange({ ...definition, ...(model ? { model } : {}), model: model || undefined, thinkingLevel: undefined })
    }

    const handleThinkingLevelChange = (event: ChangeEvent<HTMLInputElement>) => {
        const thinkingLevel = event.target.value
        onChange({ ...definition, thinkingLevel: thinkingLevel === 'none' ? undefined : thinkingLevel })
    }

    const selectedAvailability = definition.agent ? availability.values[definition.agent] : undefined
    const agentCapabilityError = availability.error
        ?? (definition.agent && !availability.loading && !selectedAvailability
            ? `Agent executable availability is missing for ${definition.agent}`
            : selectedAvailability?.error)

    const modelValues = definition.model && !models.values.includes(definition.model)
        ? [definition.model, ...models.values]
        : models.values
    const configuredThinkingLevels = thinkingLevels.values.filter((level) => level !== 'none')
    const thinkingLevelValues = definition.thinkingLevel && !configuredThinkingLevels.includes(definition.thinkingLevel)
        ? [definition.thinkingLevel, ...configuredThinkingLevels]
        : configuredThinkingLevels

    return (
        <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
            <TextField
                error={!!errors.agent || !!agentCapabilityError}
                fullWidth
                helperText={errors.agent ?? agentCapabilityError ?? (availability.loading ? 'Checking agent availability…' : undefined)}
                label="Agent override"
                onChange={handleAgentChange}
                select
                size="small"
                value={definition.agent ?? ''}
            >
                <MenuItem value="">Application default</MenuItem>
                {profiles.map((profile) => {
                    const profileAvailability = availability.values[profile.name]
                    const disabled = availability.loading || !!availability.error || !profileAvailability?.available
                    const label = profileAvailability?.error ? `${profile.name} — ${profileAvailability.error}` : profile.name

                    return <MenuItem disabled={disabled} key={profile.name} value={profile.name}>{label}</MenuItem>
                })}
            </TextField>
            <TextField
                disabled={!definition.agent || models.loading || !!models.error}
                error={!!errors.model || !!models.error}
                fullWidth
                helperText={errors.model ?? models.error ?? (models.loading ? 'Loading models…' : undefined)}
                label="Model"
                onChange={handleModelChange}
                select
                size="small"
                value={definition.model ?? ''}
            >
                <MenuItem value="">Select model</MenuItem>
                {modelValues.map((model) => <MenuItem key={model} value={model}>{model}</MenuItem>)}
            </TextField>
            <TextField
                disabled={!definition.agent || !definition.model || thinkingLevels.loading || !!thinkingLevels.error}
                error={!!errors.thinkingLevel || !!thinkingLevels.error}
                fullWidth
                helperText={errors.thinkingLevel ?? thinkingLevels.error ?? (thinkingLevels.loading ? 'Loading thinking levels…' : undefined)}
                label="Thinking level"
                onChange={handleThinkingLevelChange}
                select
                size="small"
                value={definition.thinkingLevel ?? 'none'}
            >
                <MenuItem value="none">none</MenuItem>
                {thinkingLevelValues.map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>
        </Stack>
    )
}
