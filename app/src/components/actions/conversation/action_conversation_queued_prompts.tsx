import { useSyncExternalStore } from 'react'
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import { ActionQueuedPromptRow } from './action_queued_prompt'

interface ActionConversationQueuedPromptsProps {
    tracker: ActionConversationChatlogTracker
}

/** Subscribes to queued prompts for tracker-bound live run. */
export function ActionConversationQueuedPrompts({ tracker }: ActionConversationQueuedPromptsProps) {
    const queuedPrompts = useSyncExternalStore(
        tracker.subscribeQueuedPrompts,
        tracker.getQueuedPrompts,
        tracker.getQueuedPrompts,
    )
    const runId = useSyncExternalStore(
        tracker.subscribeQueuedPrompts,
        tracker.getRunId,
        tracker.getRunId,
    )
    if (!runId) return null

    return queuedPrompts.map((entry) => <ActionQueuedPromptRow entry={entry} key={entry.id} runId={runId} />)
}
