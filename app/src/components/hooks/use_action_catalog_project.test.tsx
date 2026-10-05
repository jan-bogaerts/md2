import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionContext } from '../../data/action_context';
import type { WorktreeRecord } from '../../data/data_types';
import { ActionRunSettingsStore } from '../../services/actions/action_run_settings_service';
import { cardCollectionFieldChangedEvent, dataService } from '../../services/data/data_service';
import { mergeConflictService } from '../../services/project/merge_conflict_service';
import { worktreeService } from '../../services/project/worktree_service';
import { useActionCatalogProject } from './use_action_catalog_project';

const project = { branch: 'main', id: '/repo', rootPath: '/repo' };
const worktrees = [{ branch: 'topic', path: '/worktree', valid: true }] as WorktreeRecord[];
const conflict = {
    branch: 'topic',
    conflictedPaths: [], externalResolverConfigured: false, id: 'conflict-1',
    operation: 'rebase' as const, phase: 'rebase' as const, repositoryRoot: '/worktree', worktree: 1,
};

function catalogContext(kind: ActionContext['kind'], cardInternalId: string | null = null) {
    const store = new ActionRunSettingsStore('review', cardInternalId, kind);

    return renderHook(() => useActionCatalogProject(store)).result.current;
}

describe('action model discovery checkout', () => {
    beforeEach(() => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project,
            snapshot: { activeCards: [{ header: { branch: 'topic', internalId: 'card-1', worktree: 1 } }] },
        } as unknown as ReturnType<typeof dataService.getState>);
        vi.spyOn(worktreeService, 'getRecords').mockReturnValue(worktrees);
        vi.spyOn(worktreeService, 'getProjectActionWorktree').mockReturnValue(1);
        vi.spyOn(worktreeService, 'getProjectActionWorktreeBranch').mockReturnValue('topic');
        vi.spyOn(mergeConflictService, 'getSnapshot').mockReturnValue({ busy: false, session: null });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('uses a card assignment identified by its canonical internal ID', () => {
        expect(catalogContext('card', 'card-1').project?.rootPath).toBe('/worktree');
        expect(catalogContext('card', 'other-card').project).toBe(project);
    });

    it('uses the project assignment while file actions retain the primary checkout', () => {
        expect(catalogContext('project').project?.rootPath).toBe('/worktree');
        expect(catalogContext('file').project).toBe(project);
    });

    it('blocks an unavailable assigned checkout instead of discovering in another one', () => {
        vi.mocked(worktreeService.getRecords).mockReturnValue([]);

        expect(catalogContext('card', 'card-1')).toEqual({error: 'Assigned worktree branch "topic" is unavailable. Select a worktree again.', project: null});
    });

    it('uses the active conflict checkout and its branch', () => {
        vi.mocked(mergeConflictService.getSnapshot).mockReturnValue({ busy: false, session: conflict });

        expect(catalogContext('merge-conflict')).toEqual({error: null, project: { branch: 'topic', id: '/worktree', rootPath: '/worktree' }});
    });

    it('retains the primary branch when a conflict runs in the primary checkout', () => {
        vi.mocked(mergeConflictService.getSnapshot).mockReturnValue({busy: false, session: { ...conflict, branch: 'main', repositoryRoot: '/repo' }});

        expect(catalogContext('merge-conflict').project).toEqual(project);
    });

    it('blocks conflict discovery when its session is no longer active', () => {
        expect(catalogContext('merge-conflict')).toEqual({error: 'Merge conflict model discovery requires an active session', project: null});
    });

    it('uses the captured conflict branch while the rebase checkout has detached HEAD', () => {
        vi.mocked(mergeConflictService.getSnapshot).mockReturnValue({ busy: false, session: conflict });
        vi.mocked(worktreeService.getRecords).mockReturnValue([
            { branch: null, error: 'Worktree has detached HEAD; a named branch is required', path: '/worktree', valid: false },
        ] as WorktreeRecord[]);

        expect(catalogContext('merge-conflict')).toEqual({error: null, project: { branch: 'topic', id: '/worktree', rootPath: '/worktree' }});
    });

    it('follows the card branch after cleanup changes its numeric position', () => {
        vi.mocked(dataService.getState).mockReturnValue({
            project,
            snapshot: { activeCards: [{ header: { branch: 'topic', internalId: 'card-1', worktree: 2 } }] },
        } as unknown as ReturnType<typeof dataService.getState>);
        vi.mocked(worktreeService.getRecords).mockReturnValue([
            ...worktrees, { branch: 'other', path: '/other', valid: true },
        ] as WorktreeRecord[]);

        expect(catalogContext('card', 'card-1').project).toEqual({ branch: 'topic', id: '/worktree', rootPath: '/worktree' });
    });

    it('blocks a missing card branch even when another checkout occupies its old position', () => {
        vi.mocked(dataService.getState).mockReturnValue({
            project,
            snapshot: { activeCards: [{ header: { branch: 'topic', internalId: 'card-1', worktree: 1 } }] },
        } as unknown as ReturnType<typeof dataService.getState>);
        vi.mocked(worktreeService.getRecords).mockReturnValue([{ branch: 'other', path: '/other', valid: true }] as WorktreeRecord[]);

        expect(catalogContext('card', 'card-1')).toEqual({error: 'Assigned worktree branch "topic" is unavailable. Select a worktree again.', project: null});
    });

    it('blocks a missing project branch even when another checkout occupies its old position', () => {
        vi.mocked(worktreeService.getRecords).mockReturnValue([{ branch: 'other', path: '/other', valid: true }] as WorktreeRecord[]);

        expect(catalogContext('project')).toEqual({error: 'Assigned worktree branch "topic" is unavailable. Select a worktree again.', project: null});
    });

    it('uses the conflict checkout path when its numeric hint points at another checkout', () => {
        vi.mocked(mergeConflictService.getSnapshot).mockReturnValue({busy: false, session: { ...conflict, worktree: 2 }});
        vi.mocked(worktreeService.getRecords).mockReturnValue([
            ...worktrees, { branch: 'other', path: '/other', valid: true },
        ] as WorktreeRecord[]);

        expect(catalogContext('merge-conflict').project).toEqual({ branch: 'topic', id: '/worktree', rootPath: '/worktree' });
    });

    it('updates discovery when the card branch changes without changing its numeric hint', () => {
        const card = { header: { branch: 'topic', internalId: 'card-1', worktree: 1 } };
        const projectState = {project, snapshot: { activeCards: [card] }} as unknown as ReturnType<typeof dataService.getState>;
        vi.mocked(dataService.getState).mockReturnValue(projectState);
        vi.mocked(worktreeService.getRecords).mockReturnValue([
            ...worktrees, { branch: 'other', path: '/other', valid: true },
        ] as WorktreeRecord[]);
        const store = new ActionRunSettingsStore('review', 'card-1', 'card');
        const { result } = renderHook(() => useActionCatalogProject(store));
        expect(result.current.project?.rootPath).toBe('/worktree');
        act(() => {
            card.header.branch = 'other';
            dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('worktree')));
        });

        expect(result.current.project?.rootPath).toBe('/other');
    });
});
