import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined'
import { Box, IconButton, TextField, Tooltip } from '@mui/material'
import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { PositionedDiagramNode } from '../../../services/diagrams/diagram_layout'

/** Inline label and details action above one editable node. */
export function DiagramInlineNodeControls({ node, onOpenDetails, session }: {
    node: PositionedDiagramNode
    onOpenDetails: () => void
    session: DiagramEditSessionService
}) {
    const [draftState, setDraftState] = useState({ base: node.label, value: node.label })
    const draft = draftState.base === node.label ? draftState.value : node.label
    const [error, setError] = useState<string | null>(null)
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraftState({ base: node.label, value: event.target.value })
        setError(null)
    }
    const commit = () => {
        if (draft.trim() === node.label) return
        if (!draft.trim()) {
            setError('Label is required.')

            return
        }
        if (!session.setNodeField(node.id, 'label', draft.trim())) setError('Label could not be saved.')
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation()
            setDraftState({ base: node.label, value: node.label })
            setError(null)

            return
        }
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
    }
    const stopPointer = (event: PointerEvent<HTMLElement>) => event.stopPropagation()
    const stopClick = (event: MouseEvent<HTMLElement>) => event.stopPropagation()
    const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        onOpenDetails()
    }

    return (
        <Box
            className="diagram-node-inline-controls"
            onClick={stopClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={stopPointer}
            sx={{
                height: node.height, left: node.x, pointerEvents: 'none', position: 'absolute', top: node.y,
                width: node.width, zIndex: 3,
                '& .diagram-node-details-action': { opacity: 0 },
                '&:hover .diagram-node-details-action, &:focus-within .diagram-node-details-action': { opacity: 1 },
                '@media (hover: none)': { '& .diagram-node-details-action': { opacity: 1 } },
            }}
        >
            <TextField
                error={!!error}
                helperText={error}
                onBlur={commit}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                size="small"
                slotProps={{ htmlInput: { 'aria-label': `Edit ${node.label} label` } }}
                sx={{
                    left: 8, maxWidth: 'calc(100% - 48px)', pointerEvents: 'auto', position: 'absolute',
                    top: node.height / 2 - 18,
                    '& .MuiInputBase-root': { bgcolor: 'background.paper' },
                }}
                value={draft}
                variant="standard"
            />
            <Tooltip title={`Details for ${node.label}`}>
                <IconButton
                    aria-label={`Details for ${node.label}`}
                    className="diagram-node-details-action"
                    onClick={onOpenDetails}
                    size="small"
                    sx={{ pointerEvents: 'auto', position: 'absolute', right: 2, top: 2 }}
                >
                    <MoreHorizOutlined fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
