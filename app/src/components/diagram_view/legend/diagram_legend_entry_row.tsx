import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type {
    DiagramConnectionKindFormatting,
    DiagramEdgeKind,
    DiagramNodeRoleFormatting,
    DiagramRole,
} from '../../../services/diagrams/diagram_data'
import { NodeFormattingPopover } from '../formatting/diagram_formatting_popover'
import { ConnectionFormattingPopover } from '../formatting/diagram_connection_formatting_popover'
import { DiagramLegendConnectionSample } from './diagram_legend_connection_sample'
import type { DiagramLegendEntry } from './diagram_legend_entries'
import { diagramRoleStyle } from '../formatting/diagram_role_style'
import {
    type DiagramFormattingStore,
    useDiagramNodeRoleFormatting,
} from '../formatting/use_diagram_formatting'

export interface DiagramFormattingMutationStore extends DiagramFormattingStore {
    setConnectionKindFormatting(kind: DiagramEdgeKind, value: DiagramConnectionKindFormatting): void
    setNodeRoleFormatting(role: DiagramRole, value: DiagramNodeRoleFormatting): void
}

/** One legend semantic category with hover/focus formatting action and scoped sample subscription. */
export function DiagramLegendEntryRow({ entry, session, store }: {
    entry: DiagramLegendEntry, session?: DiagramEditSessionService, store: DiagramFormattingMutationStore,
}) {
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [draftState, setDraftState] = useState({ base: entry.label, value: entry.label })
    const draftLabel = draftState.base === entry.label ? draftState.value : entry.label
    const [labelError, setLabelError] = useState<string | null>(null)
    const entryKey = entry.entryType === 'node' ? `node:${entry.role}` : `connection:${entry.kind}`
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraftState({ base: entry.label, value: event.target.value })
        setLabelError(null)
    }
    const commitLabel = () => {
        if (!session || draftLabel.trim() === entry.label) return
        if (!draftLabel.trim()) {
            setLabelError('Label is required.')

            return
        }
        session.materializeDerivedLegend()
        if (!session.setLegendEntryLabel(entryKey, draftLabel)) setLabelError('Label could not be saved.')
    }
    const handleLabelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            commitLabel()
        }
        if (event.key === 'Escape') {
            setDraftState({ base: entry.label, value: entry.label })
            setLabelError(null)
        }
    }
    const handleRemove = () => {
        session?.materializeDerivedLegend()
        session?.removeLegendEntry(entryKey)
    }
    const nodeFormatting = useDiagramNodeRoleFormatting(entry.entryType === 'node' ? entry.role : 'focal', store)
    const handleOpen = (event: MouseEvent<HTMLButtonElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => setAnchorElement(null)
    const handleNodeApply = (value: DiagramNodeRoleFormatting) => {
        if (entry.entryType === 'node') store.setNodeRoleFormatting(entry.role, value)
    }
    const handleConnectionApply = (value: DiagramConnectionKindFormatting) => {
        if (entry.entryType === 'connection') store.setConnectionKindFormatting(entry.kind, value)
    }

    return (
        <Box
            sx={{
                alignItems: 'center', display: 'flex', gap: 1,
                '& .diagram-formatting-action': { opacity: 0 },
                '&:focus-within .diagram-formatting-action, &:hover .diagram-formatting-action': { opacity: 1 },
                '@media (hover: none)': { '& .diagram-formatting-action': { opacity: 1 } },
            }}
        >
            {entry.entryType === 'node' ? (
                <Box
                    data-role={entry.role}
                    sx={{ border: '1px solid', borderRadius: 0.5, flexShrink: 0, height: 12, width: 20, ...diagramRoleStyle(entry.role, nodeFormatting) }}
                />
            ) : <DiagramLegendConnectionSample kind={entry.kind} store={store} />}
            {session ? (
                <TextField
                    error={!!labelError}
                    helperText={labelError}
                    onBlur={commitLabel}
                    onChange={handleLabelChange}
                    onKeyDown={handleLabelKeyDown}
                    size="small"
                    slotProps={{ htmlInput: { 'aria-label': `Legend label for ${entryKey}` } }}
                    sx={{ flex: 1, minWidth: 0 }}
                    value={draftLabel}
                />
            ) : <Typography color="text.secondary" sx={{ flex: 1, minWidth: 0 }} variant="caption">{entry.label}</Typography>}
            {session ? (
                <Tooltip title={`Remove ${entry.label}`}>
                    <IconButton aria-label={`Remove ${entry.label}`} className="diagram-formatting-action" onClick={handleRemove} size="small">
                        <DeleteOutlineOutlined fontSize="small" />
                    </IconButton>
                </Tooltip>
            ) : null}
            <Tooltip title={`Format ${entry.label}`}>
                <IconButton
                    aria-label={`Format ${entry.label}`}
                    className="diagram-formatting-action"
                    onClick={handleOpen}
                    size="small"
                >
                    <SettingsOutlined fontSize="small" />
                </IconButton>
            </Tooltip>
            {anchorElement && entry.entryType === 'node' ? (
                <NodeFormattingPopover
                    anchorElement={anchorElement}
                    label={entry.label}
                    onApply={handleNodeApply}
                    onClose={handleClose}
                    value={store.getNodeRoleFormattingSnapshot(entry.role)}
                />
            ) : null}
            {anchorElement && entry.entryType === 'connection' ? (
                <ConnectionFormattingPopover
                    anchorElement={anchorElement}
                    kind={entry.kind}
                    label={entry.label}
                    onApply={handleConnectionApply}
                    onClose={handleClose}
                    value={store.getConnectionKindFormattingSnapshot(entry.kind)}
                />
            ) : null}
        </Box>
    )
}
