import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionRunRegistry } from '../actions/action_run_registry'
import {
    actionAcknowledgementEvent,
    agentAcknowledgementService,
    cardAcknowledgementEvent,
    PROJECT_ACKNOWLEDGEMENT_EVENT,
} from './agent_acknowledgement_service'
import { hasUnseenConversation, latestUnseenConversation } from './card_agent_state'

const cardInternalId = 'root-card'
const actionId = 'implement'

function conversation(id = 'conversation-1', viewed = true): AgentConversation {
    return {
        actionId,
        cardInternalId,
        cardPath: 'design/F-1-root.md',
        completedAt: null,
        entries: [],
        hasExplicitTitle: true,
        id,
        path: `design/activity/card__root-card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: id === 'newest' ? '2026-01-02T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
        status: 'running',
        title: 'Agent run',
        viewed,
    }
}

function runEvent(status: ActionRunStatus): ActionRunEvent {
    return {
        actionId,
        context: { cardInternalId, file: 'design/F-1-root.md', kind: 'card' },
        phase: 'main',
        rootActionId: actionId,
        runId: 'run-1',
        status,
        type: 'run',
    }
}

function projectConversation(viewed = true): AgentConversation {
    return {
        ...conversation('project-conversation', viewed),
        cardInternalId: null,
        cardPath: null,
        path: 'design/activity/project.json#conversation=project-conversation',
    }
}

function projectRunEvent(status: ActionRunStatus): ActionRunEvent {
    return { ...runEvent(status), context: { kind: 'project' }, runId: 'project-run' }
}

/** Starts the run registry against a bridge that reports the given conversation for the emitted run. */
function startRunRegistry(runConversation: AgentConversation | null) {
    let emit: ((event: ActionRunEvent) => void) | null = null
    const updateActionConversationViewed = vi.fn(async (reference: string, viewed: boolean) => ({
        ...conversation(),
        path: reference,
        viewed,
    }))
    setActionBridgeOverride({
        onActionRun: vi.fn((listener: (event: ActionRunEvent) => void) => {
            emit = listener

            return vi.fn()
        }),
        updateActionConversationViewed,
    } as unknown as ElectronActionBridge)
    actionRunRegistry.start()
    if (!emit) throw new Error('Missing run listener')
    const emitEvent = emit as (event: ActionRunEvent) => void
    let seeded = false
    /** Publishes a status event, seeding the run store with its conversation on first use. */
    const publish = (event: ActionRunEvent) => {
        if (runConversation && !seeded) {
            seeded = true
            emitEvent({ ...event, status: 'running', type: 'run' })
            emitEvent({
                ...event,
                status: 'running',
                type: 'update',
                update: { conversation: runConversation, kind: 'agentStarted' },
            })
        }
        emitEvent(event)
    }

    return { publish, updateActionConversationViewed }
}

describe('AgentAcknowledgementService', () => {
    afterEach(() => {
        actionRunRegistry.stop()
        agentAcknowledgementService.reset()
        agentAcknowledgementService.connectConversationStore(() => null)
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('announces card and exact action events without touching other scopes', async () => {
        const { updateActionConversationViewed } = startRunRegistry(null)
        const exactAction = vi.fn()
        const otherAction = vi.fn()
        const card = vi.fn()
        const otherCard = vi.fn()
        agentAcknowledgementService.addEventListener(actionAcknowledgementEvent(cardInternalId, actionId), exactAction)
        agentAcknowledgementService.addEventListener(actionAcknowledgementEvent(cardInternalId, 'review'), otherAction)
        agentAcknowledgementService.addEventListener(cardAcknowledgementEvent(cardInternalId), card)
        agentAcknowledgementService.addEventListener(cardAcknowledgementEvent('other-card'), otherCard)

        await agentAcknowledgementService.setViewed(cardInternalId, actionId, conversation('conversation-1', false), true)

        expect(updateActionConversationViewed).toHaveBeenCalledOnce()
        expect(exactAction).toHaveBeenCalledOnce()
        expect(card).toHaveBeenCalledOnce()
        expect(otherAction).not.toHaveBeenCalled()
        expect(otherCard).not.toHaveBeenCalled()
    })

    it('applies the view change to the stored conversation record', async () => {
        startRunRegistry(null)
        const stored = conversation('conversation-1', false)
        agentAcknowledgementService.connectConversationStore(() => stored)

        await agentAcknowledgementService.setViewed(cardInternalId, actionId, conversation('conversation-1', false), true)

        expect(stored.viewed).toBe(true)
        expect(hasUnseenConversation([stored])).toBe(false)
    })

    it('selects the newest unseen conversation and leaves older ones unseen', async () => {
        startRunRegistry(null)
        const older = conversation('older', false)
        const newest = conversation('newest', false)
        agentAcknowledgementService.connectConversationStore(() => newest)

        await agentAcknowledgementService.setViewed(cardInternalId, actionId, newest, true)

        expect(latestUnseenConversation([newest, older], actionId)).toEqual(older)
        expect(hasUnseenConversation([newest, older])).toBe(true)
    })

    it.each<ActionRunStatus>(['waitingForInput', 'completed', 'failed'])(
        'marks conversation unseen on transition into %s once',
        async (status) => {
            const running = conversation()
            const { publish, updateActionConversationViewed } = startRunRegistry(running)
            publish(runEvent('running'))
            publish(runEvent(status))
            publish(runEvent(status))

            await vi.waitFor(() => expect(updateActionConversationViewed).toHaveBeenCalledOnce())
            expect(updateActionConversationViewed).toHaveBeenCalledWith(running.path, false)
        },
    )

    it('marks conversation unseen again when it returns to a qualifying state', async () => {
        const running = conversation()
        const { publish, updateActionConversationViewed } = startRunRegistry(running)
        agentAcknowledgementService.connectConversationStore(() => running)
        publish(runEvent('waitingForInput'))
        await vi.waitFor(() => expect(running.viewed).toBe(false))

        await agentAcknowledgementService.setViewed(cardInternalId, actionId, running, true)
        publish(runEvent('running'))
        publish(runEvent('waitingForInput'))

        await vi.waitFor(() => expect(running.viewed).toBe(false))
        expect(updateActionConversationViewed).toHaveBeenCalledTimes(3)
        expect(updateActionConversationViewed).toHaveBeenLastCalledWith(running.path, false)
    })

    it.each<ActionRunStatus>(['queued', 'running', 'cancelled', 'okButNotAfter'])(
        'does not mark conversation unseen on transition into %s',
        (status) => {
            const { publish, updateActionConversationViewed } = startRunRegistry(conversation())
            publish(runEvent(status))

            expect(updateActionConversationViewed).not.toHaveBeenCalled()
        },
    )

    it('keeps a visible conversation viewed during a qualifying transition', () => {
        const running = conversation()
        const { publish, updateActionConversationViewed } = startRunRegistry(running)
        agentAcknowledgementService.setConversationVisible('popup-1', cardInternalId, actionId, running, true)

        publish(runEvent('running'))
        publish(runEvent('completed'))

        expect(updateActionConversationViewed).not.toHaveBeenCalled()
    })

    it('acknowledges an unseen conversation when its chat becomes visible', async () => {
        const { updateActionConversationViewed } = startRunRegistry(null)
        const unseen = conversation('conversation-1', false)

        agentAcknowledgementService.setConversationVisible('popup-1', cardInternalId, actionId, unseen, true)

        await vi.waitFor(() => expect(updateActionConversationViewed).toHaveBeenCalledWith(unseen.path, true))
        await vi.waitFor(() => expect(unseen.viewed).toBe(true))
    })

    it('marks project conversations unseen and announces project-only changes', async () => {
        const running = projectConversation()
        const { publish, updateActionConversationViewed } = startRunRegistry(running)
        const card = vi.fn()
        agentAcknowledgementService.addEventListener(cardAcknowledgementEvent(cardInternalId), card)

        publish(projectRunEvent('running'))
        publish(projectRunEvent('completed'))

        await vi.waitFor(() => expect(updateActionConversationViewed).toHaveBeenCalledWith(running.path, false))
        expect(card).not.toHaveBeenCalled()
    })

    it('acknowledges a visible unseen project conversation', async () => {
        const { updateActionConversationViewed } = startRunRegistry(null)
        const unseen = projectConversation(false)
        const project = vi.fn()
        agentAcknowledgementService.addEventListener(PROJECT_ACKNOWLEDGEMENT_EVENT, project)

        agentAcknowledgementService.setConversationVisible('project-popup', null, actionId, unseen, true)

        await vi.waitFor(() => expect(updateActionConversationViewed).toHaveBeenCalledWith(unseen.path, true))
        await vi.waitFor(() => expect(unseen.viewed).toBe(true))
        expect(project).toHaveBeenCalledOnce()
    })

    it('leaves the conversation unseen and retryable when persistence fails', async () => {
        const error = new Error('disk failed')
        const updateActionConversationViewed = vi.fn()
            .mockRejectedValueOnce(error)
            .mockImplementation(async (reference: string, viewed: boolean) => ({ ...conversation(), path: reference, viewed }))
        setActionBridgeOverride({
            onActionRun: vi.fn(() => vi.fn()),
            updateActionConversationViewed,
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const unseen = conversation('conversation-1', false)

        await expect(agentAcknowledgementService.setViewed(cardInternalId, actionId, unseen, true)).rejects.toThrow('disk failed')
        expect(unseen.viewed).toBe(false)

        await agentAcknowledgementService.setViewed(cardInternalId, actionId, unseen, true)
        expect(unseen.viewed).toBe(true)
        expect(updateActionConversationViewed).toHaveBeenCalledTimes(2)
    })

    it('ignores transitions without a card conversation identity', () => {
        const { publish, updateActionConversationViewed } = startRunRegistry(null)

        publish(runEvent('completed'))

        expect(updateActionConversationViewed).not.toHaveBeenCalled()
    })

    it('clears chat visibility at a project boundary', () => {
        const running = conversation()
        const { publish, updateActionConversationViewed } = startRunRegistry(running)
        agentAcknowledgementService.setConversationVisible('popup-1', cardInternalId, actionId, running, true)

        agentAcknowledgementService.reset()
        publish(runEvent('completed'))

        expect(updateActionConversationViewed).toHaveBeenCalledWith(running.path, false)
    })
})
