import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramSelectionIdentity } from '../../services/diagrams/diagram_selection_service'
import { DiagramCopyButton } from './diagram_copy_button'

const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])

class CopySelectionStub extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = EMPTY_SELECTION

    readonly getSelectionSnapshot = () => this.selection

    readonly subscribeSelection = (listener: () => void) => {
        this.addEventListener('selection', listener)

        return () => this.removeEventListener('selection', listener)
    }

    select(...identities: DiagramSelectionIdentity[]) {
        this.selection = Object.freeze(identities)
        this.dispatchEvent(new Event('selection'))
    }
}

afterEach(() => cleanup())

describe('DiagramCopyButton', () => {
    it('disables only for empty selection and starts one copy with current identities', async () => {
        const selection = new CopySelectionStub()
        const session = {} as never
        const copySelection = vi.fn(async () => true)
        render(<DiagramCopyButton copySelection={copySelection} selection={selection} session={session} />)
        const button = screen.getByRole('button', { name: 'Copy' })

        expect(button).toBeDisabled()
        act(() => { selection.select({ objectId: 'one-two', objectKind: 'edge' }) })
        expect(button).toBeEnabled()
        fireEvent.mouseOver(button)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy selected diagram objects')

        fireEvent.click(button)

        expect(copySelection).toHaveBeenCalledOnce()
        expect(copySelection).toHaveBeenCalledWith(selection.getSelectionSnapshot(), session)
    })
})
