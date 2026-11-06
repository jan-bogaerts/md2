import AllInclusiveOutlined from '@mui/icons-material/AllInclusiveOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import { useState, type MouseEvent } from 'react'
import type { ActionForEachConfig } from '../../../../data/action_run_types'

interface ActionForEachMenuProps {
    config: ActionForEachConfig
    disabled: boolean
    onChange: (config: ActionForEachConfig) => void
    onRemove: () => void
    onView: () => void
}

/** Loop indicator and idle configuration menu for one displayed conversation or draft. */
export function ActionForEachMenu({ config, disabled, onChange, onRemove, onView }: ActionForEachMenuProps) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    const [modeAnchor, setModeAnchor] = useState<HTMLElement | null>(null)
    const [failureAnchor, setFailureAnchor] = useState<HTMLElement | null>(null)
    const close = () => {
        setAnchor(null)
        setModeAnchor(null)
        setFailureAnchor(null)
    }
    const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)
    const openMode = (event: MouseEvent<HTMLElement>) => setModeAnchor(event.currentTarget)
    const openFailure = (event: MouseEvent<HTMLElement>) => setFailureAnchor(event.currentTarget)
    const selectMode = (mode: ActionForEachConfig['mode']) => {
        onChange({ ...config, mode })
        close()
    }
    const selectFailure = (failurePolicy: ActionForEachConfig['failurePolicy']) => {
        onChange({ ...config, failurePolicy })
        close()
    }
    const remove = () => {
        onRemove()
        close()
    }
    const view = () => {
        onView()
        close()
    }

    return (
        <>
            <Tooltip title={config.fileName}>
                <span>
                    <IconButton aria-label={`For each: ${config.fileName}`} onClick={open} size="small">
                        <AllInclusiveOutlined sx={{ fontSize: 18 }} />
                    </IconButton>
                </span>
            </Tooltip>
            <Menu anchorEl={anchor} onClose={close} open={!!anchor}>
                <MenuItem onClick={view}>
                    <ListItemIcon><VisibilityOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="View" />
                </MenuItem>
                <MenuItem disabled={disabled} onClick={remove}>
                    <ListItemIcon><DeleteOutlineOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Remove" />
                </MenuItem>
                <MenuItem disabled={disabled} onClick={openMode}><ListItemText primary="At end" secondary={config.mode} /></MenuItem>
                <MenuItem disabled={disabled} onClick={openFailure}><ListItemText primary="On failure" secondary={config.failurePolicy} /></MenuItem>
            </Menu>
            <Menu anchorEl={modeAnchor} onClose={() => setModeAnchor(null)} open={!!modeAnchor}>
                <MenuItem selected={config.mode === 'addPrompt'} onClick={() => selectMode('addPrompt')}>Add prompt</MenuItem>
                <MenuItem selected={config.mode === 'compact'} onClick={() => selectMode('compact')}>Compact</MenuItem>
                <MenuItem selected={config.mode === 'newConversation'} onClick={() => selectMode('newConversation')}>New conversation</MenuItem>
            </Menu>
            <Menu anchorEl={failureAnchor} onClose={() => setFailureAnchor(null)} open={!!failureAnchor}>
                <MenuItem selected={config.failurePolicy === 'logAndContinue'} onClick={() => selectFailure('logAndContinue')}>Log and continue</MenuItem>
                <MenuItem selected={config.failurePolicy === 'stopOnFirstFailure'} onClick={() => selectFailure('stopOnFirstFailure')}>Stop on first failure</MenuItem>
            </Menu>
        </>
    )
}
