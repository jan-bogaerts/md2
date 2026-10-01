import { describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { ActionDefinition } from '../../data/action_types'
import { DEFAULT_PROJECT_CONFIG, resolveProjectConfigPaths, type MarkdownFile, type StorageService } from '../../data/data_types'
import { DiagramViewService, type SaveEditedDiagramCopyRequest } from './diagram_view_service'
import { DiagramEditSessionService } from './diagram_edit_session_service'
import { DiagramSaveService } from './diagram_save_service'
import { serializeDiagramIndex, type DiagramIndex } from './diagram_index'
import { serializeDiagramData } from './diagram_data'
import { DEFAULT_DIAGRAM_ZOOM, MINIMUM_DIAGRAM_ZOOM } from './diagram_zoom'
import { EMPTY_DIAGRAM_CHOICES } from './empty_diagram_factory'

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
    const pendingDiagramCommits = new Map<string, () => void>()
    const flushCommits = vi.fn(async () => {
        for (const callback of pendingDiagramCommits.values()) callback()
        pendingDiagramCommits.clear()
    })
    const editSessionHolder: { current: DiagramEditSessionService | null } = { current: null }
    let readOnly = false
    const reportError = vi.fn()
    const requireWritable = vi.fn()
    const scheduleCommit = vi.fn<(file: MarkdownFile, message: string) => void>()
    const scheduleDiagramCommit = vi.fn<(
        diagramId: string, sourcePath: string, file: MarkdownFile, message: string, onPersisted: () => void,
    ) => void>((diagramId, _sourcePath, _file, _message, onPersisted) => {
            pendingDiagramCommits.set(diagramId, onPersisted)
        })
    const showDiagrams = vi.fn()
    const service = new DiagramViewService({
        createId: vi.fn().mockReturnValueOnce('root-1').mockReturnValueOnce('root-2').mockReturnValueOnce('child-1'),
        createPopupId: vi.fn()
            .mockReturnValueOnce('popup-1')
            .mockReturnValueOnce('popup-2')
            .mockReturnValueOnce('popup-3')
            .mockReturnValue('popup-4'),
        createTimestamp: () => '2026-09-01T10:00:00.000Z',
        flushCommits,
        getEditSession: () => {
            if (!editSessionHolder.current) throw new Error('Diagram edit session is not initialized')

            return editSessionHolder.current
        },
        isReadOnly: () => readOnly,
        loadActions: () => [
            { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'overview', label: 'Overview' },
            { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'dependencies', label: 'Dependencies' },
            { appliesTo: { kind: 'diagram', type: 'child' }, builtin: false, id: 'detail', label: 'Detail' },
        ] as ActionDefinition[],
        reportError,
        requireWritable,
        scheduleCommit,
        scheduleDiagramCommit,
        showDiagrams,
        subscribeRunEvents: (listener) => {
            runListener = listener

            return () => { runListener = null }
        },
    })
    service.bindProject({ config, project, storage })
    const editSession = new DiagramEditSessionService(service)
    editSession.bindProject(project)
    editSessionHolder.current = editSession

    return {
        editSession,
        flushCommits,
        reportError,
        requireWritable,
        run: (event: ActionRunEvent) => runListener?.(event),
        setReadOnly: (value: boolean) => { readOnly = value },
        scheduleCommit,
        scheduleDiagramCommit,
        service,
        showDiagrams,
        storage,
    }
}

function scheduledIndex(scheduleCommit: { mock: { calls: [MarkdownFile, string][] } }) {
    const lastCall = scheduleCommit.mock.calls.at(-1)

    return lastCall ? JSON.parse(lastCall[0].content) as DiagramIndex : null
}

async function saveCopy(service: DiagramViewService, request: SaveEditedDiagramCopyRequest) {
    const record = await service.queueEditedDiagramCopy(request, () => {})
    await service.flushQueuedDiagrams()

    return record
}

function completedEvent(overrides: Partial<ActionRunEvent> = {}): ActionRunEvent {
    return {
        actionId: 'overview',
        context: { kind: 'diagram', type: 'root' },
        diagramPath: 'design/diagrams/overview.json',
        output: { kind: 'diagram' },
        phase: 'main',
        rootActionId: 'overview',
        runId: 'run-1',
        status: 'completed',
        type: 'run',
        ...overrides,
    } as ActionRunEvent
}

