export type PrimaryChangeKind = 'modified' | 'deleted' | 'added' | 'renamed' | 'untracked';

/** One dirty `git status` entry of the primary worktree, reported per file. */
export interface PrimaryChange {
    path: string;
    /** Set only for renames. */
    originalPath?: string;
    tracked: boolean;
    /** False for deleted tracked files. */
    onDisk: boolean;
    kind: PrimaryChangeKind;
}

/** Integration stopped before any Git change because the primary worktree has dirty entries. */
export interface DirtyPrimaryOutcome {
    changes: PrimaryChange[];
    status: 'dirtyPrimary';
}

/** The user cancelled the primary changes review; nothing was committed or merged. */
export interface CancelledIntegrationOutcome {
    status: 'cancelled';
}
