import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Switch,
    TextField,
    Typography,
    type SelectChangeEvent,
} from '@mui/material'
import { useState, type ChangeEvent } from 'react'
import { useProjectConfig } from '../hooks/use_project_config'
import { useProjectReadOnly } from '../hooks/use_project_read_only'
import { useProjectReference } from '../hooks/use_project_reference'
import { useSentryConnection } from '../hooks/use_sentry_connection'
import { useSentryImport } from '../hooks/use_sentry_import'
import { sentryConnectionService, type SentryConnectionSnapshot } from '../../services/sentry/sentry_connection_service'
import { sentryImportService } from '../../services/sentry/sentry_import_service'
import type { SentryProjectSettings } from '../../services/sentry/sentry_types'

const SENTRY_CONFIG_SECTION_ID = 'sentry'

function settingsComplete(settings: SentryProjectSettings) {
    return settings.apiBaseUrl.trim().length > 0
        && settings.apiToken.trim().length > 0
        && settings.organization.trim().length > 0
        && settings.project.trim().length > 0
        && settings.environment.trim().length > 0
        && settings.cardType.length > 0
        && settings.cardState.trim().length > 0
}

interface SentryConfigFormProps {
    connection: SentryConnectionSnapshot
}

function SentryConfigForm({ connection }: SentryConfigFormProps) {
    const importState = useSentryImport()
    const project = useProjectReference()
    const projectConfig = useProjectConfig()
    const readOnly = useProjectReadOnly()
    const [draft, setDraft] = useState(connection.settings)
    const controlsDisabled = !project || readOnly || connection.isConnecting
    const canConnect = !controlsDisabled && settingsComplete(draft)
    const canImport = !controlsDisabled && connection.isAuthenticated && settingsComplete(connection.settings) && !importState.isPolling

    const updateTextField = (field: keyof SentryProjectSettings) => (event: ChangeEvent<HTMLInputElement>) => {
        setDraft((current) => ({ ...current, [field]: event.target.value }))
    }
    const handleCardTypeChange = (event: SelectChangeEvent) => {
        setDraft((current) => ({ ...current, cardType: event.target.value }))
    }
    const handleCardStateChange = (event: SelectChangeEvent) => {
        setDraft((current) => ({ ...current, cardState: event.target.value }))
    }
    const handleConnect = () => {
        void sentryConnectionService.connect(draft)
    }
    const handleDisconnect = () => {
        sentryConnectionService.disconnect()
        setDraft({ ...connection.settings, apiToken: '', automaticImport: false })
    }
    const handleAutomaticImportChange = (event: ChangeEvent<HTMLInputElement>) => {
        sentryConnectionService.saveSettings({ ...connection.settings, automaticImport: event.target.checked })
    }
    const handleImportNow = () => {
        void sentryImportService.importNow()
    }

    return (
        <Box aria-labelledby="sentry-config-heading" component="section" id={SENTRY_CONFIG_SECTION_ID}>
            <Stack spacing={3}>
                <Typography component="h3" id="sentry-config-heading" variant="h6">Sentry</Typography>
                <Typography color="text.secondary" variant="body2">
                    Connect this MD² project to one Sentry project. Credentials stay in this browser.
                </Typography>
                {!project ? <Alert severity="info">Open a project to configure Sentry imports.</Alert> : null}
                <TextField disabled={controlsDisabled} label="Sentry API base URL" onChange={updateTextField('apiBaseUrl')} size="small" value={draft.apiBaseUrl} />
                <TextField disabled={controlsDisabled} label="Organization slug" onChange={updateTextField('organization')} size="small" value={draft.organization} />
                <TextField disabled={controlsDisabled} label="Project slug" onChange={updateTextField('project')} size="small" value={draft.project} />
                <TextField disabled={controlsDisabled} label="Environment" onChange={updateTextField('environment')} size="small" value={draft.environment} />
                <TextField disabled={controlsDisabled} label="Sentry API token" onChange={updateTextField('apiToken')} size="small" type="password" value={draft.apiToken} />
                <FormControl disabled={controlsDisabled} size="small">
                    <InputLabel id="sentry-card-type-label">Target card type</InputLabel>
                    <Select label="Target card type" labelId="sentry-card-type-label" onChange={handleCardTypeChange} value={draft.cardType}>
                        {(projectConfig?.cardTypes ?? []).map(({ label, type }) => <MenuItem key={type} value={type}>{label}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl disabled={controlsDisabled} size="small">
                    <InputLabel id="sentry-card-state-label">Target card state</InputLabel>
                    <Select label="Target card state" labelId="sentry-card-state-label" onChange={handleCardStateChange} value={draft.cardState}>
                        {(projectConfig?.states ?? []).map(({ state }) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                    </Select>
                </FormControl>
                {connection.errorMessage ? <Alert severity="error">{connection.errorMessage}</Alert> : null}
                <Stack direction="row" spacing={1}>
                    <Button disabled={!canConnect} onClick={handleConnect} variant="contained">
                        {connection.isConnecting ? 'Connecting...' : connection.isAuthenticated ? 'Reconnect' : 'Connect'}
                    </Button>
                    <Button disabled={controlsDisabled || !connection.isAuthenticated} onClick={handleDisconnect} variant="outlined">Disconnect</Button>
                </Stack>
                <FormControlLabel
                    control={(
                        <Switch
                            checked={connection.settings.automaticImport}
                            disabled={!canImport}
                            onChange={handleAutomaticImportChange}
                        />
                    )}
                    label="Enable automatic import"
                />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Button disabled={!canImport} onClick={handleImportNow} variant="outlined">Import now</Button>
                    {importState.isPolling ? <Typography color="text.secondary" variant="body2">Checking Sentry...</Typography> : null}
                </Stack>
                {importState.lastImportCount !== null ? (
                    <Typography color="text.secondary" variant="body2">Last import created {importState.lastImportCount} card(s).</Typography>
                ) : null}
                {importState.lastSuccessfulPollAt ? (
                    <Typography color="text.secondary" variant="body2">Last successful poll: {importState.lastSuccessfulPollAt}</Typography>
                ) : null}
                {importState.latestError ? <Alert severity="error">Latest import error: {importState.latestError}</Alert> : null}
            </Stack>
        </Box>
    )
}

export function SentryConfigSection() {
    const connection = useSentryConnection()

    return <SentryConfigForm connection={connection} key={connection.projectId ?? 'no-project'} />
}
