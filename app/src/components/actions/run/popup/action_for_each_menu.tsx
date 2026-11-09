import AllInclusiveOutlined from '@mui/icons-material/AllInclusiveOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from '@mui/material'
import { useState, type MouseEvent } from 'react'
import type { ActionForEachConfig } from '../../../../data/action_run_types'
import { ActionForEachSetupDialog } from './action_for_each_setup_dialog'

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
    const [setupOpen, setSetupOpen] = useState(false)
    const close = () => setAnchor(null)
    const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)
    const openSetup = () => {
        setSetupOpen(true)
        close()
    }
    const closeSetup = () => setSetupOpen(false)
    const saveSetup = (updated: ActionForEachConfig) => {
        onChange(updated)
        closeSetup()
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
                <MenuItem disabled={disabled} onClick={openSetup}>
                    <ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Setup" />
                </MenuItem>
            </Menu>
            {setupOpen ? <ActionForEachSetupDialog config={config} disabled={disabled} onCancel={closeSetup} onSave={saveSetup} /> : null}
        </>
    )
}
