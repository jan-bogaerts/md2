import { Alert, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'

export interface FragmentDraftRegion {
    edgeIds: string[]
    guard: string
}

interface DiagramFragmentRegionEditorProps {
    assignedEdgeIds: ReadonlySet<string>
    edgeIds: readonly string[]
    getEdgeLabel: (edgeId: string) => string
    onEdgeChange: (regionIndex: number, edgeId: string, checked: boolean) => void
    onGuardChange: (regionIndex: number, guard: string) => void
    region: FragmentDraftRegion
    regionIndex: number
}

/** Edits one fragment region without owning canonical diagram state. */
export function DiagramFragmentRegionEditor({
    assignedEdgeIds,
    edgeIds,
    getEdgeLabel,
    onEdgeChange,
    onGuardChange,
    region,
    regionIndex,
}: DiagramFragmentRegionEditorProps) {
    const regionNumber = regionIndex + 1
    const guardLabel = `Region ${regionNumber} guard`
    const handleGuardChange = (event: ChangeEvent<HTMLInputElement>) => {
        onGuardChange(regionIndex, event.target.value)
    }
    const handleEdgeChange = (event: ChangeEvent<HTMLInputElement>) => {
        onEdgeChange(regionIndex, event.target.value, event.target.checked)
    }

    return (
        <Stack component="fieldset" spacing={0.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Typography component="legend" variant="subtitle2">Region {regionNumber}</Typography>
            <Typography color="text.secondary" variant="caption">{guardLabel}</Typography>
            <TextField
                onChange={handleGuardChange}
                required
                size="small"
                slotProps={{ htmlInput: { 'aria-label': guardLabel } }}
                value={region.guard}
            />
            <Typography color="text.secondary" variant="body2">Messages in sequence order</Typography>
            {edgeIds.map((edgeId, edgeIndex) => (
                <FormControlLabel
                    control={(
                        <Checkbox
                            checked={region.edgeIds.includes(edgeId)}
                            disabled={assignedEdgeIds.has(edgeId) && !region.edgeIds.includes(edgeId)}
                            onChange={handleEdgeChange}
                            value={edgeId}
                        />
                    )}
                    key={edgeId}
                    label={`${edgeIndex + 1}. ${getEdgeLabel(edgeId)}`}
                />
            ))}
            {edgeIds.length === 0 ? <Alert severity="warning">Sequence has no messages.</Alert> : null}
        </Stack>
    )
}
