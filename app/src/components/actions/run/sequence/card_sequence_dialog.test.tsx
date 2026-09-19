import { DndContext } from '@dnd-kit/core'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../../../data/data_types'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { CardSequenceDialog } from './card_sequence_dialog'
import { CardSequenceDraftService } from './card_sequence_draft_service'

const testState = vi.hoisted(() => ({
    actions: [{ description: 'Build selected cards', id: 'build', label: 'Build', prompt: 'Build', type: 'agent' }],
    register: vi.fn(async () => undefined),
}))

vi.mock('./card_sequence_registration', () => ({ registerCardSequence: testState.register }))
vi.mock('../../../hooks/use_actions', () => ({useActions: () => ({ actions: testState.actions, error: null })}))
vi.mock('../../../hooks/use_project_config', () => ({
    useProjectConfig: () => ({
        cardTypes: DEFAULT_CARD_TYPES,
        states: [{ alwaysVisible: true, state: 'todo' }, { alwaysVisible: true, state: 'ready' }],
    }),
}))
vi.mock('../../../hooks/use_claude_rate_limits', () => ({useClaudeRateLimits: () => ({ receivedAt: null, snapshot: null, stale: false })}))
vi.mock('../../../hooks/use_codex_rate_limits', () => ({useCodexRateLimits: () => ({ receivedAt: null, snapshot: null, stale: false })}))

function card(id: string, internalId: string): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, changedFiles: [], id, internalId,
            owner: null, policy: {}, references: [], status: 'todo', title: `${id} title`, worktree: null,
            worktreeError: null, worktreeValue: null,
        },
        path: `design/${id}.md`,
    }
}

const cards = [card('F-1', 'card-1'), card('F-2', 'card-2')]
function renderDialog(service: CardSequenceDraftService) {
    render(
        <AppThemeProvider>
            <DndContext>
                <CardSequenceDialog service={service} />
            </DndContext>
        </AppThemeProvider>,
    )
}

describe('CardSequenceDialog', () => {
    beforeEach(() => {
        projectAccessService.setReadOnly(false)
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
            runningAgents: [],
            snapshot: { activeCards: cards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        testState.register.mockClear()
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('adds, selects, and removes active cards with keyboard-accessible controls', async () => {
        const service = new CardSequenceDraftService()
        service.open()
        renderDialog(service)

        fireEvent.click(screen.getByRole('button', { name: 'Add cards' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'F-1 · F-1 title' }))
        expect(within(screen.getByRole('listbox', { name: 'Sequence cards' })).getByText(/F-1 title/u)).toBeInTheDocument()

        fireEvent.click(screen.getByText(/F-1 title/u))
        fireEvent.keyDown(screen.getByRole('listbox', { name: 'Sequence cards' }).parentElement!, { key: 'Delete' })

        await waitFor(() => expect(screen.queryByText(/F-1 title/u)).not.toBeInTheDocument())
    })

    it('submits canonical ids and closes only after registration succeeds', async () => {
        const service = new CardSequenceDraftService()
        service.open()
        renderDialog(service)
        fireEvent.click(screen.getByRole('button', { name: 'Add cards' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'F-1 · F-1 title' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Build' })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Build' }))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Ready state' }))
        fireEvent.click(screen.getByRole('option', { name: 'ready' }))

        await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))

        await waitFor(() => expect(testState.register).toHaveBeenCalledWith({actionId: 'build', cardInternalIds: ['card-1'], readyState: 'ready', trigger: { type: 'now' }}))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card sequence' })).not.toBeInTheDocument())
    })

    it('keeps draft open and reports failed registration', async () => {
        const failure = new Error('disk full')
        testState.register.mockRejectedValueOnce(failure)
        const report = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as never)
        const service = new CardSequenceDraftService()
        service.open()
        renderDialog(service)
        act(() => {
            service.addCard('card-1')
        })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Build' })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Build' }))
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Ready state' }))
        fireEvent.click(screen.getByRole('option', { name: 'ready' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))

        await waitFor(() => expect(report).toHaveBeenCalledWith(failure, { fallbackMessage: 'Card sequence could not be registered' }))
        expect(screen.getByRole('dialog', { name: 'Add card sequence' })).toBeInTheDocument()
        expect(service.getSnapshot().cardInternalIds).toEqual(['card-1'])
    })

    it('uses Schedule for non-now triggers and excludes sequence members as trigger cards', async () => {
        const service = new CardSequenceDraftService()
        service.open()
        renderDialog(service)
        act(() => service.addCard('card-1'))
        fireEvent.click(screen.getByRole('radio', { name: 'When another card enters state' }))

        expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled()
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Card' }))
        expect(screen.queryByRole('option', { name: /F-1/u })).not.toBeInTheDocument()
        expect(screen.getByRole('option', { name: /F-2/u })).toBeInTheDocument()
    })
})
