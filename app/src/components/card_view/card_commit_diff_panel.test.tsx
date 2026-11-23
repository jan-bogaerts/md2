import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { setActionBridgeOverride, type DiffRequest, type ElectronActionBridge } from '../../data/electron_action_bridge'
import type { CardCommit } from '../../services/actions/card_commit_history'
import { AppThemeProvider } from '../../theme/theme_provider'
import { dialogService } from '../../services/dialog_service'
import { configService } from '../../services/config/config_service'
import { worktreeService } from '../../services/project/worktree_service'
import { CardCommitDiffPanel, type CardDiffSelection } from './card_commit_diff_panel'
import { ListCardCommitDiffPanel } from './list_card_commit_diff_panel'
import { listCardCommitDiffDataSource, type ListCardCommitDiffSelection } from './list_card_commit_diff_data_source'

vi.mock('../editor/markdown_editor', () => ({
    MarkdownEditor: (props: Record<string, unknown>) => (
        <div
            aria-label="Historical Markdown diff"
            data-binding={String(props.binding)}
            data-data-source={String(props.dataSource)}
            data-local-text-search={String(props.localTextSearch)}
            data-new-markdown={String(props.markdown)}
            data-old-markdown={String(props.diffMarkdown)}
            data-read-only={String(props.readOnly)}
        />
    ),
}))

vi.mock('../actions/conversation/events/diff_view', () => ({
    DiffView: ({ label, result }: { label: string, result: { patch: string } }) => (
        <div aria-label={label} role="region"><span className="diff-code">{result.patch}</span></div>
    ),
}))

vi.mock('../hooks/use_active_card', () => ({ useActiveCard: () => ({ path: 'design/F-060.md' }) }))

const cardPath = 'design/F-060.md'
const SEARCH_DEBOUNCE_MS = 800

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

function patchFor(request: DiffRequest) {
    return { commit: request.commit, files: [], patch: `patch of ${request.filePath}` }
}

function installBridge(overrides: Partial<ElectronActionBridge> = {}) {
    const readFileAtCommit = vi.fn(async () => ({ content: 'Same body', exists: true }))
    const generateDiff = vi.fn(async (request: DiffRequest) => patchFor(request))
    setActionBridgeOverride({ generateDiff, readFileAtCommit, ...overrides } as unknown as ElectronActionBridge)

    return { generateDiff, readFileAtCommit }
}

function renderPanel(selection: CardDiffSelection = { commit: cardCommit(), kind: 'commit' }) {
    render(
        <AppThemeProvider>
            <CardCommitDiffPanel binding="board-card" onExit={vi.fn()} selection={selection} />
        </AppThemeProvider>,
    )
}

function fileLink(path: string) {
    return within(screen.getByRole('navigation', { name: 'Changed files' })).getByRole('button', { name: path })
}

beforeEach(() => {
    configService.clear()
    configService.init({ desktopConfig: { diffViewType: 'split' } })
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    configService.clear()
    setActionBridgeOverride(null)
    vi.restoreAllMocks()
})

