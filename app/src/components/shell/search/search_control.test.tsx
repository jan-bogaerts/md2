import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardHeader, ProjectCard, ProjectSnapshot } from '../../../data/data_types'
import { actionService } from '../../../services/actions/action_service'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../../services/project/workspace_view_service'
import { DialogDisplay } from '../../dialog_display'
import { SearchControl } from './search_control'

function makeHeader(overrides: Partial<CardHeader> = {}): CardHeader {
    return {
        affects: [],
        after: null,
        agentLogReferences: [],
        author: null,
        id: 'F-1',
        internalId: null,
        owner: null,
        policy: {},
        status: null,
        title: 'Untitled',
        ...overrides,
    }
}

function makeCard(path: string, content: string, header: Partial<CardHeader>, isActive: boolean): ProjectCard {
    return { agentConversationErrors: [], agentConversations: [], content, headerFields: {}, header: makeHeader(header), isActive, path }
}

const snapshot: ProjectSnapshot = {
    activeCards: [
        makeCard('design/F-1-alpha.md', '# Alpha\n\nBody of alpha.', { id: 'F-1', title: 'Alpha feature' }, true),
        makeCard('design/F-2-beta.md', '# Beta\n\nBody with secret keyword.', { id: 'F-2', title: 'Beta feature' }, true),
    ],
    backgroundCards: [
        makeCard('design/history/note.md', '# Note\n\nHidden secret text.', { id: 'H-1', title: 'History note', status: 'archived' }, false),
    ],
    repositoryFiles: [],
    workingFolder: 'design',
}

vi.mock('../../hooks/use_project_state', () => ({ useProjectState: () => ({ project: null, runningAgents: [], snapshot }) }))

function focusSearch() {
    fireEvent.focus(screen.getByRole('textbox', { name: 'Search project' }))
}

function typeQuery(value: string) {
    focusSearch()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project' }), { target: { value } })
}

describe('SearchControl', () => {
    afterEach(cleanup)
    afterEach(() => {
        actionService.clear()
        workspaceViewService.setViewMode('cards')
    })

    it('shows the search controls in a dropdown only while search is focused', () => {
        render(<SearchControl />)

        expect(screen.queryByRole('button', { name: 'RegExp mode' })).not.toBeInTheDocument()

        focusSearch()

        expect(screen.getByRole('region', { name: 'Search dropdown' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'RegExp mode' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Search background file bodies' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Search actions' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Ask agent to build a RegExp' })).toBeInTheDocument()
    })

    it('shows a focused search popover from the mobile search icon', () => {
        render(<SearchControl isMobile />)

        expect(screen.queryByRole('textbox', { name: 'Search project' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Search' }))

        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveFocus()
        expect(screen.getByRole('region', { name: 'Search dropdown' })).toBeInTheDocument()
    })

    it('shows grouped results for a plain text search', () => {
        render(<SearchControl />)

        typeQuery('feature')

        expect(screen.getByText('Active cards')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Alpha feature/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Beta feature/ })).toBeInTheDocument()
    })

    it('searches background cards by header and groups them by folder', () => {
        render(<SearchControl />)

        typeQuery('archived')

        expect(screen.getByText('history')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /History note/ })).toBeInTheDocument()
    })

    it('includes background bodies only when the full-body toggle is on', () => {
        render(<SearchControl />)

        typeQuery('Hidden secret')
        expect(screen.queryByRole('button', { name: /History note/ })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Search background file bodies' }))

        expect(screen.getByRole('button', { name: /History note/ })).toBeInTheDocument()
    })

    it('includes actions only when the action toggle is on and opens the action popup', () => {
        actionService.loadFromFiles([{
            content: JSON.stringify({
                command: 'execute', description: 'Searchable action', id: 'action-search-job',
                label: 'Run search job', type: 'command',
            }),
            path: 'actions/search-job.json',
        }])
        render(<SearchControl />)

        typeQuery('Searchable action')
        expect(screen.queryByText('Actions')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Search actions' }))
        fireEvent.click(screen.getByRole('button', { name: /Run search job/ }))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Run search job' })).toBeInTheDocument()
    })

    it('opens action search results in an editor tab from text view', () => {
        const listener = vi.fn()
        workspaceNavigationService.addEventListener('open', listener)
        workspaceViewService.setViewMode('text')
        actionService.loadFromFiles([{
            content: JSON.stringify({
                command: 'execute', description: 'Searchable action', id: 'action-search-job',
                label: 'Run search job', type: 'command',
            }),
            path: 'actions/search-job.json',
        }])
        render(<SearchControl />)

        typeQuery('Searchable action')
        fireEvent.click(screen.getByRole('button', { name: 'Search actions' }))
        fireEvent.click(screen.getByRole('button', { name: /Run search job/ }))

        const event = listener.mock.calls[0][0] as CustomEvent<{ path: string }>
        expect(event.detail.path).toBe('actions/search-job.json')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        workspaceNavigationService.removeEventListener('open', listener)
    })

    it('reports an invalid RegExp without clearing the previous results', () => {
        render(
            <>
                <DialogDisplay />
                <SearchControl />
            </>,
        )

        focusSearch()
        fireEvent.click(screen.getByRole('button', { name: 'RegExp mode' }))
        typeQuery('feature')
        expect(screen.getByRole('button', { name: /Alpha feature/ })).toBeInTheDocument()

        typeQuery('(feature')

        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Alpha feature/ })).toBeInTheDocument()
    })

    it('navigates to the selected result through the navigation service', () => {
        const listener = vi.fn()
        workspaceNavigationService.addEventListener('open', listener)
        render(<SearchControl />)

        typeQuery('Alpha')
        fireEvent.click(screen.getByRole('button', { name: /Alpha feature/ }))

        const event = listener.mock.calls[0][0] as CustomEvent<{ path: string }>
        expect(event.detail.path).toBe('design/F-1-alpha.md')
        workspaceNavigationService.removeEventListener('open', listener)
    })

    it('populates the query from a successful agent request', async () => {
        const regexpAgent = vi.fn().mockResolvedValue('Beta')
        render(<SearchControl regexpAgent={regexpAgent} />)

        typeQuery('find the beta card')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('Beta'))
        expect(await screen.findByRole('button', { name: /Beta feature/ })).toBeInTheDocument()
    })

    it('surfaces an agent failure without changing the current query', async () => {
        const regexpAgent = vi.fn().mockRejectedValue(new Error('agent offline'))
        render(
            <>
                <DialogDisplay />
                <SearchControl regexpAgent={regexpAgent} />
            </>,
        )

        typeQuery('alpha only')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByText('agent offline')).toBeInTheDocument())
        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('alpha only')
    })
})
