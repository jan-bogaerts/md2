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
import { ActionValidationError } from '../../../../shared/action_definitions.mjs'
import { getService, register } from '.././service_injector'
import {
    loadTolerantActionDefinitionGraph,
    validateActionDefinition,
    validateActionDefinitionGraph,
} from './action_definition_loader'
import { actionFilePath } from './action_definition_writer'

const ACTION_FILE_EXTENSION = '.json'
const NEW_ACTION_NAME = 'new-action'

interface ActionPersistenceGateway {
    discardPendingActionFile?: (path: string) => void
    hasPendingActionFile?: (path: string) => boolean
    persistActionFile(
        file: ActionFile,
        sourcePath?: string,
        onPathCommitted?: (fromPath: string, toPath: string) => void,
        sourceExists?: boolean,
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
    validation: ActionValidationResult
}

interface ManagedActionDraft extends ActionDraftState {
    action: ActionDefinition
    chain: Promise<void>
    committedRevision: number
    deletionRevision: number
    recreating: boolean
    targetPath: string
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

function normalizedFolder(folder: string) {
    return folder.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

function actionPath(folder: string, name: string) {
    return `${normalizedFolder(folder)}/${name}${ACTION_FILE_EXTENSION}`
}

function nextActionName(files: ActionFile[]) {
    const existingPaths = new Set(files.map(({ path }) => path.replace(/\\/gu, '/').toLowerCase()))
    if (![...existingPaths].some((path) => path.endsWith(`/${NEW_ACTION_NAME}${ACTION_FILE_EXTENSION}`))) return NEW_ACTION_NAME

    let suffix = 2
    while ([...existingPaths].some((path) => path.endsWith(`/${NEW_ACTION_NAME}-${suffix}${ACTION_FILE_EXTENSION}`))) suffix += 1

    return `${NEW_ACTION_NAME}-${suffix}`
}

function suffixedActionPath(path: string, suffix: number) {
    return `${path.slice(0, -ACTION_FILE_EXTENSION.length)}-${suffix}${ACTION_FILE_EXTENSION}`
}

function preserveActionEditorStates(currentActions: ActionDefinition[], nextActions: ActionDefinition[]) {
    const editorStatesByPath = new Map<string, NonNullable<ActionDefinition['editorState']>>()
    for (const { editorState, sourcePath } of currentActions) {
        if (!editorState || !sourcePath) continue
        editorStatesByPath.set(sourcePath, editorState)
    }
    for (const action of nextActions) {
        if (!action.sourcePath) continue
        const editorState = editorStatesByPath.get(action.sourcePath)
        if (editorState) action.editorState = editorState
    }

    return nextActions
}

function structuredValuesEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false

        return left.every((value, index) => structuredValuesEqual(value, right[index]))
    }
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false

    const leftRecord = left as Record<string, unknown>
    const rightRecord = right as Record<string, unknown>
    const leftKeys = Object.keys(leftRecord).filter((key) => leftRecord[key] !== undefined)
    const rightKeys = Object.keys(rightRecord).filter((key) => rightRecord[key] !== undefined)
    if (leftKeys.length !== rightKeys.length) return false

