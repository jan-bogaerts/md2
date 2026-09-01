import { describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { ActionDefinition } from '../../data/action_types'
import { DEFAULT_PROJECT_CONFIG, resolveProjectConfigPaths, type MarkdownFile, type StorageService } from '../../data/data_types'
import { DiagramViewService } from './diagram_view_service'
import { serializeDiagramIndex, type DiagramIndex } from './diagram_index'

const INDEX_PATH = 'design/diagrams/diagram-view.json'
const DIAGRAM_JSON = JSON.stringify({
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
})
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }
const config = resolveProjectConfigPaths(DEFAULT_PROJECT_CONFIG)

function createHarness(repositoryFiles: string[] = []) {
    let runListener: ((event: ActionRunEvent) => void) | null = null
    const storage = {
        listRepositoryFiles: vi.fn(async () => repositoryFiles),
        loadTextFile: vi.fn(async (_project, path) => {
            if (path === INDEX_PATH) throw new Error('missing')

            return { content: DIAGRAM_JSON, path }
        }),
    } as unknown as StorageService
    const flushCommits = vi.fn(async () => undefined)
    const reportError = vi.fn()
    const scheduleCommit = vi.fn<(file: MarkdownFile, message: string) => void>()
    const service = new DiagramViewService({
        createId: vi.fn().mockReturnValueOnce('root-1').mockReturnValueOnce('root-2').mockReturnValueOnce('child-1'),
        createTimestamp: () => '2026-09-01T10:00:00.000Z',
        flushCommits,
        loadActions: () => [
            { id: 'overview', label: 'Overview' },
            { id: 'detail', label: 'Detail' },
        ] as ActionDefinition[],
        reportError,
        scheduleCommit,
        subscribeRunEvents: (listener) => {
            runListener = listener

            return () => { runListener = null }
        },
    })
    service.bindProject({ config, project, storage })

    return { flushCommits, reportError, run: (event: ActionRunEvent) => runListener?.(event), scheduleCommit, service, storage }
}

function scheduledIndex(scheduleCommit: { mock: { calls: [MarkdownFile, string][] } }) {
    const lastCall = scheduleCommit.mock.calls.at(-1)

    return lastCall ? JSON.parse(lastCall[0].content) as DiagramIndex : null
}

function completedEvent(overrides: Partial<ActionRunEvent> = {}): ActionRunEvent {
    return {
        actionId: 'overview',
        context: { kind: 'diagram', type: 'root' },
        diagramPath: 'design/diagrams/overview.json',
        phase: 'main',
        rootActionId: 'overview',
        runId: 'run-1',
        status: 'completed',
        type: 'run',
        ...overrides,
    } as ActionRunEvent
}

