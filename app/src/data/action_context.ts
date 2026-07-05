import type { ActionDefinition } from './action_types'
import type { CardTypeConfig, ProjectCard } from './data_types'

/** The kind of item an action entry point is attached to. */
export type ActionContextKind = 'card' | 'file' | 'folder'

/**
 * The selected item an action is evaluated against. `appliesTo` keys are matched
 * field-by-field against this object, so every matchable property is a string.
 */
export interface ActionContext {
    /** Card/file type derived from the id prefix, e.g. `feature`. */
    type?: string
    /** Card state / status, e.g. `design`. */
    state?: string
    /** Path to the markdown file, used for placeholder resolution. */
    file?: string
    /** Folder name for folder contexts. */
    folder?: string
    kind: ActionContextKind
    [key: string]: string | undefined
}

/** Resolve the configured card type for a card id via its prefix (e.g. `F-005` → `feature`). */
export function getCardType(cardTypes: CardTypeConfig[], id: string): string | undefined {
    const prefix = id.split('-')[0]

    return cardTypes.find((cardType) => cardType.idPrefix === prefix)?.type
}

/** Build the action context for a card shown in card view. */
export function cardContext(card: ProjectCard, cardTypes: CardTypeConfig[]): ActionContext {
    const context: ActionContext = { file: card.path, kind: 'card' }
    const type = getCardType(cardTypes, card.header.id)
    if (type) context.type = type
    if (card.header.status) context.state = card.header.status

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

/**
 * True when the action is allowed in the given context. An action with no
 * `appliesTo` (like the built-in custom prompt) matches every context; otherwise
 * every `appliesTo` key must equal the same field on the context.
 */
export function actionMatchesContext(action: ActionDefinition, context: ActionContext): boolean {
    if (!action.appliesTo) return true

    return Object.entries(action.appliesTo).every(([key, value]) => context[key] === value)
}

/** All actions that should be shown for a context, preserving load order. */
export function actionsForContext(actions: ActionDefinition[], context: ActionContext): ActionDefinition[] {
    return actions.filter((action) => actionMatchesContext(action, context))
}
