import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeRecord } from '../data/data_types'
import { dialogService } from '../services/dialog_service'
import { configService } from '../services/config/config_service'
import { projectPersistenceService } from '../services/project/project_persistence_service'
import { worktreeService } from '../services/project/worktree_service'
import { AppThemeProvider } from '../theme/theme_provider'
import { WorktreeSelector } from './worktree_selector'
import { cardPopupService } from '../services/card_popup_service'

const worktrees: WorktreeRecord[] = [
    {
        branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:\\feature',
        status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
    },
    {
        branch: null, error: 'Folder missing', parkingBranch: 'md2/parking/missing', path: 'C:\\missing',
        status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: false,
    },
]

/** A paused integration session, as desktop reports it through the conflict outcome. */
const conflictSession = {
    conflictedPaths: ['src/one.ts'],
    externalResolverConfigured: false,
    id: 'session-1',
    operation: 'integrate' as const,
    phase: 'squash' as const,
    repositoryRoot: 'C:\\primary',
    worktree: 1,
}

/** The selector reads the worktree list from the service, so tests seed it there. */
function withRecords(records: WorktreeRecord[]) {
    vi.spyOn(worktreeService, 'getRecords').mockReturnValue(records)
}

function renderAssignedWorktree(record: WorktreeRecord) {
    withRecords([record])
    render(
        <AppThemeProvider>
            <WorktreeSelector
                assignment={{ worktree: 1 }}
                assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                primaryPath="C:\\primary"
            />
        </AppThemeProvider>,
    )
}

