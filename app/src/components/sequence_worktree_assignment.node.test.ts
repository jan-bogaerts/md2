import { describe, expect, it } from 'vitest'
import type { WorktreeRecord } from '../data/data_types'
import { sequenceWorktreeAssignment } from './sequence_worktree_assignment'

const checkout: WorktreeRecord = {
    branch: 'sequence-child', error: null, parkingBranch: 'parking', path: 'C:/Checkout',
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
}

describe('sequenceWorktreeAssignment', () => {
    it('matches checkout path without depending on slash direction or letter case', () => {
        expect(sequenceWorktreeAssignment(
            { checkoutPath: 'c:\\checkout', expectedBranch: 'sequence-child' }, [checkout],
        )).toEqual({ branch: 'sequence-child', worktree: 1, worktreeError: null, worktreeValue: '1' })
    })
})
