import { actionMatchesContext, type ActionContext } from '../data/action_context'
import {
    BUILTIN_CUSTOM_PROMPT,
    BUILTIN_REMARKABLE_CONVERT,
    type ActionDefinition,
    type ActionFile,
    type RawActionDefinition,
    type RawActionDefinitionEntry,
} from '../data/action_types'
import { ActionValidationError } from '../../../shared/action_definitions.mjs'
import { getService, register } from './service_injector'
import {
    loadTolerantActionDefinitionGraph,
    validateActionDefinitionGraph,
} from './action_definition_loader'

const ACTION_FILE_EXTENSION = '.json'
const NEW_ACTION_NAME = 'new-action'

interface ActionPersistenceGateway {
    persistActionFile(file: ActionFile): Promise<void>
}

export interface ActionServiceState {
    actions: ActionDefinition[]
    error: string | null
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
        this.dispatchChanged()
    }

    loadFromFiles(files: ActionFile[]) {
        return this.loadFiles(files, false)
    }

    reloadFromFiles(files: ActionFile[], changedPaths: string[]) {
        try {
            return this.loadFiles(files, true)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action reload failed'
            this.error = `Action reload failed for ${changedPaths.join(', ')}: ${message}`
            this.dispatchChanged()

            return this.actions
        }
    }

    private loadFiles(files: ActionFile[], preserveEditorState: boolean) {
        const { actions, definitions, issues } = loadTolerantActionDefinitionGraph(files, { validateAgentCapabilities: false })
        this.actions = preserveEditorState ? preserveActionEditorStates(this.actions, actions) : actions
        this.definitions = definitions
        this.error = issues.length > 0 ? issues.map(({ message }) => message).join('\n') : null
        this.files = files
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
        try {
            validateActionDefinitionGraph(this.definitionsWithDefinition(path, definition))

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

    async saveDefinition(path: string, definition: RawActionDefinition) {
        const definitions = this.definitionsWithDefinition(path, definition)
        const actions = preserveActionEditorStates(this.actions, validateActionDefinitionGraph(definitions))
        const file = { content: serializeActionDefinition(definition), path }

        await this.persistenceGateway().persistActionFile(file)
        this.files = this.filesWithFile(file)
        this.definitions = definitions
        this.actions = actions
        this.error = null
        this.dispatchChanged()

        const savedAction = actions.find((action) => action.sourcePath === path)
        if (!savedAction) throw new Error(`Missing saved action after persistence: ${path}`)

        return savedAction
    }

    clear() {
        this.actions = [BUILTIN_CUSTOM_PROMPT, BUILTIN_REMARKABLE_CONVERT]
        this.definitions = []
        this.error = null
        this.files = []
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

    setSelectedEditorTab(path: string, selectedTab: string) {
        const action = this.getActionByPath(path)
        if (!action) throw new Error(`Cannot save editor tab for unknown action: ${path}`)
        action.editorState = { selectedTab }
    }

    getActionsForStateTrigger(state: string, context: ActionContext): ActionDefinition[] {
        return this.actions.filter((action) => action.onState === state && actionMatchesContext(action, context))
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

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<ActionServiceState>('changed', { detail: this.getState() }))
    }
}

export const actionService = new ActionService()
