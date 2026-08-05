import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import type { AgentConversation } from '../../data/data_types'
import { AgentAcknowledgementService } from './agent_acknowledgement_service'

const cardPath = 'design/F-1-root.md'
const actionId = 'implement'

function conversation(id = 'conversation-1', viewed = true): AgentConversation {
    return {
        actionId,
        cardInternalId: 'root-card',
        cardPath,
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
        context: { cardInternalId: 'root-card', file: cardPath, kind: 'card' },
        phase: 'main',
        rootActionId: actionId,
        runId: 'run-1',
        status,
        type: 'run',
    }
}

function createService(persist = vi.fn(async (reference: string, viewed: boolean) => ({
    ...conversation(),
    path: reference,
    viewed,
}))) {
    let listener: ((event: ActionRunEvent) => void) | null = null
    let liveConversation: AgentConversation | null = conversation()
    const service = new AgentAcknowledgementService(
        persist,
        (nextListener) => {
            listener = nextListener

            return () => undefined
        },
        () => liveConversation,
    )

    return {
        emit: (event: ActionRunEvent) => {
            if (!listener) throw new Error('Missing action-run listener')
            listener(event)
        },
        persist,
        service,
        setLiveConversation: (next: AgentConversation | null) => {
            liveConversation = next
        },
    }
}

function deferredConversation() {
    let rejectPromise: (error: Error) => void = () => undefined
    let resolvePromise: (value: AgentConversation) => void = () => undefined
    const promise = new Promise<AgentConversation>((resolve, reject) => {
        rejectPromise = reject
        resolvePromise = resolve
    })

    return { promise, reject: rejectPromise, resolve: resolvePromise }
}

describe('AgentAcknowledgementService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('selects newest unseen conversation without acknowledging older conversations', async () => {
        const { service } = createService()
        const older = conversation('older', false)
        const newest = conversation('newest', false)

        await service.setViewed(cardPath, actionId, newest, true)

        expect(service.latestUnseen(cardPath, [newest, older], actionId)).toEqual(older)
        expect(service.hasUnseen(cardPath, [newest, older])).toBe(true)
    })

    it('notifies only exact action subscribers and card aggregate subscriber', async () => {
        const { service } = createService()
        const exact = vi.fn()
        const otherAction = vi.fn()
        const otherCard = vi.fn()
        const card = vi.fn()
        service.subscribeAction(cardPath, actionId, exact)
        service.subscribeAction(cardPath, 'review', otherAction)
        service.subscribeCard(cardPath, card)
        service.subscribeCard('design/F-2.md', otherCard)

        await service.setViewed(cardPath, actionId, conversation('conversation-1', false), true)

        expect(exact).toHaveBeenCalledOnce()
        expect(card).toHaveBeenCalledOnce()
        expect(otherAction).not.toHaveBeenCalled()
        expect(otherCard).not.toHaveBeenCalled()
    })

    it('notifies loaded conversation actions once and the card aggregate once', () => {
        const { service } = createService()
        const firstAction = vi.fn()
        const secondAction = vi.fn()
        const card = vi.fn()
        service.subscribeAction(cardPath, actionId, firstAction)
        service.subscribeAction(cardPath, 'review', secondAction)
        service.subscribeCard(cardPath, card)

        service.notifyConversationsChanged(cardPath, [actionId, 'review', actionId])

        expect(firstAction).toHaveBeenCalledOnce()
        expect(secondAction).toHaveBeenCalledOnce()
        expect(card).toHaveBeenCalledOnce()
    })

    it.each<ActionRunStatus>(['waitingForInput', 'completed', 'failed'])(
        'marks conversation unseen on transition into %s once',
        async (status) => {
            const { emit, persist, service } = createService()
            emit(runEvent('running'))
            emit(runEvent(status))
            emit(runEvent(status))
            await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())

            expect(persist).toHaveBeenCalledWith(conversation().path, false)
            expect(service.latestUnseen(cardPath, [], actionId)?.id).toBe('conversation-1')
        },
    )

    it.each<ActionRunStatus>(['queued', 'running', 'cancelled', 'okButNotAfter'])(
        'does not mark conversation unseen on transition into %s',
        (status) => {
            const { emit, persist } = createService()
            emit(runEvent(status))

            expect(persist).not.toHaveBeenCalled()
        },
    )

    it('keeps visible conversation viewed during qualifying transition', () => {
        const { emit, persist, service } = createService()
        service.setConversationVisible('popup-1', cardPath, actionId, conversation(), true)

        emit(runEvent('running'))
        emit(runEvent('completed'))

        expect(persist).not.toHaveBeenCalled()
        expect(service.hasUnseen(cardPath, [])).toBe(false)
    })

    it('acknowledges unseen conversation when it becomes visible', async () => {
        const { persist, service } = createService()
        const unseen = conversation('conversation-1', false)

        service.setConversationVisible('popup-1', cardPath, actionId, unseen, true)

        await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(unseen.path, true))
        expect(service.hasUnseen(cardPath, [unseen])).toBe(false)
    })

    it('rolls back failed optimistic update and allows retry', async () => {
        const error = new Error('disk failed')
        const persist = vi.fn()
            .mockRejectedValueOnce(error)
            .mockImplementation(async (reference: string, viewed: boolean) => ({ ...conversation(), path: reference, viewed }))
        const { service } = createService(persist)
        const unseen = conversation('conversation-1', false)

        const failed = service.setViewed(cardPath, actionId, unseen, true)
        expect(service.hasUnseen(cardPath, [unseen])).toBe(false)
        await expect(failed).rejects.toThrow('disk failed')
        expect(service.hasUnseen(cardPath, [unseen])).toBe(true)

        await service.setViewed(cardPath, actionId, unseen, true)
        expect(persist).toHaveBeenCalledTimes(2)
        expect(service.hasUnseen(cardPath, [unseen])).toBe(false)
    })

    it('does not let older failed request roll back newer desired state', async () => {
        const first = deferredConversation()
        const persist = vi.fn()
            .mockImplementationOnce(() => first.promise)
            .mockImplementationOnce(async (reference: string, viewed: boolean) => ({ ...conversation(), path: reference, viewed }))
        const { service } = createService(persist)
        const source = conversation()

        const olderRequest = service.setViewed(cardPath, actionId, source, false)
        await service.setViewed(cardPath, actionId, source, true)
        first.reject(new Error('older failed'))
        await expect(olderRequest).rejects.toThrow('older failed')

        expect(service.hasUnseen(cardPath, [source])).toBe(false)
    })

    it('clears runtime acknowledgement state when loaded project changes', async () => {
        const { service } = createService()
        service.setLoadedProject({ branch: 'main', id: 'one' })
        await service.setViewed(cardPath, actionId, conversation(), false)
        expect(service.hasUnseen(cardPath, [])).toBe(true)

        service.setLoadedProject({ branch: 'main', id: 'two' })

        expect(service.hasUnseen(cardPath, [])).toBe(false)
    })

    it('ignores transitions without card conversation identity', () => {
        const { emit, persist, setLiveConversation } = createService()
        setLiveConversation(null)

        emit(runEvent('completed'))

        expect(persist).not.toHaveBeenCalled()
    })
})
