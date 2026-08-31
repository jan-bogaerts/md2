import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardDragOverlay } from './card_drag_overlay'
import { dataService } from '../../services/data/data_service'
import { cardDragDropService } from './card_drag_drop_service'

const card: Card = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# First',
    header: {
        affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'F-1', internalId: 'one', owner: 'JB',
        policy: {}, references: [], status: 'todo', title: 'First card',
    },
    hasFrontmatter:true,
    isActive: true,
    path: 'design/F-1.md',
}

beforeEach(() => {
    cardDragDropService.endDrag()
    vi.spyOn(dataService, 'getState').mockReturnValue({
        project: null,
        runningAgents: [],
        snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
    })
})

afterEach(() => {
    cardDragDropService.endDrag()
    vi.restoreAllMocks()
})

describe('CardDragOverlay', () => {
    it('renders a pointer-transparent card copy at the active card width', () => {
        cardDragDropService.startDrag(card.path, 107, 235)
        render(
            <AppThemeProvider>
                <CardDragOverlay cardTypes={DEFAULT_CARD_TYPES} />
            </AppThemeProvider>,
        )

        const overlay = screen.getByLabelText('Dragging F-1')
        expect(overlay).toHaveTextContent('First card')
        expect(overlay).toHaveTextContent('JB')
        expect(overlay).toHaveStyle({ pointerEvents: 'none', width: '235px' })
    })
})
