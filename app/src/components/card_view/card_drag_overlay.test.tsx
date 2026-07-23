import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardDragOverlay } from './card_drag_overlay'
import { dataService } from '../../services/data/data_service'

const card: ProjectCard = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# First',
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-1', internalId: 'one', owner: 'JB',
        policy: {}, status: 'todo', title: 'First card',
    },
    headerFields: {},
    isActive: true,
    path: 'design/F-1.md',
}

beforeEach(() => {
    vi.spyOn(dataService, 'getState').mockReturnValue({
        project: null,
        runningAgents: [],
        snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
    })
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('CardDragOverlay', () => {
    it('renders a pointer-transparent card copy at the active card width', () => {
        render(
            <AppThemeProvider>
                <CardDragOverlay cardPath={card.path} cardTypes={DEFAULT_CARD_TYPES} width={235} />
            </AppThemeProvider>,
        )

        const overlay = screen.getByLabelText('Dragging F-1')
        expect(overlay).toHaveTextContent('First card')
        expect(overlay).toHaveTextContent('JB')
        expect(overlay).toHaveStyle({ pointerEvents: 'none', width: '235px' })
    })
})
