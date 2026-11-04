import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../data/data_types';
import type { PrimaryChange } from '../data/primary_change_types';
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
        commitPrimaryChanges: vi.fn(async () => undefined),
        trashPrimaryChange: vi.fn(async () => changes.slice(1)),
    };
}

function renderReview(reviewChanges: PrimaryChange[] = changes) {
    const storage = createStorage();
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

afterEach(() => {
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
});
