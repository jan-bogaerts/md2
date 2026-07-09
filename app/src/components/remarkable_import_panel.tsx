import {
    Alert, Button, Checkbox, Chip, Divider, FormControlLabel, List, ListItem, ListItemButton, ListItemText,
    MenuItem, Radio, RadioGroup, Stack, TextField, Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { useMemo, useState } from 'react'
import type { ProjectCard } from '../data/data_types'
import {
    getRemarkableBridge,
    validateRemarkableSettings,
    type RemarkableBridge,
    type RemarkableConnectionSettings,
} from '../data/remarkable_bridge'
import { diffDeviceFiles, remarkableDeviceKey, parseImportMetadata, type RemarkableFileDiff } from '../data/remarkable_import_metadata'
import { dataService } from '../services/data_service'
import type { RemarkableImportInput } from '../services/data_service'
import { convertRemarkableImagesToText, isAgentExecutionAvailable } from '../services/remarkable_convert_service'
import type { RemarkableImportPlan, RemarkableImportTarget } from '../services/remarkable_import_service'

const DEFAULT_PORT = 22

const STATUS_LABEL: Record<RemarkableFileDiff['status'], string> = {
    changed: 'Changed',
    imported: 'Imported',
    new: 'New',
}
const STATUS_COLOR: Record<RemarkableFileDiff['status'], 'default' | 'success' | 'warning'> = {
    changed: 'warning',
    imported: 'default',
    new: 'success',
}

type TargetMode = 'existing' | 'new'

interface LastImport {
    cardPath: string
    imagePaths: string[]
}

interface RemarkableImportPanelProps {
    activeCards: ProjectCard[]
    agentAvailable?: boolean
    bridge?: RemarkableBridge | null
    isProjectOpen: boolean
    metadataContent?: string | null
    onConvert?: (input: LastImport) => Promise<unknown>
    onImport?: (request: RemarkableImportInput) => Promise<RemarkableImportPlan>
}

function formatModified(modifiedTime: string) {
    const parsed = Date.parse(modifiedTime)

    return Number.isNaN(parsed) ? modifiedTime : new Date(parsed).toLocaleString()
}

export function RemarkableImportPanel(props: RemarkableImportPanelProps) {
    const { activeCards, isProjectOpen } = props
    const bridge = props.bridge === undefined ? getRemarkableBridge() : props.bridge
    const onImport = props.onImport ?? ((request: RemarkableImportInput) => dataService.importRemarkableImages(request))
    const agentAvailable = props.agentAvailable ?? isAgentExecutionAvailable()
    const onConvert = props.onConvert
        ?? ((input: LastImport) => convertRemarkableImagesToText({ cardPath: input.cardPath, imagePaths: input.imagePaths }))

    const [host, setHost] = useState('')
    const [port, setPort] = useState(String(DEFAULT_PORT))
    const [username, setUsername] = useState('root')
    const [password, setPassword] = useState('')
    const [privateKeyPath, setPrivateKeyPath] = useState('')
    const [imageFolder, setImageFolder] = useState('')
    const [connectionStatus, setConnectionStatus] = useState<string | null>(null)
    const [files, setFiles] = useState<RemarkableFileDiff[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [targetMode, setTargetMode] = useState<TargetMode>('existing')
    const [existingCardPath, setExistingCardPath] = useState('')
    const [newCardTitle, setNewCardTitle] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [lastImport, setLastImport] = useState<LastImport | null>(null)

    const settings = useMemo<RemarkableConnectionSettings>(
        () => ({ host, imageFolder, password, port: Number(port), privateKeyPath, username }),
        [host, imageFolder, password, port, privateKeyPath, username],
    )

    if (!bridge) {
        return (
            <Stack spacing={2}>
                <Alert severity="info">Remarkable import requires Electron local mode.</Alert>
            </Stack>
        )
    }

    const metadataContent = props.metadataContent === undefined ? dataService.getRemarkableMetadataContent() : props.metadataContent

    const runGuarded = async (message: string, run: () => Promise<void>) => {
        setBusy(true)
        setError(null)
        try {
            await run()
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : message)
        } finally {
            setBusy(false)
        }
    }

    const handleTest = () => {
        void runGuarded('Connection test failed', async () => {
            const validated = validateRemarkableSettings(settings)
            const result = await bridge.testConnection(validated)
            if (!result.ok) {
                setConnectionStatus(null)
                throw new Error(result.message ?? 'Connection failed')
            }
            setConnectionStatus('Connected')
        })
    }

    const handleList = () => {
        void runGuarded('Listing files failed', async () => {
            const validated = validateRemarkableSettings(settings)
            const deviceFiles = await bridge.listImageFiles(validated)
            const metadata = parseImportMetadata(metadataContent ?? null)
            setFiles(diffDeviceFiles(deviceFiles, metadata, remarkableDeviceKey(validated)))
            setSelected(new Set())
        })
    }

    const toggleSelect = (path: string) => {
        setSelected((current) => {
            const next = new Set(current)
            if (next.has(path)) next.delete(path)
            else next.add(path)

            return next
        })
    }

    const handleImport = () => {
        void runGuarded('Import failed', async () => {
            if (selected.size === 0) throw new Error('Select at least one image to import')

            const target: RemarkableImportTarget = targetMode === 'existing'
                ? { cardPath: existingCardPath, kind: 'existing' }
                : { draft: { body: '', title: newCardTitle, type: 'feature' }, kind: 'new' }

            if (targetMode === 'existing' && existingCardPath.length === 0) throw new Error('Select a target card')
            if (targetMode === 'new' && newCardTitle.trim().length === 0) throw new Error('Enter a title for the new card')

            const validated = validateRemarkableSettings(settings)
            const plan = await onImport({ paths: [...selected], settings: validated, target })
            setSelected(new Set())
            setConnectionStatus('Imported')
            setLastImport({ cardPath: plan.cardPath, imagePaths: plan.importedAssetPaths })
        })
    }

    const handleConvert = () => {
        void runGuarded('Image-to-text conversion failed', async () => {
            if (!lastImport) throw new Error('Import images before converting them to text')

            await onConvert(lastImport)
            setConnectionStatus('Conversion started')
        })
    }

    const handleTextChange = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => setter(event.target.value)

    return (
        <Stack spacing={2}>
            <Typography component="h2" variant="h6">Remarkable import</Typography>

            <Stack direction={{ sm: 'row', xs: 'column' }} spacing={2}>
                <TextField label="Host" name="host" onChange={handleTextChange(setHost)} size="small" value={host} />
                <TextField label="Port" name="port" onChange={handleTextChange(setPort)} size="small" value={port} />
                <TextField label="Username" name="username" onChange={handleTextChange(setUsername)} size="small" value={username} />
            </Stack>
            <Stack direction={{ sm: 'row', xs: 'column' }} spacing={2}>
                <TextField label="Password" name="password" onChange={handleTextChange(setPassword)} size="small" type="password" value={password} />
                <TextField label="Private key path" name="privateKeyPath" onChange={handleTextChange(setPrivateKeyPath)} size="small" value={privateKeyPath} />
                <TextField label="Image folder" name="imageFolder" onChange={handleTextChange(setImageFolder)} size="small" value={imageFolder} />
            </Stack>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Button disabled={busy} onClick={handleTest} variant="outlined">Test connection</Button>
                <Button disabled={busy} onClick={handleList} variant="outlined">List files</Button>
                {connectionStatus ? <Typography color="text.secondary" variant="body2">{connectionStatus}</Typography> : null}
            </Stack>

            <Divider />

            <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                {files.map((entry) => (
                    <ListItem
                        disablePadding
                        key={entry.file.path}
                        secondaryAction={<Chip color={STATUS_COLOR[entry.status]} label={STATUS_LABEL[entry.status]} size="small" />}
                    >
                        <ListItemButton onClick={() => toggleSelect(entry.file.path)}>
                            <Checkbox checked={selected.has(entry.file.path)} edge="start" tabIndex={-1} />
                            <ListItemText primary={entry.file.name} secondary={formatModified(entry.file.modifiedTime)} />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>

            <Divider />

            <RadioGroup onChange={(event) => setTargetMode(event.target.value as TargetMode)} row value={targetMode}>
                <FormControlLabel control={<Radio />} label="Existing card" value="existing" />
                <FormControlLabel control={<Radio />} label="New feature card" value="new" />
            </RadioGroup>
            {targetMode === 'existing' ? (
                <TextField
                    label="Target card"
                    onChange={handleTextChange(setExistingCardPath)}
                    select
                    size="small"
                    value={existingCardPath}
                >
                    {activeCards.map((card) => (
                        <MenuItem key={card.path} value={card.path}>
                            {card.header.id} — {card.header.title}
                        </MenuItem>
                    ))}
                </TextField>
            ) : (
                <TextField label="New card title" name="newCardTitle" onChange={handleTextChange(setNewCardTitle)} size="small" value={newCardTitle} />
            )}

            <Stack direction="row" spacing={2}>
                <Button disabled={busy || !isProjectOpen} onClick={handleImport} variant="contained">
                    Import selected
                </Button>
                {agentAvailable && lastImport ? (
                    <Button disabled={busy} onClick={handleConvert} variant="outlined">
                        Convert images to text
                    </Button>
                ) : null}
            </Stack>

            {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
    )
}
