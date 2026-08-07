import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, IconButton, Tooltip } from '@mui/material'

export type ActionRowMoveDirection = 'down' | 'up'

interface ActionOrderedRowActionsProps {
    controlLabel: string
    index: number
    itemCount: number
    onMove: (index: number, direction: ActionRowMoveDirection) => void
    onRemove: (index: number) => void
    setControlRef: (index: number, control: string, element: HTMLButtonElement | null) => void
}

/** Hidden-until-active controls shared by ordered action rows. */
export function ActionOrderedRowActions(props: ActionOrderedRowActionsProps) {
    const { controlLabel, index, itemCount, onMove, onRemove, setControlRef } = props
    const handleMoveUp = () => onMove(index, 'up')
    const handleMoveDown = () => onMove(index, 'down')
    const handleRemove = () => onRemove(index)
    const setMoveUpRef = (element: HTMLButtonElement | null) => setControlRef(index, 'up', element)
    const setMoveDownRef = (element: HTMLButtonElement | null) => setControlRef(index, 'down', element)
    const setRemoveRef = (element: HTMLButtonElement | null) => setControlRef(index, 'remove', element)
    const buttonSx = { '&:focus-visible, &:hover': { bgcolor: 'custom.track', color: 'primary.main' } }

    return (
        <Box className="action-row-actions" sx={{ display: 'flex', justifyContent: 'flex-end', opacity: 0 }}>
            <Tooltip title={`Move ${controlLabel} up`}>
                <span>
                    <IconButton
                        aria-label={`Move ${controlLabel} up`}
                        disabled={index === 0}
                        onClick={handleMoveUp}
                        ref={setMoveUpRef}
                        size="small"
                        sx={buttonSx}
                    >
                        <ArrowUpwardOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title={`Move ${controlLabel} down`}>
                <span>
                    <IconButton
                        aria-label={`Move ${controlLabel} down`}
                        disabled={index === itemCount - 1}
                        onClick={handleMoveDown}
                        ref={setMoveDownRef}
                        size="small"
                        sx={buttonSx}
                    >
                        <ArrowDownwardOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title={`Remove ${controlLabel}`}>
                <IconButton
                    aria-label={`Remove ${controlLabel}`}
                    onClick={handleRemove}
                    ref={setRemoveRef}
                    size="small"
                    sx={buttonSx}
                >
                    <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
