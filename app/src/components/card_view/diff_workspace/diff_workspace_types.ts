import type { DiffFile, DiffResult, WorktreeDiffResult } from '../../../data/electron_action_bridge';
import type { CardBodyDiff } from '../../../services/actions/card_commit_history';

/** One changed file listed by the `Files` tab; `path` is the tab key and selection reference. */
export interface DiffWorkspaceEntry {
    changeType?: DiffFile['changeType'];
    oldPath?: string;
    path: string;
}

/** Loaded content of one file tab: the card file as Markdown body diff, every other file as a patch. */
export type DiffWorkspaceFileContent =
    | { bodyDiff: CardBodyDiff; kind: 'markdown' }
    | { kind: 'patch'; result: DiffResult | WorktreeDiffResult };

export type DiffWorkspaceManifestState =
    | { status: 'loading' }
    | { entries: DiffWorkspaceEntry[]; status: 'ready' }
    | { error: Error; status: 'error' };

export type DiffWorkspaceFileState =
    | { status: 'loading' }
    | { content: DiffWorkspaceFileContent; status: 'ready' }
    | { status: 'empty' }
    | { error: Error; status: 'error' };

/** Diff source (one commit or one worktree state of one card) that loads its manifest first and files on demand. */
export interface DiffWorkspaceSource {
    readonly key: string;
    loadFile(entry: DiffWorkspaceEntry): Promise<DiffWorkspaceFileContent>;
    loadManifest(): Promise<DiffWorkspaceEntry[]>;
}
