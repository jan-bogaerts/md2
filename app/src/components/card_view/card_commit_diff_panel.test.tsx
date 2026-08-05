import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardCommitDiffPanel } from './card_commit_diff_panel'

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

vi.mock('../actions/conversation/diff_view', () => ({DiffView: ({ initialPath }: { initialPath: string }) => <div aria-label={`Whole commit diff ${initialPath}`} />}))

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

function renderPanel(commit = cardCommit()) {
    render(
        <AppThemeProvider>
            <CardCommitDiffPanel binding="board-card" commit={commit} onExit={vi.fn()} />
        </AppThemeProvider>,
    )
}

afterEach(() => {
    cleanup()
    setActionBridgeOverride(null)
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

        renderPanel(cardCommit({ available: false }))

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

        renderPanel(cardCommit({ filePaths: ['app/other.ts'] }))

        expect(screen.getByText('Also changed (1)')).toBeInTheDocument()
        expect(screen.queryByText('Loading diff…')).not.toBeInTheDocument()
        expect(readFileAtCommit).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.getByRole('button', { name: 'app/other.ts' })).toBeEnabled())
    })
})