describe('WorktreeSelector', () => {
    beforeEach(() => configService.init())

    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
        vi.restoreAllMocks()
    })

    it('lists Primary and valid linked worktrees while retaining the current invalid assignment', () => {
        withRecords(worktrees)
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 2, worktreeError: null, worktreeValue: '2' }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath={'C:\\primary'}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /C:\\missing: Folder missing/u }))

        expect(screen.getByRole('menuitem', { name: /Primary — C:\\primary/u })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /1 — C:\\feature/u })).toBeInTheDocument()
        expect(screen.queryByRole('menuitem', { name: /^2 — C:\\missing$/u })).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: /2 — C:\\missing: Folder missing/u })).toBeInTheDocument()
    })

    it('cannot open while a run is active', () => {
        withRecords(worktrees)
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: null }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    disabled
                    primaryPath={null}
                />
            </AppThemeProvider>,
        )

        const button = screen.getByRole('button', { name: 'Primary worktree' })
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('disables a worktree reserved by another active card', () => {
        withRecords(worktrees)
        vi.spyOn(worktreeService, 'isWorktreeAvailableForCard').mockReturnValue(false)
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: null }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath={null}
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        const reservedWorktree = screen.getByRole('menuitem', { name: '1 — C:\\feature' })
        expect(reservedWorktree).toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(reservedWorktree)
        expect(setCardWorktree).not.toHaveBeenCalled()
    })

    it('shows lifecycle actions instead of worktree choices for an assigned card', () => {
        withRecords(worktrees)
        const refresh = vi.spyOn(worktreeService, 'refresh').mockResolvedValue(undefined)
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))

        expect(refresh).not.toHaveBeenCalled()

        expect(screen.getByRole('menuitem', { name: /Primary — C:.*primary/u })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Commit' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'Update worktree' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'View diff' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'Integrate into project' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.queryByRole('menuitem', { name: /1 — C:\\feature/u })).not.toBeInTheDocument()
    })

    it('ignores upstream state when deciding project-worktree actions', () => {
        const synchronizedWorktree = {
            ...worktrees[0],
            status: { ...worktrees[0].status, hasUpstream: true },
        }
        renderAssignedWorktree(synchronizedWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))

        expect(screen.getByRole('menuitem', { name: 'Commit' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'Update worktree' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('menuitem', { name: 'Integrate into project' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('integrates a clean worktree when it is ahead of the project branch', async () => {
        const aheadWorktree = {
            ...worktrees[0],
            status: { ...worktrees[0].status, ahead: 1, baseAhead: 1, hasUpstream: true },
        }
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        renderAssignedWorktree(aheadWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))

        expect(screen.getByRole('menuitem', { name: 'View diff' })).not.toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: 'Delete branch' })).not.toBeChecked()
        fireEvent.click(screen.getByRole('button', { name: 'Integrate' }))

        await vi.waitFor(() => expect(integrateCardWorktree).toHaveBeenCalledWith('design/F-1.md', false))
        expect(commitCardWorktree).not.toHaveBeenCalled()
        await vi.waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Integrate into project' })).not.toBeInTheDocument()
        })
    })

    it('opens current diff from same availability condition as integration', () => {
        const aheadWorktree = { ...worktrees[0], status: { ...worktrees[0].status, baseAhead: 1 } }
        const openWorktreeDiff = vi.spyOn(cardPopupService, 'openWorktreeDiff')
        renderAssignedWorktree(aheadWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'View diff' }))

        expect(openWorktreeDiff).toHaveBeenCalledWith('card-1', expect.any(HTMLElement))
    })

    it('commits and integrates a dirty worktree from one dialog', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))

        expect(screen.getByRole('dialog', { name: 'Integrate into project' })).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveValue('F-1: Card')
        expect(screen.getByRole('checkbox', { name: 'Delete branch' })).not.toBeChecked()
        expect(screen.queryByRole('dialog', { name: 'Commit and integrate worktree' })).not.toBeInTheDocument()

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Integrate card changes' } })
        fireEvent.click(screen.getByRole('checkbox', { name: 'Delete branch' }))
        fireEvent.click(screen.getByRole('button', { name: 'Integrate' }))

        await vi.waitFor(() => expect(integrateCardWorktree).toHaveBeenCalledWith('design/F-1.md', true))
        expect(commitCardWorktree).toHaveBeenCalledWith('design/F-1.md', 'Integrate card changes')
        expect(commitCardWorktree.mock.invocationCallOrder[0]).toBeLessThan(integrateCardWorktree.mock.invocationCallOrder[0])
        await vi.waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Integrate into project' })).not.toBeInTheDocument()
        })
    })

    it('disables dirty integration for a blank commit message', () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })

        const integrateButton = screen.getByRole('button', { name: 'Integrate' })
        expect(integrateButton).toBeDisabled()
        fireEvent.click(integrateButton)
        expect(commitCardWorktree).not.toHaveBeenCalled()
        expect(integrateCardWorktree).not.toHaveBeenCalled()
    })

    it('cancels dirty integration without changing the worktree', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await vi.waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Integrate into project' })).not.toBeInTheDocument()
        })
        expect(commitCardWorktree).not.toHaveBeenCalled()
        expect(integrateCardWorktree).not.toHaveBeenCalled()
    })

    it('updates a clean worktree when it is behind the project branch', async () => {
        const behindWorktree = {
            ...worktrees[0],
            status: { ...worktrees[0].status, baseBehind: 1 },
        }
        const updateCardWorktree = vi.spyOn(worktreeService, 'updateCardWorktree').mockResolvedValue({ status: 'completed' })
        renderAssignedWorktree(behindWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Update worktree' }))

        await vi.waitFor(() => expect(updateCardWorktree).toHaveBeenCalledWith('design/F-1.md'))
    })

    it('uses pending project saves for both incoming indicator and update availability', () => {
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({hasPendingPush: false, hasPendingSave: true, localSaveState: 'dirty'})
        renderAssignedWorktree(worktrees[0])

        const button = screen.getByRole('button', { name: /project changes pending yes/u })
        fireEvent.click(button)

        expect(screen.getByRole('menuitem', { name: 'Update worktree' })).not.toHaveAttribute('aria-disabled')
    })

    it('uses uncommitted primary files for both incoming indicator and update availability', () => {
        vi.spyOn(worktreeService, 'getPrimaryStatus').mockReturnValue({ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: true, hasUpstream: true})
        renderAssignedWorktree(worktrees[0])

        const button = screen.getByRole('button', { name: /project changes pending yes/u })
        fireEvent.click(button)

        expect(screen.getByRole('menuitem', { name: 'Update worktree' })).not.toHaveAttribute('aria-disabled')
    })

    it('asks how to resolve dirty changes before returning to Primary', async () => {
        const dirtyWorktrees = [{
            ...worktrees[0],
            status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: true, hasUpstream: false },
        }]
        withRecords(dirtyWorktrees)
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))

        expect(await screen.findByRole('dialog', { name: 'Worktree has uncommitted changes' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Drop changes' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Commit & integrate' })).toBeInTheDocument()
    })

    it('commits, integrates, and unassigns dirty worktree changes in order', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))
        fireEvent.click(await screen.findByRole('button', { name: 'Commit & integrate' }))

        await vi.waitFor(() => expect(setCardWorktree).toHaveBeenCalledWith('design/F-1.md', null))
        expect(commitCardWorktree.mock.invocationCallOrder[0]).toBeLessThan(integrateCardWorktree.mock.invocationCallOrder[0])
        expect(integrateCardWorktree).toHaveBeenCalledWith('design/F-1.md', false)
        expect(integrateCardWorktree.mock.invocationCallOrder[0]).toBeLessThan(setCardWorktree.mock.invocationCallOrder[0])
    })

    it('leaves the merge conflict popup alone when returning a clean worktree to Primary conflicts', async () => {
        const aheadWorktree = { ...worktrees[0], status: { ...worktrees[0].status, baseAhead: 1 } }
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree')
            .mockResolvedValue({ session: conflictSession, status: 'conflict' })
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(aheadWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))

        await vi.waitFor(() => expect(integrateCardWorktree).toHaveBeenCalledWith('design/F-1.md', false))
        expect(setCardWorktree).not.toHaveBeenCalled()
        expect(reportError).not.toHaveBeenCalled()
    })

    it('unassigns after a completed integration when returning a clean worktree to Primary', async () => {
        const aheadWorktree = { ...worktrees[0], status: { ...worktrees[0].status, baseAhead: 1 } }
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(aheadWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))

        await vi.waitFor(() => expect(setCardWorktree).toHaveBeenCalledWith('design/F-1.md', null))
        expect(integrateCardWorktree.mock.invocationCallOrder[0]).toBeLessThan(setCardWorktree.mock.invocationCallOrder[0])
        expect(reportError).not.toHaveBeenCalled()
    })

    it('closes the unassign dialog without an error when commit and integrate conflicts', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree')
            .mockResolvedValue({ session: conflictSession, status: 'conflict' })
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))
        fireEvent.click(await screen.findByRole('button', { name: 'Commit & integrate' }))

        await vi.waitFor(() => expect(integrateCardWorktree).toHaveBeenCalledWith('design/F-1.md', false))
        await vi.waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Worktree has uncommitted changes' })).not.toBeInTheDocument()
        })
        expect(setCardWorktree).not.toHaveBeenCalled()
        expect(reportError).not.toHaveBeenCalled()
    })

    it('opens the dirty dialog when backend revalidation rejects parking', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        vi.spyOn(worktreeService, 'setCardWorktree').mockRejectedValue(new Error('Linked worktree has uncommitted changes'))
        withRecords([dirtyWorktree])
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary/u }))

        expect(await screen.findByRole('dialog', { name: 'Worktree has uncommitted changes' })).toBeInTheDocument()
    })

    it('offers an update for a worktree trailing the project branch without an upstream', async () => {
        const trailingWorktrees = [{
            ...worktrees[0],
            status: { ahead: 0, baseAhead: 0, baseBehind: 2, behind: 0, dirty: false, hasUpstream: false },
        }]
        withRecords(trailingWorktrees)
        vi.spyOn(worktreeService, 'getProjectBranch').mockReturnValue('main')
        const updateCardWorktree = vi.spyOn(worktreeService, 'updateCardWorktree').mockResolvedValue({ status: 'completed' })
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                />
            </AppThemeProvider>,
        )

        const button = screen.getByRole('button', { name: /Worktree 1/u })
        expect(button).toHaveAccessibleName(/behind main 2/u)
        expect(button).toHaveStyle({ color: 'rgb(249, 168, 37)' })

        fireEvent.click(button)
        fireEvent.click(screen.getByRole('menuitem', { name: 'Update worktree' }))

        await vi.waitFor(() => expect(updateCardWorktree).toHaveBeenCalledWith('design/F-1.md'))
    })

    it('disables update when the worktree is already up to date with the project branch', () => {
        withRecords([worktrees[0]])
        vi.spyOn(worktreeService, 'getProjectBranch').mockReturnValue('main')
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))

        expect(screen.getByRole('menuitem', { name: 'Update worktree' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('opens the commit dialog with the default card message', () => {
        const dirtyWorktrees = [{
            ...worktrees[0],
            status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: true, hasUpstream: false },
        }]
        withRecords(dirtyWorktrees)
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        render(
            <AppThemeProvider>
                <WorktreeSelector
                    assignment={{ worktree: 1 }}
                    assignmentTarget={{ cardInternalId: 'card-1', kind: 'card', path: 'design/F-1.md' }}
                    primaryPath="C:\\primary"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Commit' }))
        expect(screen.getByRole('dialog', { name: 'Commit worktree' })).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveValue('F-1: Card')

        fireEvent.click(screen.getByRole('button', { name: 'Commit' }))
        expect(commitCardWorktree).toHaveBeenCalledWith('design/F-1.md', 'F-1: Card')
    })

    it('reports commit errors through dialogService and leaves the commit dialog open', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        const error = new Error('commit failed')
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        vi.spyOn(worktreeService, 'commitCardWorktree').mockRejectedValue(error)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Commit' }))
        fireEvent.click(screen.getByRole('button', { name: 'Commit' }))

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error, {fallbackMessage: 'Could not commit worktree changes'}))
        expect(screen.getByRole('dialog', { name: 'Commit worktree' })).toBeInTheDocument()
    })

    it('stops dirty integration and leaves its dialog open when the commit fails', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        const error = new Error('commit failed')
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        vi.spyOn(worktreeService, 'commitCardWorktree').mockRejectedValue(error)
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))
        fireEvent.click(screen.getByRole('button', { name: 'Integrate' }))

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error, {fallbackMessage: 'Could not commit worktree changes'}))
        expect(integrateCardWorktree).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog', { name: 'Integrate into project' })).toBeInTheDocument()
    })

    it('leaves the unified dialog open and reports an integration error after the commit succeeds', async () => {
        const dirtyWorktree = { ...worktrees[0], status: { ...worktrees[0].status, dirty: true } }
        const error = new Error('integration failed')
        vi.spyOn(worktreeService, 'getCardCommitMessage').mockReturnValue('F-1: Card')
        const commitCardWorktree = vi.spyOn(worktreeService, 'commitCardWorktree').mockResolvedValue(undefined)
        vi.spyOn(worktreeService, 'integrateCardWorktree').mockRejectedValue(error)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(dirtyWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))
        fireEvent.click(screen.getByRole('button', { name: 'Integrate' }))

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error, {fallbackMessage: 'Changes were committed, but the worktree could not be integrated into the project'}))
        expect(commitCardWorktree).toHaveBeenCalledWith('design/F-1.md', 'F-1: Card')
        expect(screen.getByRole('dialog', { name: 'Integrate into project' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: 'Commit and integrate worktree' })).not.toBeInTheDocument()
    })

    it('reports update errors through dialogService', async () => {
        const behindWorktree = {
            ...worktrees[0],
            status: { ...worktrees[0].status, baseBehind: 1 },
        }
        const error = new Error('update failed')
        vi.spyOn(worktreeService, 'updateCardWorktree').mockRejectedValue(error)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(behindWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Update worktree' }))

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error, {fallbackMessage: 'Could not update worktree from the project branch'}))
    })

    it('reports integration errors through dialogService', async () => {
        const trailingWorktree = {
            ...worktrees[0],
            status: { ...worktrees[0].status, baseAhead: 1 },
        }
        const error = new Error('integration failed')
        vi.spyOn(worktreeService, 'getProjectBranch').mockReturnValue('main')
        vi.spyOn(worktreeService, 'integrateCardWorktree').mockRejectedValue(error)
        const reportError = vi.spyOn(dialogService, 'error')
        renderAssignedWorktree(trailingWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))
        fireEvent.click(screen.getByRole('button', { name: 'Integrate' }))

        await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(error, {fallbackMessage: 'Could not integrate worktree into project'}))
        expect(screen.getByRole('dialog', { name: 'Integrate into project' })).toBeInTheDocument()
    })

    it('restores and applies the persisted delete-branch integration choice', async () => {
        configService.setReactPreference('react.deleteBranchAfterIntegration', true)
        const aheadWorktree = { ...worktrees[0], status: { ...worktrees[0].status, baseAhead: 1 } }
        const integrateCardWorktree = vi.spyOn(worktreeService, 'integrateCardWorktree').mockResolvedValue({ status: 'completed' })
        renderAssignedWorktree(aheadWorktree)

        fireEvent.click(screen.getByRole('button', { name: /Worktree 1/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Integrate into project' }))

        expect(screen.getByRole('checkbox', { name: 'Delete branch' })).toBeChecked()
        fireEvent.click(screen.getByRole('checkbox', { name: 'Delete branch' }))
        expect(configService.get('react.deleteBranchAfterIntegration')).toBe(false)
        fireEvent.click(screen.getByRole('checkbox', { name: 'Delete branch' }))
        expect(configService.get('react.deleteBranchAfterIntegration')).toBe(true)
        fireEvent.click(screen.getByRole('button', { name: 'Integrate' }))
        await vi.waitFor(() => expect(integrateCardWorktree).toHaveBeenCalledWith('design/F-1.md', true))
    })
})
