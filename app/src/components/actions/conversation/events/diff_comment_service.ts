import { generateUuid } from '../../../../data/uuid';
import type { ProjectReference } from '../../../../data/data_types';

export type DiffCommentSide = 'old' | 'new';

export interface DiffCommentTarget {
    line: number;
    lineContent: string;
    path: string;
    revision: string;
    side: DiffCommentSide;
}

export interface DiffComment {
    body: string;
    id: string;
    target: Readonly<DiffCommentTarget>;
}

export interface DiffCommentComposer {
    draft: string;
    editingCommentId: string | null;
    validationError: string | null;
}

export interface DiffCommentThreadSnapshot {
    comments: readonly DiffComment[];
    composer: Readonly<DiffCommentComposer> | null;
}

interface ProjectStateOwner extends EventTarget {
    getState(): { project: ProjectReference | null };
}

const EMPTY_THREAD_SNAPSHOT: DiffCommentThreadSnapshot = Object.freeze({ comments: Object.freeze([]), composer: null });
const EMPTY_COMMENT_ERROR = 'Comment cannot be empty.';

function projectKey(project: ProjectReference | null) {
    return project ? `${project.id}\u0000${project.branch}` : null;
}

function targetKey(target: DiffCommentTarget) {
    return JSON.stringify([target.revision, target.path, target.side, target.line]);
}

function targetEvent(target: DiffCommentTarget) {
    return `thread:${targetKey(target)}`;
}

function immutableComposer(composer: DiffCommentComposer): Readonly<DiffCommentComposer> {
    return Object.freeze({ ...composer });
}

function immutableTarget(target: DiffCommentTarget): Readonly<DiffCommentTarget> {
    return Object.freeze({ ...target });
}

function immutableSnapshot(comments: DiffComment[], composer: DiffCommentComposer | null): DiffCommentThreadSnapshot {
    return Object.freeze({
        comments: Object.freeze(comments),
        composer: composer ? immutableComposer(composer) : null,
    });
}

/** Owns session-only inline diff comments and publishes changes only to their exact target thread. */
export class DiffCommentService extends EventTarget {
    private activeProjectKey: string | null = null;
    private activeWorktreeRevision: string | null = null;
    private readonly generateId: () => string;
    private projectStateOwner: ProjectStateOwner | null = null;
    private readonly snapshots = new Map<string, DiffCommentThreadSnapshot>();
    private readonly targets = new Map<string, Readonly<DiffCommentTarget>>();

    constructor(generateId: () => string = generateUuid) {
        super();
        this.generateId = generateId;
    }

    init(projectStateOwner: ProjectStateOwner) {
        this.dispose();
        this.projectStateOwner = projectStateOwner;
        this.activeProjectKey = projectKey(projectStateOwner.getState().project);
        projectStateOwner.addEventListener('changed', this.handleProjectChanged);
    }

    dispose() {
        this.projectStateOwner?.removeEventListener('changed', this.handleProjectChanged);
        this.projectStateOwner = null;
    }

    getSnapshot(target: DiffCommentTarget) {
        return this.snapshots.get(targetKey(target)) ?? EMPTY_THREAD_SNAPSHOT;
    }

    subscribe(target: DiffCommentTarget, onStoreChange: () => void) {
        const event = targetEvent(target);
        this.addEventListener(event, onStoreChange);

        return () => this.removeEventListener(event, onStoreChange);
    }

    openComposer(target: DiffCommentTarget) {
        const snapshot = this.getSnapshot(target);
        if (snapshot.composer) return;

        this.publish(target, [...snapshot.comments], { draft: '', editingCommentId: null, validationError: null });
    }

    updateDraft(target: DiffCommentTarget, draft: string) {
        const snapshot = this.getSnapshot(target);
        if (!snapshot.composer) return;

        this.publish(target, [...snapshot.comments], { ...snapshot.composer, draft, validationError: null });
    }

    cancelComposer(target: DiffCommentTarget) {
        const snapshot = this.getSnapshot(target);
        if (!snapshot.composer) return;

        this.publish(target, [...snapshot.comments], null);
    }

    saveComposer(target: DiffCommentTarget) {
        const snapshot = this.getSnapshot(target);
        const composer = snapshot.composer;
        if (!composer) return false;
        if (composer.draft.trim().length === 0) {
            this.publish(target, [...snapshot.comments], { ...composer, validationError: EMPTY_COMMENT_ERROR });
            return false;
        }

        const targetSnapshot = immutableTarget(target);
        const comments = composer.editingCommentId
            ? snapshot.comments.map((comment) => comment.id === composer.editingCommentId
                ? Object.freeze({ ...comment, body: composer.draft })
                : comment)
            : [...snapshot.comments, Object.freeze({ body: composer.draft, id: this.generateId(), target: targetSnapshot })];
        this.publish(target, [...comments], null);

        return true;
    }

    editComment(target: DiffCommentTarget, commentId: string) {
        const snapshot = this.getSnapshot(target);
        const comment = snapshot.comments.find(({ id }) => id === commentId);
        if (!comment) return;

        this.publish(target, [...snapshot.comments], { draft: comment.body, editingCommentId: commentId, validationError: null });
    }

    deleteComment(target: DiffCommentTarget, commentId: string) {
        const snapshot = this.getSnapshot(target);
        const comments = snapshot.comments.filter(({ id }) => id !== commentId);
        if (comments.length === snapshot.comments.length) return;
        const composer = snapshot.composer?.editingCommentId === commentId ? null : snapshot.composer;
        this.publish(target, comments, composer ? { ...composer } : null);
    }

    activateWorktreeRevision(revision: string) {
        if (revision === this.activeWorktreeRevision) return;
        const previousRevision = this.activeWorktreeRevision;
        this.activeWorktreeRevision = revision;
        if (!previousRevision) return;

        this.clearMatchingRevision(previousRevision);
    }

    clear() {
        const targets = [...this.targets.values()];
        this.snapshots.clear();
        this.targets.clear();
        this.activeWorktreeRevision = null;
        for (const target of targets) this.dispatchEvent(new Event(targetEvent(target)));
    }

    private clearMatchingRevision(revision: string) {
        const removedTargets = [...this.targets.entries()]
            .filter(([, target]) => target.revision === revision);
        for (const [key] of removedTargets) {
            this.snapshots.delete(key);
            this.targets.delete(key);
        }
        for (const [, target] of removedTargets) this.dispatchEvent(new Event(targetEvent(target)));
    }

    private readonly handleProjectChanged = () => {
        if (!this.projectStateOwner) return;
        const nextProjectKey = projectKey(this.projectStateOwner.getState().project);
        if (nextProjectKey === this.activeProjectKey) return;

        this.activeProjectKey = nextProjectKey;
        this.clear();
    };

    private publish(target: DiffCommentTarget, comments: DiffComment[], composer: DiffCommentComposer | null) {
        const key = targetKey(target);
        this.targets.set(key, immutableTarget(target));
        this.snapshots.set(key, immutableSnapshot(comments, composer));
        this.dispatchEvent(new Event(targetEvent(target)));
    }
}

export const diffCommentService = new DiffCommentService();
