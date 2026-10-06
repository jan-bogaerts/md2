import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../data/action_context';
import type { Card, WorktreeRecord } from '../../data/data_types';
import { cardFieldChangedEvent, dataService } from '../../services/data/data_service';
import { worktreeService } from '../../services/project/worktree_service';
import { worktreeValidationMessage } from '../actions/run/popup/action_popup_runtime';
import type { ActionDefinition } from '../../data/action_types';
import { useActionAssignmentContext } from './use_action_assignment_context';

const worktree: WorktreeRecord = {
    branch: 'feature', error: null, parkingBranch: 'parking', path: 'C:/feature', valid: true,
    status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false },
};
const otherWorktree = { ...worktree, branch: 'other', path: 'C:/other' };
const context: ActionContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card', worktree: '2', worktreeBranch: 'feature' };

describe('useActionAssignmentContext', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        worktreeService.clear();
    });

    it('resolves assignment when popup opens and ignores status notifications', () => {
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([otherWorktree, worktree]);
        const { result } = renderHook(() => useActionAssignmentContext(context));
        const initialContext = result.current;
        expect(initialContext.worktree).toBe('2');

        act(() => worktreeService.dispatchEvent(new Event('changed')));

        expect(result.current).toBe(initialContext);
    });

    it('updates numbers and validation after explicit configuration changes', () => {
        const records = vi.spyOn(worktreeService, 'getRecords').mockReturnValue([otherWorktree, worktree]);
        const { result } = renderHook(() => useActionAssignmentContext(context));
        act(() => {
            records.mockReturnValue([worktree, otherWorktree]);
            worktreeService.dispatchEvent(new Event('assignmentChanged'));
        });
        expect(result.current.worktree).toBe('1');
        expect(result.current.worktreeError).toBeUndefined();

        act(() => {
            records.mockReturnValue([otherWorktree]);
            worktreeService.dispatchEvent(new Event('assignmentChanged'));
        });
        const action = { id: 'build', label: 'Build', type: 'command', needsWorkTree: true } as ActionDefinition;
        expect(worktreeValidationMessage(action, result.current)).toContain('feature');
    });

    it('reads card assignment changes by canonical card identity', () => {
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([worktree, otherWorktree]);
        const card = { header: { internalId: 'card-1', worktreeValue: '1', branch: 'feature', worktreeError: null } } as Card;
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null, runningAgents: [],
            snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        });
        const { result } = renderHook(() => useActionAssignmentContext(context));
        expect(result.current.worktree).toBe('1');

        act(() => {
            card.header.branch = 'other';
            card.header.worktreeValue = '2';
            dataService.dispatchEvent(new Event(cardFieldChangedEvent(context.file!, 'worktree')));
        });
        expect(result.current).toMatchObject({ cardInternalId: 'card-1', worktree: '2', worktreeBranch: 'other' });

        act(() => {
            card.header.worktreeValue = null;
            card.header.branch = null;
            dataService.dispatchEvent(new Event(cardFieldChangedEvent(context.file!, 'worktree')));
        });
        expect(result.current.worktree).toBeUndefined();
        expect(result.current.worktreeBranch).toBeUndefined();
    });

    it('updates project execution context on assignment and unassignment', () => {
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue([worktree, otherWorktree]);
        const { result } = renderHook(() => useActionAssignmentContext({ kind: 'project' }));
        act(() => worktreeService.setProjectActionWorktree('other'));
        expect(result.current).toMatchObject({ kind: 'project', worktree: '2', worktreeBranch: 'other' });

        act(() => worktreeService.setProjectActionWorktree(null));
        expect(result.current.worktree).toBeUndefined();
    });
});
