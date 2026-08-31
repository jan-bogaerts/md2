import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { CardPropertiesPanel } from './card_properties_panel'

const card: Card = {
    agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true,
    header: {
        affects: [], after: null, agentLogReferences: [], author: 'JB', id: 'F-1', internalId: 'card-1',
        changedFiles: [], owner: null, policy: {}, references: [], status: 'design', title: 'Alpha', worktree: null, worktreeError: null, worktreeValue: null,
    },
    path: 'design/F-1.md',
}

function renderPanel(activeCard: Card = card, cardTypes = DEFAULT_CARD_TYPES) {
    vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(activeCard)
    const updateAuthor = vi.spyOn(cardMarkdownDataSource, 'updateActiveCardHeaderField').mockImplementation(() => undefined)
    const updateTitle = vi.spyOn(cardMarkdownDataSource, 'updateActiveCardTitle').mockImplementation(() => undefined)
    const updateType = vi.spyOn(cardMarkdownDataSource, 'updateActiveCardType').mockResolvedValue(undefined)
    const togglePolicy = vi.spyOn(cardMarkdownDataSource, 'toggleActiveCardPolicy').mockImplementation(() => undefined)
    render(
        <AppThemeProvider>
            <CardPropertiesPanel
                binding="list-card"
                cardTypes={cardTypes}
                statusColors={new Map([['design', '#123456']])}
            />
        </AppThemeProvider>,
    )

    return { togglePolicy, updateAuthor, updateTitle, updateType }
}

describe('CardPropertiesPanel', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows only requested properties and empty Affects state', () => {
        renderPanel()
        const properties = within(screen.getByLabelText('Card properties'))

        expect(properties.getByText('Title')).toBeInTheDocument()
        expect(properties.getByText('Status')).toBeInTheDocument()
        expect(properties.getByText('Author')).toBeInTheDocument()
        expect(properties.getByText('Affects')).toBeInTheDocument()
        expect(properties.getByText('Changed files')).toBeInTheDocument()
        expect(properties.getByText('Policy')).toBeInTheDocument()
        expect(properties.getAllByText('None')).toHaveLength(2)
        expect(properties.queryByText('Owner')).not.toBeInTheDocument()
        expect(properties.queryByText('Agents')).not.toBeInTheDocument()
        expect(properties.queryByText('Internal ID')).not.toBeInTheDocument()
    })

    it('shows changed files with full comma-separated value in title', () => {
        renderPanel({ ...card, header: { ...card.header, changedFiles: ['app/src/a.ts', 'desktop/main.js'] } })

        const value = screen.getByText('app/src/a.ts, desktop/main.js')
        expect(value).toHaveAttribute('title', 'app/src/a.ts, desktop/main.js')
    })

    it('commits Title and Author edits through the active card data source', () => {
        const { updateAuthor, updateTitle } = renderPanel()

        fireEvent.change(screen.getByLabelText('Card title'), { target: { value: 'Beta' } })
        fireEvent.blur(screen.getByLabelText('Card title'))
        fireEvent.change(screen.getByLabelText('Card author'), { target: { value: 'AB' } })
        fireEvent.blur(screen.getByLabelText('Card author'))

        expect(updateTitle).toHaveBeenCalledWith('list-card', 'Beta')
        expect(updateAuthor).toHaveBeenCalledWith('list-card', 'author', 'AB')
    })

    it('selects Manual or Auto-merge through the policy chip', () => {
        const { togglePolicy } = renderPanel()

        fireEvent.mouseDown(screen.getByLabelText('Card policy'))
        fireEvent.click(screen.getByRole('option', { name: 'Auto-merge' }))

        expect(togglePolicy).toHaveBeenCalledWith('list-card', 'autoMerge')
    })

    it('shows custom card types and changes the active binding type', () => {
        const customTypes = [
            ...DEFAULT_CARD_TYPES,
            { color: '#333333', idPrefix: 'T', label: 'Task', type: 'task' },
        ]
        const { updateType } = renderPanel(card, customTypes)

        fireEvent.mouseDown(screen.getByLabelText('Card type'))
        expect(screen.getByRole('option', { name: 'Feature' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Bug' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('option', { name: 'Task' }))

        expect(updateType).toHaveBeenCalledWith('list-card', 'task')
    })

    it('shows a non-collapsible section heading', () => {
        renderPanel()

        expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Properties/ })).not.toBeInTheDocument()
        expect(screen.getByLabelText('Card title')).toBeVisible()
    })
})
