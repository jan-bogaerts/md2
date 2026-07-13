import { MenuItem, Stack, TextField } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useEffect } from 'react'
import { mergeAgentProfiles } from '../../data/agent_profiles'
import type { RawActionDefinition } from '../../data/action_types'
import { agentCapabilitiesService } from '../../services/agent_capabilities_service'
import { useAgentCapabilities } from '../hooks/use_agent_capabilities'
import { useConfigValue } from '../hooks/use_config_value'

interface ActionAgentCapabilityFieldsProps {
    definition: RawActionDefinition
    errors: Partial<Record<keyof RawActionDefinition, string>>
    onChange: (definition: RawActionDefinition) => void
}

export function ActionAgentCapabilityFields(props: ActionAgentCapabilityFieldsProps) {
    const { definition, errors, onChange } = props
    const profiles = mergeAgentProfiles(useConfigValue('desktop.agentProfiles'))
    const { models, thinkingLevels } = useAgentCapabilities()

    useEffect(() => {
        if (definition.agent) void agentCapabilitiesService.loadModels(definition.agent)
        else agentCapabilitiesService.clear()
    }, [definition.agent])

    useEffect(() => {
        if (definition.agent && definition.model) {
            void agentCapabilitiesService.loadThinkingLevels(definition.agent, definition.model)
        }
    }, [definition.agent, definition.model])

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
        onChange({ ...definition, thinkingLevel: thinkingLevel || undefined })
    }

    const modelValues = definition.model && !models.values.includes(definition.model)
        ? [definition.model, ...models.values]
        : models.values
    const thinkingLevelValues = definition.thinkingLevel && !thinkingLevels.values.includes(definition.thinkingLevel)
        ? [definition.thinkingLevel, ...thinkingLevels.values]
        : thinkingLevels.values

    return (
        <Stack direction={{ md: 'row', xs: 'column' }} spacing={1}>
            <TextField
                error={!!errors.agent}
                fullWidth
                helperText={errors.agent}
                label="Agent override"
                onChange={handleAgentChange}
                select
                size="small"
                value={definition.agent ?? ''}
            >
                <MenuItem value="">Application default</MenuItem>
                {profiles.map((profile) => <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>)}
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
                value={definition.thinkingLevel ?? ''}
            >
                <MenuItem value="">Select thinking level</MenuItem>
                {thinkingLevelValues.map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
            </TextField>
        </Stack>
    )
}
