import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { contextWithCurrentWorktree, projectContextWithWorktree, type ActionContext } from '../../data/action_context';
import { cardFieldChangedEvent, dataService } from '../../services/data/data_service';
import { worktreeService } from '../../services/project/worktree_service';

/** Resolve assignment on opening and explicit MD² assignment/configuration changes only. */
export function useActionAssignmentContext(context: ActionContext): ActionContext {
    const subscribe = useCallback((listener: () => void) => {
        const event = context.file ? cardFieldChangedEvent(context.file, 'worktree') : null;
        worktreeService.addEventListener('assignmentChanged', listener);
        if (event) dataService.addEventListener(event, listener);

        return () => {
            worktreeService.removeEventListener('assignmentChanged', listener);
            if (event) dataService.removeEventListener(event, listener);
        };
    }, [context.file]);
    const getSnapshot = useCallback(() => {
        const snapshot = dataService.getState().snapshot;
        const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])];
        const card = context.cardInternalId ? cards.find(({ header }) => header.internalId === context.cardInternalId) : null;
        const assignment = card ? [card.header.worktreeValue, card.header.branch, card.header.worktreeError] : null;

        return JSON.stringify([worktreeService.getAssignmentSnapshot(), assignment]);
    }, [context.cardInternalId]);
    const assignmentSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    return useMemo(() => {
        const [, assignment] = JSON.parse(assignmentSnapshot) as [string, [string | null, string | null, string | null] | null];
        const currentContext = assignment ? {
            ...context,
            worktree: assignment[0] ?? undefined,
            worktreeBranch: assignment[1] ?? undefined,
            worktreeError: assignment[2] ?? undefined,
        } : context;

        return contextWithCurrentWorktree(
            projectContextWithWorktree(
                currentContext, worktreeService.getProjectActionWorktree(), worktreeService.getProjectActionWorktreeBranch(),
            ), worktreeService.getRecords(),
        );
    }, [assignmentSnapshot, context]);
}
