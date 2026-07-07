import { Alert, Box, Button, Divider, Stack, TextField, Typography } from '@mui/material'
import Add from 'mdi-material-ui/Plus'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import Pencil from 'mdi-material-ui/Pencil'
import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { BUILTIN_AGENT_PROFILES, MODEL_PLACEHOLDER, SESSION_ID_PLACEHOLDER, type AgentProfile } from '../../data/agent_profiles'

const CAPTURE_GROUP_REQUIRED_MESSAGE = 'Session-id pattern must include one capture group.'
const COMMA_SEPARATOR = ','

interface AgentProfilesEditorProps {
    disabled?: boolean
    onChange: (value: AgentProfile[]) => void
    onValidityChange?: (valid: boolean) => void
    value: AgentProfile[]
}

interface AgentProfileRowProps {
    disabled: boolean
    profile: AgentProfile
    readOnly: boolean
    onEdit: (name: string) => void
    onRemove: (name: string) => void
}

interface AgentProfileFormProps {
    disabled: boolean
    errors: string[]
    form: AgentProfileFormState
    onCancel: () => void
    onSave: () => void
    onTextChange: (event: ChangeEvent<HTMLInputElement>) => void
}

interface AgentProfileFormState {
    command: string
    defaultModel: string
    modelArgument: string
    models: string
    name: string
    resumeCommand: string
    sessionIdPattern: string
}

function toFormState(profile?: AgentProfile): AgentProfileFormState {
    return {
        command: profile?.command ?? '',
        defaultModel: profile?.defaultModel ?? '',
        modelArgument: profile?.modelArgument ?? '',
        models: profile?.models?.join(`${COMMA_SEPARATOR} `) ?? '',
        name: profile?.name ?? '',
        resumeCommand: profile?.resumeCommand ?? '',
        sessionIdPattern: profile?.sessionIdPattern ?? '',
    }
}

function readModels(value: string) {
    return value.split(COMMA_SEPARATOR).map((model) => model.trim()).filter((model) => model.length > 0)
}

function toAgentProfile(form: AgentProfileFormState): AgentProfile {
    const models = readModels(form.models)

    return {
        command: form.command.trim(),
        ...(form.defaultModel.trim().length > 0 ? { defaultModel: form.defaultModel.trim() } : {}),
        ...(form.modelArgument.trim().length > 0 ? { modelArgument: form.modelArgument.trim() } : {}),
        ...(models.length > 0 ? { models } : {}),
        name: form.name.trim(),
        ...(form.resumeCommand.trim().length > 0 ? { resumeCommand: form.resumeCommand.trim() } : {}),
        ...(form.sessionIdPattern.trim().length > 0 ? { sessionIdPattern: form.sessionIdPattern.trim() } : {}),
    }
}

function countCaptureGroups(pattern: string) {
    let count = 0
    let escaped = false

    for (let index = 0; index < pattern.length; index += 1) {
        const character = pattern[index]
        if (escaped) {
            escaped = false
            continue
        }
        if (character === '\\') {
            escaped = true
            continue
        }
        if (character !== '(') continue

        const next = pattern[index + 1]
        const afterQuestion = pattern[index + 2]
        const afterNamedMarker = pattern[index + 3]
        if (next !== '?') count += 1
        if (next === '?' && afterQuestion === '<' && afterNamedMarker !== '=' && afterNamedMarker !== '!') count += 1
    }

    return count
}

function validateForm(form: AgentProfileFormState, usedNames: string[]) {
    const errors: string[] = []
    const name = form.name.trim()
    const command = form.command.trim()
    const models = readModels(form.models)
    const defaultModel = form.defaultModel.trim()
    const sessionIdPattern = form.sessionIdPattern.trim()

    if (name.length === 0) errors.push('Name is required.')
    if (usedNames.includes(name)) errors.push(`Duplicate agent profile: ${name}`)
    if (command.length === 0) errors.push('Command is required.')
    if (defaultModel.length > 0 && models.length > 0 && !models.includes(defaultModel)) {
        errors.push(`Default model must be one of: ${models.join(', ')}`)
    }
    if (sessionIdPattern.length > 0) {
        try {
            new RegExp(sessionIdPattern, 'u')
            if (countCaptureGroups(sessionIdPattern) === 0) errors.push(CAPTURE_GROUP_REQUIRED_MESSAGE)
        } catch {
            errors.push('Session-id pattern is not a valid regular expression.')
        }
    }

    return errors
}

function isBuiltinName(name: string) {
    return BUILTIN_AGENT_PROFILES.some((profile) => profile.name === name)
}

function AgentProfileRow(props: AgentProfileRowProps) {
    const { disabled, onEdit, onRemove, profile, readOnly } = props

    const editProfile = () => {
        onEdit(profile.name)
    }

    const removeProfile = () => {
        onRemove(profile.name)
    }

    return (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{profile.name}</Typography>
                    <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }} variant="body2">
                        {profile.command}
                    </Typography>
                </Box>
                {readOnly ? (
                    <Typography color="text.secondary" variant="body2">Built-in</Typography>
                ) : (
                    <Stack direction="row" spacing={1}>
                        <Button disabled={disabled} onClick={editProfile} size="small" startIcon={<Pencil />} variant="outlined">
                            Edit
                        </Button>
                        <Button color="error" disabled={disabled} onClick={removeProfile} size="small" startIcon={<DeleteOutline />} variant="outlined">
                            Remove
                        </Button>
                    </Stack>
                )}
            </Stack>
        </Box>
    )
}

