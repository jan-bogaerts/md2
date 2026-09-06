import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramType } from '../../services/diagrams/diagram_data'
import { DiagramFragmentButton } from './diagram_fragment_button'

afterEach(cleanup)

class FragmentButtonSessionStub extends EventTarget {
    private readonly diagramType: DiagramType

    constructor(diagramType: DiagramType) {
        super()
        this.diagramType = diagramType
    }

    getMetadataFieldSnapshot = () => this.diagramType

    subscribeMetadataField = (_field: 'type', listener: () => void) => {
        this.addEventListener('typeChanged', listener)

        return () => this.removeEventListener('typeChanged', listener)
    }

    subscribeSession = (listener: () => void) => {
        this.addEventListener('sessionChanged', listener)

        return () => this.removeEventListener('sessionChanged', listener)
    }

}

describe('DiagramFragmentButton', () => {
    it('opens fragment creation for sequence diagrams', () => {
        const dialog = { openCreate: vi.fn(() => true) }
        render(<DiagramFragmentButton dialog={dialog} session={new FragmentButtonSessionStub('sequence')} />)

        fireEvent.click(screen.getByRole('button', { name: 'Fragment' }))

        expect(dialog.openCreate).toHaveBeenCalledOnce()
    })

    it.each(['architecture', 'dependency', 'entity', 'flow'] as const)('stays hidden for %s diagrams', (diagramType) => {
        render(<DiagramFragmentButton session={new FragmentButtonSessionStub(diagramType)} />)

        expect(screen.queryByRole('button', { name: 'Fragment' })).not.toBeInTheDocument()
    })
})
