import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGroupButton } from './diagram_group_button'

class GroupButtonSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select'

    getActiveToolSnapshot = () => this.activeTool

    subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('activeToolChanged', listener)

        return () => this.removeEventListener('activeToolChanged', listener)
    }

    setActiveTool(activeTool: DiagramPersistentTool) {
        this.activeTool = activeTool
        this.dispatchEvent(new Event('activeToolChanged'))
    }
}

afterEach(cleanup)

describe('DiagramGroupButton', () => {
    it('activates group drawing and observes active tool state', () => {
        const drawing = { activate: vi.fn(() => true) }
        const session = new GroupButtonSessionStub()
        render(<DiagramGroupButton drawing={drawing} session={session} />)
        const button = screen.getByRole('button', { name: 'Group' })

        expect(button).toHaveAttribute('aria-pressed', 'false')
        fireEvent.click(button)
        expect(drawing.activate).toHaveBeenCalledOnce()

        act(() => session.setActiveTool('group'))
        expect(button).toHaveAttribute('aria-pressed', 'true')
    })
})
