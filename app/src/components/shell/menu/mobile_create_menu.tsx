import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import Plus from 'mdi-material-ui/Plus'

interface MobileCreateMenuProps {
    isNewActionDisabled: boolean
    isNewCardDisabled: boolean
    onCreateAction: () => void | Promise<void>
    onCreateCard: () => void
}

/** Mobile entry point for project creation actions. */
export function MobileCreateMenu(props: MobileCreateMenuProps) {
    const { isNewActionDisabled, isNewCardDisabled, onCreateAction, onCreateCard } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpenMenu = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleCloseMenu = () => {
        setAnchorElement(null)
    }

    const handleCreateAction = () => {
        handleCloseMenu()
        void onCreateAction()
    }

    const handleCreateCard = () => {
        handleCloseMenu()
        onCreateCard()
    }

    return (
        <>
            <Tooltip title="Create">
                <IconButton
                    aria-controls={anchorElement ? 'mobile-create-menu' : undefined}
                    aria-expanded={!!anchorElement}
                    aria-haspopup="menu"
                    aria-label="Create"
                    onClick={handleOpenMenu}
                    size="small"
                >
                    <Plus />
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchorElement} id="mobile-create-menu" onClose={handleCloseMenu} open={!!anchorElement}>
                <MenuItem disabled={isNewActionDisabled} onClick={handleCreateAction}>New action</MenuItem>
                <MenuItem disabled={isNewCardDisabled} onClick={handleCreateCard}>New card</MenuItem>
            </Menu>
        </>
    )
}
