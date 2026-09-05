import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramType } from '../../services/diagrams/diagram_data'
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service'
import {
    DiagramEntityNodeButton,
    type DiagramEntityNodePlacement,
} from './diagram_entity_node_button'

class EntityNodeSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select'
    private readonly diagramType: DiagramType

    constructor(diagramType: DiagramType) {
        super()
        this.diagramType = diagramType
    }

    readonly getActiveToolSnapshot = () => this.activeTool
    readonly getMetadataFieldSnapshot = () => this.diagramType
    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('activeToolChanged', listener)

        return () => this.removeEventListener('activeToolChanged', listener)
    }
    readonly subscribeMetadataField = vi.fn((_field: 'preset' | 'type', listener: () => void) => {
        this.addEventListener('typeChanged', listener)

        return () => this.removeEventListener('typeChanged', listener)
    })
    readonly subscribeSession = (listener: () => void) => {
        this.addEventListener('sessionChanged', listener)

        return () => this.removeEventListener('sessionChanged', listener)
    }

    setActiveTool(activeTool: DiagramPersistentTool) {
        this.activeTool = activeTool
        this.dispatchEvent(new Event('activeToolChanged'))
    }
}

afterEach(cleanup)

describe('DiagramEntityNodeButton', () => {
    it('activates entity defaults without persisting derived height', () => {
        const session = new EntityNodeSessionStub('entity')
        const placement: DiagramEntityNodePlacement = { activate: vi.fn(() => true) }
        render(<DiagramEntityNodeButton placement={placement} session={session} />)
        const button = screen.getByRole('button', { name: 'Entity' })

        fireEvent.click(button)

        expect(placement.activate).toHaveBeenCalledWith({
            defaults: { fields: [], label: 'New entity', role: 'focal', width: 160 },
            kind: 'entity',
            previewSize: { height: 48, width: 160 },
        })
        expect(session.subscribeMetadataField.mock.calls.every(([field]) => field === 'type')).toBe(true)
        act(() => { session.setActiveTool('node:entity') })
        expect(button).toHaveAttribute('aria-pressed', 'true')
    })

    it.each(['architecture', 'dependency', 'flow', 'sequence'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramEntityNodeButton
                placement={{ activate: vi.fn(() => true) }}
                session={new EntityNodeSessionStub(diagramType)}
            />,
        )

        expect(screen.queryByRole('button', { name: 'Entity' })).not.toBeInTheDocument()
    })
})
