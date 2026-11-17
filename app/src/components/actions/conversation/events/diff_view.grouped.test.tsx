import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitReference, DiffFile, DiffResult, WorktreeDiffResult } from '../../../../data/electron_action_bridge';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { DialogDisplay } from '../../../dialog_display';
import { diffCommentService } from './diff_comment_service';
import { DiffView } from './diff_view';

const MODIFY_PATCH = [
    'diff --git a/design/F-010.md b/design/F-010.md',
    'index 1111111..2222222 100644',
    '--- a/design/F-010.md',
    '+++ b/design/F-010.md',
    '@@ -10,2 +10,3 @@ section',
    ' unchanged',
    '+new line',
    ' trailing',
].join('\n');

const RENAME_PATCH = [
    'diff --git a/design/old.md b/design/new.md',
    'similarity index 80%',
    'rename from design/old.md',
    'rename to design/new.md',
    '--- a/design/old.md',
    '+++ b/design/new.md',
    '@@ -4,1 +4,1 @@ section',
    '-old line',
    '+new line',
].join('\n');

const BINARY_PATCH = [
    'diff --git a/assets/image.png b/assets/image.png',
    'index 1111111..2222222 100644',
    'Binary files a/assets/image.png and b/assets/image.png differ',
].join('\n');

function diffFile(overrides: Partial<DiffFile> = {}): DiffFile {
    return {
        newValue: 'unchanged\nnew line\ntrailing',
        oldValue: 'unchanged\ntrailing',
        path: 'design/F-010.md',
        ...overrides,
    };
}

const commitReference: CommitReference = {
    actionId: 'action-commit',
    actionName: 'Commit changes',
    branch: 'main',
    commit: 'abc1234',
    committedAt: '2026-07-05T10:00:00.000Z',
    deletions: 0,
    filePaths: ['design/F-010.md'],
    filesChanged: 1,
    insertions: 1,
    repositoryRoot: 'C:/repo',
};

function diffResult(patch = MODIFY_PATCH): DiffResult {
    return { commit: 'abc1234', files: [diffFile()], patch, repositoryRoot: 'C:/repo' };
}

function worktreeResult(patch = RENAME_PATCH): WorktreeDiffResult {
    return {
        files: [diffFile({ changeType: 'renamed', oldPath: 'design/old.md', path: 'design/new.md' })],
        patch,
        repositoryRoot: 'C:/worktree',
        revision: 'worktree-1',
    };
}

function renderDiff(view: React.ReactNode) {
    return render(<AppThemeProvider>{view}</AppThemeProvider>);
}

describe('DiffView', () => {
    beforeEach(() => {
        diffCommentService.clear();
        HTMLElement.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('renders split hunks and both file paths from the unified patch', async () => {
        const generateDiff = vi.fn(async () => diffResult());
        const { container } = renderDiff(
            <DiffView commitReference={commitReference} generateDiff={generateDiff} openDiffLine={vi.fn()} />,
        );

        await screen.findByRole('region', { name: 'Commit diff' });
        expect(container.querySelector('.diff-split')).toBeInTheDocument();
        expect(screen.getAllByText('design/F-010.md')).toHaveLength(2);
        expect(screen.getByText('new line')).toBeInTheDocument();
        expect(generateDiff).toHaveBeenCalledWith(commitReference);
    });

    it('scrolls the initial parsed file into view', async () => {
        renderDiff(<DiffView initialPath="design/new.md" label="Worktree diff" openDiffLine={vi.fn()} result={worktreeResult()} />);

        await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' }));
    });

    it('opens the correct renamed old and new paths at real patch lines', async () => {
        const user = userEvent.setup();
        const openDiffLine = vi.fn(async () => {});
        renderDiff(<DiffView label="Worktree diff" openDiffLine={openDiffLine} result={worktreeResult()} />);

        await user.click(await screen.findByRole('button', { name: 'Open old line 4 in editor' }));
        await user.click(screen.getByRole('button', { name: 'Open new line 4 in editor' }));

        expect(openDiffLine).toHaveBeenNthCalledWith(1, { line: 4, path: 'design/old.md', repositoryRoot: 'C:/worktree' });
        expect(openDiffLine).toHaveBeenNthCalledWith(2, { line: 4, path: 'design/new.md', repositoryRoot: 'C:/worktree' });
    });

    it('renders binary files through a safe fallback without comment controls', async () => {
        const result = {
            ...worktreeResult(BINARY_PATCH),
            files: [diffFile({ changeType: 'modified', path: 'assets/image.png' })],
        };
        renderDiff(<DiffView label="Binary diff" openDiffLine={vi.fn()} result={result} />);

        expect(await screen.findByText('Modified file: no text changes available for review.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add comment/u })).not.toBeInTheDocument();
        expect(screen.getAllByText('assets/image.png')).toHaveLength(2);
    });

    it('shows unavailable state and reports malformed patches', async () => {
        renderDiff(
            <>
                <DialogDisplay />
                <DiffView commitReference={commitReference} generateDiff={vi.fn(async () => diffResult('not a patch'))} openDiffLine={vi.fn()} />
            </>,
        );

        expect(await screen.findByText('Diff unavailable.')).toBeInTheDocument();
        expect(screen.getByText(/Cannot read properties|parseable files/u)).toBeInTheDocument();
    });

    it('keeps comment actions separate from editor opening', async () => {
        const user = userEvent.setup();
        const openDiffLine = vi.fn(async () => {});
        renderDiff(
            <DiffView commitReference={commitReference} generateDiff={vi.fn(async () => diffResult())} openDiffLine={openDiffLine} />,
        );

        await user.click(await screen.findByRole('button', { name: 'Add comment on new line 11' }));
        await user.type(screen.getByRole('textbox', { name: 'Review comment' }), 'Inline note');
        await user.click(screen.getByRole('button', { name: 'Save comment' }));

        expect(screen.getByText('Inline note')).toBeInTheDocument();
        expect(openDiffLine).not.toHaveBeenCalled();
    });
});
