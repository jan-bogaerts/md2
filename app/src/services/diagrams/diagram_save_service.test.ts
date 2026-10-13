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
    let pendingCommit: (() => void) | null = null
    const queueEditedDiagramCopy = vi.fn<(
        request: SaveEditedDiagramCopyRequest,
        onPersisted: (record: DiagramRecord) => void,
    ) => Promise<DiagramRecord>>(async (_request, onPersisted) => {
            pendingCommit = () => onPersisted(savedRecord)

            return savedRecord
        })
    const flushQueuedDiagrams = vi.fn(async () => {
        pendingCommit?.()
        pendingCommit = null
    })
    const service = new DiagramSaveService(session, { flushQueuedDiagrams, queueEditedDiagramCopy })

    return { flushQueuedDiagrams, queueEditedDiagramCopy, savedRecord, service, session }
}

describe('DiagramSaveService', () => {
    it('queues edits automatically and acknowledges only after persistence', async () => {
        const { flushQueuedDiagrams, queueEditedDiagramCopy, session } = createHarness()
        session.setNodeField('orders', 'label', 'Purchases')

        await vi.waitFor(() => expect(queueEditedDiagramCopy).toHaveBeenCalled())
        expect(flushQueuedDiagrams).not.toHaveBeenCalled()
        expect(session.read.getDirtySnapshot()).toBe(true)

        await flushQueuedDiagrams()
        expect(session.read.getDirtySnapshot()).toBe(false)
    })

    it('persists New formatting through edited-copy save flow', async () => {
        const { queueEditedDiagramCopy, service, session } = createHarness()
        session.setNodeRoleFormatting('focal', { box: { fillColor: '#112233' } })
        session.setFormattingScale('spacingScalePercent', 120)

        await service.save()

        expect(JSON.parse(queueEditedDiagramCopy.mock.calls.at(-1)![0].content).formatting).toEqual({
            nodeRoles: { focal: { box: { fillColor: '#112233' } } },
            spacingScalePercent: 120,
        })
    })

    it('saves canonical model data and acknowledges one stable copy without replacing session diagrams', async () => {
        const sourceWithRenderingData = {
            ...diagram,
            nodes: [{ ...diagram.nodes[0], fanIn: 4 }],
            width: 900,
        } as unknown as DiagramData
        const { queueEditedDiagramCopy, savedRecord, service, session } = createHarness(sourceWithRenderingData)
        const editableDiagram = session.read.getEditableDiagram()
        const originalDiagram = session.read.getOriginalDiagramSnapshot()
        session.setNodeField('orders', 'label', 'Purchases')

        await expect(service.save()).resolves.toBe(savedRecord)

        const request = queueEditedDiagramCopy.mock.calls.at(-1)![0]
        expect(JSON.parse(request.content)).toEqual({
            edges: [],
            groups: [],
            meta: diagram.meta,
            nodes: [{ id: 'orders', label: 'Purchases', role: 'focal' }],
        })
        expect(session.read.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(session.read.getDirtySnapshot()).toBe(false)
        expect(session.read.getChangeIdsSnapshot()).toEqual([])
        expect(session.read.getEditableDiagram()).toBe(editableDiagram)
        expect(session.read.getOriginalDiagramSnapshot()).toBe(originalDiagram)
    })

    it('uses the same saved record and rebases later dirty tracking to the saved copy', async () => {
        const { queueEditedDiagramCopy, savedRecord, service, session } = createHarness()
        session.setNodeField('orders', 'label', 'Purchases')
        await service.save()
        session.setNodeField('orders', 'label', 'Sales')

        await service.save()
        session.setNodeField('orders', 'label', 'Sales')
        session.setNodeField('orders', 'label', 'Purchases')

        expect(queueEditedDiagramCopy.mock.calls.at(-1)![0].savedRecord).toBe(savedRecord)
        expect(session.read.getDirtySnapshot()).toBe(true)
        expect(session.read.getChange(session.read.getChangeIdsSnapshot()[0])?.originalValue).toBe('Sales')
        expect(session.read.getOriginalDiagramSnapshot()?.diagram.nodes[0].label).toBe('Orders')
    })

    it('rejects unchanged data and saves changes to an empty diagram', async () => {
        const empty = createHarness()
        await expect(empty.service.save()).rejects.toThrow('without changes')
        expect(empty.queueEditedDiagramCopy).not.toHaveBeenCalled()

        const created = createHarness({ ...diagram, nodes: [] })
        created.session.discard()
        created.session.startCreation('source')
        created.session.setMetadataField('title', 'Changed')
        await expect(created.service.save()).resolves.toBe(created.savedRecord)
        expect(created.queueEditedDiagramCopy).toHaveBeenCalled()
        expect(created.session.read.getSessionSnapshot()?.creationSourceDiagramId).toBe('source')
    })

    it('retains complete session state when persistence fails', async () => {
        const { flushQueuedDiagrams, service, session } = createHarness()
        const editableDiagram = session.read.getEditableDiagram()
        const originalDiagram = session.read.getOriginalDiagramSnapshot()
        session.setNodeField('orders', 'label', 'Purchases')
        flushQueuedDiagrams.mockRejectedValueOnce(new Error('commit failed'))

        await expect(service.save()).rejects.toThrow('commit failed')

        expect(service.getStatusSnapshot()).toBe('idle')
        expect(session.read.getSessionSnapshot()).toEqual({ sourceDiagramId: 'source' })
        expect(session.read.getEditableDiagram()).toBe(editableDiagram)
        expect(session.read.getOriginalDiagramSnapshot()).toBe(originalDiagram)
        expect(session.read.getSavedRecordSnapshot()).toBeNull()
        expect(session.read.getDirtySnapshot()).toBe(true)
    })

    it('binds the saved record but retains edits made while persistence is pending', async () => {
        const { savedRecord, session } = createHarness()
        let finishSave: () => void = () => undefined
        const pendingSave = new Promise<void>((resolve) => { finishSave = resolve })
        let persist: ((record: DiagramRecord) => void) | null = null
        const persistence = {
            queueEditedDiagramCopy: vi.fn<(
                request: SaveEditedDiagramCopyRequest, onPersisted: (record: DiagramRecord) => void,
            ) => Promise<DiagramRecord>>(async (_request, onPersisted) => {
                    persist = onPersisted

                    return savedRecord
                }),
            flushQueuedDiagrams: vi.fn(async () => {
                const activePersist = persist
                await pendingSave
                activePersist?.(savedRecord)
            }),
        }
        const concurrentService = new DiagramSaveService(session, persistence)
        session.setNodeField('orders', 'label', 'Purchases')

        const save = concurrentService.save()
        await vi.waitFor(() => expect(persistence.flushQueuedDiagrams).toHaveBeenCalled())
        session.setNodeField('orders', 'label', 'Sales')
        finishSave()
        await save

        expect(session.read.getSavedRecordSnapshot()).toBe(savedRecord)
        expect(session.read.getDirtySnapshot()).toBe(true)
        expect(session.read.getNodeFieldSnapshot('orders', 'label')).toBe('Sales')
    })
})
