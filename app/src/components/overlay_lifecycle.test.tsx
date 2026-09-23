import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card, type WorktreeRecord } from '../data/data_types'
import { dataService } from '../services/data/data_service'
import { worktreeService } from '../services/project/worktree_service'
import { AppThemeProvider } from '../theme/theme_provider'
import { CardView } from './card_view/project_card_view'
import { WorktreeSelector } from './worktree_selector'

vi.mock('@mui/material', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mui/material')>()

    return {
        ...actual,
        Menu: (props: { children: ReactNode }) => <actual.MenuList data-testid="mounted-menu">{props.children}</actual.MenuList>,
    }
})

vi.mock('./actions/run/trigger/action_entry_points', () => ({ ActionEntryPoints: () => null }))
vi.mock('./actions/run/trigger/card_run_button', () => ({ CardRunButton: () => null }))
vi.mock('./card_view/card_path_menu_items', () => ({ CardPathMenuItems: () => null }))
vi.mock('./card_view/card_policy_menu_item', () => ({ CardPolicyMenuItem: () => null }))
vi.mock('./card_view/card_worktree_indicator', () => ({ CardWorktreeIndicator: () => null }))
vi.mock('./card_view/project_card_drag_container', () => ({CardDragContainer: (props: { children: ReactNode }) => <div>{props.children}</div>}))
vi.mock('./card_view/card_archive_dialog', () => ({
    CardArchiveDialog: (props: { onClose: () => void }) => (
        <div data-testid="mounted-card-archive-dialog">
            <button onClick={props.onClose} type="button">Close archive dialog</button>
        </div>
    ),
}))
vi.mock('./card_view/card_delete_dialog', () => ({
    CardDeleteDialog: (props: { onClose: () => void }) => (
        <div data-testid="mounted-card-delete-dialog">
            <button onClick={props.onClose} type="button">Close delete dialog</button>
        </div>
    ),
}))
vi.mock('./worktree_commit_dialog', () => ({
    WorktreeCommitDialog: (props: { onClose: () => void }) => (
        <div data-testid="mounted-worktree-commit-dialog">
            <button onClick={props.onClose} type="button">Close commit dialog</button>
        </div>
    ),
}))
vi.mock('./worktree_integration_dialog', () => ({WorktreeIntegrationDialog: () => <div data-testid="mounted-worktree-integration-dialog" />}))
vi.mock('./worktree_unassign_dialog', () => ({WorktreeUnassignDialog: () => <div data-testid="mounted-worktree-unassign-dialog" />}))

const card: Card = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# Card',
    header: {
        affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'F-1', internalId: 'card-1', owner: null,
        policy: {}, references: [], status: 'todo', title: 'Card', worktree: null, worktreeError: null, worktreeValue: null,
    },
    hasFrontmatter: true,
    isActive: true,
    path: 'design/F-1.md',
}

const assignedWorktree: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: true, hasUpstream: false }, valid: true,
}

function renderCard() {
    render(
        <AppThemeProvider>
            <CardView
                cardPath={card.path}
                cardTypes={DEFAULT_CARD_TYPES}
                isMobile={false}
                onArchiveCard={vi.fn(async () => undefined)}
                onDeleteCard={vi.fn(async () => undefined)}
                onOpenInFileMode={vi.fn()}
                onTitleChange={vi.fn()}
                onTogglePolicy={vi.fn()}
            />
        </AppThemeProvider>,
    )
}

function renderWorktreeSelector() {
    vi.spyOn(worktreeService, 'getRecords').mockReturnValue([assignedWorktree])
    vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
    render(
        <AppThemeProvider>
            <WorktreeSelector
                assignment={{ worktree: 1 }}
                assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: card.path }}
                labelPrefix="F-1"
                primaryPath="C:\\project"
            />
        </AppThemeProvider>,
    )
}

describe('overlay lifecycle', () => {
    beforeEach(() => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
            runningAgents: [],
            snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('mounts only open card overlays and removes them when closed', () => {
        renderCard()

        expect(screen.queryByTestId('mounted-menu')).not.toBeInTheDocument()
        expect(screen.queryByTestId('mounted-card-archive-dialog')).not.toBeInTheDocument()
        expect(screen.queryByTestId('mounted-card-delete-dialog')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        expect(screen.getByTestId('mounted-menu')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))

        expect(screen.queryByTestId('mounted-menu')).not.toBeInTheDocument()
        expect(screen.getByTestId('mounted-card-archive-dialog')).toBeInTheDocument()
        expect(screen.queryByTestId('mounted-card-delete-dialog')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close archive dialog' }))
        expect(screen.queryByTestId('mounted-card-archive-dialog')).not.toBeInTheDocument()
    })

    it('mounts only open worktree overlay and removes it when closed', () => {
        renderWorktreeSelector()

        expect(screen.queryByTestId('mounted-menu')).not.toBeInTheDocument()
        expect(screen.queryByTestId('mounted-worktree-commit-dialog')).not.toBeInTheDocument()
        expect(screen.queryByTestId('mounted-worktree-integration-dialog')).not.toBeInTheDocument()
        expect(screen.queryByTestId('mounted-worktree-unassign-dialog')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /F-1: C:\\feature/u }))
        expect(screen.getByTestId('mounted-menu')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Commit' }))

        expect(screen.queryByTestId('mounted-menu')).not.toBeInTheDocument()
        expect(screen.getByTestId('mounted-worktree-commit-dialog')).toBeInTheDocument()
        expect(screen.queryByTestId('mounted-worktree-integration-dialog')).not.toBeInTheDocument()
        expect(screen.queryByTestId('mounted-worktree-unassign-dialog')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close commit dialog' }))
        expect(screen.queryByTestId('mounted-worktree-commit-dialog')).not.toBeInTheDocument()
    })
})
