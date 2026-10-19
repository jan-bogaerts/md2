import { MenuItem, Select, Stack, Typography } from '@mui/material';
import type { AgentProfile, PermissionMode, SpeedMode, ThinkingLevel } from '../../../../data/agent_profiles';
import { PERMISSION_MODE_OPTIONS, SPEED_MODE_OPTIONS, THINKING_LEVELS, supportsPermissionMode, supportsThinkingLevel } from '../../../../data/agent_profiles';
import { projectAgentSelection, type AgentSelectionState } from '../../../../data/agent_selection';
import type { AgentModelOption } from '../../../../data/agent_model_options';
import type { CardSequenceDraftService } from './card_sequence_draft_service';

interface CardSequenceAgentSelectionProps {
    availability: Record<string, { available: boolean; error?: string | null }>;
    modelOptions: AgentModelOption[];
    profiles: AgentProfile[];
    selection: AgentSelectionState;
    service: CardSequenceDraftService;
}

/** Bind sequence execution settings to one draft. */
export function CardSequenceAgentSelection({ availability, modelOptions, profiles, selection, service }: CardSequenceAgentSelectionProps) {
    const chosen = projectAgentSelection(selection, profiles);
    const profile = profiles.find(({ name }) => name === chosen.agent);
    const models = modelOptions.some(({ id }) => id === chosen.model)
        ? modelOptions
        : [{ id: chosen.model, displayName: `${chosen.model || '(none)'} — unavailable` }, ...modelOptions];
    const handleAgentChange = (event: { target: { value: unknown } }) => service.setExecutionAgent(event.target.value as string);
    const handleModelChange = (event: { target: { value: unknown } }) => service.setExecutionModel(event.target.value as string);
    const handleThinkingChange = (event: { target: { value: unknown } }) => (
        service.setExecutionThinkingLevel(event.target.value as ThinkingLevel)
    );
    const handlePermissionChange = (event: { target: { value: unknown } }) => (
        service.setExecutionPermissionMode(event.target.value as PermissionMode)
    );
    const handleSpeedChange = (event: { target: { value: unknown } }) => service.setExecutionSpeedMode(event.target.value as SpeedMode);

    return <Stack spacing={1} aria-label="Sequence execution settings" role="group">
        <Typography color="text.secondary" variant="subtitle2">Action agent settings</Typography>
        <Typography color="text.secondary" variant="caption">Agent</Typography>
        <Select inputProps={{ 'aria-label': 'Execution agent' }} onChange={handleAgentChange} size="small" value={chosen.agent}>
            {profiles.map(({ name }) => <MenuItem disabled={!availability[name]?.available} key={name} value={name}>{name}</MenuItem>)}
        </Select>
        <Typography color="text.secondary" variant="caption">Model</Typography>
        <Select inputProps={{ 'aria-label': 'Execution model' }} onChange={handleModelChange} size="small" value={chosen.model}>
            {models.map(({ displayName, id }) => <MenuItem key={id} value={id}>{displayName}</MenuItem>)}
        </Select>
        <Typography color="text.secondary" variant="caption">Thinking level</Typography>
        <Select inputProps={{ 'aria-label': 'Execution thinking level' }} onChange={handleThinkingChange} size="small" value={chosen.thinkingLevel}>
            {THINKING_LEVELS.map((level) => <MenuItem
                disabled={!profile || !supportsThinkingLevel(profile, level)} key={level} value={level}
            >{level}</MenuItem>)}
        </Select>
        {profile && supportsPermissionMode(profile) ? <>
            <Typography color="text.secondary" variant="caption">Permission mode</Typography>
            <Select inputProps={{ 'aria-label': 'Execution permission mode' }} onChange={handlePermissionChange} size="small" value={chosen.permissionMode ?? ''}>
                {PERMISSION_MODE_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </Select>
        </> : null}
        {chosen.agent === 'codex' ? <>
            <Typography color="text.secondary" variant="caption">Speed</Typography>
            <Select inputProps={{ 'aria-label': 'Execution speed' }} onChange={handleSpeedChange} size="small" value={chosen.speedMode ?? 'default'}>
                {SPEED_MODE_OPTIONS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </Select>
        </> : null}
    </Stack>;
}