function pendingIndex(copyIds: string[] = []): DiagramIndex {
    const source = {
        actionId: 'user-created', id: 'root-1', label: 'New architecture',
        pendingImplementation: true as const, path: 'design/diagrams/root.json',
    }
    const copies = Object.fromEntries(copyIds.map((id) => [id, {
        actionId: 'user-created', id, label: 'New architecture',
        path: `design/diagrams/${id}.json`, sourceDiagramId: source.id,
    }]))

    return {
        activePath: ['root-1'], children: {}, diagrams: { 'root-1': source, ...copies },
        roots: { 'user-created': ['root-1', ...copyIds] }, version: 1,
    }
}

function loadPendingIndex(harness: ReturnType<typeof createHarness>, index: DiagramIndex) {
    vi.mocked(harness.storage.loadTextFile!).mockImplementation(async (_project, path) => {
        if (path === INDEX_PATH) return { content: serializeDiagramIndex(index), path }
        if (path === 'design/diagrams/copy-1.json') {
            return { content: DIAGRAM_JSON.replace('Orders architecture', 'First saved'), path }
        }
        if (path === 'design/diagrams/copy-2.json') {
            return { content: DIAGRAM_JSON.replace('Orders architecture', 'Latest saved'), path }
        }

        return { content: DIAGRAM_JSON, path }
    })
}

