import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { ListEditorToolbarControls } from './list_editor_toolbar_controls'

vi.mock('../editor/markdown_format_toolbar_controls', () => ({MarkdownFormatToolbarControls: ({ endControls }: { endControls: ReactNode }) => <div>{endControls}</div>}))

vi.mock('../editor/markdown_document_undo_redo', () => ({ MarkdownDocumentUndoRedo: () => null }))

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
            executionId: 'execution-1',
            history: { completedAt: committedAt, output: '', prompt: '', status: 'completed' },
            origin: { cardInternalId: 'card-060', kind: 'card' },
            rootActionId: 'implement',
            rootActionLabel: 'Implement',
            startedAt: committedAt,
            status: 'completed',
        },
    }
}

afterEach(cleanup)

describe('ListEditorToolbarControls', () => {
    it('hosts the card commit menu and forwards file-mode selections', () => {
        const cardCommit = commit()
        const onSelectCardCommit = vi.fn()
        render(
            <AppThemeProvider>
                <ListEditorToolbarControls
                    agentConversationCount={0}
                    cardCommits={[cardCommit]}
                    cardCommitsError={null}
                    documentId="card-060"
                    historyStore={new MarkdownDocumentHistoryStore()}
                    isAgentPopupOpen={false}
                    isPropertiesOpen={false}
                    onOpenProperties={vi.fn()}
                    onSelectCardCommit={onSelectCardCommit}
                    onToggleAgentPopup={vi.fn()}
                    propertiesAvailable
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        fireEvent.click(screen.getByRole('button', { name: /Implement/ }))

        expect(onSelectCardCommit).toHaveBeenCalledWith(cardCommit)
    })
})
