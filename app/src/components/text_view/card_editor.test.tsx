import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard } from '../../data/data_types'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { openFilesService } from '../../services/open_files_service'
import { CardEditor } from './card_editor'

const commit: CardCommit = {
    branch: 'main',
    commit: 'a'.repeat(40),
    committedAt: '2026-07-20T10:00:00.000Z',
    deletions: 1,
    filePaths: ['design/F-060.md'],
    filesChanged: 1,
    insertions: 2,
    record: {
        commits: [],
        completedAt: '2026-07-20T10:00:00.000Z',
        conversationIds: [],
        executionId: 'execution-1',
        history: { completedAt: '2026-07-20T10:00:00.000Z', output: '', prompt: '', status: 'completed' },
        origin: { cardInternalId: 'card-060', kind: 'card' },
        rootActionId: 'implement',
        rootActionLabel: 'Implement',
        startedAt: '2026-07-20T10:00:00.000Z',
        status: 'completed',
    },
}

vi.mock('../hooks/use_card_commits', () => ({ useCardCommits: () => ({ commits: [commit], error: null }) }))

vi.mock('../editor/markdown_editor', () => ({
    MarkdownEditor: ({ toolbarContents }: { toolbarContents: () => ReactNode }) => (
        <div aria-label="Live file editor">{toolbarContents()}</div>
    ),
}))

vi.mock('./list_editor_toolbar_controls', () => ({
    ListEditorToolbarControls: ({ cardCommits, onSelectCardCommit }: {
        cardCommits: CardCommit[]
        onSelectCardCommit: (selectedCommit: CardCommit) => void
    }) => <button onClick={() => onSelectCardCommit(cardCommits[0])} type="button">Select file commit</button>,
}))

vi.mock('../card_view/card_commit_diff_panel', () => ({CardCommitDiffPanel: () => <div aria-label="File card commit diff" />}))

const card: ProjectCard = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# Card\n\nBody',
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-060', internalId: 'card-060',
        owner: null, policy: {}, status: 'ready', title: 'Card', worktree: null, worktreeError: null, worktreeValue: null,
    },
    headerFields: {},
    isActive: true,
    path: 'design/F-060.md',
}

const editorProps = {
    cardTypes: [],
    onHeaderFieldChange: vi.fn(),
    onTitleChange: vi.fn(),
    onTogglePolicy: vi.fn(),
    projectKey: 'project:main',
    statusColors: new Map<string, string>(),
    visible: true,
}

afterEach(() => {
    cleanup()
    openFilesService.clear()
})

describe('CardEditor commit diff', () => {
    it('keeps hidden editor mounted without occupying layout', () => {
        openFilesService.openDocument(card)
        render(<CardEditor {...editorProps} />)

        act(() => openFilesService.clear())

        const liveEditor = screen.getByLabelText('Live file editor')

        expect(liveEditor).not.toBeVisible()
        expect(liveEditor.closest('[hidden]')).toHaveStyle({ display: 'none' })
    })

    it('keeps the live file editor mounted and exits diff mode with Escape', () => {
        openFilesService.openDocument(card)
        render(<CardEditor {...editorProps} />)
        const liveEditor = screen.getByLabelText('Live file editor')

        fireEvent.click(screen.getByRole('button', { name: 'Select file commit' }))

        expect(screen.getByLabelText('File card commit diff')).toBeInTheDocument()
        expect(liveEditor).toBeInTheDocument()
        expect(liveEditor).not.toBeVisible()

        fireEvent.keyDown(window, { key: 'Escape' })

        expect(screen.queryByLabelText('File card commit diff')).not.toBeInTheDocument()
        expect(liveEditor).toBeVisible()
    })
})
