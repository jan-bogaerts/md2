import type { CardActivityFile, ActionActivityRecord } from '../../../../../../shared/card_activity.mjs'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge'
import type { PermissionMode, ThinkingLevel } from '../../../../data/agent_profiles'
import { conversationLogActions } from './action_visibility'

/** Derives conversation-backed actions from referenced historical activity. */
export function historicalCardActions(
    loadedActions: ActionDefinition[],
    activities: CardActivityFile[],
) {
    const conversations = activities.flatMap(({ conversations: activityConversations }) => activityConversations)
    const conversationActionIds = new Set(conversations.flatMap(({ actionId }) => actionId ? [actionId] : []))
    const historicalLabels = new Map<string, string>()
    for (const activity of activities) {
        for (const record of activity.records) {
            if (record.type === 'system' || !conversationActionIds.has(record.rootActionId)) continue
            historicalLabels.set(record.rootActionId, record.rootActionLabel || record.rootActionId)
        }
    }

    return conversationLogActions(loadedActions, conversations, historicalLabels)
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
