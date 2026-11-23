import { loadCardBodyDiff, type CardCommit } from '../../../services/actions/card_commit_history';
import { generateFileDiff } from '../../../services/data/diff_service';
import type { DiffWorkspaceEntry, DiffWorkspaceFileContent, DiffWorkspaceSource } from './diff_workspace_types';

/** Commit diff source: `CardCommit.filePaths` is the manifest and each file is loaded through a path-limited Git diff. */
export class CommitDiffWorkspaceSource implements DiffWorkspaceSource {
    readonly key: string;
    private readonly cardPath: string;
    private readonly commit: CardCommit;

    constructor(commit: CardCommit, cardPath: string) {
        this.cardPath = cardPath;
        this.commit = commit;
        this.key = `commit:${commit.commit}:${cardPath}`;
    }

    async loadManifest(): Promise<DiffWorkspaceEntry[]> {
        return this.commit.filePaths.map((path) => ({ path }));
    }

    async loadFile(entry: DiffWorkspaceEntry): Promise<DiffWorkspaceFileContent> {
        if (entry.path === this.cardPath) {
            const bodyDiff = await loadCardBodyDiff(this.commit, this.cardPath);

            return { bodyDiff, kind: 'markdown' };
        }
        const result = await generateFileDiff(this.commit.commit, entry.path);

        return { kind: 'patch', result };
    }
}
