import { Box, MenuItem, TextField } from '@mui/material'
import type { ChangeEvent } from 'react'
import {
    PERMISSION_MODE_OPTIONS,
    THINKING_LEVELS,
    type AgentProfile,
    type PermissionMode,
    type ThinkingLevel,
} from '../../../data/agent_profiles'
import type { AgentAvailability } from '../../../data/electron_data_bridge'

interface ActionAgentSelectorsProps {
    agent: string
    agentAvailability: Record<string, AgentAvailability>
    agentProfiles: AgentProfile[]
    disabled: boolean
    model: string
    onAgentChange: (event: ChangeEvent<HTMLInputElement>) => void
    onModelChange: (event: ChangeEvent<HTMLInputElement>) => void
    onPermissionModeChange: (event: ChangeEvent<HTMLInputElement>) => void
    onThinkingLevelChange: (event: ChangeEvent<HTMLInputElement>) => void
    selectedAgentModels: string[]
    permissionMode: PermissionMode | ''
    permissionModeSupported: boolean
    thinkingLevel: ThinkingLevel
}

/** Compact agent, model and thinking selectors for an action popup. */
export function ActionAgentSelectors(props: ActionAgentSelectorsProps) {
    const {
        agent, agentAvailability, agentProfiles, disabled, model, onAgentChange, onModelChange,
        onPermissionModeChange, onThinkingLevelChange, permissionMode, permissionModeSupported,
        selectedAgentModels, thinkingLevel,
    } = props

    return (
        <>
            <Box sx={{ alignItems: 'center', display: 'flex', position: 'relative' }}>
                <Box sx={{ bgcolor: 'success.main', borderRadius: '50%', height: 6, left: 8, position: 'absolute', width: 6, zIndex: 1 }} />
                <TextField
                    disabled={disabled}
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
            {selectedAgentModels.length > 0 ? (
                <TextField
                    disabled={disabled}
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
                    disabled={disabled}
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
            <TextField
                disabled={disabled}
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
            <Box sx={{ bgcolor: 'divider', height: 14, mx: 0.25, width: '1px' }} />
            {permissionModeSupported ? (
                <TextField
                    disabled={disabled}
                    onChange={onPermissionModeChange}
                    select
                    slotProps={{ select: { inputProps: { 'aria-label': 'Permission mode' } } }}
                    sx={{ minWidth: 150, '& .MuiInputBase-root': { borderRadius: '6px', color: permissionMode === 'full-access' ? 'warning.main' : 'text.secondary', fontSize: 12, fontWeight: 600, height: 26, pl: 0.75 }, '& .MuiInput-root:before, & .MuiInput-root:after': { display: 'none' } }}
                    value={permissionMode}
                    variant="standard"
                >
                    {PERMISSION_MODE_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
            ) : <TextField disabled slotProps={{ htmlInput: { 'aria-label': 'Permission mode' } }} sx={{ width: 150 }} value="Permissions unsupported" variant="standard" />}
        </>
    )
}
