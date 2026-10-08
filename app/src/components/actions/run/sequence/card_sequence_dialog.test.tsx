import { DndContext } from '@dnd-kit/core'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../../../data/data_types'
import { cardCollectionFieldChangedEvent, dataService } from '../../../../services/data/data_service'
import { cardPopupService } from '../../../../services/card_popup_service';
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
    cardPopupService.openSequence(document.body);
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
        cardPopupService.clear();
        vi.restoreAllMocks()
    })

    it('refreshes choices and invalidates selected cards when worktree assignment changes', async () => {
        const selected = card('F-1', 'card-1');
        const candidate = card('F-2', 'card-2');
        vi.mocked(dataService.getState).mockReturnValue({
            project: { branch: 'main', id: 'project', rootPath: 'C:\\project' }, runningAgents: [],
            snapshot: { activeCards: [selected, candidate], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        });
        const service = new CardSequenceDraftService();
        service.open();
        renderDialog(service);
        act(() => { service.addCard('card-1'); service.setActionId('build'); service.setReadyState('ready'); });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
        act(() => {
            candidate.header.worktreeError = 'Missing checkout';
            selected.header.worktree = 1;
            dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('worktree')));
        });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled());
        expect(service.getSnapshot().validationMessage).toBe('Sequence cards cannot have a worktree assignment');
        fireEvent.click(screen.getByRole('button', { name: 'Add cards' }));
        expect(screen.queryByRole('menuitem', { name: /F-2/u })).not.toBeInTheDocument();
    });

    it('preserves mobile draft while another popup is active and restores it on activation', async () => {
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
            matches: query.includes('max-width'), media: query, onchange: null,
            addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
        }));
        const service = new CardSequenceDraftService();
        service.open();
        renderDialog(service);
        act(() => service.addCard('card-1'));
        const entry = cardPopupService.getSnapshot().find(({ kind }) => kind === 'sequence')!;
        act(() => cardPopupService.showCardDetails('card-2', document.body));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add card sequence' })).not.toBeInTheDocument());
        expect(service.getSnapshot().cardInternalIds).toEqual(['card-1']);
        act(() => cardPopupService.activate(entry.id));
        expect(await screen.findByRole('dialog', { name: 'Add card sequence' })).toBeInTheDocument();
        expect(within(screen.getByRole('listbox', { name: 'Sequence cards' })).getByText(/F-1 title/u)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(service.getSnapshot().open).toBe(false);
        expect(cardPopupService.getSnapshot().some(({ kind }) => kind === 'sequence')).toBe(false);
    });

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
