import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { cardActionPopupService } from '../../services/actions/card_action_popup_service'
import type { Card } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { listCardCommitDiffDataSource } from '../card_view/list_card_commit_diff_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import * as cardCommitsHook from '../hooks/use_card_commits'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'

vi.mock('../editor/markdown_format_toolbar_controls', () => ({MarkdownFormatToolbarControls: ({ endControls }: { endControls: ReactNode }) => <div>{endControls}</div>}))

vi.mock('../editor/markdown_document_undo_redo', () => ({ MarkdownDocumentUndoRedo: () => null }))

vi.mock('../hooks/use_project_state', () => ({useProjectState: () => ({ project: { branch: 'main', id: 'project' }, runningAgents: [], snapshot: null })}))

function commit(): CardCommit {
    const committedAt = '2026-07-20T10:00:00.000Z'

    return {
        branch: 'main',
        commit: 'a'.repeat(40),
        committedAt,
        deletions: 1,
        filePaths: ['design/F-060.md'],
        filesChanged: 1,
        insertions: 2,
        record: {
            commits: [],
            completedAt: committedAt,
            conversationIds: [],
            runId: 'run-1',
            details: { command: 'edit', output: '', type: 'command' },
            origin: { cardInternalId: 'card-060', kind: 'card' },
            rootActionId: 'implement',
            rootActionLabel: 'Implement',
            startedAt: committedAt,
            status: 'completed',
        },
    }
}

afterEach(() => {
    cardActionPopupService.clear()
    cleanup()
    vi.restoreAllMocks()
})

const card: Card = {
    agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true,
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-060', internalId: 'card-060',
        owner: null, policy: {}, status: 'ready', title: 'Card', worktree: null, worktreeError: null, worktreeValue: null,
    },
    path: 'design/F-060.md',
}

describe('ListEditorToolbarControls', () => {
    it('hosts the card commit menu and forwards file-mode selections', () => {
        const cardCommit = commit()
        const selectCardCommit = vi.spyOn(listCardCommitDiffDataSource, 'select').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(card)
        vi.spyOn(cardCommitsHook, 'useCardCommits').mockReturnValue({ commits: [cardCommit], error: null, loading: false, reload: vi.fn() })
        render(
            <AppThemeProvider>
                <ListEditorToolbarControls
                    cardTypes={[]}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    statusColors={new Map()}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        fireEvent.click(screen.getByRole('button', { name: /Implement/ }))

        expect(selectCardCommit).toHaveBeenCalledWith(cardCommit)
    })

    it('opens list-editor card conversation popup through shared popup service', () => {
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(card)
        vi.spyOn(cardMarkdownDataSource, 'getActiveDocument').mockReturnValue({ getObject: () => card } as never)
        vi.spyOn(cardCommitsHook, 'useCardCommits').mockReturnValue({ commits: [], error: null, loading: false, reload: vi.fn() })
        render(
            <AppThemeProvider>
                <ListEditorToolbarControls
                    cardTypes={[]}
                    historyStore={new MarkdownDocumentHistoryStore()}
                    statusColors={new Map()}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Agents' }))

        expect(cardActionPopupService.getSnapshot()).toHaveLength(1)
        expect(cardActionPopupService.getSnapshot()[0]?.context).toMatchObject({
            cardInternalId: 'card-060',
            file: card.path,
            kind: 'file',
        })
    })
})
