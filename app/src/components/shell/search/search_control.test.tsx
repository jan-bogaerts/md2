import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardHeader, ProjectCard, ProjectSnapshot } from '../../../data/data_types'
import { workspaceNavigationService } from '../../../services/workspace_navigation_service'
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
    return { agentConversationErrors: [], agentConversations: [], content, header: makeHeader(header), isActive, path }
}

const snapshot: ProjectSnapshot = {
    activeCards: [
        makeCard('design/F-1-alpha.md', '# Alpha\n\nBody of alpha.', { id: 'F-1', title: 'Alpha feature' }, true),
        makeCard('design/F-2-beta.md', '# Beta\n\nBody with secret keyword.', { id: 'F-2', title: 'Beta feature' }, true),
    ],
    backgroundCards: [
        makeCard('design/history/note.md', '# Note\n\nHidden secret text.', { id: 'H-1', title: 'History note', status: 'archived' }, false),
    ],
    workingFolder: 'design',
}

vi.mock('../../hooks/use_project_state', () => ({ useProjectState: () => ({ project: null, runningAgents: [], snapshot }) }))

function typeQuery(value: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Search project' }), { target: { value } })
}

describe('SearchControl', () => {
    afterEach(cleanup)

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

    it('reports an invalid RegExp without clearing the previous results', () => {
        render(<SearchControl />)

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
        render(<SearchControl regexpAgent={regexpAgent} />)

        typeQuery('alpha only')
        fireEvent.click(screen.getByRole('button', { name: 'Ask agent to build a RegExp' }))

        await waitFor(() => expect(screen.getByText('agent offline')).toBeInTheDocument())
        expect(screen.getByRole('textbox', { name: 'Search project' })).toHaveValue('alpha only')
    })
})
