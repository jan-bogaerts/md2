import { describe, expect, it, vi } from 'vitest';
import type { ProjectReference } from '../../../../data/data_types';
import { DiffCommentService, type DiffCommentTarget } from './diff_comment_service';

class ProjectStateOwner extends EventTarget {
    private project: ProjectReference | null = { branch: 'main', id: 'project-1', rootPath: 'C:/one' };

    getState() {
        return { project: this.project };
    }

    setProject(project: ProjectReference | null) {
        this.project = project;
        this.dispatchEvent(new Event('changed'));
    }
}

function commentTarget(overrides: Partial<DiffCommentTarget> = {}): DiffCommentTarget {
    return {
        line: 12,
        lineContent: 'reviewed line',
        path: 'app/file.ts',
        revision: 'commit-1',
        side: 'new',
        ...overrides,
    };
}

function saveComment(service: DiffCommentService, target: DiffCommentTarget, body: string) {
    service.openComposer(target);
    service.updateDraft(target, body);
    service.saveComposer(target);
}

describe('DiffCommentService', () => {
    it('returns stable snapshots and keeps target identity scoped by revision, path, side, and line', () => {
        const service = new DiffCommentService(() => 'comment-1');
        const target = commentTarget();
        const sameIdentity = commentTarget({ lineContent: 'newly parsed text' });
        const otherSide = commentTarget({ side: 'old' });

        expect(service.getSnapshot(target)).toBe(service.getSnapshot(target));
        saveComment(service, target, 'Looks good');

        expect(service.getSnapshot(sameIdentity)).toBe(service.getSnapshot(target));
        expect(service.getSnapshot(otherSide).comments).toHaveLength(0);
        expect(service.getSnapshot(target).comments[0].target).toEqual(target);
    });

    it('publishes only the changed target event', () => {
        const service = new DiffCommentService();
        const target = commentTarget();
        const otherTarget = commentTarget({ line: 13 });
        const changed = vi.fn();
        const otherChanged = vi.fn();
        service.subscribe(target, changed);
        service.subscribe(otherTarget, otherChanged);

        service.openComposer(target);

        expect(changed).toHaveBeenCalledOnce();
        expect(otherChanged).not.toHaveBeenCalled();
    });

    it('adds multiple comments and edits and deletes them without mutating prior snapshots', () => {
        const identifiers = ['comment-1', 'comment-2'];
        const service = new DiffCommentService(() => identifiers.shift()!);
        const target = commentTarget();
        saveComment(service, target, 'First');
        const firstSnapshot = service.getSnapshot(target);
        saveComment(service, target, 'Second');

        expect(firstSnapshot.comments.map(({ body }) => body)).toEqual(['First']);
        expect(service.getSnapshot(target).comments.map(({ body }) => body)).toEqual(['First', 'Second']);

        service.editComment(target, 'comment-1');
        service.updateDraft(target, 'Edited first');
        service.saveComposer(target);
        const editedSnapshot = service.getSnapshot(target);
        service.deleteComment(target, 'comment-2');

        expect(editedSnapshot.comments.map(({ body }) => body)).toEqual(['Edited first', 'Second']);
        expect(service.getSnapshot(target).comments.map(({ body }) => body)).toEqual(['Edited first']);
    });

    it('rejects whitespace comments while preserving draft and validation', () => {
        const service = new DiffCommentService();
        const target = commentTarget();
        service.openComposer(target);
        service.updateDraft(target, '   ');

        expect(service.saveComposer(target)).toBe(false);
        expect(service.getSnapshot(target).composer).toMatchObject({
            draft: '   ',
            validationError: 'Comment cannot be empty.',
        });
        expect(service.getSnapshot(target).comments).toHaveLength(0);
    });

    it('clears comments only when canonical project identity changes', () => {
        const projectStateOwner = new ProjectStateOwner();
        const service = new DiffCommentService();
        const target = commentTarget();
        service.init(projectStateOwner);
        saveComment(service, target, 'Keep until project changes');

        projectStateOwner.setProject({ branch: 'main', id: 'project-1', rootPath: 'C:/moved' });
        expect(service.getSnapshot(target).comments).toHaveLength(1);

        projectStateOwner.setProject({ branch: 'feature', id: 'project-1', rootPath: 'C:/moved' });
        expect(service.getSnapshot(target).comments).toHaveLength(0);
    });

    it('replaces only the previous worktree revision and retains historical comments', () => {
        const service = new DiffCommentService();
        const worktreeOne = commentTarget({ revision: 'worktree-1' });
        const worktreeTwo = commentTarget({ revision: 'worktree-2' });
        const historical = commentTarget({ revision: 'commit-1' });
        service.activateWorktreeRevision('worktree-1');
        saveComment(service, worktreeOne, 'Old worktree');
        saveComment(service, historical, 'Historical');

        service.activateWorktreeRevision('worktree-2');
        saveComment(service, worktreeTwo, 'New worktree');

        expect(service.getSnapshot(worktreeOne).comments).toHaveLength(0);
        expect(service.getSnapshot(worktreeTwo).comments).toHaveLength(1);
        expect(service.getSnapshot(historical).comments).toHaveLength(1);
    });

    it('unsubscribes from project changes during teardown', () => {
        const projectStateOwner = new ProjectStateOwner();
        const service = new DiffCommentService();
        const target = commentTarget();
        service.init(projectStateOwner);
        saveComment(service, target, 'Retained after dispose');
        service.dispose();

        projectStateOwner.setProject({ branch: 'other', id: 'project-2' });

        expect(service.getSnapshot(target).comments).toHaveLength(1);
    });
});
