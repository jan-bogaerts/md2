import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, ButtonBase, IconButton, Menu, MenuItem, TextField, Tooltip, Typography } from '@mui/material'
import { useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react'
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

function noSelection() { return null }
function noSelectionSubscription() { return () => {} }

/** One legend semantic category with hover/focus formatting action and scoped sample subscription. */
export function DiagramLegendEntryRow({ entry, session, store }: {
    entry: DiagramLegendEntry, session?: DiagramEditSessionService, store: DiagramFormattingMutationStore,
}) {
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [activeRole, setActiveRole] = useState<DiagramRole | null>(null)
    const [draftState, setDraftState] = useState({ base: entry.label, value: entry.label })
    const draftLabel = draftState.base === entry.label ? draftState.value : entry.label
    const [labelError, setLabelError] = useState<string | null>(null)
    const entryKey = entry.entryType === 'node' ? `node:${entry.role}`
        : entry.entryType === 'nodeKind' ? `nodeKind:${entry.nodeKind}` : `connection:${entry.kind}`
    const sampleRole = entry.entryType === 'node' ? entry.role
        : entry.entryType === 'nodeKind' ? entry.roles[0] : undefined
    const selectedKey = useSyncExternalStore(
        session?.subscribeLegendSelection ?? noSelectionSubscription,
        session?.getSelectedLegendEntryKeySnapshot ?? noSelection,
        noSelection,
    )
    const handleSelect = () => session?.selectLegendEntry(entryKey)
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
    const nodeFormatting = useDiagramNodeRoleFormatting(sampleRole ?? 'focal', store)
    const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
        setAnchorElement(event.currentTarget)
        setActiveRole(entry.entryType === 'node' ? entry.role
            : entry.entryType === 'nodeKind' && entry.roles.length === 1 ? entry.roles[0] : null)
    }
    const handleClose = () => {
        setAnchorElement(null)
        setActiveRole(null)
    }
    const handleRoleChoice = (event: MouseEvent<HTMLLIElement>) => setActiveRole(event.currentTarget.dataset.role as DiagramRole)
    const handleNodeApply = (value: DiagramNodeRoleFormatting) => {
        if (activeRole) store.setNodeRoleFormatting(activeRole, value)
    }
    const handleConnectionApply = (value: DiagramConnectionKindFormatting) => {
        if (entry.entryType === 'connection') store.setConnectionKindFormatting(entry.kind, value)
    }

    return (
        <Box
            sx={{
                alignItems: 'center', bgcolor: selectedKey === entryKey ? 'custom.primaryBg' : undefined,
                borderRadius: 1, display: 'flex', gap: 1,
                '& .diagram-formatting-action': { opacity: 0 },
                '&:focus-within .diagram-formatting-action, &:hover .diagram-formatting-action': { opacity: 1 },
                '@media (hover: none)': { '& .diagram-formatting-action': { opacity: 1 } },
            }}
        >
            {session ? (
                <ButtonBase aria-label={`Select ${entry.label}`} aria-pressed={selectedKey === entryKey} onClick={handleSelect} sx={{ borderRadius: 0.5, p: 0.5 }}>
                    {entry.entryType !== 'connection' ? (
                        <Box data-role={sampleRole} sx={{ border: '1px solid', borderRadius: 0.5, height: 12, width: 20, ...(sampleRole ? diagramRoleStyle(sampleRole, nodeFormatting) : {}) }} />
                    ) : <DiagramLegendConnectionSample kind={entry.kind} store={store} />}
                </ButtonBase>
            ) : entry.entryType !== 'connection' ? (
                <Box data-role={sampleRole} sx={{ border: '1px solid', borderRadius: 0.5, flexShrink: 0, height: 12, width: 20, ...(sampleRole ? diagramRoleStyle(sampleRole, nodeFormatting) : {}) }} />
            ) : <DiagramLegendConnectionSample kind={entry.kind} store={store} />}
            {session ? (
                <TextField
                    error={!!labelError}
                    helperText={labelError}
                    onBlur={commitLabel}
                    onChange={handleLabelChange}
                    onClick={handleSelect}
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
                    disabled={entry.entryType === 'nodeKind' && entry.roles.length === 0}
                    onClick={handleOpen}
                    size="small"
                >
                    <SettingsOutlined fontSize="small" />
                </IconButton>
            </Tooltip>
            {anchorElement && entry.entryType === 'nodeKind' && entry.roles.length > 1 && !activeRole ? (
                <Menu anchorEl={anchorElement} onClose={handleClose} open>
                    {entry.roles.map((role) => (
                        <MenuItem data-role={role} key={role} onClick={handleRoleChoice}>{role}</MenuItem>
                    ))}
                </Menu>
            ) : null}
            {anchorElement && activeRole ? (
                <NodeFormattingPopover
                    anchorElement={anchorElement}
                    label={entry.entryType === 'nodeKind' ? `${entry.label} (${activeRole})` : entry.label}
                    onApply={handleNodeApply}
                    onClose={handleClose}
                    value={store.getNodeRoleFormattingSnapshot(activeRole)}
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
