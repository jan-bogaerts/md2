import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import { DiagramGroupDrawingService } from './diagram_group_drawing_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramSelectionService } from './diagram_selection_service'
import type { DiagramViewSourceSnapshot } from './diagram_view_service'

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Drawing test', title: 'Groups', type: 'architecture', version: 1 },
    nodes: [{ id: 'node-1', label: 'Node', role: 'focal' }],
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

function createHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub(), vi.fn().mockReturnValue('group-1'))
    const selection = new DiagramSelectionService(session)
    const drawing = new DiagramGroupDrawingService(session, selection)
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return { drawing, selection, session }
}

describe('DiagramGroupDrawingService', () => {
    it('normalizes a reverse grid-snapped rectangle, then creates and selects one explicit empty group', () => {
        const { drawing, selection, session } = createHarness()
        const membershipChanged = vi.fn()
        session.subscribeCollectionMembership('group', membershipChanged)
        drawing.activate()

        expect(drawing.beginDrawing({ x: 103, y: 99 })).toBe(true)
        expect(drawing.updateDrawing({ x: 31, y: 22 })).toBe(true)
        expect(drawing.getPreviewSnapshot()).toEqual({ height: 76, width: 72, x: 32, y: 24 })
        expect(session.getTransientGestureSnapshot()).toBe('group')
        expect(drawing.finishDrawing({ x: 31, y: 22 })).toBe(true)
        expect(session.getGroupIdsSnapshot()).toEqual([])
        expect(drawing.getPendingLabelBoxSnapshot()).toEqual({ height: 76, width: 72, x: 32, y: 24 })

        expect(drawing.completeGroup('Platform')).toBe('group-1')

        expect(session.getGroupSnapshot('group-1')).toEqual({height: 76, id: 'group-1', label: 'Platform', nodeIds: [], width: 72, x: 32, y: 24})
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'group-1', objectKind: 'group' }])
        expect(session.getActiveToolSnapshot()).toBe('select')
        expect(session.getTransientGestureSnapshot()).toBeNull()
        expect(drawing.getPreviewSnapshot()).toBeNull()
    })

    it('uses group minima for a click-sized rectangle and requires a non-empty label', () => {
        const { drawing, session } = createHarness()
        drawing.activate()
        drawing.beginDrawing({ x: 10, y: 10 })
        drawing.finishDrawing({ x: 10, y: 10 })

        expect(drawing.getPendingLabelBoxSnapshot()).toEqual({ height: 56, width: 48, x: 12, y: 12 })
        expect(() => drawing.completeGroup('  ')).toThrow('Diagram group label is required')
        expect(session.getGroupIdsSnapshot()).toEqual([])
    })

    it('cancels pointer and pending-label states without creating a group', () => {
        const { drawing, session } = createHarness()
        drawing.activate()
        drawing.beginDrawing({ x: 20, y: 20 })

        expect(drawing.cancelDrawing()).toBe(true)
        expect(session.getGroupIdsSnapshot()).toEqual([])
        expect(session.getActiveToolSnapshot()).toBe('select')

        drawing.activate()
        drawing.beginDrawing({ x: 20, y: 20 })
        drawing.finishDrawing({ x: 100, y: 100 })
        expect(drawing.cancelDrawing()).toBe(true)
        expect(session.getGroupIdsSnapshot()).toEqual([])
        expect(drawing.getPendingLabelBoxSnapshot()).toBeNull()
    })

    it('clears drawing state when another tool or session replaces it', () => {
        const { drawing, session } = createHarness()
        drawing.activate()
        drawing.beginDrawing({ x: 20, y: 20 })
        session.setActiveTool('select')

        expect(drawing.getPreviewSnapshot()).toBeNull()

        drawing.activate()
        drawing.beginDrawing({ x: 20, y: 20 })
        session.discard()
        expect(drawing.getPreviewSnapshot()).toBeNull()
        expect(drawing.getPendingLabelBoxSnapshot()).toBeNull()
    })
})
