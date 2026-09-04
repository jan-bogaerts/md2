import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramSelectionIdentity } from '../../services/diagrams/diagram_selection_service'
import { DiagramDeleteButton } from './diagram_delete_button'

const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])

class DeleteSelectionStub extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = EMPTY_SELECTION

    readonly deleteSelection = vi.fn(() => {
        this.selection = EMPTY_SELECTION
        this.dispatchEvent(new Event('selection'))

        return true
    })

    readonly getSelectionSnapshot = () => this.selection

    readonly subscribeSelection = (listener: () => void) => {
        this.addEventListener('selection', listener)

        return () => this.removeEventListener('selection', listener)
    }

    select(identity: DiagramSelectionIdentity) {
        this.selection = Object.freeze([identity])
        this.dispatchEvent(new Event('selection'))
    }
}

afterEach(() => cleanup())

describe('DiagramDeleteButton', () => {
    it('disables for empty selection and deletes complete selection once when activated', async () => {
        const selection = new DeleteSelectionStub()
        render(<DiagramDeleteButton selection={selection} />)
        const button = screen.getByRole('button', { name: 'Delete' })

        expect(button).toBeDisabled()
        act(() => { selection.select({ objectId: 'orders', objectKind: 'node' }) })
        expect(button).toBeEnabled()
        fireEvent.mouseOver(button)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete selected diagram objects')

        fireEvent.click(button)

        expect(selection.deleteSelection).toHaveBeenCalledOnce()
        expect(button).toBeDisabled()
    })
})
