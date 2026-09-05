import { Alert, Button, DialogActions, DialogContent, MenuItem, Stack, TextField } from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
    DIAGRAM_CARDINALITIES,
    DIAGRAM_EDGE_KINDS,
    requireDiagramEdgeKind,
    type DiagramCardinality,
    type DiagramEdgeKind,
    type DiagramType,
} from '../../services/diagrams/diagram_data'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'

interface EdgeDraft {
    from: string
    fromCardinality: DiagramCardinality | ''
    kind: DiagramEdgeKind
    label: string
    row: string
    to: string
    toCardinality: DiagramCardinality | ''
}

interface DiagramEdgeDetailsEditorProps {
    edgeId: string
    onClose: () => void
    session: DiagramEditSessionService
}

function optionalText(value: string) {
    return value.trim().length === 0 ? undefined : value
}

function edgeKindOptions(diagramType: DiagramType) {
    return DIAGRAM_EDGE_KINDS.filter((kind) => {
        try {
            requireDiagramEdgeKind(kind, diagramType, 'edge.kind')
            return true
        } catch {
            return false
        }
    })
}

function initialDraft(edgeId: string, session: DiagramEditSessionService): EdgeDraft {
    const edge = session.getEdgeSnapshot(edgeId)

    return {
        from: edge?.from ?? '',
        fromCardinality: edge?.fromCardinality ?? '',
        kind: edge?.kind ?? 'connection',
        label: edge?.label ?? '',
        row: String(Math.max(session.getEdgeIdsSnapshot().indexOf(edgeId), 0) + 1),
        to: edge?.to ?? '',
        toCardinality: edge?.toCardinality ?? '',
    }
}

export function DiagramEdgeDetailsEditor({ edgeId, onClose, session }: DiagramEdgeDetailsEditorProps) {
    const [draft, setDraft] = useState(() => initialDraft(edgeId, session))
    const [validationError, setValidationError] = useState<string | null>(null)
    const diagramType = session.getMetadataFieldSnapshot('type') ?? 'architecture'
    const preset = session.getMetadataFieldSnapshot('preset')
    const kindOptions = edgeKindOptions(diagramType)
    const nodeOptions = session.getNodeIdsSnapshot().map((nodeId) => ({
        id: nodeId,
        label: session.getNodeFieldSnapshot(nodeId, 'label') ?? nodeId,
    }))
    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target
        setDraft((current) => ({ ...current, [name]: value }))
    }
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const edge = session.getEdgeSnapshot(edgeId)
        if (!edge) return
        const sourceKind = session.getNodeFieldSnapshot(edge.from, 'kind')
        const labelRequired = diagramType === 'flow' && (preset === 'state' || sourceKind === 'decision')
        if (labelRequired && draft.label.trim().length === 0) {
            setValidationError('Label is required for this flow edge.')
            return
        }

        let saved = true
        const nextLabel = optionalText(draft.label)
        const nextFromCardinality = draft.fromCardinality || undefined
        const nextToCardinality = draft.toCardinality || undefined
        if (edge.kind !== draft.kind) saved = session.setEdgeField(edgeId, 'kind', draft.kind) && saved
        if (edge.label !== nextLabel) saved = session.setEdgeField(edgeId, 'label', nextLabel) && saved
        if ((diagramType === 'architecture' || diagramType === 'sequence') && edge.from !== draft.from) {
            saved = session.reconnectEdgeEndpoint(edgeId, 'sourceAttachment', draft.from) && saved
        }
        if ((diagramType === 'architecture' || diagramType === 'sequence') && edge.to !== draft.to) {
            saved = session.reconnectEdgeEndpoint(edgeId, 'targetAttachment', draft.to) && saved
        }
        const nextRowIndex = Number(draft.row) - 1
        const currentRowIndex = session.getEdgeIdsSnapshot().indexOf(edgeId)
        if (diagramType === 'sequence' && currentRowIndex !== nextRowIndex) {
            saved = session.moveSequenceEdge(edgeId, nextRowIndex) && saved
        }
        if (diagramType === 'entity' && edge.fromCardinality !== nextFromCardinality) {
            saved = session.setEdgeField(edgeId, 'fromCardinality', nextFromCardinality) && saved
        }
        if (diagramType === 'entity' && edge.toCardinality !== nextToCardinality) {
            saved = session.setEdgeField(edgeId, 'toCardinality', nextToCardinality) && saved
        }
        if (saved) onClose()
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationError ? <Alert severity="error">{validationError}</Alert> : null}
                    <TextField autoFocus label="Label" name="label" onChange={handleFieldChange} size="small" value={draft.label} />
                    {diagramType === 'architecture' || diagramType === 'sequence' ? (
                        <>
                            <TextField label="From" name="from" onChange={handleFieldChange} select size="small" value={draft.from}>
                                {nodeOptions.map(({ id, label }) => <MenuItem key={id} value={id}>{label}</MenuItem>)}
                            </TextField>
                            <TextField label="To" name="to" onChange={handleFieldChange} select size="small" value={draft.to}>
                                {nodeOptions.map(({ id, label }) => <MenuItem key={id} value={id}>{label}</MenuItem>)}
                            </TextField>
                        </>
                    ) : null}
                    {diagramType === 'sequence' ? (
                        <TextField label="Message row" name="row" onChange={handleFieldChange} select size="small" value={draft.row}>
                            {session.getEdgeIdsSnapshot().map((_edgeId, index) => (
                                <MenuItem key={index} value={String(index + 1)}>{index + 1}</MenuItem>
                            ))}
                        </TextField>
                    ) : null}
                    {kindOptions.length > 1 ? (
                        <TextField label="Kind" name="kind" onChange={handleFieldChange} select size="small" value={draft.kind}>
                            {kindOptions.map((kind) => <MenuItem key={kind} value={kind}>{kind}</MenuItem>)}
                        </TextField>
                    ) : null}
                    {diagramType === 'entity' ? (
                        <>
                            <TextField label="From cardinality" name="fromCardinality" onChange={handleFieldChange} select size="small" value={draft.fromCardinality}>
                                <MenuItem value="">None</MenuItem>
                                {DIAGRAM_CARDINALITIES.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                            </TextField>
                            <TextField label="To cardinality" name="toCardinality" onChange={handleFieldChange} select size="small" value={draft.toCardinality}>
                                <MenuItem value="">None</MenuItem>
                                {DIAGRAM_CARDINALITIES.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                            </TextField>
                        </>
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
