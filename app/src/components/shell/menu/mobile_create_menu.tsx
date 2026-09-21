import { IconButton, Menu, MenuItem, Tooltip } from '@mui/material'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import Plus from 'mdi-material-ui/Plus'
import type { EmptyDiagramChoice } from '../../../services/diagrams/empty_diagram_factory'
import { EMPTY_DIAGRAM_CHOICES } from '../../../services/diagrams/empty_diagram_factory'

interface MobileCreateMenuProps {
    isNewActionDisabled: boolean
    isNewCardDisabled: boolean
    isNewDiagramDisabled: boolean
    onCreateAction: () => void | Promise<void>
    onCreateCard: () => void
    onCreateDiagram: (choice: EmptyDiagramChoice) => void | Promise<void>
}

/** Mobile entry point for project creation actions. */
export function MobileCreateMenu(props: MobileCreateMenuProps) {
    const {
        isNewActionDisabled,
        isNewCardDisabled,
        isNewDiagramDisabled,
        onCreateAction,
        onCreateCard,
        onCreateDiagram,
    } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [diagramAnchorElement, setDiagramAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpenMenu = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleCloseMenu = () => {
        setAnchorElement(null)
        setDiagramAnchorElement(null)
    }

    const handleOpenDiagramMenu = (event: MouseEvent<HTMLElement>) => {
        setDiagramAnchorElement(event.currentTarget)
    }

    const handleCloseDiagramMenu = () => {
        setDiagramAnchorElement(null)
    }

    const handleCreateAction = () => {
        handleCloseMenu()
        void onCreateAction()
    }

    const handleCreateCard = () => {
        handleCloseMenu()
        onCreateCard()
    }

    const handleCreateDiagram = (choice: EmptyDiagramChoice) => () => {
        handleCloseMenu()
        void onCreateDiagram(choice)
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
                <MenuItem disabled={isNewCardDisabled} onClick={handleCreateCard}>New card</MenuItem>
                <MenuItem disabled={isNewActionDisabled} onClick={handleCreateAction}>New action</MenuItem>
                <MenuItem disabled={isNewDiagramDisabled} onClick={handleOpenDiagramMenu}>New diagram</MenuItem>
            </Menu>
            <Menu anchorEl={diagramAnchorElement} onClose={handleCloseDiagramMenu} open={!!diagramAnchorElement}>
                {EMPTY_DIAGRAM_CHOICES.map((choice) => (
                    <MenuItem key={choice.id} onClick={handleCreateDiagram(choice)}>{choice.label}</MenuItem>
                ))}
            </Menu>
        </>
    )
}