describe('CardCommitDiffPanel', () => {
    it('places the search button and diff view control immediately before Exit diff', () => {
        installBridge()

        renderPanel()

        const viewControl = screen.getByRole('group', { name: 'Diff view' })
        expect(viewControl.nextElementSibling).toBe(screen.getByRole('button', { name: 'Exit diff' }))
        expect(viewControl.previousElementSibling).toContainElement(screen.getByRole('button', { name: 'Find in diff' }))
    })

    it('starts on the Files tab with full paths and loads no file content', async () => {
        const { generateDiff, readFileAtCommit } = installBridge()

        renderPanel()

        const tabs = await screen.findAllByRole('tab')
        expect(tabs).toHaveLength(1)
        expect(tabs[0]).toHaveTextContent('Files')
        expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
        expect(await screen.findByRole('button', { name: cardPath })).toBeInTheDocument()
        expect(fileLink('app/other.ts')).toBeInTheDocument()
        expect(generateDiff).not.toHaveBeenCalled()
        expect(readFileAtCommit).not.toHaveBeenCalled()
        expect(screen.queryByLabelText('Historical Markdown diff')).not.toBeInTheDocument()
    })

    it('opens the card file as a read-only Markdown body diff in a filename-labelled tab', async () => {
        installBridge({
            readFileAtCommit: vi.fn(async ({ parent }: { parent: boolean }) => parent
                ? { content: '', exists: false }
                : { content: '---\ntitle: Card\n---\nNew body', exists: true }),
        } as Partial<ElectronActionBridge>)
        renderPanel()

        fireEvent.click(await screen.findByRole('button', { name: cardPath }))

        const tab = screen.getByRole('tab', { name: cardPath })
        expect(tab).toHaveTextContent('F-060.md')
        expect(tab).toHaveAttribute('aria-selected', 'true')
        const editor = await screen.findByLabelText('Historical Markdown diff')
        expect(editor).toHaveAttribute('data-old-markdown', '')
        expect(editor).toHaveAttribute('data-new-markdown', 'New body')
        expect(editor).toHaveAttribute('data-read-only', 'true')
        expect(editor).toHaveAttribute('data-local-text-search', 'false')
        expect(editor).toHaveAttribute('data-binding', 'undefined')
    })

    it('reports a frontmatter-only card change without mounting a historical editor', async () => {
        installBridge({
            readFileAtCommit: vi.fn(async ({ parent }: { parent: boolean }) => ({
                content: `---\ntitle: ${parent ? 'Old' : 'New'}\n---\nSame body`,
                exists: true,
            })),
        } as Partial<ElectronActionBridge>)
        renderPanel()

        fireEvent.click(await screen.findByRole('button', { name: cardPath }))

        expect(await screen.findByText('No body changes in this commit')).toBeInTheDocument()
        expect(screen.queryByLabelText('Historical Markdown diff')).not.toBeInTheDocument()
    })

    it('shows an unavailable-commit message without reading repository content', () => {
        const { generateDiff, readFileAtCommit } = installBridge()

        renderPanel({ commit: cardCommit({ available: false }), kind: 'commit' })

        expect(screen.getByRole('alert')).toHaveTextContent('Commit is no longer available in this repository')
        expect(readFileAtCommit).not.toHaveBeenCalled()
        expect(generateDiff).not.toHaveBeenCalled()
    })

    it('loads only the selected path once and reuses its tab and result', async () => {
        const { generateDiff } = installBridge()
        renderPanel()

        fireEvent.click(await screen.findByRole('button', { name: 'app/other.ts' }))
        expect(await screen.findByRole('region', { name: 'Diff app/other.ts' })).toHaveTextContent('patch of app/other.ts')
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        fireEvent.click(fileLink('app/other.ts'))
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        fireEvent.click(screen.getByRole('tab', { name: 'app/other.ts' }))

        expect(screen.getByRole('region', { name: 'Diff app/other.ts' })).toBeInTheDocument()
        expect(screen.getAllByRole('tab')).toHaveLength(2)
        expect(generateDiff).toHaveBeenCalledTimes(1)
        expect(generateDiff).toHaveBeenCalledWith({ commit: 'a'.repeat(40), filePath: 'app/other.ts' })
    })

    it('keeps duplicate filenames distinguishable by full-path tab names', async () => {
        installBridge()
        renderPanel({ commit: cardCommit({ filePaths: ['app/a/index.ts', 'app/b/index.ts'] }), kind: 'commit' })

        fireEvent.click(await screen.findByRole('button', { name: 'app/a/index.ts' }))
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        fireEvent.click(fileLink('app/b/index.ts'))

        expect(screen.getByRole('tab', { name: 'app/a/index.ts' })).toHaveTextContent('index.ts')
        expect(screen.getByRole('tab', { name: 'app/b/index.ts' })).toHaveTextContent('index.ts')
        expect(screen.getByRole('tab', { name: 'app/b/index.ts' })).toHaveAttribute('aria-selected', 'true')
    })

    it('keeps a file load failure scoped to its tab', async () => {
        const reportError = vi.spyOn(dialogService, 'error')
        const failure = new Error('fatal: path not in commit')
        installBridge({ generateDiff: vi.fn(async () => { throw failure }) })
        renderPanel()

        fireEvent.click(await screen.findByRole('button', { name: 'app/other.ts' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('fatal: path not in commit')
        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not load diff for app/other.ts' })
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        expect(fileLink(cardPath)).toBeEnabled()
    })

    it('shows the loading state only for the active file', async () => {
        installBridge({ generateDiff: vi.fn(() => new Promise(() => undefined)) } as Partial<ElectronActionBridge>)
        renderPanel()

        fireEvent.click(await screen.findByRole('button', { name: 'app/other.ts' }))

        expect(screen.getByText('Loading diff…')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        expect(screen.queryByText('Loading diff…')).not.toBeInTheDocument()
    })

    it('shows the empty state for a file without patch output', async () => {
        installBridge({ generateDiff: vi.fn(async (request: DiffRequest) => ({ commit: request.commit, files: [], patch: '' })) })
        renderPanel()

        fireEvent.click(await screen.findByRole('button', { name: 'app/other.ts' }))

        expect(await screen.findByText('No changes in this file')).toBeInTheDocument()
    })

    it('shows No changed files for an empty manifest', async () => {
        installBridge()

        renderPanel({ commit: cardCommit({ filePaths: [] }), kind: 'commit' })

        expect(await screen.findByText('No changed files')).toBeInTheDocument()
        expect(screen.getAllByRole('tab')).toHaveLength(1)
    })

    it('lists worktree renames and loads only the selected worktree file', async () => {
        vi.spyOn(worktreeService, 'listCardWorktreeChanges').mockResolvedValue({
            files: [
                { changeType: 'modified', path: cardPath },
                { changeType: 'renamed', oldPath: 'app/old.ts', path: 'app/new.ts' },
            ],
            repositoryRoot: 'C:/worktree',
            revision: 'worktree-1',
        })
        const loadFile = vi.spyOn(worktreeService, 'loadCardWorktreeFileDiff').mockImplementation(async (_cardPath, filePath) => (
            filePath === cardPath
                ? {
                    file: { changeType: 'modified', newValue: '---\ntitle: New\n---\nNew body', oldValue: '---\ntitle: Old\n---\nOld body', path: cardPath },
                    patch: 'card patch',
                    repositoryRoot: 'C:/worktree',
                }
                : {
                    file: { changeType: 'renamed', newValue: 'content', oldPath: 'app/old.ts', oldValue: 'content', path: 'app/new.ts' },
                    patch: 'diff --git a/app/old.ts b/app/new.ts',
                    repositoryRoot: 'C:/worktree',
                }
        ))
        renderPanel({ kind: 'worktree' })

        fireEvent.click(await screen.findByRole('button', { name: 'app/old.ts -> app/new.ts' }))
        expect(await screen.findByRole('region', { name: 'Diff app/new.ts' })).toBeInTheDocument()
        expect(loadFile).toHaveBeenCalledTimes(1)
        expect(loadFile).toHaveBeenCalledWith(cardPath, 'app/new.ts')

        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        fireEvent.click(fileLink(cardPath))
        const editor = await screen.findByLabelText('Historical Markdown diff')
        expect(editor).toHaveAttribute('data-old-markdown', 'Old body')
        expect(editor).toHaveAttribute('data-new-markdown', 'New body')
    })

    it('reports worktree manifest failure and leaves a safe unavailable state', async () => {
        const failure = new Error('assigned worktree missing')
        vi.spyOn(worktreeService, 'listCardWorktreeChanges').mockRejectedValue(failure)
        const reportError = vi.spyOn(dialogService, 'error')

        renderPanel({ kind: 'worktree' })

        expect(await screen.findByRole('alert')).toHaveTextContent('assigned worktree missing')
        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not load changed files' })
        expect(screen.queryByLabelText('Historical Markdown diff')).not.toBeInTheDocument()
    })
})

describe('CardCommitDiffPanel search', () => {
    function openSearch() {
        fireEvent.keyDown(screen.getByRole('region', { name: 'Card commit diff' }), { ctrlKey: true, key: 'f' })

        return screen.getByRole('textbox', { name: 'Find in diff' })
    }

    function search(term: string) {
        fireEvent.change(screen.getByRole('textbox', { name: 'Find in diff' }), { target: { value: term } })
        act(() => {
            vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
        })
    }

    it('opens and focuses with Ctrl+F and closes with Escape', async () => {
        installBridge()
        renderPanel()
        await screen.findByRole('button', { name: cardPath })

        const input = openSearch()

        await waitFor(() => expect(input).toHaveFocus())
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(screen.queryByRole('search', { name: 'Diff search' })).not.toBeInTheDocument()
    })

    it('matches Files paths, focuses links with F3 and wrapping navigation, and never loads files', async () => {
        const { generateDiff, readFileAtCommit } = installBridge()
        renderPanel({ commit: cardCommit({ filePaths: [cardPath, 'app/other.ts', 'app/Other.md'] }), kind: 'commit' })
        await screen.findByRole('button', { name: cardPath })
        vi.useFakeTimers()
        openSearch()

        search('other')
        expect(screen.getByText('2 results')).toBeInTheDocument()
        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Find in diff' }), { key: 'F3' })
        expect(fileLink('app/Other.md')).toHaveFocus()
        fireEvent.click(screen.getByRole('button', { name: 'Next result' }))
        expect(fileLink('app/other.ts')).toHaveFocus()
        fireEvent.click(screen.getByRole('button', { name: 'Previous result' }))
        expect(fileLink('app/Other.md')).toHaveFocus()

        fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
        expect(screen.getByText('1 result')).toBeInTheDocument()
        expect(generateDiff).not.toHaveBeenCalled()
        expect(readFileAtCommit).not.toHaveBeenCalled()
    })

    it('keeps the term while switching tabs and recalculates results for the active tab only', async () => {
        installBridge()
        renderPanel()
        fireEvent.click(await screen.findByRole('button', { name: 'app/other.ts' }))
        await screen.findByRole('region', { name: 'Diff app/other.ts' })
        vi.useFakeTimers()
        openSearch()

        search('patch')
        expect(screen.getByText('1 result')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
        expect(screen.getByRole('textbox', { name: 'Find in diff' })).toHaveValue('patch')
        expect(screen.getByText('0 results')).toBeInTheDocument()
    })
})

describe('ListCardCommitDiffPanel', () => {
    it('keeps the list container and renders the tabbed workspace for the selected commit', async () => {
        installBridge()
        const selection = { commit: cardCommit(), document: {} } as ListCardCommitDiffSelection
        vi.spyOn(listCardCommitDiffDataSource, 'getSnapshot').mockReturnValue(selection)

        render(
            <AppThemeProvider>
                <ListCardCommitDiffPanel><div aria-label="Live list editor" /></ListCardCommitDiffPanel>
            </AppThemeProvider>,
        )

        expect(screen.getByRole('region', { name: 'Card commit diff' })).toBeInTheDocument()
        expect(await screen.findByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByLabelText('Live list editor')).not.toBeVisible()
    })
})
