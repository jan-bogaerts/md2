import { diagramContext, type ActionContext } from '../../data/action_context'
import type { ActionRunEvent } from '../../data/action_run_types'
import type { MarkdownFile, ProjectAsset, ProjectConfig, ProjectReference, StorageService } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'
import { actionRunRegistry } from '../actions/action_run_registry'
import { actionService } from '../actions/action_service'
import { dataService } from '../data/data_service'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'
import {
    diagramIndexPath,
    emptyDiagramIndex,
    isPathInsideDiagramsFolder,
    parseDiagramIndex,
    serializeDiagramIndex,
    type DiagramIndex,
    type DiagramRecord,
} from './diagram_index'
import { sanitizeDiagramSvg } from './diagram_svg_sanitizer'

const DIAGRAM_INDEX_COMMIT_MESSAGE = 'Update diagram view'

export interface DiagramPopupState {
    anchorElement: HTMLElement
    context: ActionContext
    initialActionId?: string
}

export interface DiagramMenuState {
    anchorElement: HTMLElement
    diagramId: string
    itemId: string
    itemLabel: string
    left: number
    top: number
}

export interface DiagramViewSnapshot {
    currentSvg: string | null
    currentSvgError: string | null
    error: string | null
    index: DiagramIndex
    menu: DiagramMenuState | null
    popup: DiagramPopupState | null
    status: 'idle' | 'loading' | 'ready' | 'error'
}

interface DiagramProjectBinding {
    config: ProjectConfig
    project: ProjectReference
    storage: StorageService
}

interface DiagramViewDependencies {
    createId: () => string
    createTimestamp: () => string
    flushCommits: () => Promise<void>
    loadActions: () => ReturnType<typeof actionService.getActions>
    reportError: (error: unknown, fallbackMessage: string) => void
    scheduleCommit: (file: MarkdownFile, message: string) => void
    subscribeRunEvents: (listener: (event: ActionRunEvent) => void) => () => void
}

const INITIAL_SNAPSHOT: DiagramViewSnapshot = {
    currentSvg: null,
    currentSvgError: null,
    error: null,
    index: emptyDiagramIndex(),
    menu: null,
    popup: null,
    status: 'idle',
}

