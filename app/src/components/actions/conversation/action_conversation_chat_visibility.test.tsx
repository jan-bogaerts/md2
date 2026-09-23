import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation } from '../../../data/data_types'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import { ActionConversationChat } from './action_conversation_chat'
import type { ActionConversationSearchService } from './action_conversation_search_service'
import type { ActionConversationStore } from './action_conversation_store'

vi.mock('./action_conversation_transcript', () => ({ ActionConversationTranscript: () => null }))
vi.mock('./conversation_meta_info', () => ({ ConversationMetaInfo: () => null }))
vi.mock('../../hooks/use_action_runs', () => ({
    useBoundRunId: () => null,
    useRunSelector: () => null,
}))

const conversation: AgentConversation = {
    actionId: 'respond',
    cardInternalId: null,
    cardPath: null,
    completedAt: null,
    entries: [],
    hasExplicitTitle: true,
    id: 'conversation-1',
    path: 'design/activity/project.json#conversation=conversation-1',
    providerSessions: [],
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'completed',
    title: 'Project result',
    viewed: false,
}

function conversationStore() {
    const snapshot = { selectedConversation: conversation }

    return {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
    } as unknown as ActionConversationStore
}

describe('ActionConversationChat popup visibility', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('marks a conversation visible only while caller reports its popup visible', () => {
        const setConversationVisible = vi.spyOn(agentAcknowledgementService, 'setConversationVisible')
            .mockImplementation(() => undefined)
        const props = {
            actionId: 'respond',
            bindingStore: {} as ActionRunBindingStore,
            context: { kind: 'project' as const },
            popupEntryId: 'project-popup',
            searchService: {} as ActionConversationSearchService,
            store: conversationStore(),
        }
        const { rerender } = render(
            <ActionConversationChat
                {...props}
                popupVisible
            />,
        )

        expect(setConversationVisible).toHaveBeenLastCalledWith('project-popup', null, 'respond', conversation, true)

        setConversationVisible.mockClear()
        rerender(<ActionConversationChat {...props} popupVisible={false} />)

        expect(setConversationVisible).toHaveBeenLastCalledWith('project-popup', null, 'respond', conversation, false)

        setConversationVisible.mockClear()
        rerender(<ActionConversationChat {...props} popupVisible />)

        expect(setConversationVisible).toHaveBeenLastCalledWith('project-popup', null, 'respond', conversation, true)
    })
})
