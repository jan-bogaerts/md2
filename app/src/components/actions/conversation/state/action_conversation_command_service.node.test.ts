import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationMessageEntry } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionService } from '../../../../services/actions/action_service'
import { dataService } from '../../../../services/data/data_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import * as popupDefaults from '../../run/popup/action_popup_defaults'
import {
    ActionConversationCommandService,
    firstPromptMessageId,
} from './action_conversation_command_service'
import type { ActionConversationStore } from './action_conversation_store'

const message: AgentConversationMessageEntry = {
    content: '**Exact selected Markdown**',
    id: 'message-2',
    kind: 'message',
    role: 'assistant',
    timestamp: '2026-09-12T10:01:00.000Z',
}

function conversation(): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-1.md',
        completedAt: '2026-09-12T10:02:00.000Z',
        entries: [
            { content: 'tool', id: 'event-1', kind: 'event', timestamp: '2026-09-12T09:59:00.000Z', type: 'tool' },
            { content: 'Prompt', id: 'message-1', kind: 'message', role: 'user', timestamp: '2026-09-12T10:00:00.000Z' },
            message,
        ],
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'design/activity/card__card-1.json#conversation=conversation-1',
        providerSessions: [],
        startedAt: '2026-09-12T10:00:00.000Z',
        status: 'completed',
        title: 'Review',
        viewed: true,
    }
}

describe('ActionConversationCommandService', () => {
    afterEach(() => {
        actionService.clear()
        projectAccessService.setReadOnly(false)
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('finds first prompt from canonical entries rather than rendered groups', () => {
        expect(firstPromptMessageId(conversation())).toBe('message-1')
    })

    it('creates a new action with exact content, context, and current action settings', async () => {
        actionService.loadFromFiles([{
            content: JSON.stringify({
                agent: 'codex',
                description: 'Review',
                id: 'review',
                label: 'Review',
                model: 'gpt-5.5',
                permissionMode: 'ask-for-approval',
                phrases: [],
                prompt: 'Review prompt',
                type: 'agent',
            }),
            path: 'actions/review.json',
        }])
        const save = vi.spyOn(popupDefaults, 'defaultConvertPromptToAction').mockResolvedValue({
            definition: { description: '', id: 'new', label: 'Saved response', prompt: message.content, type: 'agent' },
            path: 'actions/saved-response.json',
        })
        const context = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const, type: 'feature' }
        const service = new ActionConversationCommandService('review', context, {} as ActionConversationStore)

        await service.saveAsNewAction(message, 'Saved response')

        expect(save).toHaveBeenCalledWith({
            agent: 'codex',
            context,
            label: 'Saved response',
            model: 'gpt-5.5',
            permissionMode: 'ask-for-approval',
            prompt: message.content,
        })
    })

    it('adds and selects backend split by returned identity and reference', async () => {
        const source = conversation()
        const split = { ...source, id: 'conversation-split', path: 'design/activity/card__card-1.json#conversation=conversation-split' }
        const splitActionConversation = vi.fn(async () => split)
        setActionBridgeOverride({ splitActionConversation } as unknown as ElectronActionBridge)
        const updateAgentConversation = vi.spyOn(dataService.agents, 'updateAgentConversation').mockImplementation(() => undefined)
        const addAndSelectConversation = vi.fn()
        const store = { addAndSelectConversation } as unknown as ActionConversationStore
        const service = new ActionConversationCommandService('review', { cardInternalId: 'card-1', kind: 'card' }, store)

        await service.split(source, message)

        expect(splitActionConversation).toHaveBeenCalledWith(source.path, message.id)
        expect(updateAgentConversation).toHaveBeenCalledWith(split)
        expect(addAndSelectConversation).toHaveBeenCalledWith(split)
    })
})
