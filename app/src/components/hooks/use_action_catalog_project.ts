import type { ActionRunSettingsStore } from '../../services/actions/action_run_settings_service';
import { worktreeService } from '../../services/project/worktree_service';
import { useCardWorktreeByInternalId } from '../card_view/use_project_card';
import { useProjectReference } from './use_project_reference';
import { useProjectActionWorktree, useProjectActionWorktreeBranch } from './use_worktrees';
import { useMergeConflict } from './use_merge_conflict';

/** Discover capabilities in the same assigned checkout as a card or project action. */
export function useActionCatalogProject(store: ActionRunSettingsStore) {
    const project = useProjectReference();
    const cardWorktree = useCardWorktreeByInternalId(store.cardInternalId);
    const projectWorktree = useProjectActionWorktree();
    const projectWorktreeBranch = useProjectActionWorktreeBranch();
    const { session } = useMergeConflict();
    if (project && store.contextKind === 'merge-conflict') {
        if (!session) return { error: 'Merge conflict model discovery requires an active session', project: null };
        const { branch } = session;
        if (!branch) return { error: 'Merge conflict checkout is unavailable', project: null };

        return { error: null, project: { ...project, branch, id: session.repositoryRoot, rootPath: session.repositoryRoot } };
    }
    if (!project || (store.contextKind !== 'card' && store.contextKind !== 'project')) return { error: null, project };
    const assignment = store.contextKind === 'card'
        ? { branch: cardWorktree?.branch, worktree: cardWorktree?.worktree, worktreeError: cardWorktree?.error }
        : { branch: projectWorktreeBranch, worktree: projectWorktree };
    const { error, record } = worktreeService.getAssignmentState(assignment);
    if (error) return { error, project: null };
    if (!record) return { error: null, project };
    if (!record.branch) return { error: 'Selected worktree has no branch', project: null };

    return { error: null, project: { ...project, branch: record.branch, id: record.path, rootPath: record.path } };
}
