import { Button, Menu, MenuItem } from '@mui/material'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import type { EmptyDiagramChoice } from '../../../services/diagrams/empty_diagram_factory'
import { EMPTY_DIAGRAM_CHOICES } from '../../../services/diagrams/empty_diagram_factory'

interface NewDiagramMenuProps {
    disabled: boolean
    onCreateDiagram: (choice: EmptyDiagramChoice) => void | Promise<void>
}

/** Desktop entry point for choosing an empty diagram type. */
export function NewDiagramMenu({ disabled, onCreateDiagram }: NewDiagramMenuProps) {
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)

    const handleOpenMenu = (event: MouseEvent<HTMLButtonElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleCloseMenu = () => {
        setAnchorElement(null)
    }

    const handleCreateDiagram = (choice: EmptyDiagramChoice) => () => {
        handleCloseMenu()
        void onCreateDiagram(choice)
    }

    return (
        <>
            <Button disabled={disabled} onClick={handleOpenMenu} size="small" variant="outlined">New diagram</Button>
            <Menu anchorEl={anchorElement} onClose={handleCloseMenu} open={!!anchorElement}>
                {EMPTY_DIAGRAM_CHOICES.map((choice) => (
                    <MenuItem key={choice.id} onClick={handleCreateDiagram(choice)}>{choice.label}</MenuItem>
                ))}
            </Menu>
        </>
    )
}
