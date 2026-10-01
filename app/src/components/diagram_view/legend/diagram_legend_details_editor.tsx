import { Alert, Button, Checkbox, DialogActions, DialogContent, FormControlLabel, ListSubheader, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useCallback, useMemo, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import {
    diagramEdgeKindsForType, DIAGRAM_NODE_KINDS, DIAGRAM_ROLES, requireDiagramNodeKind,
    type DiagramEdgeKind, type DiagramNodeKind, type DiagramRole,
} from '../../../services/diagrams/diagram_data'
import { diagramNodeKindLabel, effectiveDiagramNodeKind } from '../../../services/diagrams/diagram_creation_tool_labels'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { DiagramLegendEntryEditor } from './diagram_legend_entry_editor'
import { useEditableDiagramEdgeIds, useEditableDiagramLegendEntryKeys, useEditableDiagramNodeIds } from '../editing/use_editable_diagram'

interface DiagramLegendDetailsEditorProps {
    onClose: () => void
    session: DiagramEditSessionService
}

const EMPTY_ENTRY_KEYS: readonly string[] = Object.freeze([])

/** Tracks node kinds and connection kinds used by the current diagram. */
function useUsedLegendEntryKeys(session: DiagramEditSessionService) {
    const nodeIds = useEditableDiagramNodeIds(session) ?? EMPTY_ENTRY_KEYS
    const edgeIds = useEditableDiagramEdgeIds(session) ?? EMPTY_ENTRY_KEYS
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribes = [
            ...nodeIds.map((nodeId) => session.subscribeNodeField(nodeId, 'kind', listener)),
            ...nodeIds.map((nodeId) => session.subscribeNodeField(nodeId, 'role', listener)),
            ...edgeIds.map((edgeId) => session.subscribeEdgeField(edgeId, 'kind', listener)),
        ]

        return () => {
            for (const unsubscribe of unsubscribes) unsubscribe()
        }
    }, [edgeIds, nodeIds, session])
    const getSnapshot = useCallback(() => {
        const diagramType = session.getMetadataFieldSnapshot('type')
        if (!diagramType) return ''
        const keys = [
            ...nodeIds.map((nodeId) => `node:${session.getNodeFieldSnapshot(nodeId, 'role')}`),
            ...nodeIds.map((nodeId) => `nodeKind:${effectiveDiagramNodeKind(
                session.getNodeFieldSnapshot(nodeId, 'kind') ?? undefined, diagramType,
            )}`),
            ...edgeIds.map((edgeId) => `connection:${session.getEdgeFieldSnapshot(edgeId, 'kind')}`),
        ]

        return [...new Set(keys)].join('|')
    }, [edgeIds, nodeIds, session])
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return useMemo(() => new Set(snapshot ? snapshot.split('|') : []), [snapshot])
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
 * Adds, renames, reorders, and removes explicit legend entries. Each action assigns one entry field or
 * changes legend membership directly on the session; no complete legend is ever submitted.
 */
export function DiagramLegendDetailsEditor({ onClose, session }: DiagramLegendDetailsEditorProps) {
    const entryKeys = useEditableDiagramLegendEntryKeys(session) ?? EMPTY_ENTRY_KEYS
    const usedEntryKeys = useUsedLegendEntryKeys(session)
    const [validationMessage, setValidationMessage] = useState<string | null>(null)
    const [addedSemantic, setAddedSemantic] = useState('')
    const [addedLabel, setAddedLabel] = useState('')
    const [includeUsedTypes, setIncludeUsedTypes] = useState(false)
    const diagramType = session.getMetadataFieldSnapshot('type')
    const preset = session.getMetadataFieldSnapshot('preset') ?? undefined
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
    const availableOptions = useMemo(
        () => semanticOptions.filter(({ entryKey }) => !entryKeys.includes(entryKey)),
        [entryKeys, semanticOptions],
    )
    const unusedOptions = availableOptions.filter(({ entryKey }) => !usedEntryKeys.has(entryKey))
    const usedOptions = availableOptions.filter(({ entryKey }) => usedEntryKeys.has(entryKey))
    const selectedSemantic = availableOptions.some(({ entryKey }) => entryKey === addedSemantic)
        && (includeUsedTypes || !usedEntryKeys.has(addedSemantic)) ? addedSemantic : ''
    const handleSemanticChange = (event: ChangeEvent<HTMLInputElement>) => {
        setAddedSemantic(event.target.value)
        const semantic = event.target.value.split(':')[1] ?? ''
        setAddedLabel(event.target.value.startsWith('nodeKind:') ? diagramNodeKindLabel(semantic as DiagramNodeKind) : semantic)
        setValidationMessage(null)
    }
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => setAddedLabel(event.target.value)
    const handleIncludeUsedTypesChange = (event: ChangeEvent<HTMLInputElement>) => {
        setIncludeUsedTypes(event.target.checked)
        if (!event.target.checked && usedEntryKeys.has(addedSemantic)) {
            setAddedSemantic('')
            setAddedLabel('')
        }
    }
    const handleAdd = () => {
        if (!selectedSemantic) {
            setValidationMessage('Choose the node kind, node role, or connection kind to add.')

            return
        }
        if (session.addLegendEntry(newEntryFor(selectedSemantic, addedLabel)) === null) {
            setValidationMessage('That node kind, node role, or connection kind already has a legend entry.')

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
                    {!session.getHasExplicitLegendSnapshot() ? (
                        <Typography color="text.secondary" variant="body2">
                            This diagram has no explicit legend entries, so its legend is derived from the node kinds and
                            connection kinds it uses. Adding an entry keeps those derived entries.
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
                    <FormControlLabel
                        control={<Checkbox checked={includeUsedTypes} onChange={handleIncludeUsedTypesChange} />}
                        label="Include used types"
                    />
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
                        <TextField
                            label="Add entry for"
                            onChange={handleSemanticChange}
                            select
                            size="small"
                            slotProps={{ select: { inputProps: { 'aria-label': 'Add entry for' } } }}
                            sx={{ flex: 1 }}
                            value={selectedSemantic}
                        >
                            <ListSubheader>Unused types</ListSubheader>
                            {unusedOptions.map(({ entryKey, label }) => (
                                <MenuItem key={entryKey} value={entryKey}>{label}</MenuItem>
                            ))}
                            {includeUsedTypes && usedOptions.length > 0 ? <ListSubheader>Used types</ListSubheader> : null}
                            {includeUsedTypes ? usedOptions.map(({ entryKey, label }) => (
                                <MenuItem key={entryKey} value={entryKey}>{label}</MenuItem>
                            )) : null}
                        </TextField>
                        <TextField
                            label="Label"
                            onChange={handleLabelChange}
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Label for the added entry' } }}
                            sx={{ flex: 1 }}
                            value={selectedSemantic ? addedLabel : ''}
                        />
                        <Button disabled={unusedOptions.length === 0 && (!includeUsedTypes || usedOptions.length === 0)} onClick={handleAdd} variant="outlined">Add</Button>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">Close</Button>
            </DialogActions>
        </>
    )
}
