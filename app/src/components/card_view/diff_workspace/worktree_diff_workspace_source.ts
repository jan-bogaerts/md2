import type { DiffFile } from '../../../data/electron_action_bridge';
import type { CardBodyDiff } from '../../../services/actions/card_commit_history';
import { markdownParsingService } from '../../../services/data/markdown_parsing_service';
import { worktreeService } from '../../../services/project/worktree_service';
import type { DiffWorkspaceEntry, DiffWorkspaceFileContent, DiffWorkspaceSource } from './diff_workspace_types';

function worktreeBodyDiff(file: DiffFile): CardBodyDiff {
    const oldExists = file.changeType !== 'added';
    const newExists = file.changeType !== 'deleted';

    return {
        newBody: newExists ? markdownParsingService.parse(file.newValue).body : '',
        newExists,
        oldBody: oldExists ? markdownParsingService.parse(file.oldValue).body : '',
        oldExists,
    };
}

/** Current-worktree source of one card: name-status metadata is the manifest and each file is read on demand. */
export class WorktreeDiffWorkspaceSource implements DiffWorkspaceSource {
    readonly key: string;
    private readonly cardPath: string;
    private revision: string | null = null;

    constructor(cardPath: string) {
        this.cardPath = cardPath;
        this.key = `worktree:${cardPath}`;
    }

    async loadManifest(): Promise<DiffWorkspaceEntry[]> {
        const { files, revision } = await worktreeService.listCardWorktreeChanges(this.cardPath);
        this.revision = revision;

        return files;
    }

    async loadFile(entry: DiffWorkspaceEntry): Promise<DiffWorkspaceFileContent> {
        if (!this.revision) throw new Error('Worktree changes must be listed before a file diff loads');
        const { file, patch, repositoryRoot } = await worktreeService.loadCardWorktreeFileDiff(this.cardPath, entry.path);
        if (entry.path === this.cardPath || entry.oldPath === this.cardPath) return { bodyDiff: worktreeBodyDiff(file), kind: 'markdown' };

        const result = { files: [file], patch, repositoryRoot, revision: this.revision };

        return { kind: 'patch', result };
    }
}