function AgentProfileForm(props: AgentProfileFormProps) {
    const { disabled, errors, form, onCancel, onSave, onTextChange } = props
    const canSave = !disabled && errors.length === 0

    return (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
            <Stack spacing={2}>
                {errors.length > 0 ? <Alert severity="error">{errors.join(' ')}</Alert> : null}
                <TextField disabled={disabled} fullWidth label="Name" name="name" onChange={onTextChange} size="small" value={form.name} />
                <TextField
                    disabled={disabled}
                    fullWidth
                    helperText={`May include ${MODEL_PLACEHOLDER}.`}
                    label="Command"
                    name="command"
                    onChange={onTextChange}
                    size="small"
                    value={form.command}
                />
                <TextField disabled={disabled} fullWidth label="Model argument" name="modelArgument" onChange={onTextChange} size="small" value={form.modelArgument} />
                <TextField disabled={disabled} fullWidth helperText="Comma-separated model names." label="Models" name="models" onChange={onTextChange} size="small" value={form.models} />
                <TextField disabled={disabled} fullWidth label="Profile default model" name="defaultModel" onChange={onTextChange} size="small" value={form.defaultModel} />
                <TextField
                    disabled={disabled}
                    fullWidth
                    helperText={`May include ${SESSION_ID_PLACEHOLDER}.`}
                    label="Resume command"
                    name="resumeCommand"
                    onChange={onTextChange}
                    size="small"
                    value={form.resumeCommand}
                />
                <TextField disabled={disabled} fullWidth label="Session-id pattern" name="sessionIdPattern" onChange={onTextChange} size="small" value={form.sessionIdPattern} />
                <Stack direction="row" spacing={1}>
                    <Button disabled={!canSave} onClick={onSave} variant="contained">
                        Save profile
                    </Button>
                    <Button disabled={disabled} onClick={onCancel} variant="outlined">
                        Cancel
                    </Button>
                </Stack>
            </Stack>
        </Box>
    )
}

export function AgentProfilesEditor(props: AgentProfilesEditorProps) {
    const { disabled = false, onChange, onValidityChange, value } = props
    const [editingName, setEditingName] = useState<string | null>(null)
    const [form, setForm] = useState<AgentProfileFormState | null>(null)
    const storedBuiltinProfiles = value.filter((profile) => isBuiltinName(profile.name))
    const userProfiles = value.filter((profile) => !isBuiltinName(profile.name))
    const usedNames = useMemo(
        () => [...BUILTIN_AGENT_PROFILES, ...userProfiles]
            .map((profile) => profile.name)
            .filter((name) => name !== editingName),
        [editingName, userProfiles],
    )
    const errors = form ? validateForm(form, usedNames) : []

    useEffect(() => {
        onValidityChange?.(errors.length === 0)
    }, [errors.length, onValidityChange])

    const startAdd = () => {
        setEditingName(null)
        setForm(toFormState())
    }

    const editProfile = (name: string) => {
        const profile = userProfiles.find((item) => item.name === name)
        if (!profile) return

        setEditingName(name)
        setForm(toFormState(profile))
    }

    const removeProfile = (name: string) => {
        onChange([...storedBuiltinProfiles, ...userProfiles.filter((profile) => profile.name !== name)])
    }

    const cancelEdit = () => {
        setEditingName(null)
        setForm(null)
    }

    const saveProfile = () => {
        if (!form || errors.length > 0) return

        const nextProfile = toAgentProfile(form)
        const retainedProfiles = userProfiles.filter((profile) => profile.name !== editingName)
        onChange([...storedBuiltinProfiles, ...retainedProfiles, nextProfile])
        cancelEdit()
    }

    const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        const field = event.target.name as keyof AgentProfileFormState
        setForm((currentForm) => (currentForm ? { ...currentForm, [field]: event.target.value } : currentForm))
    }

    return (
        <Stack spacing={2}>
            <Stack spacing={1}>
                {BUILTIN_AGENT_PROFILES.map((profile) => (
                    <AgentProfileRow
                        disabled={disabled}
                        key={profile.name}
                        onEdit={editProfile}
                        onRemove={removeProfile}
                        profile={profile}
                        readOnly
                    />
                ))}
                {userProfiles.map((profile) => (
                    <AgentProfileRow
                        disabled={disabled}
                        key={profile.name}
                        onEdit={editProfile}
                        onRemove={removeProfile}
                        profile={profile}
                        readOnly={false}
                    />
                ))}
            </Stack>
            <Divider />
            {form ? (
                <AgentProfileForm
                    disabled={disabled}
                    errors={errors}
                    form={form}
                    onCancel={cancelEdit}
                    onSave={saveProfile}
                    onTextChange={handleTextChange}
                />
            ) : (
                <Button disabled={disabled} onClick={startAdd} startIcon={<Add />} variant="outlined">
                    Add profile
                </Button>
            )}
        </Stack>
    )
}
