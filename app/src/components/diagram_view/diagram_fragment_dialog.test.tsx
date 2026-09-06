import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramSequenceFragment } from '../../services/diagrams/diagram_data'
import { DiagramFragmentDialog } from './diagram_fragment_dialog'
import { DiagramFragmentDialogService } from './diagram_fragment_dialog_service'

afterEach(cleanup)

class FragmentDialogSessionStub extends EventTarget {
    readonly createFragment = vi.fn(() => 'fragment-new')
    readonly removeFragment = vi.fn(() => true)
    readonly updateFragment = vi.fn(() => true)
    readonly edges = [
        { id: 'edge-1', label: 'Request' },
        { id: 'edge-2', label: 'Retry' },
        { id: 'edge-3', label: 'Response' },
    ]
    readonly edgeIds = this.edges.map(({ id }) => id)
    readonly fragments = new Map<string, DiagramSequenceFragment>([[
        'fragment-1',
        {
            id: 'fragment-1', operator: 'alt', regions: [
                { edgeIds: ['edge-1'], guard: 'valid' },
                { edgeIds: ['edge-2'], guard: 'invalid' },
            ],
        },
    ]])

    getEdgeIdsSnapshot = () => this.edgeIds
    getEdgeSnapshot = (edgeId: string) => this.edges.find(({ id }) => id === edgeId) ?? null
    getFragmentSnapshot = (fragmentId: string) => this.fragments.get(fragmentId) ?? null
    subscribeCollectionMembership = (objectKind: 'edge' | 'fragment', listener: () => void) => {
        this.addEventListener(`${objectKind}Changed`, listener)

        return () => this.removeEventListener(`${objectKind}Changed`, listener)
    }
}

describe('DiagramFragmentDialog', () => {
    it('creates alt regions with required guards and unique messages in sequence order', () => {
        const dialog = new DiagramFragmentDialogService()
        const session = new FragmentDialogSessionStub()
        dialog.openCreate()
        render(<DiagramFragmentDialog dialog={dialog} session={session} />)

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Operator' }))
        fireEvent.click(screen.getByRole('option', { name: 'alt' }))
        expect(screen.getAllByRole('textbox')).toHaveLength(2)
        fireEvent.change(screen.getByRole('textbox', { name: 'Region 1 guard' }), { target: { value: 'success' } })
        fireEvent.change(screen.getByRole('textbox', { name: 'Region 2 guard' }), { target: { value: 'failure' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(screen.getByRole('alert')).toHaveTextContent('Region 1 requires at least one message.')

        const firstRegion = screen.getByRole('group', { name: 'Region 1' })
        const secondRegion = screen.getByRole('group', { name: 'Region 2' })
        fireEvent.click(within(firstRegion).getByRole('checkbox', { name: '3. Response' }))
        fireEvent.click(within(firstRegion).getByRole('checkbox', { name: '1. Request' }))
        expect(within(secondRegion).getByRole('checkbox', { name: '1. Request' })).toBeDisabled()
        fireEvent.click(within(secondRegion).getByRole('checkbox', { name: '2. Retry' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.createFragment).toHaveBeenCalledWith({
            operator: 'alt',
            regions: [
                { edgeIds: ['edge-1', 'edge-3'], guard: 'success' },
                { edgeIds: ['edge-2'], guard: 'failure' },
            ],
        })
        expect(dialog.getTargetSnapshot()).toBeNull()
    })

    it('edits and deletes an existing fragment', () => {
        const dialog = new DiagramFragmentDialogService()
        const session = new FragmentDialogSessionStub()
        dialog.openEdit('fragment-1')
        const { rerender } = render(<DiagramFragmentDialog dialog={dialog} session={session} />)

        fireEvent.change(screen.getByRole('textbox', { name: 'Region 1 guard' }), { target: { value: 'approved' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(session.updateFragment).toHaveBeenCalledWith('fragment-1', {
            operator: 'alt',
            regions: [
                { edgeIds: ['edge-1'], guard: 'approved' },
                { edgeIds: ['edge-2'], guard: 'invalid' },
            ],
        })

        dialog.openEdit('fragment-1')
        rerender(<DiagramFragmentDialog dialog={dialog} session={session} />)
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        expect(session.removeFragment).toHaveBeenCalledWith('fragment-1')
        expect(dialog.getTargetSnapshot()).toBeNull()
    })
})
