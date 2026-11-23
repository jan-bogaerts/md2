import { BUILTIN_CUSTOM_PROMPT, CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'

interface ConversationAction {
    actionId?: string | null
}

function selectableLoadedActions(actions: ActionDefinition[]) {
    return actions.filter((action) => !action.builtin || action.id === CUSTOM_PROMPT_ACTION_ID)
}

function customPromptLast(actions: ActionDefinition[]) {
    const customPrompt = actions.find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)
    const otherActions = actions.filter(({ id }) => id !== CUSTOM_PROMPT_ACTION_ID)

    return customPrompt ? [...otherActions, customPrompt] : otherActions
}

function historicalDefinition(actionId: string, label: string): ActionDefinition {
    return {
        ...BUILTIN_CUSTOM_PROMPT,
        builtin: false,
        description: label,
        id: actionId,
        label,
    }
}

/** Every loaded user action plus custom prompt, preserving selector order. */
export function allPopupActions(loadedActions: ActionDefinition[]) {
    return customPromptLast(selectableLoadedActions(loadedActions))
}

/** Actions backed by stored conversations, including synthetic definitions for removed actions. */
export function conversationLogActions(
    loadedActions: ActionDefinition[],
    conversations: ConversationAction[],
    historicalLabels: ReadonlyMap<string, string> = new Map(),
) {
    const conversationActionIds = [...new Set(conversations.flatMap(({ actionId }) => actionId ? [actionId] : []))]
    const includedActionIds = new Set(conversationActionIds)
    const actions = selectableLoadedActions(loadedActions).filter(({ id }) => includedActionIds.has(id))
    for (const actionId of conversationActionIds) {
        if (actions.some(({ id }) => id === actionId)) continue
        actions.push(historicalDefinition(actionId, historicalLabels.get(actionId) ?? actionId))
    }

    return customPromptLast(actions)
}

/** Stored conversation records for the active card or project context. */
export function liveConversationLogActions(loadedActions: ActionDefinition[], conversations: ConversationAction[]) {
    return conversationLogActions(loadedActions, conversations)
}
