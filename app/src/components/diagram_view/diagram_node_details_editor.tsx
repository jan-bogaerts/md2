import {
    Alert, Button, DialogActions, DialogContent, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddOutlinedIcon from '@mui/icons-material/AddOutlined'
import ArrowDownwardOutlinedIcon from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlinedIcon from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined'
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react'
import {
    DIAGRAM_NODE_KINDS,
    DIAGRAM_ROLES,
    requireDiagramNodeKind,
    type DiagramEntityField,
    type DiagramNodeKind,
    type DiagramRole,
} from '../../services/diagrams/diagram_data'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'

type DrilldownDraft = 'default' | 'disabled' | 'enabled'

interface EntityFieldDraft {
    draftId: string
    key: '' | 'foreign' | 'primary'
    name: string
    type: string
}

interface NodeDraft {
    drilldown: DrilldownDraft
    entityFields: EntityFieldDraft[]
    kind: DiagramNodeKind | ''
    label: string
    nextEntityFieldId: number
    role: DiagramRole
    sublabel: string
    tag: string
}

interface DiagramNodeDetailsEditorProps {
    nodeId: string
    onClose: () => void
    session: DiagramEditSessionService
}

function optionalText(value: string) {
    return value.trim().length === 0 ? undefined : value
}

function drilldownDraft(value: boolean | undefined): DrilldownDraft {
    if (value === undefined) return 'default'

    return value ? 'enabled' : 'disabled'
}

function drilldownValue(value: DrilldownDraft) {
    if (value === 'default') return undefined

    return value === 'enabled'
}

function nodeKindOptions(session: DiagramEditSessionService) {
    const diagramType = session.getMetadataFieldSnapshot('type')
    const preset = session.getMetadataFieldSnapshot('preset') ?? undefined

    return DIAGRAM_NODE_KINDS.filter((kind) => {
        try {
            requireDiagramNodeKind(kind, diagramType ?? 'architecture', preset, 'node.kind')
            return true
        } catch {
            return false
        }
    })
}

function initialDraft(nodeId: string, session: DiagramEditSessionService): NodeDraft {
    const node = session.getNodeSnapshot(nodeId)

    return {
        drilldown: drilldownDraft(node?.drilldown),
        entityFields: node?.fields?.map((field, fieldIndex) => ({draftId: `existing:${fieldIndex}`, key: field.key ?? '', name: field.name, type: field.type ?? ''})) ?? [],
        kind: node?.kind ?? '',
        label: node?.label ?? '',
        nextEntityFieldId: 0,
        role: node?.role ?? 'focal',
        sublabel: node?.sublabel ?? '',
        tag: node?.tag ?? '',
    }
}

function entityFieldValue(draft: EntityFieldDraft): DiagramEntityField {
    return {
        ...(draft.key ? { key: draft.key } : {}),
        name: draft.name,
        ...(optionalText(draft.type) ? { type: draft.type } : {}),
    }
}

function synchronizeEntityFields(
    nodeId: string,
    drafts: readonly EntityFieldDraft[],
    session: DiagramEditSessionService,
) {
    const node = session.getNodeSnapshot(nodeId)
    if (!node) return false

    const currentIds = (node.fields ?? []).map((_field, fieldIndex) => `existing:${fieldIndex}`)
    const targetIds = drafts.map(({ draftId }) => draftId)
    let saved = true
    for (let fieldIndex = currentIds.length - 1; fieldIndex >= 0; fieldIndex -= 1) {
        if (targetIds.includes(currentIds[fieldIndex])) continue
        saved = session.removeEntityField(nodeId, fieldIndex) && saved
        currentIds.splice(fieldIndex, 1)
    }
    for (const [targetIndex, draft] of drafts.entries()) {
        const currentIndex = currentIds.indexOf(draft.draftId)
        if (currentIndex < 0) {
            saved = session.addEntityField(nodeId, entityFieldValue(draft), targetIndex) && saved
            currentIds.splice(targetIndex, 0, draft.draftId)
        } else if (currentIndex !== targetIndex) {
            saved = session.moveEntityField(nodeId, currentIndex, targetIndex) && saved
            currentIds.splice(targetIndex, 0, currentIds.splice(currentIndex, 1)[0])
        }
    }
    for (const [fieldIndex, draft] of drafts.entries()) {
        const entityField = session.getEntityFieldSnapshot(nodeId, fieldIndex)
        if (!entityField) continue
        const nextEntityField = entityFieldValue(draft)
        if (entityField.name !== nextEntityField.name) {
            saved = session.setEntityField(nodeId, fieldIndex, 'name', nextEntityField.name) && saved
        }
        if (entityField.type !== nextEntityField.type) {
            saved = session.setEntityField(nodeId, fieldIndex, 'type', nextEntityField.type) && saved
        }
        if (entityField.key !== nextEntityField.key) {
            saved = session.setEntityField(nodeId, fieldIndex, 'key', nextEntityField.key) && saved
        }
    }

    return saved
}

export function DiagramNodeDetailsEditor({ nodeId, onClose, session }: DiagramNodeDetailsEditorProps) {
    const [draft, setDraft] = useState(() => initialDraft(nodeId, session))
    const [validationError, setValidationError] = useState<string | null>(null)
    const diagramType = session.getMetadataFieldSnapshot('type')
    const preset = session.getMetadataFieldSnapshot('preset')
    const kindOptions = nodeKindOptions(session)
    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target
        setDraft((current) => ({ ...current, [name]: value }))
    }
    const handleEntityFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const [fieldIndexText, field] = event.target.name.split(':') as [string, keyof EntityFieldDraft]
        const fieldIndex = Number(fieldIndexText)
        setDraft((current) => ({
            ...current,
            entityFields: current.entityFields.map((entityField, index) => (
                index === fieldIndex ? { ...entityField, [field]: event.target.value } : entityField
            )),
        }))
    }
    const handleAddEntityField = () => {
        setDraft((current) => ({
            ...current,
            entityFields: [...current.entityFields, {draftId: `new:${current.nextEntityFieldId}`, key: '', name: '', type: ''}],
            nextEntityFieldId: current.nextEntityFieldId + 1,
        }))
    }
    const handleRemoveEntityField = (event: MouseEvent<HTMLButtonElement>) => {
        const fieldIndex = Number(event.currentTarget.dataset.fieldIndex)
        setDraft((current) => ({
            ...current,
            entityFields: current.entityFields.filter((_field, index) => index !== fieldIndex),
        }))
    }
    const handleMoveEntityField = (event: MouseEvent<HTMLButtonElement>) => {
        const fieldIndex = Number(event.currentTarget.dataset.fieldIndex)
        const targetIndex = Number(event.currentTarget.dataset.targetIndex)
        setDraft((current) => {
            const entityFields = [...current.entityFields]
            entityFields.splice(targetIndex, 0, entityFields.splice(fieldIndex, 1)[0])

            return { ...current, entityFields }
        })
    }
    const validate = () => {
        if (draft.label.trim().length === 0) return 'Label is required.'
        const invalidEntityIndex = draft.entityFields.findIndex(({ name }) => name.trim().length === 0)
        if (invalidEntityIndex >= 0) return `Entity field ${invalidEntityIndex + 1} requires a name.`
        if (diagramType === 'flow' && preset === 'flowchart' && draft.kind === 'decision') {
            const unlabeledEdge = session.getEdgeIdsSnapshot().find((edgeId) => (
                session.getEdgeFieldSnapshot(edgeId, 'from') === nodeId
                && session.getEdgeFieldSnapshot(edgeId, 'label') === undefined
            ))
            if (unlabeledEdge) return 'Decision nodes require labels on every outgoing edge.'
        }

        return null
    }
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const error = validate()
        if (error) {
            setValidationError(error)
            return
        }

        const node = session.getNodeSnapshot(nodeId)
        if (!node) return
        let saved = true
        const nextDrilldown = drilldownValue(draft.drilldown)
        const nextSublabel = optionalText(draft.sublabel)
        const nextTag = optionalText(draft.tag)
        if (node.label !== draft.label) saved = session.setNodeField(nodeId, 'label', draft.label) && saved
        if (node.role !== draft.role) saved = session.setNodeField(nodeId, 'role', draft.role) && saved
        if (node.sublabel !== nextSublabel) saved = session.setNodeField(nodeId, 'sublabel', nextSublabel) && saved
        if (node.tag !== nextTag) saved = session.setNodeField(nodeId, 'tag', nextTag) && saved
        if (node.drilldown !== nextDrilldown) saved = session.setNodeField(nodeId, 'drilldown', nextDrilldown) && saved
        if (diagramType === 'flow' && node.kind !== draft.kind) {
            saved = session.setNodeField(nodeId, 'kind', draft.kind as DiagramNodeKind) && saved
        }
        if (diagramType === 'entity') {
            saved = synchronizeEntityFields(nodeId, draft.entityFields, session) && saved
        }
        if (saved) onClose()
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationError ? <Alert severity="error">{validationError}</Alert> : null}
                    <TextField autoFocus label="Label" name="label" onChange={handleFieldChange} required size="small" value={draft.label} />
                    <TextField label="Role" name="role" onChange={handleFieldChange} select size="small" value={draft.role}>
                        {DIAGRAM_ROLES.map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}
                    </TextField>
                    {diagramType === 'flow' ? (
                        <TextField label="Kind" name="kind" onChange={handleFieldChange} select size="small" value={draft.kind}>
                            {kindOptions.map((kind) => <MenuItem key={kind} value={kind}>{kind}</MenuItem>)}
                        </TextField>
                    ) : null}
                    <TextField label="Tag" name="tag" onChange={handleFieldChange} size="small" value={draft.tag} />
                    <TextField label="Sublabel" name="sublabel" onChange={handleFieldChange} size="small" value={draft.sublabel} />
                    <TextField label="Drill-down" name="drilldown" onChange={handleFieldChange} select size="small" value={draft.drilldown}>
                        <MenuItem value="default">Default</MenuItem>
                        <MenuItem value="enabled">Enabled</MenuItem>
                        <MenuItem value="disabled">Disabled</MenuItem>
                    </TextField>
                    {diagramType === 'entity' ? (
                        <Stack spacing={1.5}>
                            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography variant="subtitle2">Entity fields</Typography>
                                <Button onClick={handleAddEntityField} size="small" startIcon={<AddOutlinedIcon />}>Add field</Button>
                            </Stack>
                            {draft.entityFields.map((field, fieldIndex) => (
                                <Stack key={field.draftId} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                    <TextField
                                        label={`Field ${fieldIndex + 1} name`}
                                        name={`${fieldIndex}:name`}
                                        onChange={handleEntityFieldChange}
                                        required
                                        size="small"
                                        value={field.name}
                                    />
                                    <TextField
                                        label="Type"
                                        name={`${fieldIndex}:type`}
                                        onChange={handleEntityFieldChange}
                                        size="small"
                                        value={field.type}
                                    />
                                    <TextField
                                        label="Key"
                                        name={`${fieldIndex}:key`}
                                        onChange={handleEntityFieldChange}
                                        select
                                        size="small"
                                        value={field.key}
                                    >
                                        <MenuItem value="">None</MenuItem>
                                        <MenuItem value="primary">Primary</MenuItem>
                                        <MenuItem value="foreign">Foreign</MenuItem>
                                    </TextField>
                                    <Tooltip title="Move field up">
                                        <span>
                                            <IconButton
                                                aria-label={`Move field ${fieldIndex + 1} up`}
                                                data-field-index={fieldIndex}
                                                data-target-index={fieldIndex - 1}
                                                disabled={fieldIndex === 0}
                                                onClick={handleMoveEntityField}
                                                size="small"
                                            >
                                                <ArrowUpwardOutlinedIcon fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title="Move field down">
                                        <span>
                                            <IconButton
                                                aria-label={`Move field ${fieldIndex + 1} down`}
                                                data-field-index={fieldIndex}
                                                data-target-index={fieldIndex + 1}
                                                disabled={fieldIndex === draft.entityFields.length - 1}
                                                onClick={handleMoveEntityField}
                                                size="small"
                                            >
                                                <ArrowDownwardOutlinedIcon fontSize="small" />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title="Remove field">
                                        <IconButton
                                            aria-label={`Remove field ${fieldIndex + 1}`}
                                            data-field-index={fieldIndex}
                                            onClick={handleRemoveEntityField}
                                            size="small"
                                        >
                                            <DeleteOutlineOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            ))}
                        </Stack>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="contained">Save</Button>
            </DialogActions>
        </form>
    )
}
