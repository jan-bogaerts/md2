import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { AgentProfile } from '../../data/agent_profiles'

interface ActionAgentFormProps {
    actionLabel: string
    agent: string
    agentProfiles: AgentProfile[]
    convertMessage: string | null
    extraPrompt: string
    model: string
    onActionLabelChange: (event: ChangeEvent<HTMLInputElement>) => void
    onAgentChange: (event: ChangeEvent<HTMLInputElement>) => void
    onConvertToAction: () => void
    onExtraPromptChange: (event: ChangeEvent<HTMLInputElement>) => void
    onModelChange: (event: ChangeEvent<HTMLInputElement>) => void
    selectedAgentModels: string[]
}

/** Presentation-only agent run controls for an action popup. */
export function ActionAgentForm(props: ActionAgentFormProps) {
    const {
        actionLabel,
        agent,
        agentProfiles,
        convertMessage,
        extraPrompt,
        model,
        onActionLabelChange,
        onAgentChange,
        onConvertToAction,
        onExtraPromptChange,
        onModelChange,
        selectedAgentModels,
    } = props

    return (
        <Stack spacing={1}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label="Agent" onChange={onAgentChange} select size="small" value={agent}>
                    {agentProfiles.map((profile) => (
                        <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>
                    ))}
                </TextField>
                {selectedAgentModels.length > 0 ? (
                    <TextField label="Model" onChange={onModelChange} select size="small" value={model}>
                        {selectedAgentModels.map((agentModel) => (
                            <MenuItem key={agentModel} value={agentModel}>{agentModel}</MenuItem>
                        ))}
                    </TextField>
                ) : (
                    <TextField label="Model" onChange={onModelChange} size="small" value={model} />
                )}
            </Stack>
            <TextField label="Extra prompt" minRows={3} multiline onChange={onExtraPromptChange} value={extraPrompt} />
            {extraPrompt.trim().length > 0 ? (
                <Stack direction="row" spacing={1}>
                    <TextField label="Action label" onChange={onActionLabelChange} size="small" value={actionLabel} />
                    <Button onClick={onConvertToAction} variant="outlined">
                        Convert to action
                    </Button>
                </Stack>
            ) : null}
            {convertMessage ? (
                <Typography color="text.secondary" variant="caption">
                    {convertMessage}
                </Typography>
            ) : null}
        </Stack>
    )
}
