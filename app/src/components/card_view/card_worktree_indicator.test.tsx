import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card, WorktreeRecord } from '../../data/data_types'
import type { ActiveScheduleService } from '../../services/actions/active_schedule_service'
import type { DataService } from '../../services/data/data_service'
import { worktreeService } from '../../services/project/worktree_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardWorktreeIndicator } from './card_worktree_indicator'

const checkout: WorktreeRecord = {
    branch: 'sequence-child', error: null, parkingBranch: 'parking', path: 'C:/checkout',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

const card = {
    agentConversationErrors: [], agentConversations: [], content: '# Card', hasFrontmatter: true, isActive: true,
    path: 'design/F-1.md',
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, branch: null, changedFiles: [],
        id: 'F-1', internalId: 'card-1', owner: null, policy: {}, references: [], status: 'design',
        title: 'Card', worktree: null, worktreeError: null, worktreeValue: null,
    },
} as Card

describe('CardWorktreeIndicator in a sequence', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows the sequence checkout with disabled controls and explains why', async () => {
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([checkout])
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        const service = Object.assign(new EventTarget(), {getState: () => ({ project: null, runningAgents: [], snapshot: { activeCards: [card], backgroundCards: [] } })}) as unknown as DataService
        const sequenceWorktree = { checkoutPath: checkout.path, expectedBranch: checkout.branch }
        const scheduleService = {
            getSequenceWorktreeForCard: () => sequenceWorktree,
            subscribeSequenceCard: () => () => undefined,
        } as unknown as ActiveScheduleService

        render(
            <AppThemeProvider>
                <CardWorktreeIndicator
                    cardId="F-1"
                    cardInternalId="card-1"
                    cardPath={card.path}
                    primaryPath="C:/primary"
                    scheduleService={scheduleService}
                    service={service}
                />
            </AppThemeProvider>,
        )

        const button = screen.getByRole('button', { name: /F-1: C:\/checkout/u })
        expect(button).toBeDisabled()
        fireEvent.mouseOver(button.parentElement!)
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'This card is running within a sequence, so its worktree controls are disabled.',
        )
        fireEvent.click(button)
        expect(setCardWorktree).not.toHaveBeenCalled()
    })
})
