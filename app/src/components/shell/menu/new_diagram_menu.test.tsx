import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewDiagramMenu } from './new_diagram_menu'

describe('NewDiagramMenu', () => {
    afterEach(cleanup)

    it('lists supported types and creates the selected type', () => {
        const onCreateDiagram = vi.fn()
        render(
            <AppThemeProvider>
                <NewDiagramMenu disabled={false} onCreateDiagram={onCreateDiagram} />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'New diagram' }))

        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
            'Architecture', 'Dependency', 'Sequence', 'Flowchart', 'State diagram', 'Entity', 'Mindmap',
        ])
        fireEvent.click(screen.getByRole('menuitem', { name: 'State diagram' }))
        expect(onCreateDiagram).toHaveBeenCalledWith(expect.objectContaining({ id: 'state', preset: 'state', type: 'flow' }))
    })

    it('disables creation entry point', () => {
        render(
            <AppThemeProvider>
                <NewDiagramMenu disabled onCreateDiagram={vi.fn()} />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'New diagram' })).toBeDisabled()
    })
})
