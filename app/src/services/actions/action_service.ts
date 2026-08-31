import { actionMatchesContext, type ActionContext } from '../../data/action_context'
import {
    BUILTIN_CUSTOM_PROMPT,
    BUILTIN_REMARKABLE_CONVERT,
    type ActionDefinition,
    type ActionEditorState,
    type ActionFile,
    type RawActionDefinition,
    type RawActionDefinitionEntry,
} from '../../data/action_types'
import { generateUuid } from '../../data/uuid'
import { getService, register } from '../service_injector'
import {
    loadTolerantActionDefinitionGraph,
    validateActionDefinitionGraph,
} from './action_definition_loader'
import { ActionDraftStore } from './action_draft_store'
import { actionPromptDraftService } from './action_prompt_draft_service'
import { actionPath, actionValidationResult, nextActionName, preserveActionEditorStates } from './action_service_helpers'
import type { OpenDocumentSaveReference } from '../open_files_service'
import { projectAccessService } from '../project/project_access_service'
import {
    ACTIONS_CHANGED_EVENT,
    ACTION_DRAFT_CHANGED_EVENT,
    ACTION_PERSISTENCE_CHANGED_EVENT,
    type ActionDraftChangedDetail,
} from './action_service_events'

export {
    ACTIONS_CHANGED_EVENT,
    ACTION_DRAFT_CHANGED_EVENT,
    ACTION_PERSISTENCE_CHANGED_EVENT,
    type ActionDraftChangedDetail,
} from './action_service_events'
export { editableActionDefinition } from './action_service_helpers'

export interface ActionPersistenceGateway {
    discardPendingFile?: (path: string) => void
    hasPendingFile?: (path: string) => boolean
    persistActionFile(
        file: ActionFile,
        actionId: string,
        sourcePath?: string,
        onPathCommitted?: (fromPath: string, toPath: string) => void,
        saveReference?: OpenDocumentSaveReference,
        onPersisted?: () => void,
    ): Promise<void>
}

export interface ActionServiceState {
    actions: ActionDefinition[]
    error: string | null
}

export type ActionReloadChange =
    | { origin: 'external', path: string }
    | { origin: 'local', path: string, revision: number }

export interface ActionDraftState {
    conflict: RawActionDefinition | null
    definition: RawActionDefinition
    deleted: boolean
    error: string | null
    revision: number
    savedRevision: number
    saving: boolean
    sourcePath: string
    targetPath: string
    validation: ActionValidationResult
}

export interface ActionValidationResult {
    code: string | null
    error: string | null
    field: keyof RawActionDefinition | null
    fieldPath: string | null
    index: number | null
    valid: boolean
}

function defaultPersistenceGateway(): ActionPersistenceGateway {
    return getService<ActionPersistenceGateway>('dataService')
}

export function serializeActionDefinition(definition: RawActionDefinition) {
    return `${JSON.stringify(definition, null, 2)}\n`
}

/** Owns loaded action objects, validation, creation, and valid-only persistence. */
export class ActionService extends EventTarget {
    private actions: ActionDefinition[] = [BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT]
    private definitions: RawActionDefinitionEntry[] = []
    private error: string | null = null
    private files: ActionFile[] = []
    readonly draftStore: ActionDraftStore = new ActionDraftStore(this)
    private readonly publicationRevisionsByPath = new Map<string, number>()
    readonly persistenceGateway: () => ActionPersistenceGateway

    constructor(persistenceGateway: () => ActionPersistenceGateway = defaultPersistenceGateway) {
        super()
        this.persistenceGateway = persistenceGateway
        register('actionService', this)
    }

    init() {
        this.actions = validateActionDefinitionGraph([])
        this.resetState()
    }

    loadFromFiles(files: ActionFile[]) {
        return this.loadFiles(files, false)
    }

    reloadFromFiles(files: ActionFile[], changes: ActionReloadChange[]) {
        try {
            const localPaths = new Set<string>()
            for (const change of changes) {
                if (change.origin === 'external') continue
                const publishedRevision = this.getPublicationRevision(change.path)
                if (change.revision > publishedRevision) {
                    throw new Error(`Unknown local action publication revision ${change.revision} for ${change.path}`)
                }
                localPaths.add(change.path)
            }
            const reconciledFiles = files.map((file) => {
                if (!localPaths.has(file.path)) return file

                return this.files.find(({ path }) => path === file.path) ?? file
            })

            return this.loadFiles(reconciledFiles, true)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action reload failed'
            this.error = `Action reload failed for ${changes.map(({ path }) => path).join(', ')}: ${message}`
            this.dispatchActionsChanged()

            return this.actions
        }
    }

