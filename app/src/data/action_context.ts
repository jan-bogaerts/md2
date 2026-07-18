import { ACTION_APPLIES_TO_FIELDS, CUSTOM_PROMPT_ACTION_ID } from './action_types'
import type { ActionAppliesToField, ActionDefinition } from './action_types'
import type { CardTypeConfig, ProjectCard } from './data_types'
import { getCardIdPrefix } from './card_identifiers'

/** The kind of item an action entry point is attached to. */
export type ActionContextKind = 'card' | 'file' | 'folder' | 'project'

export type ActionContextFilterValueSource =
    'kind' | 'type' | 'state' | 'file' | 'folder' | 'worktree' | 'text'

export interface ActionContextFilterDescriptor {
    key: ActionAppliesToField
    label: string
    supportedContextKinds: ActionContextKind[]
    valueSource: ActionContextFilterValueSource
    validate: (value: string) => string | null
}

/**
 * The selected item an action is evaluated against. `appliesTo` keys are matched
 * field-by-field against this object, so every matchable property is a string.
 */
export interface ActionContext {
    /** Title of the selected card, used for placeholder resolution. */
    title?: string
    /** Card/file type derived from the id prefix, e.g. `feature`. */
    type?: string
    /** Card state / status, e.g. `design`. */
    state?: string
    /** Path to the markdown file, used for placeholder resolution. */
    file?: string
    /** Folder name for folder contexts. */
    folder?: string
    kind: ActionContextKind
    worktree?: string
    worktreeError?: string
    [key: string]: string | undefined
}

/** Required-value validation shared by every applicability filter descriptor. */
export function validateActionContextFilterValue(value: string): string | null {
    return value.length > 0 ? null : 'Required value'
}

const ACTION_CONTEXT_FILTER_METADATA: Record<ActionAppliesToField, Omit<ActionContextFilterDescriptor, 'key'>> = {
    file: { label: 'Repository file', supportedContextKinds: ['card', 'file'], valueSource: 'file', validate: validateActionContextFilterValue },
    folder: { label: 'Repository folder', supportedContextKinds: ['folder'], valueSource: 'folder', validate: validateActionContextFilterValue },
    kind: { label: 'Target kind', supportedContextKinds: ['card', 'file', 'folder', 'project'], valueSource: 'kind', validate: validateActionContextFilterValue },
    state: { label: 'Card state', supportedContextKinds: ['card', 'file'], valueSource: 'state', validate: validateActionContextFilterValue },
    type: { label: 'Context type', supportedContextKinds: ['card', 'file', 'folder'], valueSource: 'type', validate: validateActionContextFilterValue },
    worktree: { label: 'Worktree', supportedContextKinds: ['card', 'file'], valueSource: 'worktree', validate: validateActionContextFilterValue },
    worktreeError: { label: 'Worktree error', supportedContextKinds: ['card', 'file'], valueSource: 'text', validate: validateActionContextFilterValue },
}

export const ACTION_CONTEXT_FILTER_DESCRIPTORS: ActionContextFilterDescriptor[] = ACTION_APPLIES_TO_FIELDS.map((key) => ({
    key,
    ...ACTION_CONTEXT_FILTER_METADATA[key],
}))

/** Resolve the configured card type for a card id via its prefix (e.g. `F-005` → `feature`). */
export function getCardType(cardTypes: CardTypeConfig[], id: string): string | undefined {
    const prefix = getCardIdPrefix(id)

    return cardTypes.find((cardType) => cardType.idPrefix === prefix)?.type
}

/** Build the action context for a card shown in card view. */
export function cardContext(card: ProjectCard, cardTypes: CardTypeConfig[]): ActionContext {
    const context: ActionContext = { file: card.path, kind: 'card', title: card.header.title }
    const type = getCardType(cardTypes, card.header.id)
    if (type) context.type = type
    if (card.header.status) context.state = card.header.status
    if (card.header.worktreeValue) context.worktree = card.header.worktreeValue
    if (card.header.worktreeError) context.worktreeError = card.header.worktreeError

    return context
}

/** Build the action context for a card opened as a file in the tree/text view. */
export function fileContext(card: ProjectCard, cardTypes: CardTypeConfig[]): ActionContext {
    return { ...cardContext(card, cardTypes), kind: 'file' }
}

/** Build the action context for a folder node in the tree. */
export function folderContext(folder: string, isSpecial = false): ActionContext {
    const context: ActionContext = { folder, kind: 'folder' }
    if (isSpecial) context.type = folder

    return context
}

/** Build context for actions that run against the opened project rather than a card or file. */
export function projectContext(): ActionContext {
    return { kind: 'project' }
}

/**
 * True when the action is allowed in the given context. An action with no
 * `appliesTo` (like the built-in custom prompt) matches every context; otherwise
 * every `appliesTo` key must equal the same field on the context.
 */
export function actionMatchesContext(action: ActionDefinition, context: ActionContext): boolean {
    if (!action.appliesTo) return true

    return ACTION_APPLIES_TO_FIELDS.every((key) => action.appliesTo?.[key] === undefined || context[key] === action.appliesTo[key])
}

/** All actions that should be shown for a context, preserving load order. */
export function actionsForContext(actions: ActionDefinition[], context: ActionContext): ActionDefinition[] {
    return actions.filter((action) => (!action.builtin || action.id === CUSTOM_PROMPT_ACTION_ID) && actionMatchesContext(action, context))
}

/** Context actions in selector order, with the built-in custom prompt last. */
export function displayActionsForContext(actions: ActionDefinition[], context: ActionContext): ActionDefinition[] {
    const contextActions = actionsForContext(actions, context)
    const customPrompt = contextActions.find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)
    const configuredActions = contextActions.filter(({ id }) => id !== CUSTOM_PROMPT_ACTION_ID)

    return customPrompt ? [...configuredActions, customPrompt] : configuredActions
}
