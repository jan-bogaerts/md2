import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardHeader, Card, ProjectSnapshot } from '../../../data/data_types'
import { actionService } from '../../../services/actions/action_service'
import { ACTIONS_CHANGED_EVENT } from '../../../services/actions/action_service_events'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../../services/project/workspace_view_service'
import { DialogDisplay } from '../../dialog_display'
import { AppThemeProvider } from '../../../theme/theme_provider'
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
        references: [],
        status: null,
        title: 'Untitled',
        ...overrides,
    }
}

function makeCard(path: string, content: string, header: Partial<CardHeader>, isActive: boolean): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content, hasFrontmatter: true,
        header: makeHeader(header), isActive, path,
    }
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
        window.localStorage.removeItem('search-panel-results-size')
    })

    it('subscribes to project data only while search is open', () => {
        const addEventListener = vi.spyOn(actionService, 'addEventListener')
        render(<SearchControl />)

        expect(addEventListener).not.toHaveBeenCalledWith(ACTIONS_CHANGED_EVENT, expect.any(Function))

        focusSearch()

        expect(addEventListener).toHaveBeenCalledWith(ACTIONS_CHANGED_EVENT, expect.any(Function))
    })

    it('shows the search controls in a dropdown only while search is focused', () => {
        render(<SearchControl />)

        expect(screen.queryByRole('button', { name: 'RegExp mode' })).not.toBeInTheDocument()

        focusSearch()

        expect(screen.getByRole('dialog', { name: 'Search dropdown' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'RegExp mode' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Search background file bodies' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Search actions' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Ask agent to build a RegExp' })).toBeInTheDocument()
    })

    it('can be resized by dragging its lower-right corner handle and persists the chosen size', () => {
        render(<SearchControl />)

        focusSearch()

        const dialog = screen.getByRole('dialog', { name: 'Search dropdown' })
        const handle = screen.getByRole('separator', { name: 'Resize search results' })

        expect(dialog.style.width).toBe('460px')
        expect(dialog.style.height).toBe('420px')

        fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 40, clientY: 30, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog.style.width).toBe('500px')
        expect(dialog.style.height).toBe('450px')
        expect(window.localStorage.getItem('search-panel-results-size')).toBe(JSON.stringify({ height: 450, width: 500 }))
    })

    it('shows a focused search popover from the mobile search icon', () => {
        render(<SearchControl isMobile />)

        expect(screen.queryByRole('textbox', { name: 'Search project' })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Search' }))

        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveFocus()
        expect(screen.getByRole('dialog', { name: 'Search dropdown' })).toBeInTheDocument()
    })

    it('highlights a case-insensitive plain text match while preserving its context', () => {
        render(<SearchControl />)

        typeQuery('FEATURE')

        expect(screen.getByText('Active cards')).toBeInTheDocument()
        const alphaResult = screen.getByRole('button', { name: /Alpha feature/ })
        const highlight = within(alphaResult).getByText('feature')
        expect(highlight.tagName).toBe('MARK')
        expect(alphaResult).toHaveTextContent('design/F-1-alpha.md — Alpha feature')
        expect(screen.getByRole('button', { name: /Beta feature/ })).toBeInTheDocument()
    })

    it('highlights a RegExp match while preserving its context', () => {
        render(<SearchControl />)

        focusSearch()
        fireEvent.click(screen.getByRole('button', { name: 'RegExp mode' }))
        typeQuery('f[a-z]+')

        const alphaResult = screen.getByRole('button', { name: /Alpha feature/ })
        const highlight = within(alphaResult).getByText('feature')
        expect(highlight.tagName).toBe('MARK')
        expect(alphaResult).toHaveTextContent('design/F-1-alpha.md — Alpha feature')
    })

    it('renders normalized context as plain text when the RegExp cannot be relocated', () => {
        render(<SearchControl />)

        focusSearch()
        fireEvent.click(screen.getByRole('button', { name: 'RegExp mode' }))
        typeQuery('# Alpha\\s{2}Body')

        const alphaResult = screen.getByRole('button', { name: /Alpha feature/ })
        expect(alphaResult.querySelector('mark')).toBeNull()
        expect(alphaResult).toHaveTextContent('design/F-1-alpha.md — # Alpha Body of alpha.')
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
        render(<AppThemeProvider><SearchControl /></AppThemeProvider>)

        typeQuery('Searchable action')
        expect(screen.queryByText('Actions')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Search actions' }))
        const actionResult = screen.getByRole('button', { name: /Run search job/ })
        expect(within(actionResult).getByText('Searchable action').tagName).toBe('MARK')
        fireEvent.click(actionResult)

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        expect(dialog.getByRole('button', { name: 'Run search job' })).toHaveAttribute('aria-pressed', 'true')
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
