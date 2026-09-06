import { Alert, Button, DialogActions, DialogContent, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useMemo, useState, type ChangeEvent } from 'react'
import {
    DIAGRAM_EDGE_KINDS, DIAGRAM_ROLES, type DiagramEdgeKind, type DiagramRole,
} from '../../services/diagrams/diagram_data'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramLegendEntryEditor } from './diagram_legend_entry_editor'
import { useEditableDiagramLegendEntryKeys } from './use_editable_diagram'

interface DiagramLegendDetailsEditorProps {
    onClose: () => void
    session: DiagramEditSessionService
}

/** Every semantic an entry may identify, node roles first so the picker mirrors legend order. */
const SEMANTIC_OPTIONS: readonly { entryKey: string, label: string }[] = [
    ...DIAGRAM_ROLES.map((role) => ({ entryKey: `node:${role}`, label: `${role} node` })),
    ...DIAGRAM_EDGE_KINDS.map((kind) => ({ entryKey: `connection:${kind}`, label: `${kind} connection` })),
]
const EMPTY_ENTRY_KEYS: readonly string[] = Object.freeze([])

/** Omits a blank label so the service falls back to the canonical role or kind name. */
function newEntryFor(entryKey: string, label: string) {
    const [entryType, semantic] = entryKey.split(':')
    const typedLabel = label.trim().length > 0 ? { label } : {}

    return entryType === 'node'
        ? { ...typedLabel, role: semantic as DiagramRole }
        : { ...typedLabel, kind: semantic as DiagramEdgeKind }
}

/**
 * Adds, renames, reorders, and removes explicit legend entries. Each action assigns one entry field or
 * changes legend membership directly on the session; no complete legend is ever submitted.
 */
export function DiagramLegendDetailsEditor({ onClose, session }: DiagramLegendDetailsEditorProps) {
    const entryKeys = useEditableDiagramLegendEntryKeys(session) ?? EMPTY_ENTRY_KEYS
    const [validationMessage, setValidationMessage] = useState<string | null>(null)
    const [addedSemantic, setAddedSemantic] = useState('')
    const [addedLabel, setAddedLabel] = useState('')
    const availableOptions = useMemo(
        () => SEMANTIC_OPTIONS.filter(({ entryKey }) => !entryKeys.includes(entryKey)),
        [entryKeys],
    )
    const handleSemanticChange = (event: ChangeEvent<HTMLInputElement>) => {
        setAddedSemantic(event.target.value)
        setValidationMessage(null)
    }
    const handleAdd = () => {
        if (!addedSemantic) {
            setValidationMessage('Choose the node role or connection kind to add.')

            return
        }
        if (session.addLegendEntry(newEntryFor(addedSemantic, addedLabel)) === null) {
            setValidationMessage('That node role or connection kind already has a legend entry.')

            return
        }
        setAddedSemantic('')
        setAddedLabel('')
        setValidationMessage(null)
    }

    return (
        <>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationMessage ? <Alert severity="error">{validationMessage}</Alert> : null}
                    {entryKeys.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                            This diagram has no explicit legend entries, so its legend is derived from the node roles and
                            connection kinds it uses. Adding an entry replaces that derived legend.
                        </Typography>
                    ) : null}
                    <Stack aria-label="Legend entries" component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {entryKeys.map((entryKey, entryIndex) => (
                            <li key={entryKey}>
                                <DiagramLegendEntryEditor
                                    entryCount={entryKeys.length}
                                    entryIndex={entryIndex}
                                    entryKey={entryKey}
                                    onValidationMessage={setValidationMessage}
                                    session={session}
                                />
                            </li>
                        ))}
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
                        <TextField
                            label="Add entry for"
                            onChange={handleSemanticChange}
                            select
                            size="small"
                            slotProps={{ select: { inputProps: { 'aria-label': 'Add entry for' } } }}
                            sx={{ flex: 1 }}
                            value={addedSemantic}
                        >
                            {availableOptions.map(({ entryKey, label }) => (
                                <MenuItem key={entryKey} value={entryKey}>{label}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="Label"
                            onChange={(event) => setAddedLabel(event.target.value)}
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Label for the added entry' } }}
                            sx={{ flex: 1 }}
                            value={addedLabel}
                        />
                        <Button disabled={availableOptions.length === 0} onClick={handleAdd} variant="outlined">Add</Button>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">Close</Button>
            </DialogActions>
        </>
    )
}
