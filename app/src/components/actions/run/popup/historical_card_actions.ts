import type { CardActivityFile, ActionActivityRecord } from '../../../../../../shared/card_activity.mjs'
import { BUILTIN_CUSTOM_PROMPT, CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge'
import type { PermissionMode, ThinkingLevel } from '../../../../data/agent_profiles'

function historicalDefinition(actionId: string, label: string, type: ActionDefinition['type']): ActionDefinition {
    return {
        ...BUILTIN_CUSTOM_PROMPT,
        builtin: false,
        command: type === 'command' ? '' : null,
        description: label,
        id: actionId,
        label,
        prompt: type === 'agent' ? '' : null,
        type,
    }
}

/** Adds action identities found in stored runs or conversations to current applicable actions. */
export function historicalCardActions(
    applicableActions: ActionDefinition[],
    loadedActions: ActionDefinition[],
    activities: CardActivityFile[],
) {
    const historical = new Map<string, { label: string, type: ActionDefinition['type'] }>()
    for (const activity of activities) {
        for (const record of activity.records) {
            if (record.type === 'system' || record.rootActionId === CUSTOM_PROMPT_ACTION_ID) continue
            historical.set(record.rootActionId, {
                label: record.rootActionLabel || record.rootActionId,
                type: record.details.type,
            })
        }
        for (const conversation of activity.conversations) {
            if (!conversation.actionId || conversation.actionId === CUSTOM_PROMPT_ACTION_ID) continue
            if (!historical.has(conversation.actionId)) {
                historical.set(conversation.actionId, { label: conversation.actionId, type: 'agent' })
            }
        }
    }

    const actions = applicableActions.filter(({ id }) => id !== CUSTOM_PROMPT_ACTION_ID)
    for (const [actionId, { label, type }] of historical) {
        if (actions.some(({ id }) => id === actionId)) continue
        actions.push(loadedActions.find(({ id }) => id === actionId) ?? historicalDefinition(actionId, label, type))
    }

    const customPrompt = applicableActions.find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID) ?? BUILTIN_CUSTOM_PROMPT
    return [...actions, customPrompt]
}

function historyEntry(record: ActionActivityRecord, repositoryRoot: string): ActionRunHistoryEntry {
    const commits = record.commits.map((commit) => ({
        ...commit,
        actionId: commit.actionId ?? record.rootActionId,
        actionName: commit.actionName ?? record.rootActionLabel,
        repositoryRoot,
    }))
    const base = {
        commits,
        completedAt: record.completedAt,
        startedAt: record.startedAt,
        status: record.status,
    }
    if (record.details.type === 'agent') {
        if (!record.rootConversationId) throw new Error(`Agent run missing conversation ID: ${record.runId}`)
        return {
            ...base,
            ...record.details,
            permissionMode: record.details.permissionMode as PermissionMode | undefined,
            rootConversationId: record.rootConversationId,
            thinkingLevel: record.details.thinkingLevel as ThinkingLevel | undefined,
        }
    }

    return { ...base, ...record.details }
}

/** Reads one action's persisted runs from activity already checked against card identity. */
export function historicalActionHistory(activities: CardActivityFile[], actionId: string, repositoryRoot: string) {
    return activities.flatMap(({ records }) => records
        .filter((record): record is ActionActivityRecord => record.type !== 'system' && record.rootActionId === actionId)
        .map((record) => historyEntry(record, repositoryRoot)))
}
