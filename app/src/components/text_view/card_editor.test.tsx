import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '../../data/data_types'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { openFilesService } from '../../services/open_files_service'
import { listCardCommitDiffDataSource } from '../card_view/list_card_commit_diff_data_source'
import { CardEditor } from './card_editor'

const markdownEditorRender = vi.hoisted(() => vi.fn())

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
        runId: 'run-1',
        details: { command: 'edit', output: '', type: 'command' },
        origin: { cardInternalId: 'card-060', kind: 'card' },
        rootActionId: 'implement',
        rootActionLabel: 'Implement',
        startedAt: '2026-07-20T10:00:00.000Z',
        status: 'completed',
    },
}

vi.mock('../hooks/use_card_commits', () => ({ useCardCommits: () => ({ commits: [commit], error: null }) }))

vi.mock('../editor/markdown_editor', () => ({
    MarkdownEditor: ({ attachmentHandler, toolbarContents }: {
        attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
        toolbarContents: () => ReactNode
    }) => {
        markdownEditorRender()

        return (
            <div aria-label="Live file editor">
                {toolbarContents()}
                {attachmentHandler ? <button type="button">Attach files</button> : null}
            </div>
        )
    },
}))

vi.mock('./list_editor_toolbar_controls', () => ({
    ListEditorToolbarControls: () => (
        <button onClick={() => listCardCommitDiffDataSource.select(commit)} type="button">Select file commit</button>
    ),
}))

vi.mock('../card_view/card_commit_diff_panel', () => ({CardCommitDiffPanel: () => <div aria-label="File card commit diff" />}))

const card: Card = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# Card\n\nBody',
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-060', internalId: 'card-060',
        owner: null, policy: {}, references: [], status: 'ready', title: 'Card', worktree: null, worktreeError: null, worktreeValue: null,
    },
    hasFrontmatter:true,
    isActive: true,
    path: 'design/F-060.md',
}

const editorProps = {
    cardTypes: [],
    statusColors: new Map<string, string>(),
}

const secondCard: Card = {
    ...card,
    header: { ...card.header, id: 'F-061', internalId: 'card-061', title: 'Second card' },
    path: 'design/F-061.md',
}

afterEach(() => {
    cleanup()
    listCardCommitDiffDataSource.clear()
    openFilesService.clear()
})

describe('CardEditor commit diff', () => {
    it('keeps its lifetime editor mounted when the list binding clears', () => {
        openFilesService.openDocument(card)
        render(<CardEditor {...editorProps} />)

        expect(screen.getByRole('button', { name: 'Attach files' })).toBeInTheDocument()

        act(() => openFilesService.clear())

        const liveEditor = screen.getByLabelText('Live file editor')

        expect(liveEditor).toBeVisible()
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

    it('does not rerender the live editor when a tab change closes the selected diff', () => {
        markdownEditorRender.mockClear()
        openFilesService.openDocument(card)
        render(<CardEditor {...editorProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Select file commit' }))

        act(() => openFilesService.openDocument(secondCard))

        expect(screen.queryByLabelText('File card commit diff')).not.toBeInTheDocument()
        expect(markdownEditorRender).toHaveBeenCalledTimes(1)
    })
})
