import { Alert, Button, DialogActions, DialogContent, MenuItem, Stack, TextField } from '@mui/material'
import { useMemo, useState, type ChangeEvent } from 'react'
import {
    diagramEdgeKindsForType, DIAGRAM_NODE_KINDS, DIAGRAM_ROLES, requireDiagramNodeKind,
    type DiagramEdgeKind, type DiagramNodeKind, type DiagramRole,
} from '../../../services/diagrams/diagram_data'
import { diagramNodeKindLabel } from '../../../services/diagrams/diagram_creation_tool_labels'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'

interface DiagramLegendDetailsEditorProps {
    onClose: () => void
    session: DiagramEditSessionService
}

/** Omits a blank label so the service falls back to the canonical role or kind name. */
function newEntryFor(entryKey: string, label: string) {
    const [entryType, semantic] = entryKey.split(':')
    const typedLabel = label.trim().length > 0 ? { label } : {}

    return entryType === 'node'
        ? { ...typedLabel, role: semantic as DiagramRole }
        : entryType === 'nodeKind' ? { ...typedLabel, nodeKind: semantic as DiagramNodeKind }
            : { ...typedLabel, kind: semantic as DiagramEdgeKind }
}

/**
 * Adds one explicit legend entry. The entry is appended directly on the session; no complete legend is
 * ever submitted.
 */
export function DiagramLegendDetailsEditor({ onClose, session }: DiagramLegendDetailsEditorProps) {
    const [validationMessage, setValidationMessage] = useState<string | null>(null)
    const [addedSemantic, setAddedSemantic] = useState('')
    const [addedLabel, setAddedLabel] = useState('')
    const diagramType = session.read.getMetadataFieldSnapshot('type')
    const preset = session.read.getMetadataFieldSnapshot('preset') ?? undefined
    const semanticOptions = useMemo(() => diagramType ? [
        ...DIAGRAM_ROLES.map((role) => ({ entryKey: `node:${role}`, label: `${role} node` })),
        ...DIAGRAM_NODE_KINDS.filter((kind) => {
            try {
                requireDiagramNodeKind(kind, diagramType, preset, 'node.kind')
                return true
            } catch { return false }
        }).map((kind) => ({ entryKey: `nodeKind:${kind}`, label: `${diagramNodeKindLabel(kind)} node kind` })),
        ...diagramEdgeKindsForType(diagramType).map((kind) => ({ entryKey: `connection:${kind}`, label: `${kind} connection` })),
    ] : [], [diagramType, preset])
    const handleSemanticChange = (event: ChangeEvent<HTMLInputElement>) => {
        setAddedSemantic(event.target.value)
        const semantic = event.target.value.split(':')[1] ?? ''
        setAddedLabel(event.target.value.startsWith('nodeKind:') ? diagramNodeKindLabel(semantic as DiagramNodeKind) : semantic)
        setValidationMessage(null)
    }
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => setAddedLabel(event.target.value)
    const handleAdd = () => {
        if (!addedSemantic) {
            setValidationMessage('Choose the node kind, node role, or connection kind to add.')

            return
        }
        if (session.legend.addLegendEntry(newEntryFor(addedSemantic, addedLabel)) === null) {
            setValidationMessage('Legend entry could not be added.')

            return
        }
        onClose()
    }

    return (
        <>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationMessage ? <Alert severity="error">{validationMessage}</Alert> : null}
                    <Stack direction="row" spacing={1}>
                        <TextField
                            label="Add entry for"
                            onChange={handleSemanticChange}
                            select
                            size="small"
                            slotProps={{ select: { inputProps: { 'aria-label': 'Add entry for' } } }}
                            sx={{ flex: 1 }}
                            value={addedSemantic}
                        >
                            {semanticOptions.map(({ entryKey, label }) => (
                                <MenuItem key={entryKey} value={entryKey}>{label}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="Label"
                            onChange={handleLabelChange}
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Label for the added entry' } }}
                            sx={{ flex: 1 }}
                            value={addedSemantic ? addedLabel : ''}
                        />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleAdd} variant="contained">Add</Button>
            </DialogActions>
        </>
    )
}