    return leftKeys.every((key) => Object.hasOwn(rightRecord, key)
        && rightRecord[key] !== undefined
        && structuredValuesEqual(leftRecord[key], rightRecord[key]))
}

function actionDefinitionsEqual(left: RawActionDefinition, right: RawActionDefinition) {
    return structuredValuesEqual(left, right)
}

function actionValidationResult(validate: () => unknown): ActionValidationResult {
    try {
        validate()

        return { code: null, error: null, field: null, fieldPath: null, index: null, valid: true }
    } catch (error) {
        if (error instanceof ActionValidationError) {
            return {
                code: error.code,
                error: error.message,
                field: error.field as keyof RawActionDefinition | null,
                fieldPath: error.fieldPath,
                index: error.index,
                valid: false,
            }
        }
        const message = error instanceof Error ? error.message : 'Invalid action definition'

        return { code: null, error: message, field: null, fieldPath: null, index: null, valid: false }
    }
}

function validateDraftDefinition(path: string, definition: RawActionDefinition) {
    return actionValidationResult(() => validateActionDefinition(definition, path))
}

/** Convert a loaded action back to its canonical editable JSON shape. */
export function editableActionDefinition(action: ActionDefinition): RawActionDefinition {
    if (action.builtin) throw new Error(`Built-in action cannot be edited: ${action.id}`)

    return {
        id: action.id,
        label: action.label,
        description: action.description,
        type: action.type,
        ...(action.icon !== null ? { icon: action.icon } : {}),
        ...(action.appliesTo !== null ? { appliesTo: action.appliesTo } : {}),
        ...(action.onBefore.length > 0 ? { onBefore: action.onBefore.map(({ id }) => id) } : {}),
        ...(action.on.length > 0 ? { on: action.on.map(({ actionId, condition }) => ({ actionId, condition })) } : {}),
        ...(action.onAfter.length > 0 ? { onAfter: action.onAfter.map(({ id }) => id) } : {}),
        ...(action.onState !== null ? { onState: action.onState } : {}),
        ...(action.needsWorkTree ? { needsWorkTree: true } : {}),
        ...(action.agent !== null ? { agent: action.agent } : {}),
        ...(action.model !== null ? { model: action.model } : {}),
        ...(action.thinkingLevel !== null ? { thinkingLevel: action.thinkingLevel } : {}),
        ...(action.trackFileChanges ? { trackFileChanges: true } : {}),
        phrases: action.phrases,
        ...(action.type === 'agent' ? { prompt: action.prompt as string } : { command: action.command as string }),
    }
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
    private readonly drafts = new Map<string, ManagedActionDraft>()
    private readonly publicationRevisionsByPath = new Map<string, number>()
    private readonly uncommittedCreationPaths = new Set<string>()
    private readonly persistenceGateway: () => ActionPersistenceGateway

    constructor(persistenceGateway: () => ActionPersistenceGateway = defaultPersistenceGateway) {
        super()
        this.persistenceGateway = persistenceGateway
        register('actionService', this)
    }

    init() {
        this.actions = validateActionDefinitionGraph([])
        this.definitions = []
        this.error = null
        this.files = []
        this.drafts.clear()
        this.publicationRevisionsByPath.clear()
        this.uncommittedCreationPaths.clear()
        this.dispatchChanged()
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
            this.dispatchChanged()

            return this.actions
        }
    }

    private loadFiles(files: ActionFile[], preserveEditorState: boolean) {
        const previousDefinitions = new Map(this.definitions.map(({ definition, path }) => [path, definition]))
        const { actions, definitions, issues } = loadTolerantActionDefinitionGraph(files, { validateAgentCapabilities: false })
        if (!preserveEditorState) {
            this.drafts.clear()
            this.publicationRevisionsByPath.clear()
            this.uncommittedCreationPaths.clear()
        }
        this.actions = preserveEditorState ? preserveActionEditorStates(this.actions, actions) : actions
        this.definitions = definitions
        this.error = issues.length > 0 ? issues.map(({ message }) => message).join('\n') : null
        this.files = files
        if (preserveEditorState) this.reconcileDrafts(previousDefinitions)
        this.dispatchChanged()

        return this.actions
    }

    createDefinition(actionsFolder: string): { definition: RawActionDefinition, path: string } {
        const name = nextActionName(this.files)
        const definition: RawActionDefinition = {
            description: 'Describe this action.',
            id: crypto.randomUUID(),
            label: 'New action',
            phrases: [],
            prompt: 'Describe what the agent should do.',
            type: 'agent',
        }

        return { definition, path: actionPath(actionsFolder, name) }
    }

    validateDefinition(path: string, definition: RawActionDefinition): ActionValidationResult {
        return actionValidationResult(() => validateActionDefinitionGraph(this.definitionsWithDefinition(path, definition)))
    }

