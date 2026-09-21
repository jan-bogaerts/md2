import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, ProjectSnapshot } from '../../data/data_types'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { PinnedConversationsIndicator } from './pinned_conversations_indicator'

const hookState = vi.hoisted(() => ({
    actions: [{ id: 'review', label: 'Review action' }],
    project: { branch: 'main', id: 'project-1', rootPath: 'C:/repo' },
    snapshot: {
        activeCards: [{ header: { internalId: 'card-1', title: 'Card one' } }],
        backgroundCards: [],
        repositoryFiles: [],
        workingFolder: 'C:/repo',
    } as unknown as ProjectSnapshot,
}))

vi.mock('../hooks/use_actions', () => ({useActions: () => ({ actions: hookState.actions, error: null })}))

vi.mock('../hooks/use_project_state', () => ({useProjectState: () => ({ project: hookState.project, runningAgents: [], snapshot: hookState.snapshot })}))

function createConversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/cards/card-one.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: 'conversation-1',
        path: 'design/activity/card-one.json#conversation=conversation-1',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Pinned discussion',
        viewed: true,
        ...overrides,
    }
}

describe('PinnedConversationsIndicator', () => {
    beforeEach(() => {
        hookState.actions = [{ id: 'review', label: 'Review action' }]
        vi.spyOn(dataService.agents, 'subscribePinnedConversations').mockReturnValue(() => undefined)
        vi.spyOn(dataService.conversationPins, 'subscribe').mockReturnValue(() => undefined)
        vi.spyOn(dataService.agents, 'ensurePinnedConversationsLoaded').mockResolvedValue([])
        vi.spyOn(dataService.agents, 'setPinnedConversationsPopupOpen').mockImplementation(() => undefined)
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('stays hidden without pins and does not load conversations', () => {
        vi.spyOn(dataService.agents, 'getPinnedConversationsSnapshot').mockReturnValue([])
        vi.spyOn(dataService.conversationPins, 'getSnapshot').mockReturnValue([])

        render(<PinnedConversationsIndicator />)

        expect(screen.queryByRole('button', { name: /Pinned conversations/u })).not.toBeInTheDocument()
        expect(dataService.agents.ensurePinnedConversationsLoaded).not.toHaveBeenCalled()
    })

    it('loads and lists pinned conversations when opened', async () => {
        const conversations = [
            createConversation({ id: 'newer', path: 'newer-path', startedAt: '2026-01-02T00:00:00.000Z', title: 'Newer' }),
            createConversation({ id: 'older', path: 'older-path', startedAt: '2026-01-01T00:00:00.000Z', title: 'Older' }),
        ]
        vi.spyOn(dataService.agents, 'getPinnedConversationsSnapshot').mockReturnValue(conversations)
        vi.spyOn(dataService.conversationPins, 'getSnapshot').mockReturnValue([
            { contextKind: 'project', conversationId: 'newer' },
            { contextKind: 'project', conversationId: 'older' },
        ])

        render(<PinnedConversationsIndicator />)
        fireEvent.click(screen.getByRole('button', { name: 'Pinned conversations: 2' }))

        const rows = await screen.findAllByRole('button', { name: /Review action.*Card one/u })
        expect(dataService.agents.setPinnedConversationsPopupOpen).toHaveBeenCalledWith(true)
        expect(dataService.agents.ensurePinnedConversationsLoaded).toHaveBeenCalledOnce()
        expect(rows.map((row) => row.textContent)).toEqual([
            expect.stringContaining('Newer'),
            expect.stringContaining('Older'),
        ])
    })

    it('opens the exact selected persisted conversation', async () => {
        const conversation = createConversation()
        vi.spyOn(dataService.agents, 'getPinnedConversationsSnapshot').mockReturnValue([conversation])
        vi.spyOn(dataService.conversationPins, 'getSnapshot').mockReturnValue([
            { cardInternalId: 'card-1', contextKind: 'card', conversationId: conversation.id },
        ])
        const openPersistedConversation = vi.spyOn(cardPopupService, 'openPersistedConversation').mockReturnValue(true)
        render(<PinnedConversationsIndicator />)
        fireEvent.click(screen.getByRole('button', { name: 'Pinned conversations: 1' }))

        fireEvent.click(await screen.findByRole('button', { name: /Pinned discussion/u }))

        expect(openPersistedConversation).toHaveBeenCalledWith(conversation, expect.any(HTMLElement))
        expect(dataService.agents.setPinnedConversationsPopupOpen).toHaveBeenLastCalledWith(false)
        expect(screen.queryByRole('heading', { name: 'Pinned conversations' })).not.toBeInTheDocument()
    })

    it('keeps unavailable targets visible and selectable for error reporting', async () => {
        hookState.actions = []
        const conversation = createConversation({ actionId: 'missing-action' })
        vi.spyOn(dataService.agents, 'getPinnedConversationsSnapshot').mockReturnValue([conversation])
        vi.spyOn(dataService.conversationPins, 'getSnapshot').mockReturnValue([
            { cardInternalId: 'card-1', contextKind: 'card', conversationId: conversation.id },
        ])
        const openPersistedConversation = vi.spyOn(cardPopupService, 'openPersistedConversation').mockReturnValue(false)
        render(<PinnedConversationsIndicator />)
        fireEvent.click(screen.getByRole('button', { name: 'Pinned conversations: 1' }))

        const row = await screen.findByRole('button', { name: /Action unavailable/u })
        expect(row).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(row)

        expect(openPersistedConversation).toHaveBeenCalledWith(conversation, expect.any(HTMLElement))
        expect(screen.getByRole('heading', { name: 'Pinned conversations' })).toBeInTheDocument()
    })
})
