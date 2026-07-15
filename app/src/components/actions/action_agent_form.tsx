import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { THINKING_LEVELS, type AgentProfile, type ThinkingLevel } from '../../data/agent_profiles'
import type { AgentAvailability } from '../../data/electron_data_bridge'

interface ActionAgentFormProps {
    actionLabel: string
    agent: string
    agentAvailability: Record<string, AgentAvailability>
    agentProfiles: AgentProfile[]
    compact?: boolean
    convertMessage: string | null
    extraPrompt: string
    model: string
    onActionLabelChange: (event: ChangeEvent<HTMLInputElement>) => void
    onAgentChange: (event: ChangeEvent<HTMLInputElement>) => void
    onConvertToAction: () => void
    onExtraPromptChange: (event: ChangeEvent<HTMLInputElement>) => void
    onModelChange: (event: ChangeEvent<HTMLInputElement>) => void
    onThinkingLevelChange: (event: ChangeEvent<HTMLInputElement>) => void
    onRunShortcut?: () => void
    onSaveAndRun: () => void
    saveDisabled: boolean
    selectedAgentModels: string[]
    showSaveControls: boolean
    thinkingLevel: ThinkingLevel
}

/** Presentation-only agent run controls for an action popup. */
export function ActionAgentForm(props: ActionAgentFormProps) {
    const {
        actionLabel,
        agent,
        agentAvailability,
        agentProfiles,
        compact = false,
        convertMessage,
        extraPrompt,
        model,
        onActionLabelChange,
        onAgentChange,
        onConvertToAction,
        onExtraPromptChange,
        onModelChange,
        onThinkingLevelChange,
        onRunShortcut,
        onSaveAndRun,
        saveDisabled,
        selectedAgentModels,
        showSaveControls,
        thinkingLevel,
    } = props

    const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter' || !onRunShortcut) return

        event.preventDefault()
        onRunShortcut()
    }

    const handlePromptKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || !onRunShortcut) return

        event.preventDefault()
        onRunShortcut()
    }

    if (compact) {
        const fieldSx = {
            '& .MuiOutlinedInput-root': {
                borderRadius: '9px',
                fontSize: 13,
                '& fieldset': { borderColor: (theme: { palette: { mode: string } }) => theme.palette.mode === 'dark' ? '#364152' : '#d5dbe3' },
                '&:hover fieldset': { borderColor: 'text.secondary' },
                '&.Mui-focused': {boxShadow: (theme: { palette: { action: { selected: string } } }) => `0 0 0 3px ${theme.palette.action.selected}`},
                '&.Mui-focused fieldset': { borderColor: 'primary.main' },
            },
        }

        return (
            <Stack spacing={2}>
                {showSaveControls ? (
                    <Stack spacing={0.75}>
                        <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 0.75 }}>
                            <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600 }}>Preset name</Typography>
                            <Typography color="text.disabled" sx={{ fontSize: 11.5 }}>saved for reuse</Typography>
                        </Box>
                        <TextField
                            autoFocus
                            fullWidth
                            onChange={onActionLabelChange}
                            onKeyDown={handleNameKeyDown}
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Preset name' } }}
                            sx={fieldSx}
                            value={actionLabel}
                            variant="outlined"
                        />
                    </Stack>
                ) : null}
                <Stack spacing={0.75}>
                    <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 0.75 }}>
                        <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600 }}>Extra prompt</Typography>
                        <Typography color="text.disabled" sx={{ fontSize: 11.5 }}>optional</Typography>
                    </Box>
                    <TextField
                        fullWidth
                        minRows={4}
                        multiline
                        onChange={onExtraPromptChange}
                        onKeyDown={handlePromptKeyDown}
                        placeholder="Add extra instructions for this run..."
                        slotProps={{ htmlInput: { 'aria-label': 'Extra prompt' } }}
                        sx={{
                            ...fieldSx,
                            '& .MuiOutlinedInput-root': {
                                ...fieldSx['& .MuiOutlinedInput-root'],
                                alignItems: 'flex-start',
                                minHeight: 96,
                                py: 0.25,
                            },
                            '& textarea': { resize: 'vertical' },
                        }}
                        value={extraPrompt}
                        variant="outlined"
                    />
                </Stack>
                <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 0.75 }}>
                    <span>Agent</span>
                    <Box sx={{ alignItems: 'center', display: 'flex', position: 'relative' }}>
                        <Box sx={{ bgcolor: 'success.main', borderRadius: '50%', height: 6, left: 8, position: 'absolute', width: 6, zIndex: 1 }} />
                        <TextField
                            onChange={onAgentChange}
                            select
                            slotProps={{ select: { inputProps: { 'aria-label': 'Agent' } } }}
                            sx={{
                                minWidth: 82,
                                '& .MuiInputBase-root': { borderRadius: '6px', color: 'text.secondary', fontSize: 12, fontWeight: 600, height: 26, pl: 2 },
                                '& .MuiInputBase-root:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                                '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                            }}
                            value={agent}
                            variant="standard"
                        >
                            {agentProfiles.map((profile) => (
                                <MenuItem
                                    disabled={agentAvailability[profile.name]?.available !== true}
                                    key={profile.name}
                                    value={profile.name}
                                >
                                    {profile.name}{agentAvailability[profile.name]?.error ? ` — ${agentAvailability[profile.name].error}` : ''}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <Box sx={{ bgcolor: 'divider', height: 14, mx: 0.25, width: '1px' }} />
                    <span>Model</span>
                    {selectedAgentModels.length > 0 ? (
                        <TextField
                            onChange={onModelChange}
                            select
                            slotProps={{ select: { inputProps: { 'aria-label': 'Model' } } }}
                            sx={{
                                minWidth: 90,
                                '& .MuiInputBase-root': { borderRadius: '6px', color: 'text.secondary', fontSize: 12, fontWeight: 600, height: 26, pl: 0.75 },
                                '& .MuiInputBase-root:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                                '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                            }}
                            value={model}
                            variant="standard"
                        >
                            {selectedAgentModels.map((agentModel) => (
                                <MenuItem key={agentModel} value={agentModel}>{agentModel}</MenuItem>
                            ))}
                        </TextField>
                    ) : (
                        <TextField
                            onChange={onModelChange}
                            placeholder="Default"
                            slotProps={{ htmlInput: { 'aria-label': 'Model' } }}
                            sx={{
                                width: 90,
                                '& .MuiInputBase-root': { borderRadius: '6px', color: 'text.secondary', fontSize: 12, fontWeight: 600, height: 26, px: 0.75 },
                                '& .MuiInputBase-root:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                                '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                            }}
                            value={model}
                            variant="standard"
                        />
                    )}
                    <Box sx={{ bgcolor: 'divider', height: 14, mx: 0.25, width: '1px' }} />
                    <span>Thinking</span>
                    <TextField
                        onChange={onThinkingLevelChange}
                        select
                        slotProps={{ select: { inputProps: { 'aria-label': 'Thinking level' } } }}
                        sx={{
                            minWidth: 72,
                            '& .MuiInputBase-root': { borderRadius: '6px', color: 'text.secondary', fontSize: 12, fontWeight: 600, height: 26, pl: 0.75 },
                            '& .MuiInputBase-root:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                            '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' },
                        }}
                        value={thinkingLevel}
                        variant="standard"
                    >
                        {THINKING_LEVELS.map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
                    </TextField>
                </Box>
                {convertMessage ? (
                    <Typography color="text.secondary" role="status" variant="caption">
                        {convertMessage}
                    </Typography>
                ) : null}
            </Stack>
        )
    }

    return (
        <Stack spacing={1}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label="Agent" onChange={onAgentChange} select size="small" value={agent}>
                    {agentProfiles.map((profile) => (
                        <MenuItem disabled={agentAvailability[profile.name]?.available !== true} key={profile.name} value={profile.name}>
                            {profile.name}{agentAvailability[profile.name]?.error ? ` — ${agentAvailability[profile.name].error}` : ''}
                        </MenuItem>
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
                <TextField label="Thinking level" onChange={onThinkingLevelChange} select size="small" value={thinkingLevel}>
                    {THINKING_LEVELS.map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}
                </TextField>
            </Stack>
            <TextField label="Extra prompt" minRows={3} multiline onChange={onExtraPromptChange} value={extraPrompt} />
            {showSaveControls ? (
                <Stack spacing={1}>
                    <TextField label="Name" onChange={onActionLabelChange} size="small" value={actionLabel} />
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button disabled={saveDisabled} onClick={onConvertToAction} variant="outlined">
                            Save
                        </Button>
                        <Button disabled={saveDisabled} onClick={onSaveAndRun} variant="contained">
                            Save and run
                        </Button>
                    </Stack>
                </Stack>
            ) : extraPrompt.trim().length > 0 ? (
                <Stack direction="row" spacing={1}>
                    <TextField label="Action label" onChange={onActionLabelChange} size="small" value={actionLabel} />
                    <Button onClick={onConvertToAction} variant="outlined">Convert to action</Button>
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