    /** Removes an action file from owned state after its local persistence deletion succeeds. */
    reconcileCommittedDeletion(path: string) {
        if (!this.files.some((file) => file.path === path)) return;

        this.loadFiles(this.files.filter((file) => file.path !== path), true);
    }

    private loadFiles(files: ActionFile[], preserveEditorState: boolean) {
        const previousActionIds = new Set(this.actions.map(({ id }) => id))
        const previousDefinitions = new Map(this.definitions.map((entry) => [entry.definition.id, entry]))
        const previousDraftActionIds = this.draftStore.actionIds()
        const { actions, definitions, issues } = loadTolerantActionDefinitionGraph(files, { validateAgentCapabilities: false })
        if (!preserveEditorState) {
            actionPromptDraftService.clearAll()
            this.draftStore.clear()
            this.publicationRevisionsByPath.clear()
        }
        this.actions = preserveEditorState ? preserveActionEditorStates(this.actions, actions) : actions
        if (preserveEditorState) {
            const actionIds = new Set(this.actions.map(({ id }) => id))
            for (const actionId of previousActionIds) {
                if (!actionIds.has(actionId)) actionPromptDraftService.clearAction(actionId)
            }
        }
        this.definitions = definitions
        this.error = issues.length > 0 ? issues.map(({ message }) => message).join('\n') : null
        this.files = files
        if (preserveEditorState) this.draftStore.reconcileDrafts(previousDefinitions)
        this.dispatchActionsChanged()
        const draftActionIds = new Set([...previousDraftActionIds, ...this.draftStore.actionIds()])
        for (const actionId of draftActionIds) this.dispatchDraftChanged(actionId)
        this.dispatchPersistenceChanged()

        return this.actions
    }

    createDefinition(actionsFolder: string): { definition: RawActionDefinition, path: string } {
        projectAccessService.requireWritable()
        const name = nextActionName(this.files)
        const definition: RawActionDefinition = {
            description: 'Describe this action.',
            id: generateUuid(),
            label: 'New action',
            phrases: [],
            prompt: 'Describe what the agent should do.',
            type: 'agent',
        }

        return { definition, path: actionPath(actionsFolder, name) }
    }

    validateDefinition(path: string, definition: RawActionDefinition): ActionValidationResult {
        return this.validateDefinitionInternal(path, definition)
    }

    async saveDefinition(
        path: string,
        definition: RawActionDefinition,
        targetPath = path,
        saveReference?: OpenDocumentSaveReference,
        onPersisted?: () => void,
    ): Promise<ActionDefinition> {
        projectAccessService.requireWritable()
        const definitions = this.definitionsWithDefinition(path, definition)
        const actions = preserveActionEditorStates(this.actions, validateActionDefinitionGraph(definitions))
        const content = serializeActionDefinition(definition)
        const persistedFile = { content, path: targetPath }
        const sourceStateFile = { content, path }

        await this.persistenceGateway().persistActionFile(
            persistedFile,
            definition.id,
            path,
            (fromPath, toPath) => this.reconcileCommittedPath(definition.id, fromPath, toPath),
            saveReference,
            onPersisted,
        )
        if (this.draftStore.isDeletedAndNotRecreating(definition.id)) {
            throw new Error(`Action save cancelled after external deletion: ${path}`)
        }
        this.files = this.filesWithFile(sourceStateFile)
        this.definitions = definitions
        this.actions = actions
        this.publicationRevisionsByPath.set(path, (this.publicationRevisionsByPath.get(path) ?? 0) + 1)
        if (targetPath !== path) {
            this.publicationRevisionsByPath.set(
                targetPath,
                (this.publicationRevisionsByPath.get(targetPath) ?? 0) + 1,
            )
        }
        this.error = null
        const savedAction = actions.find((action) => action.sourcePath === path)
        if (!savedAction) throw new Error(`Missing saved action after persistence: ${path}`)
        actionPromptDraftService.invalidateIdlePreparedDrafts(savedAction.id)
        this.dispatchActionsChanged()

        return savedAction
    }

    clear() {
        actionPromptDraftService.clearAll()
        this.actions = [BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT]
        this.resetState()
    }

    getState(): ActionServiceState {
        return { actions: this.actions, error: this.error }
    }

    getActions(): ActionDefinition[] {
        return this.actions
    }

    getActionByPath(path: string): ActionDefinition | null {
        return this.actions.find(({ sourcePath }) => sourcePath === path) ?? null
    }

    getActionById(actionId: string): ActionDefinition | null {
        return this.actions.find(({ id }) => id === actionId) ?? null
    }

    getFiles(): ActionFile[] {
        return this.files
    }

    getDefinitionByPath(path: string): RawActionDefinition | null {
        return this.definitions.find((entry) => entry.path === path)?.definition ?? null
    }

    getDefinitionEntryById(actionId: string): RawActionDefinitionEntry | null {
        return this.definitions.find(({ definition }) => definition.id === actionId) ?? null
    }

