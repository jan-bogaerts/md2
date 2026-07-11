import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardDragOverlay } from './card_drag_overlay'

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

describe('CardDragOverlay', () => {
    it('renders a pointer-transparent card copy at the active card width', () => {
        render(
            <AppThemeProvider>
                <CardDragOverlay card={card} cardTypes={DEFAULT_CARD_TYPES} width={235} />
            </AppThemeProvider>,
        )

        const overlay = screen.getByLabelText('Dragging F-1')
        expect(overlay).toHaveTextContent('First card')
        expect(overlay).toHaveTextContent('JB')
        expect(overlay).toHaveStyle({ pointerEvents: 'none', width: '235px' })
    })
})
