import {
    Alert, Button, DialogActions, DialogContent, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useCallback, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react'
import type { DiagramSequenceOperator } from '../../services/diagrams/diagram_data'
import type { NewDiagramSequenceFragment } from '../../services/diagrams/diagram_edit_session_service'
import {
    DiagramFragmentRegionEditor, type FragmentDraftRegion,
} from './diagram_fragment_region_editor'

export interface ReadonlySequenceFragment {
    readonly id: string
    readonly operator: DiagramSequenceOperator
    readonly regions: readonly { readonly edgeIds: readonly string[], readonly guard: string }[]
}

export interface FragmentDialogSession {
    createFragment: (fragment: NewDiagramSequenceFragment) => string | null
    getEdgeIdsSnapshot: () => readonly string[]
    getEdgeSnapshot: (edgeId: string) => Readonly<{ id: string, label?: string }> | null
    getFragmentSnapshot: (fragmentId: string) => ReadonlySequenceFragment | null
    removeFragment: (fragmentId: string) => boolean
    subscribeCollectionMembership: (objectKind: 'edge' | 'fragment', listener: () => void) => () => void
    updateFragment: (fragmentId: string, fragment: NewDiagramSequenceFragment) => boolean
}

interface FragmentDraft {
    operator: DiagramSequenceOperator
    regions: FragmentDraftRegion[]
}

const EMPTY_REGION = (): FragmentDraftRegion => ({ edgeIds: [], guard: '' })
const NEW_FRAGMENT_DRAFT = (): FragmentDraft => ({ operator: 'opt', regions: [EMPTY_REGION()] })

function draftFromFragment(fragment: ReadonlySequenceFragment): FragmentDraft {
    return {
        operator: fragment.operator,
        regions: fragment.regions.map(({ edgeIds, guard }) => ({ edgeIds: [...edgeIds], guard })),
    }
}

function validationMessage(draft: FragmentDraft) {
    const missingGuardIndex = draft.regions.findIndex(({ guard }) => guard.trim().length === 0)
    if (missingGuardIndex >= 0) return `Region ${missingGuardIndex + 1} guard is required.`
    const missingEdgesIndex = draft.regions.findIndex(({ edgeIds }) => edgeIds.length === 0)
    if (missingEdgesIndex >= 0) return `Region ${missingEdgesIndex + 1} requires at least one message.`

    return null
}

/** Edits one complete fragment draft and commits it atomically. */
export function DiagramFragmentForm({
    fragmentId,
    onClose,
    session,
}: {
    fragmentId: string | null
    onClose: () => void
    session: FragmentDialogSession
}) {
    const sourceFragment = fragmentId ? session.getFragmentSnapshot(fragmentId) : null
    const [draft, setDraft] = useState(() => sourceFragment ? draftFromFragment(sourceFragment) : NEW_FRAGMENT_DRAFT())
    const [validationError, setValidationError] = useState<string | null>(null)
    const edgeIds = useSyncExternalStore(
        useCallback((listener) => session.subscribeCollectionMembership('edge', listener), [session]),
        session.getEdgeIdsSnapshot,
        session.getEdgeIdsSnapshot,
    )
    const assignedEdgeIds = new Set(draft.regions.flatMap((region) => region.edgeIds))
    const handleOperatorChange = (event: ChangeEvent<HTMLInputElement>) => {
        const operator = event.target.value as DiagramSequenceOperator
        const regionCount = operator === 'alt' ? 2 : 1
        setDraft((current) => ({
            operator,
            regions: Array.from({ length: regionCount }, (_value, index) => current.regions[index] ?? EMPTY_REGION()),
        }))
        setValidationError(null)
    }
    const handleGuardChange = (regionIndex: number, guard: string) => {
        setDraft((current) => ({
            ...current,
            regions: current.regions.map((region, index) => (
                index === regionIndex ? { ...region, guard } : region
            )),
        }))
        setValidationError(null)
    }
    const handleEdgeChange = (regionIndex: number, edgeId: string, checked: boolean) => {
        setDraft((current) => {
            const selectedIds = new Set(current.regions.flatMap((region) => region.edgeIds))
            if (checked) selectedIds.add(edgeId)
            else selectedIds.delete(edgeId)
            const regionEdgeIds = edgeIds.filter((id) => selectedIds.has(id) && (
                id === edgeId || current.regions[regionIndex].edgeIds.includes(id)
            ))

            return {
                ...current,
                regions: current.regions.map((region, index) => (
                    index === regionIndex ? { ...region, edgeIds: [...regionEdgeIds] } : region
                )),
            }
        })
        setValidationError(null)
    }
    const getEdgeLabel = (edgeId: string) => session.getEdgeSnapshot(edgeId)?.label ?? edgeId
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const error = validationMessage(draft)
        if (error) {
            setValidationError(error)

            return
        }
        const fragment = { operator: draft.operator, regions: draft.regions }
        const saved = fragmentId ? session.updateFragment(fragmentId, fragment) : session.createFragment(fragment) !== null
        if (saved) onClose()
    }
    const handleDelete = () => {
        if (fragmentId && session.removeFragment(fragmentId)) onClose()
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationError ? <Alert severity="error">{validationError}</Alert> : null}
                    <Stack spacing={0.5}>
                        <Typography color="text.secondary" variant="caption">Operator</Typography>
                        <TextField
                            onChange={handleOperatorChange}
                            select
                            size="small"
                            slotProps={{ select: { inputProps: { 'aria-label': 'Operator' } } }}
                            value={draft.operator}
                        >
                            <MenuItem value="alt">alt</MenuItem>
                            <MenuItem value="opt">opt</MenuItem>
                            <MenuItem value="loop">loop</MenuItem>
                        </TextField>
                    </Stack>
                    {draft.regions.map((region, regionIndex) => (
                        <DiagramFragmentRegionEditor
                            assignedEdgeIds={assignedEdgeIds}
                            edgeIds={edgeIds}
                            getEdgeLabel={getEdgeLabel}
                            key={regionIndex}
                            onEdgeChange={handleEdgeChange}
                            onGuardChange={handleGuardChange}
                            region={region}
                            regionIndex={regionIndex}
                        />
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                {fragmentId ? <Button color="error" onClick={handleDelete}>Delete</Button> : null}
                <Button onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="contained">Save</Button>
            </DialogActions>
        </form>
    )
}
