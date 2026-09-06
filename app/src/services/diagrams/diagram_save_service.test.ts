import { describe, expect, it, vi } from 'vitest'
import type { DiagramData } from './diagram_data'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import type { DiagramRecord } from './diagram_index'
import { DiagramSaveService } from './diagram_save_service'
import type { SaveEditedDiagramCopyRequest } from './diagram_view_service'

const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }
const sourceRecord: DiagramRecord = {actionId: 'overview', id: 'source', label: 'Overview', path: 'design/diagrams/overview.json'}
const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [{ id: 'orders', label: 'Orders', role: 'focal' }],
}

function createHarness(sourceDiagram: DiagramData = diagram) {
    const source = {
        getSourceSnapshot: () => ({ diagram: sourceDiagram, record: sourceRecord }),
        subscribeSource: () => () => undefined,
    }
    const session = new DiagramEditSessionService(source)
    session.bindProject(project)
    session.start()
    const savedRecord: DiagramRecord = {
        ...sourceRecord,
        id: 'copy',
        path: 'design/diagrams/overview-edited-copy.json',
        sourceDiagramId: 'source',
    }
    const saveEditedDiagramCopy = vi.fn<(request: SaveEditedDiagramCopyRequest) => Promise<DiagramRecord>>(async () => savedRecord)
    const service = new DiagramSaveService(session, { saveEditedDiagramCopy })

    return { saveEditedDiagramCopy, savedRecord, service, session }
}

describe('DiagramSaveService', () => {
    it('saves canonical model data and acknowledges one stable copy without replacing session diagrams', async () => {
        const sourceWithRenderingData = {
            ...diagram,
            nodes: [{ ...diagram.nodes[0], fanIn: 4 }],
            width: 900,
        } as unknown as DiagramData
        const { saveEditedDiagramCopy, savedRecord, service, session } = createHarness(sourceWithRenderingData)
        const editableDiagram = session.getEditableDiagram()
        const originalDiagram = session.getOriginalDiagramSnapshot()
        session.setNodeField('orders', 'label', 'Purchases')

        await expect(service.save()).resolves.toBe(savedRecord)

        const request = saveEditedDiagramCopy.mock.calls[0][0]
        expect(JSON.parse(request.content)).toEqual({
            edges: [],
            groups: [],
            meta: diagram.meta,
            nodes: [{ id: 'orders', label: 'Purchases', role: 'focal' }],
        })
        expect(session.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(session.getDirtySnapshot()).toBe(false)
        expect(session.getChangeIdsSnapshot()).toEqual([])
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getOriginalDiagramSnapshot()).toBe(originalDiagram)
    })

    it('uses the same saved record and rebases later dirty tracking to the saved copy', async () => {
        const { saveEditedDiagramCopy, savedRecord, service, session } = createHarness()
        session.setNodeField('orders', 'label', 'Purchases')
        await service.save()
        session.setNodeField('orders', 'label', 'Sales')

        await service.save()
        session.setNodeField('orders', 'label', 'Sales')
        session.setNodeField('orders', 'label', 'Purchases')

        expect(saveEditedDiagramCopy.mock.calls[1][0].savedRecord).toBe(savedRecord)
        expect(session.getDirtySnapshot()).toBe(true)
        expect(session.getChange(session.getChangeIdsSnapshot()[0])?.originalValue).toBe('Sales')
        expect(session.getOriginalDiagramSnapshot()?.diagram.nodes[0].label).toBe('Orders')
    })

    it('rejects empty and invalid editable data before persistence', async () => {
        const empty = createHarness()
        await expect(empty.service.save()).rejects.toThrow('without changes')
        expect(empty.saveEditedDiagramCopy).not.toHaveBeenCalled()

        const invalid = createHarness({ ...diagram, nodes: [] })
        invalid.session.setMetadataField('title', 'Changed')
        await expect(invalid.service.save()).rejects.toThrow('nodes has empty array')
        expect(invalid.saveEditedDiagramCopy).not.toHaveBeenCalled()
    })

    it('retains complete session state when persistence fails', async () => {
        const { saveEditedDiagramCopy, service, session } = createHarness()
        const editableDiagram = session.getEditableDiagram()
        const originalDiagram = session.getOriginalDiagramSnapshot()
        session.setNodeField('orders', 'label', 'Purchases')
        saveEditedDiagramCopy.mockRejectedValueOnce(new Error('commit failed'))

        await expect(service.save()).rejects.toThrow('commit failed')

        expect(service.getStatusSnapshot()).toBe('idle')
        expect(session.getSessionSnapshot()).toEqual({ sourceDiagramId: 'source' })
        expect(session.getEditableDiagram()).toBe(editableDiagram)
        expect(session.getOriginalDiagramSnapshot()).toBe(originalDiagram)
        expect(session.getSavedRecordSnapshot()).toBeNull()
        expect(session.getDirtySnapshot()).toBe(true)
    })

    it('binds the saved record but retains edits made while persistence is pending', async () => {
        const { savedRecord, session } = createHarness()
        let finishSave: (record: DiagramRecord) => void = () => undefined
        const pendingSave = new Promise<DiagramRecord>((resolve) => { finishSave = resolve })
        const persistence = {
            saveEditedDiagramCopy: vi.fn<(
                request: SaveEditedDiagramCopyRequest,
            ) => Promise<DiagramRecord>>(async () => pendingSave),
        }
        const concurrentService = new DiagramSaveService(session, persistence)
        session.setNodeField('orders', 'label', 'Purchases')

        const save = concurrentService.save()
        session.setNodeField('orders', 'label', 'Sales')
        finishSave(savedRecord)
        await save

        expect(session.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(session.getDirtySnapshot()).toBe(true)
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Sales')
    })
})
