import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramGroupDrawingBox } from '../../services/diagrams/diagram_group_drawing_service'
import { DiagramGroupLabelDialog } from './diagram_group_label_dialog'

class GroupLabelDrawingStub extends EventTarget {
    readonly cancelDrawing = vi.fn(() => true)
    readonly completeGroup = vi.fn(() => 'group-1')
    private pendingBox: DiagramGroupDrawingBox | null = null

    getPendingLabelBoxSnapshot = () => this.pendingBox

    subscribePendingLabelBox = (listener: () => void) => {
        this.addEventListener('pendingLabelChanged', listener)

        return () => this.removeEventListener('pendingLabelChanged', listener)
    }

    open() {
        this.pendingBox = { height: 80, width: 120, x: 20, y: 24 }
        this.dispatchEvent(new Event('pendingLabelChanged'))
    }
}

afterEach(cleanup)

describe('DiagramGroupLabelDialog', () => {
    it('requires a label and submits it to pending group drawing', async () => {
        const drawing = new GroupLabelDrawingStub()
        const user = userEvent.setup()
        render(<DiagramGroupLabelDialog drawing={drawing} />)
        act(() => drawing.open())

        expect(screen.getByRole('dialog', { name: 'New group' })).toBeInTheDocument()
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement)
        expect(screen.getByText('Label is required.')).toBeInTheDocument()

        await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Platform')
        await user.click(screen.getByRole('button', { name: 'Save' }))
        expect(drawing.completeGroup).toHaveBeenCalledWith('Platform')
    })

    it('cancels pending creation from dialog action', async () => {
        const drawing = new GroupLabelDrawingStub()
        const user = userEvent.setup()
        render(<DiagramGroupLabelDialog drawing={drawing} />)
        act(() => drawing.open())

        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(drawing.cancelDrawing).toHaveBeenCalledOnce()
    })
})
