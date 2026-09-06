import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { useActiveDiagramTool, useDiagramTransientGesture } from './use_diagram_tool'

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'diagram.json' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createService() {
    const service = new DiagramEditSessionService(new DiagramSourceStub())
    service.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    service.start()

    return service
}

function ActiveToolLeaf({ counter, service }: {
    counter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    service: DiagramEditSessionService
}) {
    counter(useActiveDiagramTool(service))

    return null
}

function GestureLeaf({ counter, service }: {
    counter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    service: DiagramEditSessionService
}) {
    counter(useDiagramTransientGesture(service))

    return null
}

afterEach(cleanup)

describe('diagram tool subscriptions', () => {
    it('rerenders only leaf subscribed to changed interaction primitive', () => {
        const service = createService()
        const toolCounter = vi.fn()
        const gestureCounter = vi.fn()
        render(
            <>
                <ActiveToolLeaf counter={toolCounter} service={service} />
                <GestureLeaf counter={gestureCounter} service={service} />
            </>,
        )

        act(() => service.setActiveTool('node:component'))
        expect(toolCounter).toHaveBeenCalledTimes(2)
        expect(toolCounter).toHaveBeenLastCalledWith('node:component')
        expect(gestureCounter).toHaveBeenCalledOnce()

        act(() => service.beginTransientGesture('placement'))
        expect(toolCounter).toHaveBeenCalledTimes(2)
        expect(gestureCounter).toHaveBeenCalledTimes(2)
        expect(gestureCounter).toHaveBeenLastCalledWith('placement')
    })
})
