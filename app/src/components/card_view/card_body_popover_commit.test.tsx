import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardBodyPopover } from './card_body_popover'

vi.mock('../hooks/use_card_commits', () => ({
    useCardCommits: () => ({
        commits: [{
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
        }],
        error: null,
    }),
}))

vi.mock('./card_commit_diff_panel', () => ({CardCommitDiffPanel: () => <div aria-label="Card commit diff" />}))

vi.mock('./card_body_save_status', () => ({ CardBodySaveStatus: () => null }))
vi.mock('./card_body_editor', () => ({ CardBodyEditor: () => <div aria-label="Live card editor" /> }))

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

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('CardBodyPopover commit diff', () => {
    it('uses the first Escape to exit diff and the second to close the popover', () => {
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        const onClose = vi.fn()
        render(
            <AppThemeProvider>
                <CardBodyPopover
                    anchorElement={anchorElement}
                    card={card}
                    isMobile={false}
                    onClose={onClose}
                    onDeleteCard={vi.fn(async () => undefined)}
                    onOpenAffects={vi.fn()}
                    onOpenInFileMode={vi.fn()}
                    onTitleChange={vi.fn()}
                    visible
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        fireEvent.click(screen.getByRole('button', { name: /Implement/ }))
        expect(screen.getByLabelText('Card commit diff')).toBeInTheDocument()
        expect(screen.getByLabelText('Live card editor')).toBeInTheDocument()
        expect(screen.getByLabelText('Live card editor')).not.toBeVisible()
        const dialog = screen.getByRole('dialog')

        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(screen.queryByLabelText('Card commit diff')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Live card editor')).toBeVisible()
        expect(onClose).not.toHaveBeenCalled()

        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledOnce()
    })
})
