import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, ProjectSnapshot } from '../../data/data_types'
import {
    CARD_ADDED_EVENT,
    CARD_REMOVED_EVENT,
    cardCollectionFieldChangedEvent,
    dataService,
} from '../../services/data/data_service'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MobileCardViewMenu } from './mobile_card_view_menu'

function card(id: string, status: string | null): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id, internalId: id, owner: null,
            policy: {}, references: [], status, title: id,
        },
        hasFrontmatter:true,
        isActive: true,
        path: `design/${id}.md`,
    }
}

function menuItem(label: string) {
    return screen.getByRole('menuitem', { name: new RegExp(`^${label}\\s+\\d+$`) })
}

describe('MobileCardViewMenu', () => {
    let snapshot: ProjectSnapshot

    beforeEach(() => {
        snapshot = {
            activeCards: [card('F-1', 'todo'), card('F-2', 'todo'), card('F-3', 'done'), card('F-4', null)],
            backgroundCards: [card('F-5', 'todo')],
            repositoryFiles: [],
            workingFolder: 'design',
        }
        vi.spyOn(dataService, 'getState').mockImplementation(() => ({
            project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
            runningAgents: [],
            snapshot,
        }))
        mobileCardViewService.selectVisibleColumn([])
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('lists configured visible columns with active-card counts and preserves selection behavior', () => {
        const onSelected = vi.fn()
        render(
            <AppThemeProvider>
                <MobileCardViewMenu
                    onSelected={onSelected}
                    states={[
                        { alwaysVisible: false, state: 'done' },
                        { alwaysVisible: true, state: 'blocked' },
                        { alwaysVisible: false, state: 'todo' },
                        { alwaysVisible: false, state: '' },
                        { alwaysVisible: false, state: 'hidden' },
                    ]}
                />
            </AppThemeProvider>,
        )

        const visibleItems = screen.getAllByRole('menuitem')
        expect(visibleItems.map(({ textContent }) => textContent)).toEqual(['done1', 'blocked0', 'todo2', 'Unassigned1'])
        expect(menuItem('done')).toHaveClass('Mui-selected')
        expect(screen.queryByText('hidden')).not.toBeInTheDocument()

        fireEvent.click(menuItem('todo'))

        expect(mobileCardViewService.getSnapshot().selectedColumnStatus).toBe('todo')
        expect(onSelected).toHaveBeenCalledOnce()
        act(() => mobileCardViewService.selectVisibleColumn([]))
    })

    it('updates counts when active cards are added, removed, or moved between statuses', () => {
        render(
            <AppThemeProvider>
                <MobileCardViewMenu
                    onSelected={vi.fn()}
                    states={[
                        { alwaysVisible: true, state: 'todo' },
                        { alwaysVisible: true, state: 'done' },
                    ]}
                />
            </AppThemeProvider>,
        )

        const addedCard = card('F-6', 'done')
        act(() => {
            snapshot = { ...snapshot, activeCards: [...snapshot.activeCards, addedCard] }
            dataService.dispatchEvent(new CustomEvent(CARD_ADDED_EVENT, { detail: { card: addedCard } }))
        })
        expect(menuItem('done')).toHaveTextContent('done2')

        const removedCard = snapshot.activeCards[0]
        act(() => {
            snapshot = { ...snapshot, activeCards: snapshot.activeCards.filter(({ path }) => path !== removedCard.path) }
            dataService.dispatchEvent(new CustomEvent(CARD_REMOVED_EVENT, { detail: { card: removedCard } }))
        })
        expect(menuItem('todo')).toHaveTextContent('todo1')

        const previousCard = snapshot.activeCards.find(({ header }) => header.status === 'todo')!
        const movedCard = { ...previousCard, header: { ...previousCard.header, status: 'done' } }
        act(() => {
            snapshot = {
                ...snapshot,
                activeCards: snapshot.activeCards.map((candidate) => candidate.path === movedCard.path ? movedCard : candidate),
            }
            dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('ordering')))
            dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('status')))
        })

        expect(menuItem('todo')).toHaveTextContent('todo0')
        expect(menuItem('done')).toHaveTextContent('done3')
    })
})