    getPublicationRevision(path: string): number {
        const revision = this.publicationRevisionsByPath.get(path)
        if (revision === undefined) throw new Error(`Missing local action publication revision: ${path}`)

        return revision
    }

    setActionEditorState(actionId: string, editorState: ActionEditorState) {
        const action = this.getActionById(actionId)
        if (!action) throw new Error(`Cannot save editor state for unknown action: ${actionId}`)
        action.editorState = editorState
        this.dispatchDraftChanged(actionId)
    }

    getActionsForStateTrigger(state: string, context: ActionContext): ActionDefinition[] {
        return this.actions.filter((action) => action.onState === state && actionMatchesContext(action, context))
    }

    private resetState() {
        this.definitions = []
        this.error = null
        this.files = []
        this.draftStore.clear()
        this.publicationRevisionsByPath.clear()
        this.dispatchActionsChanged()
        this.dispatchPersistenceChanged()
    }

    private validateDefinitionInternal(path: string, definition: RawActionDefinition): ActionValidationResult {
        return actionValidationResult(() => validateActionDefinitionGraph(this.definitionsWithDefinition(path, definition)))
    }

    /** Reconciles core state (files/definitions/actions) once a path rename has been persisted. */
    private reconcileCommittedPath(actionId: string, fromPath: string, toPath: string) {
        if (fromPath === toPath) return

        const { committedDraftDefinition, editorState, hasDraft } = this.draftStore.peekRenameInfo(actionId)
        const sourceDefinition = this.definitions.find((entry) => entry.path === fromPath)?.definition
        const targetDefinition = this.definitions.find((entry) => entry.path === toPath)?.definition
        const definition = sourceDefinition ?? committedDraftDefinition ?? targetDefinition
        if (!definition) throw new Error(`Missing action definition after committed rename from ${fromPath} to ${toPath}`)
        if (targetDefinition && targetDefinition.id !== definition.id) {
            throw new Error(`Committed action rename resolved to a different action at ${toPath}`)
        }

        const sourceFile = this.files.find((file) => file.path === fromPath)
        const targetFile = this.files.find((file) => file.path === toPath)
        const content = hasDraft ? serializeActionDefinition(definition) : sourceFile?.content ?? targetFile?.content
        if (!content) throw new Error(`Missing action file after committed rename from ${fromPath} to ${toPath}`)
        const committedFile = { ...targetFile, ...sourceFile, content, path: toPath }
        this.files = [...this.files.filter(({ path }) => path !== fromPath && path !== toPath), committedFile]
        this.definitions = [
            ...this.definitions.filter(({ path }) => path !== fromPath && path !== toPath),
            { definition, path: toPath },
        ]

        this.actions = preserveActionEditorStates(this.actions, validateActionDefinitionGraph(this.definitions))
        const committedAction = this.getActionById(actionId)
        if (!committedAction) throw new Error(`Missing action after committed rename from ${fromPath} to ${toPath}`)
        if (editorState) committedAction.editorState = editorState

        this.draftStore.finalizeRenamedDraft(actionId, toPath, committedAction)

        const revision = Math.max(
            this.publicationRevisionsByPath.get(fromPath) ?? 0,
            this.publicationRevisionsByPath.get(toPath) ?? 0,
        )
        this.publicationRevisionsByPath.delete(fromPath)
        this.publicationRevisionsByPath.set(toPath, revision)
        this.dispatchActionsChanged()
        this.dispatchPersistenceChanged()
    }

    private definitionsWithDefinition(path: string, definition: RawActionDefinition): RawActionDefinitionEntry[] {
        const entry = { definition, path }
        const found = this.definitions.some((candidate) => candidate.path === path)

        return found
            ? this.definitions.map((candidate) => candidate.path === path ? entry : candidate)
            : [...this.definitions, entry]
    }

    private filesWithFile(file: ActionFile): ActionFile[] {
        const found = this.files.some((candidate) => candidate.path === file.path)

        return found
            ? this.files.map((candidate) => candidate.path === file.path ? file : candidate)
            : [...this.files, file]
    }

    private dispatchActionsChanged() {
        this.dispatchEvent(new CustomEvent<ActionServiceState>(ACTIONS_CHANGED_EVENT, { detail: this.getState() }))
    }

    dispatchDraftChanged(actionId: string) {
        const detail: ActionDraftChangedDetail = { actionId }
        this.dispatchEvent(new CustomEvent<ActionDraftChangedDetail>(ACTION_DRAFT_CHANGED_EVENT, { detail }))
    }

    dispatchPersistenceChanged() {
        this.dispatchEvent(new Event(ACTION_PERSISTENCE_CHANGED_EVENT))
    }
}

export const actionService = new ActionService()