    async saveDefinition(path: string, definition: RawActionDefinition, targetPath = path) {
        const definitions = this.definitionsWithDefinition(path, definition)
        const actions = preserveActionEditorStates(this.actions, validateActionDefinitionGraph(definitions))
        const content = serializeActionDefinition(definition)
        const persistedFile = { content, path: targetPath }
        const sourceStateFile = { content, path }

        const sourceExists = this.files.some((file) => file.path === path) && !this.uncommittedCreationPaths.has(path)
        if (sourceExists && targetPath === path) {
            await this.persistenceGateway().persistActionFile(persistedFile)
        } else {
            if (!sourceExists) this.uncommittedCreationPaths.add(path)
            try {
                await this.persistenceGateway().persistActionFile(
                    persistedFile,
                    path,
                    (fromPath, toPath) => this.reconcileCommittedPath(fromPath, toPath),
                    sourceExists,
                )
            } catch (error) {
                if (!sourceExists) this.uncommittedCreationPaths.delete(path)
                throw error
            }
        }
        const draft = this.drafts.get(path)
        if (draft?.deleted && !draft.recreating) {
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
        this.dispatchChanged()

        const savedAction = actions.find((action) => action.sourcePath === path)
        if (!savedAction) throw new Error(`Missing saved action after persistence: ${path}`)

        return savedAction
    }

    getDraft(path: string): ActionDraftState {
        const existingDraft = this.drafts.get(path)
        if (existingDraft) return existingDraft

        const action = this.getActionByPath(path)
        if (!action) throw new Error(`Cannot create draft for unknown action: ${path}`)
        const definition = editableActionDefinition(action)
        const draft: ManagedActionDraft = {
            action,
            chain: Promise.resolve(),
            committedRevision: 0,
            conflict: null,
            definition,
            deleted: false,
            deletionRevision: 0,
            error: null,
            recreating: false,
            revision: 0,
            savedRevision: 0,
            saving: false,
            targetPath: path,
            validation: validateDraftDefinition(path, definition),
        }
        this.drafts.set(path, draft)

        return draft
    }

    updateDraft(path: string, definition: RawActionDefinition) {
        const current = this.requireDraft(path)
        const revision = current.revision + 1
        const validation = validateDraftDefinition(path, definition)
        const targetPath = validation.valid ? this.desiredActionPath(path, definition.label) : current.targetPath
        const draft = {
            ...current,
            conflict: null,
            committedRevision: revision,
            definition,
            error: null,
            revision,
            targetPath,
            validation,
        }
        this.drafts.set(path, draft)
        this.dispatchChanged()
        if (draft.validation.valid && !draft.deleted) this.queueDraftSave(path, definition, revision, targetPath)

        return draft
    }

    /** Store an editor value and mark the draft dirty without validation, events, or persistence. */
    stageDraft(path: string, definition: RawActionDefinition) {
        const current = this.requireDraft(path)
        const draft = {
            ...current,
            conflict: null,
            definition,
            error: null,
            revision: current.revision + 1,
        }
        this.drafts.set(path, draft)

        return draft
    }

    /** Validate and queue the latest staged value at an editor commit boundary. */
    commitDraft(path: string) {
        const current = this.requireDraft(path)
        if (current.committedRevision === current.revision) return current

        const validation = validateDraftDefinition(path, current.definition)
        const targetPath = validation.valid ? this.desiredActionPath(path, current.definition.label) : current.targetPath
        const draft = { ...current, committedRevision: current.revision, targetPath, validation }
        this.drafts.set(path, draft)
        this.dispatchChanged()
        if (draft.validation.valid && !draft.conflict && !draft.deleted) {
            this.queueDraftSave(path, draft.definition, draft.revision, targetPath)
        }

        return draft
    }

    retryDraft(path: string) {
        const draft = this.requireDraft(path)
        if (draft.deleted) throw new Error(`Cannot retry a deleted action draft: ${path}`)
        if (!draft.validation.valid) throw new Error(`Cannot retry invalid action draft: ${path}`)
        this.queueDraftSave(path, draft.definition, draft.revision, draft.targetPath)
    }

    keepDraft(path: string) {
        this.commitDraft(path)
        const draft = this.requireDraft(path)
        this.drafts.set(path, { ...draft, conflict: null })
        this.dispatchChanged()
        if (draft.validation.valid && draft.revision !== draft.savedRevision) {
            this.queueDraftSave(path, draft.definition, draft.revision, draft.targetPath)
        }
    }

    reloadDraft(path: string) {
        const draft = this.requireDraft(path)
        if (!draft.conflict) return
        const revision = draft.revision + 1
        this.drafts.set(path, {
            ...draft,
            committedRevision: revision,
            conflict: null,
            definition: draft.conflict,
            error: null,
            revision,
            savedRevision: revision,
            targetPath: path,
            validation: validateDraftDefinition(path, draft.conflict),
        })
        this.dispatchChanged()
    }

    recreateDeletedDraft(path: string) {
        const draft = this.requireDraft(path)
        if (!draft.deleted) throw new Error(`Cannot recreate an action that is not deleted: ${path}`)
        if (!draft.validation.valid) throw new Error(`Cannot recreate invalid action draft: ${path}`)

        this.queueDraftSave(path, draft.definition, draft.revision, draft.targetPath, true)
    }

    discardDeletedDraft(path: string) {
        const draft = this.requireDraft(path)
        if (!draft.deleted) throw new Error(`Cannot discard an action that is not deleted: ${path}`)

        this.persistenceGateway().discardPendingActionFile?.(path)
        this.drafts.delete(path)
        this.dispatchChanged()
    }

    getDeletedDraftActions() {
        return [...this.drafts.values()]
            .filter(({ deleted }) => deleted)
            .map(({ action }) => action)
    }

    hasPendingDrafts() {
        return [...this.drafts.values()].some((draft) => (
            draft.deleted || draft.revision !== draft.savedRevision || draft.saving || !!draft.error || !!draft.conflict
        ))
    }

    async flushDrafts() {
        for (const path of this.drafts.keys()) this.commitDraft(path)
        const deletedDraft = [...this.drafts.entries()].find(([, draft]) => draft.deleted)
        if (deletedDraft) throw new Error(`Action ${deletedDraft[0]} was deleted and requires explicit recovery or discard`)
        const invalidDraft = [...this.drafts.entries()].find(([, draft]) => (
            draft.revision !== draft.savedRevision && !draft.validation.valid
        ))
        if (invalidDraft) throw new Error(`Action ${invalidDraft[0]} has invalid unsaved changes`)

        await Promise.all([...this.drafts.values()].map(({ chain }) => chain))
        const failedDraft = [...this.drafts.entries()].find(([, draft]) => !!draft.error)
        if (failedDraft) throw new Error(failedDraft[1].error as string)
    }

    clear() {
        this.actions = [BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT]
        this.definitions = []
        this.error = null
        this.files = []
        this.drafts.clear()
        this.publicationRevisionsByPath.clear()
        this.uncommittedCreationPaths.clear()
        this.dispatchChanged()
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

    getDefinitionByPath(path: string): RawActionDefinition | null {
        return this.definitions.find((entry) => entry.path === path)?.definition ?? null
    }

    getPublicationRevision(path: string): number {
        const revision = this.publicationRevisionsByPath.get(path)
        if (revision === undefined) throw new Error(`Missing local action publication revision: ${path}`)

        return revision
    }

    setActionEditorState(path: string, editorState: ActionEditorState) {
        const action = this.getActionByPath(path)
        if (!action) throw new Error(`Cannot save editor state for unknown action: ${path}`)
        action.editorState = editorState
        this.dispatchChanged()
    }

    getActionsForStateTrigger(state: string, context: ActionContext): ActionDefinition[] {
        return this.actions.filter((action) => action.onState === state && actionMatchesContext(action, context))
    }

    private desiredActionPath(sourcePath: string, label: string) {
        const normalizedSourcePath = sourcePath.replace(/\\/gu, '/')
        const separatorIndex = normalizedSourcePath.lastIndexOf('/')
        if (separatorIndex < 0) throw new Error(`Action path must include its actions folder: ${sourcePath}`)

        const actionsFolder = normalizedSourcePath.slice(0, separatorIndex)
        const desiredPath = actionFilePath(actionsFolder, label)
        const sourcePathKey = normalizedSourcePath.toLowerCase()
        const occupiedPaths = new Set(
            this.files
                .map(({ path }) => path.replace(/\\/gu, '/').toLowerCase())
                .filter((path) => path !== sourcePathKey),
        )
        for (const [draftPath, draft] of this.drafts) {
            if (draftPath === sourcePath) continue
            occupiedPaths.add(draft.targetPath.replace(/\\/gu, '/').toLowerCase())
        }
        if (!occupiedPaths.has(desiredPath.toLowerCase())) return desiredPath

        let suffix = 2
        while (occupiedPaths.has(suffixedActionPath(desiredPath, suffix).toLowerCase())) suffix += 1

        return suffixedActionPath(desiredPath, suffix)
    }

    private reconcileCommittedPath(fromPath: string, toPath: string) {
        this.uncommittedCreationPaths.delete(fromPath)
        this.uncommittedCreationPaths.delete(toPath)
        if (fromPath === toPath) return

        const sourceDraft = this.drafts.get(fromPath)
        const targetDraft = this.drafts.get(toPath)
        const draft = sourceDraft && targetDraft
            ? sourceDraft.revision >= targetDraft.revision ? sourceDraft : targetDraft
            : sourceDraft ?? targetDraft
        const sourceDefinition = this.definitions.find((entry) => entry.path === fromPath)?.definition
        const targetDefinition = this.definitions.find((entry) => entry.path === toPath)?.definition
        const committedDraftDefinition = draft && draft.committedRevision === draft.revision && draft.validation.valid
            ? draft.definition
            : undefined
        const definition = sourceDefinition ?? committedDraftDefinition ?? targetDefinition
        if (!definition) throw new Error(`Missing action definition after committed rename from ${fromPath} to ${toPath}`)
        if (targetDefinition && targetDefinition.id !== definition.id) {
            throw new Error(`Committed action rename resolved to a different action at ${toPath}`)
        }

        const sourceFile = this.files.find((file) => file.path === fromPath)
        const targetFile = this.files.find((file) => file.path === toPath)
        const content = draft ? serializeActionDefinition(definition) : sourceFile?.content ?? targetFile?.content
        if (!content) throw new Error(`Missing action file after committed rename from ${fromPath} to ${toPath}`)
        const committedFile = { ...targetFile, ...sourceFile, content, path: toPath }
        this.files = [...this.files.filter(({ path }) => path !== fromPath && path !== toPath), committedFile]
        this.definitions = [
            ...this.definitions.filter(({ path }) => path !== fromPath && path !== toPath),
            { definition, path: toPath },
        ]

        const editorState = this.actions.find((action) => action.sourcePath === fromPath)?.editorState
            ?? this.actions.find((action) => action.sourcePath === toPath)?.editorState
            ?? draft?.action.editorState
        this.actions = preserveActionEditorStates(this.actions, validateActionDefinitionGraph(this.definitions))
        const committedAction = this.getActionByPath(toPath)
        if (!committedAction) throw new Error(`Missing action after committed rename from ${fromPath} to ${toPath}`)
        if (editorState) committedAction.editorState = editorState

        this.drafts.delete(fromPath)
        this.drafts.delete(toPath)
        if (draft) {
            this.drafts.set(toPath, {
                ...draft,
                action: committedAction,
                conflict: null,
                deleted: false,
                targetPath: draft.targetPath === fromPath ? toPath : draft.targetPath,
            })
        }

        const revision = Math.max(
            this.publicationRevisionsByPath.get(fromPath) ?? 0,
            this.publicationRevisionsByPath.get(toPath) ?? 0,
        )
        this.publicationRevisionsByPath.delete(fromPath)
        this.publicationRevisionsByPath.set(toPath, revision)
        this.dispatchChanged()
    }

    private definitionsWithDefinition(path: string, definition: RawActionDefinition): RawActionDefinitionEntry[] {
        const entry = { definition, path }
        const found = this.definitions.some((candidate) => candidate.path === path)

        return found
            ? this.definitions.map((candidate) => candidate.path === path ? entry : candidate)
            : [...this.definitions, entry]
    }

    private requireDraft(path: string) {
        this.getDraft(path)
        const draft = this.drafts.get(path)
        if (!draft) throw new Error(`Missing action draft: ${path}`)

        return draft
    }

    private reconcileDrafts(previousDefinitions: Map<string, RawActionDefinition>) {
        for (const [path, draft] of this.drafts) {
            const previousDefinition = previousDefinitions.get(path)
            const externalDefinition = this.getDefinitionByPath(path)
            if (!externalDefinition) {
                if (!previousDefinition && !draft.recreating) continue

                const gateway = this.persistenceGateway()
                const pendingPersistence = gateway.hasPendingActionFile?.(path) ?? false
                gateway.discardPendingActionFile?.(path)
                const recoverable = draft.revision !== draft.savedRevision
                    || draft.saving
                    || draft.recreating
                    || pendingPersistence
                    || !!draft.error
                    || !!draft.conflict
                if (!recoverable) {
                    this.drafts.delete(path)
                    continue
                }
                this.drafts.set(path, {
                    ...draft,
                    conflict: null,
                    deleted: true,
                    deletionRevision: draft.deletionRevision + 1,
                    recreating: false,
                    saving: false,
                })
                continue
            }
            const externalAction = this.getActionByPath(path)
            if (!externalAction) throw new Error(`Missing external action after reload: ${path}`)
            if (draft.deleted) {
                this.drafts.set(path, { ...draft, action: externalAction, conflict: externalDefinition, deleted: false })
                continue
            }
            if (!previousDefinition || actionDefinitionsEqual(previousDefinition, externalDefinition)) continue

            if (draft.revision !== draft.savedRevision) {
                this.drafts.set(path, { ...draft, action: externalAction, conflict: externalDefinition })
                continue
            }
            const revision = draft.revision + 1
            this.drafts.set(path, {
                ...draft,
                action: externalAction,
                committedRevision: revision,
                conflict: null,
                definition: externalDefinition,
                error: null,
                revision,
                savedRevision: revision,
                targetPath: path,
                validation: validateDraftDefinition(path, externalDefinition),
            })
        }
    }

    private queueDraftSave(
        path: string,
        definition: RawActionDefinition,
        revision: number,
        targetPath: string,
        recreate = false,
    ) {
        const current = this.requireDraft(path)
        const deletionRevision = current.deletionRevision
        const chain = current.chain.then(async () => {
            const startedDraft = this.drafts.get(path)
            if (!startedDraft) return
            if (startedDraft.deletionRevision !== deletionRevision || (startedDraft.deleted && !recreate)) return
            this.drafts.set(path, { ...startedDraft, error: null, recreating: recreate, saving: true })
            this.dispatchChanged()
            try {
                await this.saveDefinition(path, definition, targetPath)
                const savedDraft = this.drafts.get(path)
                if (!savedDraft) return
                if (savedDraft.deletionRevision !== deletionRevision) return
                this.drafts.set(path, {
                    ...savedDraft,
                    deleted: recreate ? false : savedDraft.deleted,
                    error: null,
                    recreating: false,
                    savedRevision: Math.max(savedDraft.savedRevision, revision),
                    saving: false,
                })
            } catch (error) {
                const failedDraft = this.drafts.get(path)
                if (!failedDraft) return
                if (failedDraft.deletionRevision !== deletionRevision) return
                const message = error instanceof Error ? error.message : 'Action save failed'
                this.drafts.set(path, { ...failedDraft, error: message, recreating: false, saving: false })
            }
            this.dispatchChanged()
        })
        this.drafts.set(path, { ...current, chain })
    }

    private filesWithFile(file: ActionFile): ActionFile[] {
        const found = this.files.some((candidate) => candidate.path === file.path)

        return found
            ? this.files.map((candidate) => candidate.path === file.path ? file : candidate)
            : [...this.files, file]
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<ActionServiceState>('changed', { detail: this.getState() }))
    }
}

export const actionService = new ActionService()
