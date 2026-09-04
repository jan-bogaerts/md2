import {
    Alert, Button, DialogActions, DialogContent, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
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
    key: '' | 'foreign' | 'primary'
    name: string
    type: string
}

interface NodeDraft {
    drilldown: DrilldownDraft
    entityFields: EntityFieldDraft[]
    kind: DiagramNodeKind | ''
    label: string
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
        entityFields: node?.fields?.map((field) => ({ key: field.key ?? '', name: field.name, type: field.type ?? '' })) ?? [],
        kind: node?.kind ?? '',
        label: node?.label ?? '',
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
            for (const [fieldIndex, entityDraft] of draft.entityFields.entries()) {
                const entityField = node.fields?.[fieldIndex]
                if (!entityField) continue
                const nextEntityField = entityFieldValue(entityDraft)
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
                    {diagramType === 'entity' && draft.entityFields.length > 0 ? (
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2">Entity fields</Typography>
                            {draft.entityFields.map((field, fieldIndex) => (
                                <Stack key={fieldIndex} direction="row" spacing={1}>
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