function normalizeSlashes(path: string) {
    return path.replace(/\\/gu, '/')
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function decodeSvgAsset(asset: ProjectAsset) {
    if (asset.contentType !== 'image/svg+xml') throw new Error(`Diagram asset is not SVG: ${asset.path}`)
    const bytes = Uint8Array.from(atob(asset.content), (character) => character.charCodeAt(0))

    return new TextDecoder().decode(bytes)
}

function defaultDependencies(): DiagramViewDependencies {
    return {
        createId: generateUuid,
        createTimestamp: () => new Date().toISOString(),
        flushCommits: () => dataService.cards.flushPendingCommits(),
        loadActions: () => actionService.getActions(),
        reportError: (error, fallbackMessage) => dialogService.error(error, { fallbackMessage }),
        scheduleCommit: (file, message) => dataService.scheduleFileCommit(file, message),
        subscribeRunEvents: (listener) => actionRunRegistry.subscribeActiveRunEvents(listener),
    }
}

function validateDiagramPaths(index: DiagramIndex, diagramsFolder: string) {
    const invalid = Object.values(index.diagrams).find(({ path }) => !isPathInsideDiagramsFolder(path, diagramsFolder))
    if (invalid) throw new Error(`Diagram path must stay inside configured diagrams folder: ${invalid.path}`)
}

async function loadSanitizedSvg(binding: DiagramProjectBinding, path: string) {
    if (!binding.storage.loadProjectAsset) throw new Error('Project asset loading is not available')
    const asset = await binding.storage.loadProjectAsset(binding.project, path)

    return sanitizeDiagramSvg(decodeSvgAsset(asset))
}

async function loadActiveSvg(binding: DiagramProjectBinding, index: DiagramIndex) {
    const diagramId = index.activePath.at(-1)
    if (!diagramId) return { currentSvg: null, currentSvgError: null }
    try {
        return { currentSvg: await loadSanitizedSvg(binding, index.diagrams[diagramId].path), currentSvgError: null }
    } catch (error) {
        return { currentSvg: null, currentSvgError: errorMessage(error) }
    }
}

/** A missing index file means an empty index; any other read or parse failure is reported. */
async function loadDiagramIndex(binding: DiagramProjectBinding) {
    if (!binding.storage.loadTextFile) throw new Error('Repository text file loading is not available')
    const indexPath = diagramIndexPath(binding.config.diagramsFolder)
    let content: string
    try {
        content = (await binding.storage.loadTextFile(binding.project, indexPath)).content
    } catch (error) {
        const repositoryFiles = await binding.storage.listRepositoryFiles(binding.project)
        if (repositoryFiles.some((path) => normalizeSlashes(path) === normalizeSlashes(indexPath))) throw error

        return emptyDiagramIndex()
    }

    return parseDiagramIndex(content)
}

/** Ordered diagram IDs from the root of the parent chain down to the requested diagram. */
function pathToDiagram(index: DiagramIndex, diagramId: string) {
    const path: string[] = []
    const seen = new Set<string>()
    let currentId: string | undefined = diagramId
    while (currentId) {
        if (seen.has(currentId)) throw new Error(`Diagram parent cycle detected at ${currentId}`)
        seen.add(currentId)
        path.unshift(currentId)
        currentId = index.diagrams[currentId]?.parent?.diagramId
    }

    return path
}

/** Files a new diagram under its root action or parent item and makes it the active path. */
function addRecord(current: DiagramIndex, record: DiagramRecord): DiagramIndex {
    const diagrams = { ...current.diagrams, [record.id]: record }
    if (!record.parent) {
        const roots = { ...current.roots, [record.actionId]: [...(current.roots[record.actionId] ?? []), record.id] }

        return { ...current, activePath: [record.id], diagrams, roots }
    }
    const { diagramId, itemId } = record.parent
    if (!current.diagrams[diagramId]) throw new Error(`Parent diagram does not exist: ${diagramId}`)
    const parentItems = current.children[diagramId] ?? {}
    const itemActions = parentItems[itemId] ?? {}
    const children = {
        ...current.children,
        [diagramId]: {
            ...parentItems,
            [itemId]: { ...itemActions, [record.actionId]: [...(itemActions[record.actionId] ?? []), record.id] },
        },
    }

    return { ...current, activePath: [...pathToDiagram(current, diagramId), record.id], children, diagrams }
}

/** Owns diagram records, navigation, popup state, SVG loading, and persistence for one project. */
export class DiagramViewService extends EventTarget {
    private binding: DiagramProjectBinding | null = null
    private readonly dependencies: DiagramViewDependencies
    private loadPromise: Promise<void> | null = null
    private navigationToken = 0
    private processedRunIds = new Set<string>()
    private projectKey: string | null = null
    private snapshot = INITIAL_SNAPSHOT
    private unsubscribeRunEvents: (() => void) | null = null

    constructor(dependencies: Partial<DiagramViewDependencies> = {}) {
        super()
        this.dependencies = { ...defaultDependencies(), ...dependencies }
    }

    getSnapshot = () => this.snapshot

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    bindProject(binding: DiagramProjectBinding) {
        const projectKey = `${binding.project.id}:${binding.project.branch}`
        if (projectKey !== this.projectKey) this.clear()
        this.binding = binding
        this.projectKey = projectKey
    }

    clear() {
        this.binding = null
        this.loadPromise = null
        this.navigationToken += 1
        this.processedRunIds.clear()
        this.projectKey = null
        this.unsubscribeRunEvents?.()
        this.unsubscribeRunEvents = null
        this.publish(INITIAL_SNAPSHOT)
    }

    /** Loads the index on first activation; a failed load is retried by the next call. */
    async open() {
        if (!this.binding) throw new Error('Diagram view is not bound to a project')
        this.unsubscribeRunEvents ??= this.dependencies.subscribeRunEvents(this.handleRunEvent)
        this.loadPromise ??= this.load()
        await this.loadPromise
    }

    openRootPopup(anchorElement: HTMLElement) {
        this.requireReady()
        this.publish({ ...this.snapshot, menu: null, popup: { anchorElement, context: diagramContext('root') } })
    }

    openChildPopup(actionId: string) {
        this.requireReady()
        const menu = this.snapshot.menu
        if (!menu) throw new Error('Cannot open a child diagram action without a selected item')
        const context = diagramContext('child', menu.diagramId, menu.itemId, menu.itemLabel)
        this.publish({
            ...this.snapshot,
            menu: null,
            popup: { anchorElement: menu.anchorElement, context, initialActionId: actionId },
        })
    }

    closePopup() {
        if (!this.snapshot.popup) return
        this.publish({ ...this.snapshot, popup: null })
    }

    openItemMenu(menu: DiagramMenuState) {
        this.requireReady()
        this.publish({ ...this.snapshot, menu })
    }

    closeItemMenu() {
        if (!this.snapshot.menu) return
        this.publish({ ...this.snapshot, menu: null })
    }

    /** Root diagrams in load order, used to re-enter navigation when no active path is stored. */
    getRootDiagrams() {
        const { diagrams, roots } = this.snapshot.index

        return Object.values(roots).flat().map((id) => diagrams[id])
    }

    getSavedChildren(diagramId: string, itemId: string) {
        const actionGroups = this.snapshot.index.children[diagramId]?.[itemId] ?? {}

        return Object.values(actionGroups).flatMap((ids) => ids.map((id) => this.snapshot.index.diagrams[id]))
    }

    async navigateToSavedDiagram(diagramId: string) {
        this.requireReady()
        if (!this.snapshot.index.diagrams[diagramId]) throw new Error(`Unknown diagram: ${diagramId}`)
        await this.applyActivePath(pathToDiagram(this.snapshot.index, diagramId))
    }

    async navigateToCrumb(index: number) {
        this.requireReady()
        if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.index.activePath.length) {
            throw new Error(`Invalid diagram breadcrumb index: ${index}`)
        }
        await this.applyActivePath(this.snapshot.index.activePath.slice(0, index + 1))
    }

    async navigateBack() {
        this.requireReady()
        if (this.snapshot.index.activePath.length <= 1) return
        await this.applyActivePath(this.snapshot.index.activePath.slice(0, -1))
    }

    private readonly handleRunEvent = (event: ActionRunEvent) => {
        if (event.type !== 'run' || event.context.kind !== 'diagram') return
        if (event.status !== 'completed' && event.status !== 'okButNotAfter') return
        if (this.processedRunIds.has(event.runId)) return
        this.processedRunIds.add(event.runId)
        if (!event.diagramPath) {
            this.dependencies.reportError(new Error('Completed diagram action returned no diagram path'), 'Diagram was not created')

            return
        }

        void this.recordCompletedRun(event).catch((error: unknown) => {
            this.dependencies.reportError(error, 'Diagram output could not be stored')
        })
    }

    private async load() {
        const binding = this.requireBinding()
        this.publish({ ...INITIAL_SNAPSHOT, status: 'loading' })
        try {
            const index = await loadDiagramIndex(binding)
            validateDiagramPaths(index, binding.config.diagramsFolder)
            const activeSvg = await loadActiveSvg(binding, index)
            this.publish({ ...activeSvg, error: null, index, menu: null, popup: null, status: 'ready' })
        } catch (error) {
            this.loadPromise = null
            this.publish({ ...INITIAL_SNAPSHOT, error: errorMessage(error), status: 'error' })
            this.dependencies.reportError(error, 'Diagram index could not be loaded')
        }
    }

    private async recordCompletedRun(event: Extract<ActionRunEvent, { type: 'run' }>) {
        const binding = this.requireBinding()
        this.requireReady()
        const diagramPath = normalizeSlashes(event.diagramPath as string)
        if (!isPathInsideDiagramsFolder(diagramPath, binding.config.diagramsFolder)) {
            throw new Error(`Diagram output path must stay inside configured diagrams folder: ${diagramPath}`)
        }
        const currentSvg = await loadSanitizedSvg(binding, diagramPath)
        const action = this.dependencies.loadActions().find(({ id }) => id === event.rootActionId)
        if (!action) throw new Error(`Diagram action no longer exists: ${event.rootActionId}`)
        const { context } = event
        if (context.type !== 'root' && context.type !== 'child') throw new Error('Diagram action result has invalid context type')
        if (context.type === 'child' && (!context.diagramId || !context.diagramItemId || !context.parentNode)) {
            throw new Error('Child diagram result requires diagram, item, and parent-node values')
        }
        const record: DiagramRecord = {
            actionId: action.id,
            createdAt: this.dependencies.createTimestamp(),
            id: this.dependencies.createId(),
            label: context.type === 'child' ? context.parentNode as string : action.label,
            ...(context.type === 'child' ? {
                parent: {
                    diagramId: context.diagramId as string,
                    itemId: context.diagramItemId as string,
                    itemLabel: context.parentNode as string,
                },
            } : {}),
            path: diagramPath,
        }
        const index = addRecord(this.snapshot.index, record)
        await this.persistIndex(index)
        this.navigationToken += 1
        this.publish({ ...this.snapshot, currentSvg, currentSvgError: null, index, menu: null, popup: null })
    }

    /** Shows the requested path once its SVG resolves, discarding results of superseded navigations. */
    private async applyActivePath(activePath: string[]) {
        const binding = this.requireBinding()
        const index = { ...this.snapshot.index, activePath }
        this.navigationToken += 1
        const token = this.navigationToken
        const activeSvg = await loadActiveSvg(binding, index)
        if (token !== this.navigationToken) return

        this.publish({ ...this.snapshot, ...activeSvg, index, menu: null })
        this.scheduleIndexCommit(index)
    }

    /** Queues the index in the shared commit batch and waits for it to reach the repository. */
    private async persistIndex(index: DiagramIndex) {
        this.scheduleIndexCommit(index)
        await this.dependencies.flushCommits()
    }

    private scheduleIndexCommit(index: DiagramIndex) {
        const binding = this.requireBinding()
        const file = { content: serializeDiagramIndex(index), path: diagramIndexPath(binding.config.diagramsFolder) }
        this.dependencies.scheduleCommit(file, DIAGRAM_INDEX_COMMIT_MESSAGE)
    }

    private requireBinding() {
        if (!this.binding) throw new Error('Diagram view is not bound to a project')

        return this.binding
    }

    private requireReady() {
        if (this.snapshot.status !== 'ready') throw new Error('Diagram view is not ready')
    }

    private publish(snapshot: DiagramViewSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

export const diagramViewService = register('diagramViewService', new DiagramViewService())
