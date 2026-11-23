import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../data/data_types';
import type { PrimaryChange } from '../data/primary_change_types';
import { dialogService } from '../services/dialog_service';
import { primaryChangesService } from '../services/project/primary_changes_service';
import { AppThemeProvider } from '../theme/theme_provider';
import { PrimaryChangesDialog } from './primary_changes_dialog';

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const changes: PrimaryChange[] = [
    { path: 'later.txt', tracked: false, onDisk: true, kind: 'untracked' },
    { path: 'base.txt', tracked: true, onDisk: true, kind: 'modified' },
    { path: 'gone.txt', tracked: true, onDisk: false, kind: 'deleted' },
    { path: 'new.txt', originalPath: 'old.txt', tracked: true, onDisk: true, kind: 'renamed' },
];

function createStorage() {
    return {
        commitPrimaryChanges: vi.fn(async (): Promise<void> => undefined),
        trashPrimaryChange: vi.fn(async () => changes.slice(1)),
    };
}

/** Commit promise the test settles explicitly, to observe the dialog while the commit is pending. */
function createDeferredCommit() {
    let resolveCommit: () => void = () => undefined;
    let rejectCommit: (error: Error) => void = () => undefined;
    const commitPromise = new Promise<void>((resolve, reject) => {
        resolveCommit = resolve;
        rejectCommit = reject;
    });
    const commitPrimaryChanges = vi.fn(() => commitPromise);

    return { commitPrimaryChanges, rejectCommit, resolveCommit };
}

function renderReview(reviewChanges: PrimaryChange[] = changes, storage: ReturnType<typeof createStorage> = createStorage()) {
    primaryChangesService.init({ storage: storage as unknown as StorageService });
    render(
        <AppThemeProvider>
            <PrimaryChangesDialog />
        </AppThemeProvider>,
    );
    let review: Promise<boolean> = Promise.resolve(false);
    act(() => {
        review = primaryChangesService.review(project, reviewChanges);
    });

    return { review, storage };
}

async function startCommit(storage: ReturnType<typeof createStorage>) {
    const user = userEvent.setup();
    const rendered = renderReview(changes, storage);
    await user.type(screen.getByRole('textbox', { name: 'Commit message' }), 'Save');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    return { ...rendered, user };
}

afterEach(() => {
    vi.restoreAllMocks();
    primaryChangesService.clear();
    cleanup();
});

describe('PrimaryChangesDialog', () => {
    it('lists one row per change with rename paths', () => {
        renderReview();

        const list = screen.getByRole('list', { name: 'Uncommitted files' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(4);
        expect(within(list).getByText('old.txt → new.txt')).toBeInTheDocument();
        expect(within(list).getByText('gone.txt')).toBeInTheDocument();
    });

    it('labels each entry with its tracked state', async () => {
        const user = userEvent.setup();
        renderReview();

        expect(screen.getByRole('img', { name: 'Untracked: not yet in Git' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Tracked: modified' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Tracked: deleted' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Tracked: renamed' })).toBeInTheDocument();

        await user.hover(screen.getByRole('img', { name: 'Untracked: not yet in Git' }));

        expect(await screen.findByRole('tooltip')).toHaveTextContent('Untracked: not yet in Git');
    });

    it('offers the trash action only for files on disk and refreshes the list', async () => {
        const user = userEvent.setup();
        const { storage } = renderReview();

        expect(screen.getByRole('button', { name: 'Move later.txt to trash' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Move gone.txt to trash' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Move later.txt to trash' }));

        expect(storage.trashPrimaryChange).toHaveBeenCalledWith({ path: 'later.txt', project });
        expect(screen.queryByText('later.txt')).not.toBeInTheDocument();
    });

    it('disables OK while the commit message is blank', async () => {
        const user = userEvent.setup();
        renderReview();

        expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();

        await user.type(screen.getByRole('textbox', { name: 'Commit message' }), '   ');
        expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();

        await user.type(screen.getByRole('textbox', { name: 'Commit message' }), 'Save');
        expect(screen.getByRole('button', { name: 'OK' })).toBeEnabled();
    });

    it('enables OK for an empty list without a message', () => {
        renderReview([]);

        expect(screen.getByRole('button', { name: 'OK' })).toBeEnabled();
    });

    it('commits the listed files with the message on OK', async () => {
        const user = userEvent.setup();
        const { review, storage } = renderReview();

        await user.type(screen.getByRole('textbox', { name: 'Commit message' }), 'Save project changes');
        await user.click(screen.getByRole('button', { name: 'OK' }));

        expect(storage.commitPrimaryChanges).toHaveBeenCalledWith({
            message: 'Save project changes',
            paths: ['later.txt', 'base.txt', 'gone.txt', 'new.txt'],
            project,
        });
        await expect(review).resolves.toBe(true);
    });

    it('cancels the review without committing', async () => {
        const user = userEvent.setup();
        const { review, storage } = renderReview();

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(storage.commitPrimaryChanges).not.toHaveBeenCalled();
        await expect(review).resolves.toBe(false);
    });

    it('shows accessible commit progress and locks every control while the commit is pending', async () => {
        const deferredCommit = createDeferredCommit();
        const storage = { ...createStorage(), commitPrimaryChanges: deferredCommit.commitPrimaryChanges };
        const { review, user } = await startCommit(storage);

        expect(screen.getByRole('progressbar', { name: 'Committing project changes' })).toBeInTheDocument();
        expect(screen.getByText('Committing project changes...')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Committing...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'Commit message' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Move later.txt to trash' })).toBeDisabled();

        await user.keyboard('{Escape}');

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(primaryChangesService.isOpen()).toBe(true);

        await act(async () => {
            deferredCommit.resolveCommit();
            await review;
        });

        await expect(review).resolves.toBe(true);
        expect(primaryChangesService.isOpen()).toBe(false);
    });

    it('removes commit progress and restores controls after a failing commit', async () => {
        const reportError = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as ReturnType<typeof dialogService.error>);
        const deferredCommit = createDeferredCommit();
        const storage = { ...createStorage(), commitPrimaryChanges: deferredCommit.commitPrimaryChanges };
        const failure = new Error('commit failed');
        await startCommit(storage);

        await act(async () => {
            deferredCommit.rejectCommit(failure);
            await Promise.resolve();
        });

        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not commit project changes' });
        expect(screen.queryByRole('progressbar', { name: 'Committing project changes' })).not.toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Commit message' })).toHaveValue('Save');
        expect(screen.getByRole('textbox', { name: 'Commit message' })).toBeEnabled();
        expect(within(screen.getByRole('list', { name: 'Uncommitted files' })).getAllByRole('listitem')).toHaveLength(4);
        expect(screen.getByRole('button', { name: 'OK' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    it('does not present a pending trash operation as a commit', async () => {
        const user = userEvent.setup();
        let resolveTrash: (remaining: PrimaryChange[]) => void = () => undefined;
        const trashPromise = new Promise<PrimaryChange[]>((resolve) => {
            resolveTrash = resolve;
        });
        const storage = { ...createStorage(), trashPrimaryChange: vi.fn(() => trashPromise) };
        renderReview(changes, storage);

        await user.click(screen.getByRole('button', { name: 'Move later.txt to trash' }));

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Committing...' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();

        await act(async () => {
            resolveTrash(changes.slice(1));
            await trashPromise;
        });
    });
});
