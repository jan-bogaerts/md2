import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardView } from './card_view'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'

function card(id: string, title: string, status: string, policy: Record<string, string> = {}): ProjectCard {
    return {
        content: `# ${title}\n\nBody of ${id}`,
        header: { affects: [], after: null, id, internalId: id.toLowerCase(), owner: null, policy, status, title },
        isActive: true,
        path: `design/${id}.md`,
    }
}

const cards = [
    card('F-1', 'First', 'todo', { checkLinting: 'true', requireTests: 'false' }),
    card('F-2', 'Second', 'done'),
]

function renderCardView(overrides: Partial<Parameters<typeof CardView>[0]> = {}) {
    const handlers = {
        onBodyChange: vi.fn(),
        onMoveCard: vi.fn(),
        onOpenInFileMode: vi.fn(),
        onTitleChange: vi.fn(),
        onTogglePolicy: vi.fn(),
    }

    render(
        <CardView
            cardTypes={DEFAULT_CARD_TYPES}
            cards={cards}
            isMobile={false}
            {...handlers}
            {...overrides}
        />,
    )

    return handlers
}

describe('CardView', () => {
    afterEach(cleanup)

    it('groups cards into a column per status with id and title', () => {
        renderCardView()

        expect(screen.getByText('todo')).toBeInTheDocument()
        expect(screen.getByText('done')).toBeInTheDocument()
        expect(screen.getByText('F-1')).toBeInTheDocument()
        expect(screen.getByText('First')).toBeInTheDocument()
    })

    it('renders one policy led per policy flag and toggles on click', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Toggle checkLinting' }))

        expect(handlers.onTogglePolicy).toHaveBeenCalledWith('design/F-1.md', 'checkLinting')
    })

    it('edits the title inline on double-click and commits on Enter', () => {
        const handlers = renderCardView()

        fireEvent.doubleClick(screen.getByText('First'))
        const input = screen.getByDisplayValue('First')
        fireEvent.change(input, { target: { value: 'Renamed' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(handlers.onTitleChange).toHaveBeenCalledWith('design/F-1.md', 'Renamed')
    })

    it('opens the body in a dialog on desktop when a card is clicked', () => {
        renderCardView()

        fireEvent.click(screen.getByText('First'))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText('F-1 First')).toBeInTheDocument()
        expect(within(dialog).getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
    })

    it('routes the file-mode action from the dialog to the callback', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByText('First'))
        fireEvent.click(screen.getByRole('button', { name: 'Open in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
    })

    it('expands the body inline as an accordion on mobile instead of a dialog', () => {
        renderCardView({ isMobile: true })

        fireEvent.click(screen.getByText('First'))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
    })
})
