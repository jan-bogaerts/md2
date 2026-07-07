import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardViewNavigation } from '../card_view/card_view_navigation'
import { LeftPanelSlot } from './left_panel_slot'
import { LeftPanelSlotProvider } from './left_panel_slot_provider'
import { LeftPanelTarget } from './left_panel_target'

function card(id: string, status: string): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [],
            after: null,
            agentLogReferences: [],
            author: null,
            id,
            internalId: null,
            owner: null,
            policy: {},
            status,
            title: id,
        },
        headerFields: {},
        isActive: true,
        path: `design/${id}.md`,
    }
}

function renderColumnSlot(cards: ProjectCard[]) {
    return render(
        <AppThemeProvider>
            <LeftPanelSlotProvider>
                <LeftPanelTarget fallback="No project navigation available." />
                <LeftPanelSlot>
                    <CardViewNavigation cards={cards} onNavigate={vi.fn()} />
                </LeftPanelSlot>
            </LeftPanelSlotProvider>
        </AppThemeProvider>,
    )
}

describe('LeftPanelSlot', () => {
    afterEach(cleanup)

    it('updates card columns when cards change without replacing the target', () => {
        const { rerender } = renderColumnSlot([card('F-1', 'todo')])

        expect(screen.getByLabelText('Card columns')).toHaveTextContent('todo')
        expect(screen.queryByText('done')).toBeNull()

        rerender(
            <AppThemeProvider>
                <LeftPanelSlotProvider>
                    <LeftPanelTarget fallback="No project navigation available." />
                    <LeftPanelSlot>
                        <CardViewNavigation cards={[card('F-1', 'todo'), card('F-2', 'done')]} onNavigate={vi.fn()} />
                    </LeftPanelSlot>
                </LeftPanelSlotProvider>
            </AppThemeProvider>,
        )

        expect(screen.getByLabelText('Card columns')).toHaveTextContent('done')
    })
})
