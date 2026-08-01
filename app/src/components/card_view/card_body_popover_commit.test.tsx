import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectCard } from '../../data/data_types'
import { openFilesService } from '../../services/open_files_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardBodyPopover } from './card_body_popover'
import { dataService } from '../../services/data/data_service'
import { cardBodyPopoverService } from './card_body_popover_service'
import { dialogService } from '../../services/dialog_service'

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
                runId: 'run-1',
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
    cardBodyPopoverService.close()
    vi.restoreAllMocks()
})

beforeEach(() => {
    vi.spyOn(dataService, 'getState').mockReturnValue({
        project: null,
        runningAgents: [],
        snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
    })
})

describe('CardBodyPopover commit diff', () => {
    it('reports a missing card identity once and skips document binding', async () => {
        const invalidCard = { ...card, header: { ...card.header, internalId: null } }
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: { activeCards: [invalidCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        const openBoardDocument = vi.spyOn(openFilesService, 'openBoardDocument')
        const error = vi.spyOn(dialogService, 'error')
        cardBodyPopoverService.toggle(invalidCard.path, anchorElement)

        render(
            <StrictMode>
                <AppThemeProvider>
                    <CardBodyPopover
                        isMobile={false}
                        onDeleteCard={vi.fn(async () => undefined)}
                        onOpenAffects={vi.fn()}
                        onOpenInFileMode={vi.fn()}
                        visible
                    />
                </AppThemeProvider>
            </StrictMode>,
        )

        await waitFor(() => expect(error).toHaveBeenCalledTimes(1))
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: `Card identity was not added before opening: ${invalidCard.path}` }),
            { fallbackMessage: 'Card details could not be opened' },
        )
        expect(openBoardDocument).not.toHaveBeenCalled()
    })

    it('keeps the board document bound when refreshed card data retains its identity', () => {
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        const openBoardDocument = vi.spyOn(openFilesService, 'openBoardDocument')
        const closeBoardDocument = vi.spyOn(openFilesService, 'closeBoardDocument')
        const props = {
            isMobile: false,
            onDeleteCard: vi.fn(async () => undefined),
            onOpenAffects: vi.fn(),
            onOpenInFileMode: vi.fn(),
            visible: true,
        }
        cardBodyPopoverService.toggle(card.path, anchorElement)
        const view = render(
            <AppThemeProvider>
                <CardBodyPopover {...props} />
            </AppThemeProvider>,
        )

        view.rerender(
            <AppThemeProvider>
                <CardBodyPopover {...props} />
            </AppThemeProvider>,
        )

        expect(openBoardDocument).toHaveBeenCalledOnce()
        expect(closeBoardDocument).not.toHaveBeenCalled()
    })

    it('uses the first Escape to exit diff and the second to close the popover', () => {
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        cardBodyPopoverService.toggle(card.path, anchorElement)
        render(
            <AppThemeProvider>
                <CardBodyPopover
                    isMobile={false}
                    onDeleteCard={vi.fn(async () => undefined)}
                    onOpenAffects={vi.fn()}
                    onOpenInFileMode={vi.fn()}
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
        expect(cardBodyPopoverService.getSnapshot().cardPath).toBe(card.path)

        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(cardBodyPopoverService.getSnapshot().cardPath).toBeNull()
    })
})
