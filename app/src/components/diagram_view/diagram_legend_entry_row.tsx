import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import { useState, type MouseEvent } from 'react'
import type {
    DiagramConnectionKindFormatting,
    DiagramEdgeKind,
    DiagramNodeRoleFormatting,
    DiagramRole,
} from '../../services/diagrams/diagram_data'
import { NodeFormattingPopover } from './diagram_formatting_popover'
import { ConnectionFormattingPopover } from './diagram_connection_formatting_popover'
import { DiagramLegendConnectionSample } from './diagram_legend_connection_sample'
import type { DiagramLegendEntry } from './diagram_legend_entries'
import { diagramRoleStyle } from './diagram_role_style'
import {
    type DiagramFormattingStore,
    useDiagramNodeRoleFormatting,
} from './use_diagram_formatting'

export interface DiagramFormattingMutationStore extends DiagramFormattingStore {
    setConnectionKindFormatting(kind: DiagramEdgeKind, value: DiagramConnectionKindFormatting): void
    setNodeRoleFormatting(role: DiagramRole, value: DiagramNodeRoleFormatting): void
}

/** One legend semantic category with hover/focus formatting action and scoped sample subscription. */
export function DiagramLegendEntryRow({ entry, store }: { entry: DiagramLegendEntry, store: DiagramFormattingMutationStore }) {
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
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
            }}
        >
            {entry.entryType === 'node' ? (
                <Box
                    data-role={entry.role}
                    sx={{ border: '1px solid', borderRadius: 0.5, flexShrink: 0, height: 12, width: 20, ...diagramRoleStyle(entry.role, nodeFormatting) }}
                />
            ) : <DiagramLegendConnectionSample kind={entry.kind} store={store} />}
            <Typography color="text.secondary" sx={{ flex: 1, minWidth: 0 }} variant="caption">{entry.label}</Typography>
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
