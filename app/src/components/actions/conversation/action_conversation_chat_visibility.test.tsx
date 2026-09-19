import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation } from '../../../data/data_types'
import { agentAcknowledgementService } from '../../../services/agents/agent_acknowledgement_service'
import { cardPopupService } from '../../../services/card_popup_service'
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

describe('ActionConversationChat project popup visibility', () => {
    afterEach(() => {
        cleanup()
        cardPopupService.clear()
        vi.restoreAllMocks()
    })

    it('marks a project conversation viewed only while its entry is top of stack', () => {
        const setConversationVisible = vi.spyOn(agentAcknowledgementService, 'setConversationVisible')
            .mockImplementation(() => undefined)
        cardPopupService.toggleAction({ kind: 'project' }, document.createElement('button'))
        const projectEntryId = cardPopupService.getSnapshot()[0].id
        render(
            <ActionConversationChat
                actionId="respond"
                bindingStore={{} as ActionRunBindingStore}
                context={{ kind: 'project' }}
                popupEntryId={projectEntryId}
                searchService={{} as ActionConversationSearchService}
                store={conversationStore()}
            />,
        )

        expect(setConversationVisible).toHaveBeenLastCalledWith(projectEntryId, null, 'respond', conversation, true)

        setConversationVisible.mockClear()
        act(() => cardPopupService.toggleAction({ cardInternalId: 'card-1', kind: 'card' }, document.createElement('button')))

        expect(setConversationVisible).toHaveBeenLastCalledWith(projectEntryId, null, 'respond', conversation, false)

        setConversationVisible.mockClear()
        act(() => cardPopupService.activate(projectEntryId))

        expect(setConversationVisible).toHaveBeenLastCalledWith(projectEntryId, null, 'respond', conversation, true)
    })
})