describe('DiagramViewService', () => {
    it('restores latest saved copy on reopen and saves again to that record', async () => {
        const harness = createHarness()
        const index = pendingIndex(['copy-1', 'copy-2'])
        index.diagrams = {
            'root-1': index.diagrams['root-1'],
            'copy-2': index.diagrams['copy-2'],
            'copy-1': index.diagrams['copy-1'],
        }
        loadPendingIndex(harness, index)

        await harness.service.open()

        expect(harness.editSession.getSessionSnapshot()?.creationSourceDiagramId).toBe('root-1')
        expect(harness.editSession.getEditableDiagram()?.meta.description).toBe('Latest saved')
        expect(harness.editSession.getSavedRecordSnapshot()?.id).toBe('copy-2')
        expect(harness.editSession.getDirtySnapshot()).toBe(false)

        harness.editSession.setMetadataField('title', 'Updated after restart')
        const save = new DiagramSaveService(harness.editSession, harness.service)
        await save.save()

        expect(harness.service.getIndexSnapshot().roots['user-created']).toEqual(['root-1', 'copy-1', 'copy-2'])
        expect(harness.scheduleDiagramCommit).toHaveBeenCalledWith(
            'copy-2', 'design/diagrams/copy-2.json',
            expect.objectContaining({ path: 'design/diagrams/updated-after-restart-copy-2.json' }),
            'Save edited diagram copy', expect.any(Function),
        )
    })

    it('restores pending roots on navigation and leaves agent-created diagrams read-only', async () => {
        const harness = createHarness()
        const index = pendingIndex()
        index.activePath = []
        index.diagrams.agent = { actionId: 'overview', id: 'agent', label: 'Agent', path: 'design/diagrams/agent.json' }
        index.roots.overview = ['agent']
        loadPendingIndex(harness, index)
        await harness.service.open()

        await harness.service.navigateToSavedDiagram('agent')
        expect(harness.editSession.getSessionSnapshot()).toBeNull()
        await harness.service.navigateToSavedDiagram('root-1')
        expect(harness.editSession.getSessionSnapshot()?.creationSourceDiagramId).toBe('root-1')
    })

    it('keeps pending roots read-only when project access is read-only', async () => {
        const harness = createHarness()
        harness.setReadOnly(true)
        loadPendingIndex(harness, pendingIndex())

        await harness.service.open()

        expect(harness.editSession.getSessionSnapshot()).toBeNull()
        expect(harness.service.getCurrentDiagramSnapshot()).not.toBeNull()
    })

    it('reports missing saved copy and never opens an empty editable root', async () => {
        const harness = createHarness()
        loadPendingIndex(harness, pendingIndex(['copy-1']))
        vi.mocked(harness.storage.loadTextFile!).mockImplementation(async (_project, path) => {
            if (path === INDEX_PATH) return { content: serializeDiagramIndex(pendingIndex(['copy-1'])), path }
            if (path === 'design/diagrams/copy-1.json') throw new Error('copy missing')

            return { content: DIAGRAM_JSON, path }
        })

        await harness.service.open()

        expect(harness.reportError).toHaveBeenCalledWith(expect.any(Error), 'Diagram edit could not be restored')
        expect(harness.service.getCurrentDiagramErrorSnapshot()).toContain('copy missing')
        expect(harness.editSession.getSessionSnapshot()).toBeNull()
        expect(harness.service.getCurrentDiagramSnapshot()).toBeNull()
    })

    it('reports malformed saved copy and never starts a creation session', async () => {
        const harness = createHarness()
        vi.mocked(harness.storage.loadTextFile!).mockImplementation(async (_project, path) => ({
            content: path === INDEX_PATH ? serializeDiagramIndex(pendingIndex(['copy-1'])) : path.endsWith('copy-1.json') ? '{' : DIAGRAM_JSON,
            path,
        }))

        await harness.service.open()

        expect(harness.reportError).toHaveBeenCalledWith(expect.any(Error), 'Diagram edit could not be restored')
        expect(harness.service.getCurrentDiagramErrorSnapshot()).not.toBeNull()
        expect(harness.editSession.getSessionSnapshot()).toBeNull()
    })

    it('does not replace dirty pending creation when navigating to another pending root', async () => {
        const harness = createHarness()
        const index = pendingIndex()
        index.diagrams['root-2'] = {
            actionId: 'user-created', id: 'root-2', label: 'Another',
            pendingImplementation: true, path: 'design/diagrams/root-2.json',
        }
        index.roots['user-created'].push('root-2')
        loadPendingIndex(harness, index)
        await harness.service.open()
        harness.editSession.setMetadataField('title', 'Unsaved')

        await expect(harness.service.navigateToSavedDiagram('root-2')).rejects.toThrow('Save or discard')

        expect(harness.service.getIndexSnapshot().activePath).toEqual(['root-1'])
        expect(harness.editSession.getEditableDiagram()?.meta.title).toBe('Unsaved')
        expect(harness.editSession.getDirtySnapshot()).toBe(true)
    })

    it('persists an empty diagram and its active user-created root in one flush before publishing', async () => {
        const { flushCommits, requireWritable, scheduleCommit, service } = createHarness()
        const architecture = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'architecture')
        if (!architecture) throw new Error('Architecture choice is required')
        await service.open()
        const sourceChanged = vi.fn()
        service.subscribeSource(sourceChanged)

        const record = await service.createEmptyDiagram(architecture)

        expect(requireWritable).toHaveBeenCalledOnce()
        expect(flushCommits).toHaveBeenCalledOnce()
        expect(scheduleCommit).toHaveBeenCalledTimes(2)
        expect(record).toEqual({
            actionId: 'user-created',
            createdAt: '2026-09-01T10:00:00.000Z',
            id: 'root-1',
            label: 'New architecture',
            pendingImplementation: true,
            path: 'design/diagrams/architecture-root-1.json',
        })
        expect(JSON.parse(scheduleCommit.mock.calls[0][0].content)).toEqual({
            edges: [],
            groups: [],
            meta: {
                description: 'New architecture diagram',
                title: 'New architecture',
                type: 'architecture',
                version: 1,
            },
            nodes: [],
        })
        expect(scheduledIndex(scheduleCommit)).toMatchObject({
            activePath: ['root-1'],
            roots: { 'user-created': ['root-1'] },
        })
        expect(service.getSourceSnapshot()).toEqual({ diagram: expect.objectContaining({ nodes: [] }), record })
        expect(service.getCurrentDiagramSnapshot()).toMatchObject({ nodes: [] })
        expect(sourceChanged).toHaveBeenCalledOnce()
    })

    it('retries IDs whose diagram paths collide with repository files', async () => {
        const { service } = createHarness(['design/diagrams/architecture-root-1.json'])
        const architecture = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'architecture')
        if (!architecture) throw new Error('Architecture choice is required')
        await service.open()

        const record = await service.createEmptyDiagram(architecture)

        expect(record).toMatchObject({ id: 'root-2', path: 'design/diagrams/architecture-root-2.json' })
        expect(service.getIndexSnapshot().activePath).toEqual(['root-2'])
    })

    it('makes each new diagram the sole active path while retaining earlier user-created roots', async () => {
        const { service } = createHarness()
        const architecture = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'architecture')
        const sequence = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'sequence')
        if (!architecture || !sequence) throw new Error('Diagram choices are required')
        await service.open()
        await service.createEmptyDiagram(architecture)

        await service.createEmptyDiagram(sequence)

        expect(service.getIndexSnapshot().activePath).toEqual(['root-2'])
        expect(service.getIndexSnapshot().roots['user-created']).toEqual(['root-1', 'root-2'])
        expect(service.getSourceSnapshot()?.record.id).toBe('root-2')
    })

    it('keeps diagram state unchanged when empty-diagram persistence fails', async () => {
        const harness = createHarness()
        const architecture = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'architecture')
        const sequence = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'sequence')
        if (!architecture || !sequence) throw new Error('Diagram choices are required')
        await harness.service.open()
        await harness.service.createEmptyDiagram(architecture)
        const snapshot = harness.service.getSnapshot()
        const source = harness.service.getSourceSnapshot()
        harness.flushCommits.mockRejectedValueOnce(new Error('commit failed'))

        await expect(harness.service.createEmptyDiagram(sequence)).rejects.toThrow('commit failed')

        expect(harness.service.getSnapshot()).toBe(snapshot)
        expect(harness.service.getSourceSnapshot()).toBe(source)
        expect(harness.service.getIndexSnapshot().activePath).toEqual(['root-1'])
        expect(Object.keys(harness.service.getIndexSnapshot().diagrams)).toEqual(['root-1'])
    })

    it('checks writable access before creating files', async () => {
        const harness = createHarness()
        const architecture = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'architecture')
        if (!architecture) throw new Error('Architecture choice is required')
        harness.requireWritable.mockImplementationOnce(() => { throw new Error('read only') })
        await harness.service.open()
        vi.mocked(harness.storage.listRepositoryFiles).mockClear()

        await expect(harness.service.createEmptyDiagram(architecture)).rejects.toThrow('read only')

        expect(harness.storage.listRepositoryFiles).not.toHaveBeenCalled()
        expect(harness.scheduleCommit).not.toHaveBeenCalled()
    })

    it('formats Current in place and schedules canonical content for captured active path', async () => {
        const { run, scheduleCommit, service } = createHarness()
        const boxScaleChanged = vi.fn()
        const roleChanged = vi.fn()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        scheduleCommit.mockClear()
        const sourceBefore = service.getSourceSnapshot()
        service.subscribeNodeRoleFormatting('focal', roleChanged)
        service.subscribeFormattingScale('boxScalePercent', boxScaleChanged)

        service.setNodeRoleFormatting('focal', { box: { autoWrap: false, contentInset: 40, fillColor: '#112233' } })
        service.setFormattingScale('fontScalePercent', 110)
        service.setFormattingScale('boxScalePercent', 120)

        expect(service.getSourceSnapshot()).toBe(sourceBefore)
        expect(service.getNodeRoleFormattingSnapshot('focal')).toEqual({ box: { autoWrap: false, contentInset: 40, fillColor: '#112233' } })
        expect(roleChanged).toHaveBeenCalledOnce()
        expect(boxScaleChanged).toHaveBeenCalledOnce()
        expect(scheduleCommit).toHaveBeenCalledTimes(3)
        expect(scheduleCommit.mock.calls[0][0].path).toBe('design/diagrams/overview.json')
        expect(JSON.parse(scheduleCommit.mock.calls[2][0].content).formatting).toEqual({
            boxScalePercent: 120,
            fontScalePercent: 110,
            nodeRoles: { focal: { box: { autoWrap: false, contentInset: 40, fillColor: '#112233' } } },
        })
    })

    it('ignores completed regular actions in diagram context', async () => {
        const { reportError, run, scheduleCommit, service } = createHarness()
        await service.open()

        run(completedEvent({ output: null }))
        await Promise.resolve()

        expect(scheduleCommit).not.toHaveBeenCalled()
        expect(reportError).not.toHaveBeenCalled()
    })

    it('loads missing index lazily once as empty state', async () => {
        const { service, storage } = createHarness()

        expect(storage.loadTextFile).not.toHaveBeenCalled()
        await service.open()
        await service.open()

        expect(storage.loadTextFile).toHaveBeenCalledTimes(1)
        expect(service.getSnapshot()).toMatchObject({ currentDiagram: null, index: { activePath: [], diagrams: {} }, status: 'ready' })
    })

    it('toggles root popup while preserving child popup opening behavior', async () => {
        const { service } = createHarness()
        const rootAnchor = document.createElement('button')
        await service.open()

        service.openRootPopup(rootAnchor)
        expect(service.getSnapshot().popup).toMatchObject({
            anchorElement: rootAnchor,
            context: { kind: 'diagram', type: 'root' },
            id: 'popup-1',
        })

        service.openRootPopup(rootAnchor)
        expect(service.getSnapshot().popup).toBeNull()

        const childAnchor = document.createElement('button')
        service.openItemMenu({ anchorElement: childAnchor, diagramId: 'diagram-1', itemId: 'item-1', itemLabel: 'Item', left: 1, objectKind: 'node', surface: 'current', top: 2 })
        service.openChildPopup('detail')
        expect(service.getSnapshot().menu).toBeNull()
        expect(service.getSnapshot().popup).toMatchObject({
            anchorElement: childAnchor,
            context: { diagramId: 'diagram-1', diagramItemId: 'item-1', kind: 'diagram', parentNode: 'Item', type: 'child' },
            id: 'popup-2',
            initialActionId: 'detail',
        })
    })

    it('owns root menu and preselects first root action without a saved diagram', async () => {
        const { run, service } = createHarness()
        const menuChanged = vi.fn()
        const menuAnchor = document.createElement('button')
        const newAnchor = document.createElement('button')
        await service.open()
        service.subscribeRootMenu(menuChanged)

        service.openRootMenu(menuAnchor)
        expect(service.getRootMenuSnapshot()).toEqual({ anchorElement: menuAnchor })

        run(completedEvent())
        await vi.waitFor(() => expect(service.getSnapshot().index.roots.overview).toEqual(['root-1']))
        service.openRootMenu(menuAnchor)
        service.openNewRootPopup(newAnchor)

        expect(service.getRootMenuSnapshot()).toBeNull()
        expect(service.getPopupSnapshot()).toMatchObject({
            anchorElement: newAnchor,
            context: { kind: 'diagram', type: 'root' },
            id: 'popup-1',
            initialActionId: 'dependencies',
        })
        expect(menuChanged).toHaveBeenCalledTimes(3)
    })

    it('omits root popup preselection after every root action has a saved diagram', async () => {
        const { run, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSnapshot().index.roots.overview).toEqual(['root-1']))
        run(completedEvent({ actionId: 'dependencies', diagramPath: 'design/diagrams/dependencies.json', rootActionId: 'dependencies', runId: 'run-2' }))
        await vi.waitFor(() => expect(service.getSnapshot().index.roots.dependencies).toEqual(['root-2']))

        service.openNewRootPopup(document.createElement('button'))

        expect(service.getPopupSnapshot()).toEqual(expect.objectContaining({ context: { kind: 'diagram', type: 'root' } }))
        expect(service.getPopupSnapshot()).not.toHaveProperty('initialActionId')
    })

    it('owns one item submenu and clears it with its parent menu', async () => {
        const { service } = createHarness()
        const itemAnchor = document.createElement('button')
        const actionsAnchor = document.createElement('button')
        const savedDiagramsAnchor = document.createElement('button')
        await service.open()

        service.openItemMenu({ anchorElement: itemAnchor, diagramId: 'diagram-1', itemId: 'item-1', itemLabel: 'Item', left: 1, objectKind: 'node', surface: 'current', top: 2 })
        expect(service.getSnapshot().menu?.submenu).toBeNull()

        service.openItemSubmenu('actions', actionsAnchor)
        expect(service.getSnapshot().menu?.submenu).toEqual({ anchorElement: actionsAnchor, kind: 'actions' })

        service.openItemSubmenu('savedDiagrams', savedDiagramsAnchor)
        expect(service.getSnapshot().menu?.submenu).toEqual({ anchorElement: savedDiagramsAnchor, kind: 'savedDiagrams' })

        service.closeItemSubmenu()
        expect(service.getSnapshot().menu?.submenu).toBeNull()

        service.openItemSubmenu('actions', actionsAnchor)
        service.closeItemMenu()
        expect(service.getSnapshot().menu).toBeNull()
    })

    it('owns granular Current selection', async () => {
        const { run, service } = createHarness()
        const selectedChanged = vi.fn()
        const selectedItemChanged = vi.fn()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getCurrentDiagramSnapshot()).not.toBeNull())
        const unsubscribe = service.subscribeCurrentSelection('node', 'orders', selectedChanged)
        service.subscribeCurrentSelectedItem(selectedItemChanged)

        const selection = { activeDiagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders', objectKind: 'node' } as const
        service.selectCurrentObject(selection)

        expect(service.getCurrentSelectionSnapshot('node', 'orders')).toBe(true)
        const selectedItemSnapshot = service.getCurrentSelectedItemSnapshot()
        expect(selectedItemSnapshot).toEqual({activeDiagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders', objectKind: 'node'})
        expect(selectedChanged).toHaveBeenCalledOnce()
        expect(selectedItemChanged).toHaveBeenCalledOnce()
        service.selectCurrentObject({ ...selection })
        expect(service.getCurrentSelectedItemSnapshot()).toBe(selectedItemSnapshot)
        expect(selectedItemChanged).toHaveBeenCalledOnce()
        run(completedEvent({ diagramPath: 'design/diagrams/overview-2.json', runId: 'run-2' }))
        await vi.waitFor(() => expect(service.getCurrentSelectionSnapshot('node', 'orders')).toBe(false))
        expect(service.getCurrentSelectedItemSnapshot()).toBeNull()
        expect(selectedItemChanged).toHaveBeenCalledTimes(2)
        unsubscribe()
    })

    it('opens child popup from selected Current item and clears selection after navigation', async () => {
        const { run, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        service.selectCurrentObject({ activeDiagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders', objectKind: 'node' })
        const anchorElement = document.createElement('button')

        service.openSelectedItemPopup(anchorElement)

        expect(service.getPopupSnapshot()).toEqual({
            anchorElement,
            context: { diagramId: 'root-1', diagramItemId: 'orders', kind: 'diagram', parentNode: 'Orders', type: 'child' },
            id: 'popup-1',
        })

        run(completedEvent({ diagramPath: 'design/diagrams/overview-2.json', runId: 'run-2' }))
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-2'))
        service.selectCurrentObject({ activeDiagramId: 'root-2', itemId: 'orders', itemLabel: 'Orders', objectKind: 'node' })

        await service.navigateToSavedDiagram('root-1')

        expect(service.getCurrentSelectedItemSnapshot()).toBeNull()
        expect(() => service.openSelectedItemPopup(anchorElement)).toThrow('without a selected Current item')
    })

    it('owns transient legend state and resets it only when project changes or service clears', async () => {
        const { scheduleCommit, service, storage } = createHarness()

        service.collapseLegend()
        service.moveLegend({ left: 120, top: 40 })
        service.bindProject({ config, project, storage })

        expect(service.getSnapshot().legend).toEqual({ collapsed: true, position: { left: 120, top: 40 } })
        expect(scheduleCommit).not.toHaveBeenCalled()

        service.expandLegend()
        expect(service.getSnapshot().legend.collapsed).toBe(false)

        service.bindProject({ config, project: { ...project, branch: 'other' }, storage })
        expect(service.getSnapshot().legend).toEqual({ collapsed: false, position: null })

        service.moveLegend({ left: 20, top: 10 })
        service.clear()
        expect(service.getSnapshot().legend).toEqual({ collapsed: false, position: null })
    })

    it('notifies only subscribers of fields changed by transient view operations', async () => {
        const { service } = createHarness()
        await service.open()
        const currentDiagramChanged = vi.fn()
        const currentDiagramErrorChanged = vi.fn()
        const errorChanged = vi.fn()
        const indexChanged = vi.fn()
        const legendCollapsedChanged = vi.fn()
        const legendPositionChanged = vi.fn()
        const menuChanged = vi.fn()
        const popupChanged = vi.fn()
        const statusChanged = vi.fn()
        service.subscribeCurrentDiagram(currentDiagramChanged)
        service.subscribeCurrentDiagramError(currentDiagramErrorChanged)
        service.subscribeError(errorChanged)
        service.subscribeIndex(indexChanged)
        service.subscribeLegendCollapsed(legendCollapsedChanged)
        service.subscribeLegendPosition(legendPositionChanged)
        service.subscribeMenu(menuChanged)
        service.subscribePopup(popupChanged)
        service.subscribeStatus(statusChanged)

        service.moveLegend({ left: 20, top: 10 })
        service.moveLegend({ left: 20, top: 10 })
        service.collapseLegend()
        service.expandLegend()
        const anchorElement = document.createElement('button')
        service.openItemMenu({ anchorElement, diagramId: 'diagram-1', itemId: 'item-1', itemLabel: 'Item', left: 1, objectKind: 'node', surface: 'current', top: 2 })
        service.closeItemMenu()
        service.openRootPopup(anchorElement)
        service.closePopup()

        expect(legendPositionChanged).toHaveBeenCalledOnce()
        expect(legendCollapsedChanged).toHaveBeenCalledTimes(2)
        expect(menuChanged).toHaveBeenCalledTimes(2)
        expect(popupChanged).toHaveBeenCalledTimes(2)
        expect(currentDiagramChanged).not.toHaveBeenCalled()
        expect(currentDiagramErrorChanged).not.toHaveBeenCalled()
        expect(errorChanged).not.toHaveBeenCalled()
        expect(indexChanged).not.toHaveBeenCalled()
        expect(statusChanged).not.toHaveBeenCalled()
    })

    it('owns Current scale separately and resets it when active saved diagram changes', async () => {
        const { run, service } = createHarness()
        const viewportScaleChanged = vi.fn()
        service.subscribeViewportScale(viewportScaleChanged)
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))

        const snapshot = service.getSnapshot()
        expect(service.setViewportScale(MINIMUM_DIAGRAM_ZOOM)).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM)
        expect(service.getSnapshot()).toBe(snapshot)
        service.collapseLegend()
        expect(service.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledOnce()

        run(completedEvent({ diagramPath: 'design/diagrams/overview-2.json', runId: 'run-2' }))
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-2'))

        expect(service.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM)
        expect(viewportScaleChanged).toHaveBeenCalledTimes(2)
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
        expect(service.getSourceSnapshot()?.record.id).toBe('child-1')
        expect(service.getSourceSnapshot()?.diagram.nodes[0]).toEqual({ id: 'orders', label: 'Orders', role: 'focal' })
        expect(service.getSourceSnapshot()?.diagram).not.toHaveProperty('width')
    })

    it('notifies source subscribers only when active source changes', async () => {
        const { run, service } = createHarness()
        const sourceListener = vi.fn()
        const unsubscribe = service.subscribeSource(sourceListener)
        await service.open()

        service.openRootPopup(document.createElement('button'))
        service.collapseLegend()
        expect(sourceListener).not.toHaveBeenCalled()

        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        expect(sourceListener).toHaveBeenCalledOnce()

        service.closePopup()
        service.expandLegend()
        expect(sourceListener).toHaveBeenCalledOnce()

        unsubscribe()
        service.clear()
        expect(sourceListener).toHaveBeenCalledOnce()
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
        const { flushCommits, run, scheduleCommit, service, showDiagrams } = createHarness()
        await service.open()
        service.openRootPopup(document.createElement('button'))

        run(completedEvent())
        await vi.waitFor(() => expect(service.getSnapshot().index.activePath).toEqual(['root-1']))
        expect(showDiagrams).toHaveBeenCalledTimes(1)
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
        expect(showDiagrams).toHaveBeenCalledTimes(3)
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
        service.collapseLegend()
        service.moveLegend({ left: 80, top: 24 })

        await service.navigateBack()

        expect(service.getSnapshot().index.activePath).toEqual(['root-1'])
        expect(service.getSnapshot().legend).toEqual({ collapsed: true, position: { left: 80, top: 24 } })
        expect(scheduledIndex(scheduleCommit)?.activePath).toEqual(['root-1'])
        expect(flushCommits).not.toHaveBeenCalled()

        await service.navigateToSavedDiagram('root-2')

        expect(service.getSnapshot().index.activePath).toEqual(['root-1', 'root-2'])
        expect(service.getSnapshot().legend).toEqual({ collapsed: true, position: { left: 80, top: 24 } })
        expect(scheduledIndex(scheduleCommit)?.activePath).toEqual(['root-1', 'root-2'])
    })

    it('keeps prior diagram and popup when persistence fails', async () => {
        const { flushCommits, reportError, run, service, showDiagrams } = createHarness()
        await service.open()
        service.openRootPopup(document.createElement('button'))
        flushCommits.mockRejectedValueOnce(new Error('write failed'))

        run(completedEvent())
        await vi.waitFor(() => expect(reportError).toHaveBeenCalled())

        expect(service.getSnapshot().index.activePath).toEqual([])
        expect(service.getSnapshot().popup).not.toBeNull()
        expect(service.getSnapshot().currentDiagram).toBeNull()
        expect(showDiagrams).not.toHaveBeenCalled()
    })

    it('saves a root edit beside its source while keeping Current active', async () => {
        const { flushCommits, run, scheduleCommit, scheduleDiagramCommit, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        scheduleCommit.mockClear()
        flushCommits.mockClear()

        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const content = serializeDiagramData({ ...source.diagram, meta: { ...source.diagram.meta, title: 'Edited' } })
        const record = await saveCopy(service, { content, savedRecord: null, sourceRecord: source.record })

        expect(record).toMatchObject({
            id: 'root-2',
            path: 'design/diagrams/edited-root-2.json',
            sourceDiagramId: 'root-1',
        })
        expect(service.getSnapshot().index.roots.overview).toEqual(['root-1', 'root-2'])
        expect(service.getSnapshot().index.activePath).toEqual(['root-1'])
        expect(service.getSourceSnapshot()).toBe(source)
        expect(scheduleCommit).toHaveBeenCalledTimes(1)
        expect(scheduleDiagramCommit).toHaveBeenCalledWith(record.id, record.path, { content, path: record.path }, 'Save edited diagram copy', expect.any(Function))
        expect(scheduledIndex(scheduleCommit)?.diagrams['root-2']).toEqual(record)
        expect(flushCommits).toHaveBeenCalledOnce()
    })

    it('queues an edited copy and index without publishing either before the batch persists', async () => {
        const { flushCommits, run, scheduleCommit, scheduleDiagramCommit, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        flushCommits.mockClear()
        scheduleCommit.mockClear()
        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const content = serializeDiagramData({ ...source.diagram, meta: { ...source.diagram.meta, title: 'Queued' } })

        const record = await service.queueEditedDiagramCopy(
            { content, savedRecord: null, sourceRecord: source.record },
            () => undefined,
        )

        expect(flushCommits).not.toHaveBeenCalled()
        expect(service.getIndexSnapshot().diagrams[record.id]).toBeUndefined()
        expect(scheduleDiagramCommit).toHaveBeenCalledWith(record.id, record.path, { content, path: record.path }, 'Save edited diagram copy', expect.any(Function))
        expect(scheduledIndex(scheduleCommit)?.diagrams[record.id]).toEqual(record)

        await flushCommits()
        expect(service.getIndexSnapshot().diagrams[record.id]).toEqual(record)
    })

    it('saves a child edit beside its source in the same child collection', async () => {
        const { run, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        run(completedEvent({
            actionId: 'detail',
            context: { diagramId: 'root-1', diagramItemId: 'orders', kind: 'diagram', parentNode: 'Orders', type: 'child' },
            diagramPath: 'design/diagrams/detail.json',
            rootActionId: 'detail',
            runId: 'child-run',
        }))
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-2'))

        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const record = await saveCopy(service, {
            content: serializeDiagramData(source.diagram),
            savedRecord: null,
            sourceRecord: source.record,
        })

        expect(record).toMatchObject({ id: 'child-1', parent: source.record.parent, sourceDiagramId: 'root-2' })
        expect(service.getSavedChildren('root-1', 'orders').map(({ id }) => id)).toEqual(['root-2', 'child-1'])
        expect(service.getSnapshot().index.activePath).toEqual(['root-1', 'root-2'])
    })

    it('retries generated IDs until copy record and path are collision-free', async () => {
        const collisionPath = 'design/diagrams/overview-root-2.json'
        const { run, service } = createHarness([collisionPath])
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))

        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const record = await saveCopy(service, {
            content: serializeDiagramData(source.diagram),
            savedRecord: null,
            sourceRecord: source.record,
        })

        expect(record).toMatchObject({ id: 'child-1', path: 'design/diagrams/overview-child-1.json' })
    })

    it('updates one saved copy on later saves without adding another record', async () => {
        const { run, scheduleDiagramCommit, service, storage } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const firstContent = serializeDiagramData(source.diagram)
        const record = await saveCopy(service, { content: firstContent, savedRecord: null, sourceRecord: source.record })
        scheduleDiagramCommit.mockClear()
        const laterContent = serializeDiagramData({ ...source.diagram, meta: { ...source.diagram.meta, title: 'Later' } })

        const laterRecord = await saveCopy(service, { content: laterContent, savedRecord: record, sourceRecord: source.record })

        expect(laterRecord).toMatchObject({ id: record.id, label: 'Later', path: 'design/diagrams/later-root-2.json' })
        expect(service.getSnapshot().index.roots.overview).toEqual(['root-1', 'root-2'])
        expect(scheduleDiagramCommit).toHaveBeenCalledWith(record.id, record.path, { content: laterContent, path: laterRecord.path }, 'Save edited diagram copy', expect.any(Function))
        await service.navigateToSavedDiagram(record.id)
        expect(storage.loadTextFile).toHaveBeenCalledWith(project, laterRecord.path)
    })

    it('keeps the copy ID while choosing another title-based path when a rename target is occupied', async () => {
        const { run, service } = createHarness(['design/diagrams/later-root-2.json'])
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const firstRequest = { content: serializeDiagramData(source.diagram), savedRecord: null, sourceRecord: source.record }
        const first = await saveCopy(service, firstRequest)
        const renamed = await saveCopy(service, {
            content: serializeDiagramData({ ...source.diagram, meta: { ...source.diagram.meta, title: 'Later' } }),
            savedRecord: first,
            sourceRecord: source.record,
        })

        expect(renamed).toMatchObject({ id: first.id, label: 'Later', path: 'design/diagrams/later-root-2-2.json' })
        expect(service.getIndexSnapshot().diagrams[first.id]).toEqual(renamed)
    })

    it('publishes no partial index after atomic failure and reuses candidate on retry', async () => {
        const { flushCommits, run, service } = createHarness()
        await service.open()
        run(completedEvent())
        await vi.waitFor(() => expect(service.getSourceSnapshot()?.record.id).toBe('root-1'))
        const source = service.getSourceSnapshot() as NonNullable<ReturnType<typeof service.getSourceSnapshot>>
        const content = serializeDiagramData(source.diagram)
        flushCommits.mockRejectedValueOnce(new Error('atomic write failed'))

        await expect(saveCopy(service, { content, savedRecord: null, sourceRecord: source.record }))
            .rejects.toThrow('atomic write failed')
        expect(service.getSnapshot().index.roots.overview).toEqual(['root-1'])
        expect(service.getSourceSnapshot()).toBe(source)

        const record = await saveCopy(service, { content, savedRecord: null, sourceRecord: source.record })
        expect(record.id).toBe('root-2')
        expect(service.getSnapshot().index.roots.overview).toEqual(['root-1', 'root-2'])
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