describe('DiagramViewService', () => {
    it('loads missing index lazily once as empty state', async () => {
        const { service, storage } = createHarness()

        expect(storage.loadTextFile).not.toHaveBeenCalled()
        await service.open()
        await service.open()

        expect(storage.loadTextFile).toHaveBeenCalledTimes(1)
        expect(service.getSnapshot()).toMatchObject({ currentDiagram: null, index: { activePath: [], diagrams: {} }, status: 'ready' })
    })

    it('restores global active path and parses exact last diagram JSON from versioned index', async () => {
        const index: DiagramIndex = {
            activePath: ['root-1', 'child-1'],
            children: { 'root-1': { orders: { detail: ['child-1'] } } },
            diagrams: {
                'child-1': {
                    actionId: 'detail', id: 'child-1', label: 'Orders',
                    parent: { diagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders' },
                    path: 'design/diagrams/child.json',
                },
                'root-1': { actionId: 'overview', id: 'root-1', label: 'Overview', path: 'design/diagrams/root.json' },
            },
            roots: { overview: ['root-1'] },
            version: 1,
        }
        const { service, storage } = createHarness([INDEX_PATH])
        vi.mocked(storage.loadTextFile!).mockImplementation(async (_project, path) => path === INDEX_PATH
            ? { content: serializeDiagramIndex(index), path }
            : { content: DIAGRAM_JSON, path })

        await service.open()

        expect(service.getSnapshot().index.activePath).toEqual(['root-1', 'child-1'])
        expect(storage.loadTextFile).toHaveBeenCalledWith(project, 'design/diagrams/child.json')
        expect(service.getSnapshot().currentDiagram?.nodes[0]).toMatchObject({ id: 'orders', label: 'Orders' })
        expect(service.getSnapshot().currentDiagram?.width).toBeGreaterThan(0)
    })

    it('reports malformed index without replacing it and retries on the next open', async () => {
        const { reportError, scheduleCommit, service, storage } = createHarness([INDEX_PATH])
        vi.mocked(storage.loadTextFile!).mockResolvedValueOnce({ content: '{', path: INDEX_PATH })

        await service.open()

        expect(service.getSnapshot().status).toBe('error')
        expect(reportError).toHaveBeenCalled()
        expect(scheduleCommit).not.toHaveBeenCalled()

        vi.mocked(storage.loadTextFile!).mockResolvedValueOnce({ content: serializeDiagramIndex(serializedEmptyIndex()), path: INDEX_PATH })
        await service.open()

        expect(service.getSnapshot().status).toBe('ready')
    })

    it('keeps repeated root and child runs in tree and closes popup only after persistence', async () => {
        const { flushCommits, run, scheduleCommit, service } = createHarness()
        await service.open()
        service.openRootPopup(document.createElement('button'))

        run(completedEvent())
        await vi.waitFor(() => expect(service.getSnapshot().index.activePath).toEqual(['root-1']))
        expect(service.getSnapshot().popup).toBeNull()
        expect(scheduleCommit).toHaveBeenLastCalledWith(expect.objectContaining({ path: INDEX_PATH }), 'Update diagram view')
        expect(flushCommits).toHaveBeenCalledTimes(1)
        expect(service.getSnapshot().index.diagrams['root-1'].createdAt).toBe('2026-09-01T10:00:00.000Z')

        run(completedEvent({ diagramPath: 'design/diagrams/overview-2.json', runId: 'run-2' }))
        await vi.waitFor(() => expect(service.getSnapshot().index.roots.overview).toEqual(['root-1', 'root-2']))

        run(completedEvent({
            actionId: 'detail',
            context: { diagramId: 'root-2', diagramItemId: 'orders', kind: 'diagram', parentNode: 'Orders', type: 'child' },
            diagramPath: 'design/diagrams/detail.json',
            rootActionId: 'detail',
            runId: 'run-3',
            status: 'okButNotAfter',
        }))
        await vi.waitFor(() => expect(service.getSnapshot().index.activePath).toEqual(['root-2', 'child-1']))
        expect(service.getSavedChildren('root-2', 'orders').map(({ id }) => id)).toEqual(['child-1'])
        expect(scheduledIndex(scheduleCommit)?.diagrams['child-1'].parent?.itemLabel).toBe('Orders')
    })

    it('queues navigation without forcing a commit and keeps the stored path in step', async () => {
        const { flushCommits, run, scheduleCommit, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSnapshot().index.activePath).toEqual(['root-1']))
        run(completedEvent({
            actionId: 'detail',
            context: { diagramId: 'root-1', diagramItemId: 'orders', kind: 'diagram', parentNode: 'Orders', type: 'child' },
            diagramPath: 'design/diagrams/detail.json',
            rootActionId: 'detail',
            runId: 'run-2',
        }))
        await vi.waitFor(() => expect(service.getSnapshot().index.activePath).toEqual(['root-1', 'root-2']))
        flushCommits.mockClear()

        await service.navigateBack()

        expect(service.getSnapshot().index.activePath).toEqual(['root-1'])
        expect(scheduledIndex(scheduleCommit)?.activePath).toEqual(['root-1'])
        expect(flushCommits).not.toHaveBeenCalled()

        await service.navigateToSavedDiagram('root-2')

        expect(service.getSnapshot().index.activePath).toEqual(['root-1', 'root-2'])
        expect(scheduledIndex(scheduleCommit)?.activePath).toEqual(['root-1', 'root-2'])
    })

    it('keeps prior diagram and popup when persistence fails', async () => {
        const { flushCommits, reportError, run, service } = createHarness()
        await service.open()
        service.openRootPopup(document.createElement('button'))
        flushCommits.mockRejectedValueOnce(new Error('write failed'))

        run(completedEvent())
        await vi.waitFor(() => expect(reportError).toHaveBeenCalled())

        expect(service.getSnapshot().index.activePath).toEqual([])
        expect(service.getSnapshot().popup).not.toBeNull()
        expect(service.getSnapshot().currentDiagram).toBeNull()
    })

    it('ignores cancelled and failed runs', async () => {
        const { reportError, run, scheduleCommit, service } = createHarness()
        await service.open()

        run(completedEvent({ runId: 'run-cancelled', status: 'cancelled' }))
        run(completedEvent({ runId: 'run-failed', status: 'failed' }))

        expect(reportError).not.toHaveBeenCalled()
        expect(scheduleCommit).not.toHaveBeenCalled()
    })

    it('rejects output outside configured diagram folder before persistence', async () => {
        const { reportError, run, scheduleCommit, service } = createHarness()
        await service.open()

        run(completedEvent({ diagramPath: 'design/outside.json' }))
        await vi.waitFor(() => expect(reportError).toHaveBeenCalled())

        expect(scheduleCommit).not.toHaveBeenCalled()
        expect(service.getSnapshot().index.diagrams).toEqual({})
    })

    it('rejects non-JSON and malformed JSON output without changing current diagram', async () => {
        const { reportError, run, scheduleCommit, service, storage } = createHarness()
        await service.open()

        run(completedEvent({ diagramPath: 'design/diagrams/overview.svg', runId: 'svg' }))
        await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1))
        expect(storage.loadTextFile).not.toHaveBeenCalledWith(project, 'design/diagrams/overview.svg')

        vi.mocked(storage.loadTextFile!).mockImplementation(async (_project, path) => {
            if (path === INDEX_PATH) throw new Error('missing')

            return { content: '{', path }
        })
        run(completedEvent({ runId: 'malformed' }))
        await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(2))

        expect(scheduleCommit).not.toHaveBeenCalled()
        expect(service.getSnapshot().currentDiagram).toBeNull()
    })
})

function serializedEmptyIndex(): DiagramIndex {
    return { activePath: [], children: {}, diagrams: {}, roots: {}, version: 1 }
}
