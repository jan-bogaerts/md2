import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, StateConfig } from '../../data/data_types'
import { DEFAULT_CARD_TYPES } from '../../data/data_types'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardBodyPopover } from './card_body_popover'

vi.mock('../hooks/use_card_commits', () => ({useCardCommits: () => ({ commits: [], error: null })}))
vi.mock('./card_body_editor', () => ({ CardBodyEditor: () => <div aria-label="Live card editor" /> }))
vi.mock('./card_body_save_status', () => ({ CardBodySaveStatus: () => null }))

function card(id: string, status: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${id}`,
        hasFrontmatter: true,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, references: [], status, title: id, worktree: null, worktreeError: null, worktreeValue: null,
        },
        isActive: true,
        path: `design/${id}.md`,
    }
}

const activeCard = card('F-1', 'todo')
const activeCards = [activeCard, card('F-2', 'done'), card('F-3', 'done')]
const states: StateConfig[] = [
    { alwaysVisible: true, color: '#111111', state: 'todo' },
    { alwaysVisible: true, color: '#222222', state: 'done' },
    { alwaysVisible: true, color: '#333333', state: 'blocked' },
]
const statusColors = new Map(states.map(({ color, state }) => [state, color!]))
let anchorElement: HTMLButtonElement | null = null

function renderPopover(isMobile = false) {
    anchorElement = document.body.appendChild(document.createElement('button'))
    cardPopupService.toggleCardDetails(activeCard.header.internalId!, anchorElement)
    render(
        <AppThemeProvider>
            <CardBodyPopover
                cardTypes={DEFAULT_CARD_TYPES}
                isMobile={isMobile}
                onDeleteCard={vi.fn(async () => undefined)}
                onOpenAffects={vi.fn()}
                onOpenInFileMode={vi.fn()}
                states={states}
                statusColors={statusColors}
                visible
            />
        </AppThemeProvider>,
    )

    return screen.getByRole('dialog', { name: 'F-1 card details' })
}

function selectState(dialog: HTMLElement, state: string) {
    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: 'Card state' }))
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: state }))
}

describe('CardBodyPopover state selector', () => {
    beforeEach(() => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: { activeCards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        vi.spyOn(dataService.cards, 'moveCard').mockResolvedValue([])
    })

    afterEach(() => {
        cleanup()
        cardPopupService.clear()
        anchorElement?.remove()
        anchorElement = null
        vi.restoreAllMocks()
    })

    it('shows current state and configured options in configured order', () => {
        const dialog = renderPopover()
        const selector = within(dialog).getByRole('combobox', { name: 'Card state' })

        expect(selector).toHaveTextContent('todo')
        fireEvent.mouseDown(selector)
        const options = within(screen.getByRole('listbox')).getAllByRole('option')
        expect(options.map((option) => option.textContent)).toEqual(['todo', 'done', 'blocked'])
    })

    it('moves to end of latest destination column and keeps popup open', async () => {
        const dialog = renderPopover()

        selectState(dialog, 'done')

        await waitFor(() => expect(dataService.cards.moveCard).toHaveBeenCalledWith(activeCard.path, 'done', 2))
        expect(dialog).toBeInTheDocument()
    })

    it('does no move work when current state is selected', () => {
        const dialog = renderPopover()

        selectState(dialog, 'todo')

        expect(dataService.cards.moveCard).not.toHaveBeenCalled()
        expect(dialog).toBeInTheDocument()
    })

    it('reports move failure with card path and keeps popup usable', async () => {
        const error = new Error('Move failed')
        vi.mocked(dataService.cards.moveCard).mockRejectedValueOnce(error)
        const reportError = vi.spyOn(dialogService, 'error')
        const dialog = renderPopover()

        selectState(dialog, 'done')

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(error, {fallbackMessage: `Card move failed: ${activeCard.path}`}))
        expect(within(dialog).getByRole('combobox', { name: 'Card state' })).toBeEnabled()
    })

    it.each([
        { closeButton: true, isMobile: false },
        { closeButton: false, isMobile: true },
    ])('places selector after footer spacer when isMobile is $isMobile', ({ closeButton, isMobile }) => {
        const dialog = renderPopover(isMobile)
        const footer = dialog.querySelector('[data-card-details-footer="true"]')
        const selector = footer?.querySelector('[data-card-state-selector="true"]')
        const spacer = footer?.querySelector('[data-card-details-footer-spacer="true"]')

        expect(footer).not.toBeNull()
        expect(selector?.previousElementSibling).toBe(spacer)
        expect(within(footer as HTMLElement).getByRole('combobox', { name: 'Card state' })).toBeInTheDocument()
        if (closeButton) {
            expect(selector?.nextElementSibling).toHaveRole('button')
        } else {
            expect(selector?.nextElementSibling).toBeNull()
            expect(within(footer as HTMLElement).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
            expect(within(footer as HTMLElement).getByRole('button', { name: 'Affects' })).toBeInTheDocument()
            expect(within(footer as HTMLElement).getByRole('button', { name: 'Open in file mode' })).toBeInTheDocument()
        }
    })
})
