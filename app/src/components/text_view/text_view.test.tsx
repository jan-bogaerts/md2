import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextView } from './text_view'
import { DEFAULT_CARD_TYPES, type AgentConversation, type ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'

function conversation(): AgentConversation {
    return {
        cardPath: 'design/F-1-a.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        events: [],
        id: 'agent-1',
        messages: [{ content: 'editor output', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:01:00.000Z' }],
        path: '.md2-agent-logs/one.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Editor agent',
    }
}

function card(path: string, overrides: Partial<ProjectCard['header']> = {}, content = ''): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content,
        header: {
            affects: [],
            after: null,
            agentLogReferences: [],
            author: null,
            id: 'F-0',
            internalId: null,
            owner: null,
            policy: {},
            status: null,
            title: 'Untitled',
            ...overrides,
        },
        isActive: false,
        path,
    }
}

const activeCards = [
    card('design/F-1-a.md', { id: 'F-1', title: 'Alpha', status: 'todo' }, '# Alpha\n\nBody A'),
    card('design/F-2-b.md', { id: 'F-2', title: 'Beta', status: 'done' }, '# Beta\n\nBody B'),
]
const backgroundCards = [card('design/history/rel1/F-9-old.md', { id: 'F-9', title: 'Old' }, '# Old')]

function renderTextView(overrides: Partial<Parameters<typeof TextView>[0]> = {}) {
    const onBodyChange = vi.fn()
    const onDeleteFile = vi.fn(async () => undefined)
    const onHeaderFieldChange = vi.fn()

    render(
        <TextView
            activeCards={activeCards}
            backgroundCards={backgroundCards}
            cardTypes={DEFAULT_CARD_TYPES}
            isMobile={false}
            onBodyChange={onBodyChange}
            onContinueAgentConversation={vi.fn()}
            onDeleteFile={onDeleteFile}
            onHeaderFieldChange={onHeaderFieldChange}
            onSendAgentInput={vi.fn()}
            onStartAgentConversation={vi.fn()}
            requestedNonce={0}
            requestedPath={null}
            workingFolder="design"
            {...overrides}
        />,
    )

    return { onBodyChange, onDeleteFile, onHeaderFieldChange }
}

/** Click a file leaf inside the tree region (avoids matching the same label in an open tab). */
function clickTreeFile(label: string) {
    fireEvent.click(within(screen.getByLabelText('File tree')).getByText(label))
}

describe('TextView', () => {
    afterEach(cleanup)

    it('renders a tree with status groups and special folders', () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        expect(tree.getByText('todo')).toBeInTheDocument()
        expect(tree.getByText('done')).toBeInTheDocument()
        expect(tree.getByText('history')).toBeInTheDocument()
        expect(tree.getByText('F-1 Alpha')).toBeInTheDocument()
    })

    it('opens a file in a tab when its tree node is clicked', () => {
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(screen.getByRole('tab', { name: /Alpha/ })).toBeInTheDocument()
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('focuses the existing tab instead of duplicating when a file is reopened', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        clickTreeFile('F-2 Beta')
        clickTreeFile('F-1 Alpha')

        expect(screen.getAllByRole('tab', { name: /Alpha/ })).toHaveLength(1)
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('closes a tab from the tab bar', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        clickTreeFile('F-2 Beta')
        fireEvent.click(screen.getByRole('button', { name: 'Close F-1 Alpha' }))

        expect(screen.queryByRole('tab', { name: /Alpha/ })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Beta/ })).toBeInTheDocument()
    })

    it('confirms tree deletion and closes the matching open tab after success', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const { onDeleteFile } = renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: 'Delete design/F-1-a.md' }))

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('design/F-1-a.md'))
        expect(onDeleteFile).toHaveBeenCalledWith('design/F-1-a.md')
        await waitFor(() => expect(screen.queryByRole('tab', { name: /Alpha/ })).not.toBeInTheDocument())

        confirm.mockRestore()
    })

    it('persists edits to the active file through onBodyChange', () => {
        const { onBodyChange } = renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited body' } })

        expect(onBodyChange).toHaveBeenCalledWith('design/F-1-a.md', 'Edited body')
    })

    it('opens the requested file when the open nonce changes', () => {
        const shared = {
            activeCards,
            backgroundCards,
            cardTypes: DEFAULT_CARD_TYPES,
            isMobile: false,
            onBodyChange: vi.fn(),
            onContinueAgentConversation: vi.fn(),
            onDeleteFile: vi.fn(async () => undefined),
            onHeaderFieldChange: vi.fn(),
            onSendAgentInput: vi.fn(),
            onStartAgentConversation: vi.fn(),
            workingFolder: 'design',
        }
        const { rerender } = render(<TextView {...shared} requestedNonce={0} requestedPath={null} />)

        rerender(<TextView {...shared} requestedNonce={1} requestedPath="design/F-2-b.md" />)

        expect(screen.getByRole('tab', { name: /Beta/ })).toBeInTheDocument()
    })

    it('hides the tree behind a Browse files drawer on mobile', () => {
        renderTextView({ isMobile: true })

        expect(screen.queryByLabelText('File tree')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /Browse files/ }))
        clickTreeFile('F-1 Alpha')

        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('keeps the formatting toolbar sticky above the editor on mobile', () => {
        const { container } = render(
            <TextView
                activeCards={activeCards}
                backgroundCards={backgroundCards}
                cardTypes={DEFAULT_CARD_TYPES}
                isMobile
                onBodyChange={vi.fn()}
                onContinueAgentConversation={vi.fn()}
                onDeleteFile={vi.fn(async () => undefined)}
                onHeaderFieldChange={vi.fn()}
                onSendAgentInput={vi.fn()}
                onStartAgentConversation={vi.fn()}
                requestedNonce={0}
                requestedPath={null}
                workingFolder="design"
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: /Browse files/ }))
        clickTreeFile('F-1 Alpha')

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('leaves the toolbar non-sticky on desktop', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(document.querySelector('[data-sticky-toolbar="false"]')).not.toBeNull()
    })

    it('renders the desktop tree inline without a Browse files button', () => {
        renderTextView()

        expect(screen.queryByRole('button', { name: /Browse files/ })).not.toBeInTheDocument()
        expect(within(screen.getByLabelText('File tree')).getByText('F-1 Alpha')).toBeInTheDocument()
    })

    it('opens the editor conversation panel and continues the active card conversation', () => {
        const agentConversation = conversation()
        const onContinueAgentConversation = vi.fn()
        renderTextView({
            activeCards: [{ ...activeCards[0], agentConversations: [agentConversation] }],
            onContinueAgentConversation,
        })

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: /Agents/ }))
        expect(screen.getByText('Editor agent')).toBeInTheDocument()
        expect(screen.getByText('editor output')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(onContinueAgentConversation).toHaveBeenCalledWith('design/F-1-a.md', agentConversation)
    })

    it('shows the header fields of the open file behind a collapsible panel', () => {
        renderTextView({activeCards: [{ ...activeCards[0], headerFields: { customField: 'keep me', id: 'F-1', status: 'todo' } }, activeCards[1]]})

        clickTreeFile('F-1 Alpha')
        expect(screen.queryByLabelText('Header field status')).not.toBeInTheDocument()

        fireEvent.click(screen.getByLabelText('Toggle header fields'))

        expect(screen.getByLabelText('Header field status')).toHaveValue('todo')
        expect(screen.getByLabelText('Header field customField')).toHaveValue('keep me')
    })

    it('persists header field edits through onHeaderFieldChange', () => {
        const { onHeaderFieldChange } = renderTextView({activeCards: [{ ...activeCards[0], headerFields: { id: 'F-1', status: 'todo' } }, activeCards[1]]})

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByLabelText('Toggle header fields'))
        const statusInput = screen.getByLabelText('Header field status')
        fireEvent.change(statusInput, { target: { value: 'done' } })
        fireEvent.blur(statusInput)

        expect(onHeaderFieldChange).toHaveBeenCalledWith('design/F-1-a.md', 'status', 'done')
    })

    it('renders no header panel for files without frontmatter', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(screen.queryByLabelText('Toggle header fields')).not.toBeInTheDocument()
    })

    it('starts a new agent conversation for the active text tab', () => {
        const onStartAgentConversation = vi.fn()
        renderTextView({ onStartAgentConversation })

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: /Agents/ }))
        fireEvent.change(screen.getByLabelText('Agent prompt'), { target: { value: 'review this file' } })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))

        expect(onStartAgentConversation).toHaveBeenCalledWith('design/F-1-a.md', 'review this file')
    })
})
