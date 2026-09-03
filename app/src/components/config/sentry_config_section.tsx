import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    FormHelperText,
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
import { isSentryConfigurationComplete, type SentryProjectSettings } from '../../services/sentry/sentry_types'

const SENTRY_CONFIG_SECTION_ID = 'sentry'

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
    const canConnect = !controlsDisabled && isSentryConfigurationComplete(draft)
    const canImport = !controlsDisabled
        && connection.isAuthenticated
        && isSentryConfigurationComplete(connection.settings)
        && !importState.isPolling

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
                <Stack spacing={1}>
                    <Typography color="text.secondary" component="label" htmlFor="sentry-api-base-url" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Sentry API base URL
                    </Typography>
                    <TextField
                        disabled={controlsDisabled}
                        helperText="Use https://sentry.io for Sentry SaaS, or your self-hosted instance origin without /api/0."
                        id="sentry-api-base-url"
                        onChange={updateTextField('apiBaseUrl')}
                        placeholder="https://sentry.io"
                        size="small"
                        value={draft.apiBaseUrl}
                    />
                </Stack>
                <Stack spacing={1}>
                    <Typography color="text.secondary" component="label" htmlFor="sentry-organization" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Organization slug
                    </Typography>
                    <TextField
                        disabled={controlsDisabled}
                        helperText="Enter organization URL identifier, not its display name."
                        id="sentry-organization"
                        onChange={updateTextField('organization')}
                        placeholder="acme"
                        size="small"
                        value={draft.organization}
                    />
                </Stack>
                <Stack spacing={1}>
                    <Typography color="text.secondary" component="label" htmlFor="sentry-project" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Project slug
                    </Typography>
                    <TextField
                        disabled={controlsDisabled}
                        helperText="Enter project URL identifier from Sentry Project Settings, not its display name."
                        id="sentry-project"
                        onChange={updateTextField('project')}
                        placeholder="frontend"
                        size="small"
                        value={draft.project}
                    />
                </Stack>
                <Stack spacing={1}>
                    <Typography color="text.secondary" component="label" htmlFor="sentry-environment" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Environment
                    </Typography>
                    <TextField
                        disabled={controlsDisabled}
                        helperText="Only unresolved issues from this exact Sentry environment are imported."
                        id="sentry-environment"
                        onChange={updateTextField('environment')}
                        placeholder="production"
                        size="small"
                        value={draft.environment}
                    />
                </Stack>
                <Stack spacing={1}>
                    <Typography color="text.secondary" component="label" htmlFor="sentry-api-token" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Sentry API token
                    </Typography>
                    <TextField
                        autoComplete="off"
                        disabled={controlsDisabled}
                        helperText="Use a Personal Auth Token from User Settings > Auth > Personal Tokens with event:read. Organization Auth Tokens are for CI and cannot read issues. Do not use a DSN, client key, or client secret."
                        id="sentry-api-token"
                        onChange={updateTextField('apiToken')}
                        placeholder="Paste personal auth token"
                        size="small"
                        type="password"
                        value={draft.apiToken}
                    />
                </Stack>
                <Stack spacing={1}>
                    <Typography color="text.secondary" id="sentry-card-type-label" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Target card type
                    </Typography>
                    <FormControl disabled={controlsDisabled} size="small">
                        <Select displayEmpty labelId="sentry-card-type-label" onChange={handleCardTypeChange} value={draft.cardType}>
                            <MenuItem disabled value=""><em>Select card type</em></MenuItem>
                            {(projectConfig?.cardTypes ?? []).map(({ label, type }) => (
                                <MenuItem key={type} value={type}>{label}</MenuItem>
                            ))}
                        </Select>
                        <FormHelperText>Imported Sentry issues become cards of this type.</FormHelperText>
                    </FormControl>
                </Stack>
                <Stack spacing={1}>
                    <Typography color="text.secondary" id="sentry-card-state-label" sx={{ fontWeight: 'fontWeightMedium' }} variant="body2">
                        Target card state
                    </Typography>
                    <FormControl disabled={controlsDisabled} size="small">
                        <Select displayEmpty labelId="sentry-card-state-label" onChange={handleCardStateChange} value={draft.cardState}>
                            <MenuItem disabled value=""><em>Select card state</em></MenuItem>
                            {(projectConfig?.states ?? []).map(({ state }) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                        </Select>
                        <FormHelperText>New cards start in this project state.</FormHelperText>
                    </FormControl>
                </Stack>
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
