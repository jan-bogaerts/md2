import {
    type ActionDefinition,
    type ActionFile,
    type RawActionDefinition,
} from '../../data/action_types'
import { ActionValidationError } from '../../../../shared/action_definitions.mjs'
import { validateActionDefinition } from './action_definition_loader'
import type { ActionValidationResult } from './action_service'

export const ACTION_FILE_EXTENSION = '.json'
export const NEW_ACTION_NAME = 'new-action'

export function normalizedPathKey(path: string) {
    return path.replace(/\\/gu, '/').toLowerCase()
}

export function normalizedFolder(folder: string) {
    return folder.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

export function actionPath(folder: string, name: string) {
    return `${normalizedFolder(folder)}/${name}${ACTION_FILE_EXTENSION}`
}

export function nextActionName(files: ActionFile[]) {
    const existingPaths = new Set(files.map(({ path }) => normalizedPathKey(path)))
    if (![...existingPaths].some((path) => path.endsWith(`/${NEW_ACTION_NAME}${ACTION_FILE_EXTENSION}`))) return NEW_ACTION_NAME

    let suffix = 2
    while ([...existingPaths].some((path) => path.endsWith(`/${NEW_ACTION_NAME}-${suffix}${ACTION_FILE_EXTENSION}`))) suffix += 1

    return `${NEW_ACTION_NAME}-${suffix}`
}

export function suffixedActionPath(path: string, suffix: number) {
    return `${path.slice(0, -ACTION_FILE_EXTENSION.length)}-${suffix}${ACTION_FILE_EXTENSION}`
}

export function preserveActionEditorStates(currentActions: ActionDefinition[], nextActions: ActionDefinition[]) {
    const editorStatesByActionId = new Map<string, NonNullable<ActionDefinition['editorState']>>()
    for (const { editorState, id } of currentActions) {
        if (!editorState) continue
        editorStatesByActionId.set(id, editorState)
    }
    for (const action of nextActions) {
        const editorState = editorStatesByActionId.get(action.id)
        if (editorState) action.editorState = editorState
    }

    return nextActions
}

export function structuredValuesEqual(left: unknown, right: unknown): boolean {
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

export function actionDefinitionsEqual(left: RawActionDefinition, right: RawActionDefinition) {
    return structuredValuesEqual(left, right)
}

export function actionValidationResult(validate: () => unknown): ActionValidationResult {
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

export function validateDraftDefinition(path: string, definition: RawActionDefinition) {
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
        ...(action.autoFinish != null ? { autoFinish: action.autoFinish } : {}),
        ...(action.onBefore.length > 0 ? { onBefore: action.onBefore.map(({ id }) => id) } : {}),
        ...(action.on.length > 0 ? { on: action.on.map(({ actionId, condition }) => ({ actionId, condition })) } : {}),
        ...(action.onAfter.length > 0 ? { onAfter: action.onAfter.map(({ id }) => id) } : {}),
        ...(action.onState !== null ? { onState: action.onState } : {}),
        ...(action.output !== null ? { output: action.output } : {}),
        ...(action.needsWorkTree ? { needsWorkTree: true } : {}),
        ...(action.showCommandWindow ? { showCommandWindow: true } : {}),
        ...(action.agent !== null ? { agent: action.agent } : {}),
        ...(action.model !== null ? { model: action.model } : {}),
        ...(action.permissionMode !== null ? { permissionMode: action.permissionMode } : {}),
        ...(action.thinkingLevel !== null ? { thinkingLevel: action.thinkingLevel } : {}),
        ...(action.trackFileChanges ? { trackFileChanges: true } : {}),
        ...(action.streaming ? { streaming: true } : {}),
        phrases: action.phrases,
        ...(action.type === 'agent' ? { prompt: action.prompt as string } : { command: action.command as string }),
    }
}
