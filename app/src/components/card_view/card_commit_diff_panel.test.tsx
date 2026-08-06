import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { AppThemeProvider } from '../../theme/theme_provider'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { CardCommitDiffPanel, type CardDiffSelection } from './card_commit_diff_panel'

vi.mock('../editor/markdown_editor', () => ({
    MarkdownEditor: (props: Record<string, unknown>) => (
        <div
            aria-label="Historical Markdown diff"
            data-binding={String(props.binding)}
            data-data-source={String(props.dataSource)}
            data-new-markdown={String(props.markdown)}
            data-old-markdown={String(props.diffMarkdown)}
            data-read-only={String(props.readOnly)}
        />
    ),
}))

vi.mock('../actions/conversation/diff_view', () => ({
    DiffView: ({ initialPath, result }: { initialPath: string, result?: unknown }) => (
        <div aria-label={`${result ? 'Whole worktree' : 'Whole commit'} diff ${initialPath}`} />
    ),
}))

vi.mock('../hooks/use_active_card', () => ({ useActiveCard: () => ({ path: 'design/F-060.md' }) }))

const cardPath = 'design/F-060.md'

function cardCommit(overrides: Partial<CardCommit> = {}): CardCommit {
    const committedAt = '2026-07-20T10:00:00.000Z'
    const record: CardActivityFile['records'][number] = {
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
    }

    return {
        branch: 'main',
        commit: 'a'.repeat(40),
        committedAt,
        deletions: 1,
        filePaths: [cardPath, 'app/other.ts'],
        filesChanged: 2,
        insertions: 2,
        record,
        ...overrides,
    }
}

function installBridge(readFileAtCommit: ElectronActionBridge['readFileAtCommit']) {
    setActionBridgeOverride({ readFileAtCommit } as ElectronActionBridge)
}

function renderPanel(selection: CardDiffSelection = { commit: cardCommit(), kind: 'commit' }) {
    render(
        <AppThemeProvider>
            <CardCommitDiffPanel binding="board-card" onExit={vi.fn()} selection={selection} />
        </AppThemeProvider>,
    )
}

afterEach(() => {
    cleanup()
    setActionBridgeOverride(null)
    vi.restoreAllMocks()
})

describe('CardCommitDiffPanel', () => {
    it('reports a frontmatter-only commit without mounting a historical editor', async () => {
        installBridge(vi.fn(async ({ parent }) => ({
            content: `---\ntitle: ${parent ? 'Old' : 'New'}\n---\nSame body`,
            exists: true,
        })))

        renderPanel()

        expect(await screen.findByText('No body changes in this commit')).toBeInTheDocument()
        expect(screen.queryByLabelText('Historical Markdown diff')).not.toBeInTheDocument()
    })

    it('renders a root commit as an addition in a disconnected read-only editor', async () => {
        installBridge(vi.fn(async ({ parent }) => parent
            ? { content: '', exists: false }
            : { content: '---\ntitle: Card\n---\nNew body', exists: true }))

        renderPanel()

        const editor = await screen.findByLabelText('Historical Markdown diff')
        expect(editor).toHaveAttribute('data-old-markdown', '')
        expect(editor).toHaveAttribute('data-new-markdown', 'New body')
        expect(editor).toHaveAttribute('data-read-only', 'true')
        expect(editor).toHaveAttribute('data-binding', 'undefined')
        expect(editor).toHaveAttribute('data-data-source', 'undefined')
    })

    it('shows an unavailable-commit message without reading repository content', () => {
        const readFileAtCommit = vi.fn()
        installBridge(readFileAtCommit)

        renderPanel({ commit: cardCommit({ available: false }), kind: 'commit' })

        expect(screen.getByRole('alert')).toHaveTextContent('Commit is no longer available in this repository')
        expect(readFileAtCommit).not.toHaveBeenCalled()
    })

    it('opens a selected also-changed path in the whole-commit diff', async () => {
        installBridge(vi.fn(async () => ({ content: 'Same body', exists: true })))
        renderPanel()
        await screen.findByText('No body changes in this commit')

        fireEvent.click(screen.getByRole('button', { name: 'app/other.ts' }))

        expect(screen.getByLabelText('Whole commit diff app/other.ts')).toBeInTheDocument()
    })

    it('opens the other-files list directly when the card path was not changed', async () => {
        const readFileAtCommit = vi.fn()
        installBridge(readFileAtCommit)

        renderPanel({ commit: cardCommit({ filePaths: ['app/other.ts'] }), kind: 'commit' })

        expect(screen.getByText('Also changed (1)')).toBeInTheDocument()
        expect(screen.queryByText('Loading diff…')).not.toBeInTheDocument()
        expect(readFileAtCommit).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.getByRole('button', { name: 'app/other.ts' })).toBeEnabled())
    })

    it('renders current worktree card body and renamed-file navigation from one loaded result', async () => {
        vi.spyOn(worktreeService, 'generateCardWorktreeDiff').mockResolvedValue({
            files: [
                {
                    changeType: 'modified',
                    newLineNumbers: [1, 2, 3, 4],
                    newValue: '---\ntitle: New\n---\nNew body',
                    oldLineNumbers: [1, 2, 3, 4],
                    oldValue: '---\ntitle: Old\n---\nOld body',
                    path: cardPath,
                },
                {
                    changeType: 'renamed',
                    newLineNumbers: [1],
                    newValue: 'content',
                    oldLineNumbers: [1],
                    oldPath: 'app/old.ts',
                    oldValue: 'content',
                    path: 'app/new.ts',
                },
            ],
            repositoryRoot: 'C:/worktree',
        })

        renderPanel({ kind: 'worktree' })

        const editor = await screen.findByLabelText('Historical Markdown diff')
        expect(editor).toHaveAttribute('data-old-markdown', 'Old body')
        expect(editor).toHaveAttribute('data-new-markdown', 'New body')
        expect(screen.getByText('Also changed (1)')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'app/old.ts — app/new.ts' }))
        expect(screen.getByLabelText('Whole worktree diff app/new.ts')).toBeInTheDocument()
    })

    it('reports worktree loading failure and leaves safe unavailable state', async () => {
        const failure = new Error('assigned worktree missing')
        vi.spyOn(worktreeService, 'generateCardWorktreeDiff').mockRejectedValue(failure)
        const reportError = vi.spyOn(dialogService, 'error')

        renderPanel({ kind: 'worktree' })

        expect(await screen.findByRole('alert')).toHaveTextContent('assigned worktree missing')
        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not load worktree diff' })
        expect(screen.queryByLabelText('Historical Markdown diff')).not.toBeInTheDocument()
    })
})
