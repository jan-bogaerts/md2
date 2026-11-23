import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../data/data_types';
import type { PrimaryChange } from '../../data/primary_change_types';
import { dialogService } from '../dialog_service';
import {
    PRIMARY_CHANGES_COMMITTING_EVENT,
    PRIMARY_CHANGES_LIST_EVENT,
    PRIMARY_CHANGES_MESSAGE_EVENT,
    PrimaryChangesService,
} from './primary_changes_service';

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const untrackedChange: PrimaryChange = { path: 'later.txt', tracked: false, onDisk: true, kind: 'untracked' };
const modifiedChange: PrimaryChange = { path: 'base.txt', tracked: true, onDisk: true, kind: 'modified' };
const deletedChange: PrimaryChange = { path: 'base.txt', tracked: true, onDisk: false, kind: 'deleted' };

/** Commit promise the test settles explicitly, to observe the pending commit state. */
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

function createHarness(storageOverrides: Partial<StorageService> = {}) {
    const storage = {
        commitPrimaryChanges: vi.fn(async () => undefined),
        trashPrimaryChange: vi.fn(async () => [deletedChange]),
        ...storageOverrides,
    } as unknown as StorageService;
    const service = new PrimaryChangesService();
    service.init({ storage });

    return { service, storage };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('PrimaryChangesService', () => {
    it('commits every listed path with the entered message and resolves the review', async () => {
        const { service, storage } = createHarness();
        const review = service.review(project, [modifiedChange, untrackedChange]);
        service.setMessage('Save project changes');

        await service.confirm();

        expect(storage.commitPrimaryChanges).toHaveBeenCalledWith({
            message: 'Save project changes',
            paths: ['base.txt', 'later.txt'],
            project,
        });
        await expect(review).resolves.toBe(true);
        expect(service.isOpen()).toBe(false);
    });

    it('skips the commit when the list is empty', async () => {
        const { service, storage } = createHarness();
        const review = service.review(project, []);

        await service.confirm();

        expect(storage.commitPrimaryChanges).not.toHaveBeenCalled();
        await expect(review).resolves.toBe(true);
    });

    it('replaces the list with the refreshed changes after trashing a file', async () => {
        const { service, storage } = createHarness();
        const listListener = vi.fn();
        void service.review(project, [modifiedChange, untrackedChange]);
        service.addEventListener(PRIMARY_CHANGES_LIST_EVENT, listListener);

        await service.trash('base.txt');

        expect(storage.trashPrimaryChange).toHaveBeenCalledWith({ path: 'base.txt', project });
        expect(service.getChanges()).toEqual([deletedChange]);
        expect(listListener).toHaveBeenCalledOnce();
        expect(service.isBusy()).toBe(false);
    });

    it('reports a failing commit and keeps the dialog open', async () => {
        const failure = new Error('commit failed');
        const { service } = createHarness({ commitPrimaryChanges: vi.fn(async () => { throw failure; }) });
        const reportError = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as ReturnType<typeof dialogService.error>);
        void service.review(project, [modifiedChange]);
        service.setMessage('Save');

        await service.confirm();

        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not commit project changes' });
        expect(service.isOpen()).toBe(true);
        expect(service.isBusy()).toBe(false);
        expect(service.getMessage()).toBe('Save');
    });

    it('reports a failing trash and keeps the list', async () => {
        const failure = new Error('trash failed');
        const { service } = createHarness({ trashPrimaryChange: vi.fn(async () => { throw failure; }) });
        const reportError = vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as ReturnType<typeof dialogService.error>);
        const changes = [modifiedChange];
        void service.review(project, changes);

        await service.trash('base.txt');

        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not move base.txt to the trash' });
        expect(service.isOpen()).toBe(true);
        expect(service.getChanges()).toBe(changes);
    });

    it('resolves the review with false on cancel', async () => {
        const { service, storage } = createHarness();
        const review = service.review(project, [modifiedChange]);

        service.cancel();

        await expect(review).resolves.toBe(false);
        expect(storage.commitPrimaryChanges).not.toHaveBeenCalled();
        expect(service.getChanges()).toEqual([]);
    });

    it('signals only the message event when the message changes', () => {
        const { service } = createHarness();
        const messageListener = vi.fn();
        const listListener = vi.fn();
        void service.review(project, [modifiedChange]);
        service.addEventListener(PRIMARY_CHANGES_MESSAGE_EVENT, messageListener);
        service.addEventListener(PRIMARY_CHANGES_LIST_EVENT, listListener);

        service.setMessage('S');

        expect(messageListener).toHaveBeenCalledOnce();
        expect(listListener).not.toHaveBeenCalled();
    });

    it('resolves an open review with false on clear', async () => {
        const { service } = createHarness();
        const review = service.review(project, [modifiedChange]);

        service.clear();

        await expect(review).resolves.toBe(false);
    });

    it('marks the commit as running and signals the committing event until it succeeds', async () => {
        const { commitPrimaryChanges, resolveCommit } = createDeferredCommit();
        const { service } = createHarness({ commitPrimaryChanges });
        const committingListener = vi.fn();
        const review = service.review(project, [modifiedChange]);
        service.setMessage('Save');
        service.addEventListener(PRIMARY_CHANGES_COMMITTING_EVENT, committingListener);

        const confirmation = service.confirm();

        expect(service.isCommitting()).toBe(true);
        expect(committingListener).toHaveBeenCalledOnce();

        resolveCommit();
        await confirmation;

        expect(service.isCommitting()).toBe(false);
        expect(committingListener).toHaveBeenCalledTimes(2);
        await expect(review).resolves.toBe(true);
    });

    it('clears the commit state after a failing commit so it can be retried', async () => {
        const { commitPrimaryChanges, rejectCommit } = createDeferredCommit();
        const { service } = createHarness({ commitPrimaryChanges });
        vi.spyOn(dialogService, 'error').mockImplementation(() => ({}) as ReturnType<typeof dialogService.error>);
        const changes = [modifiedChange];
        void service.review(project, changes);
        service.setMessage('Save');

        const confirmation = service.confirm();
        expect(service.isCommitting()).toBe(true);

        rejectCommit(new Error('commit failed'));
        await confirmation;

        expect(service.isCommitting()).toBe(false);
        expect(service.canConfirm()).toBe(true);
        expect(service.getChanges()).toBe(changes);
        expect(service.getMessage()).toBe('Save');
    });

    it('resets the commit state when the service is cleared during a commit', () => {
        const { commitPrimaryChanges } = createDeferredCommit();
        const { service } = createHarness({ commitPrimaryChanges });
        void service.review(project, [modifiedChange]);
        service.setMessage('Save');
        void service.confirm();

        service.clear();

        expect(service.isCommitting()).toBe(false);
    });

    it('does not mark a trash operation as a commit', async () => {
        const { service } = createHarness();
        const committingListener = vi.fn();
        void service.review(project, [modifiedChange, untrackedChange]);
        service.addEventListener(PRIMARY_CHANGES_COMMITTING_EVENT, committingListener);

        const trashing = service.trash('base.txt');

        expect(service.isBusy()).toBe(true);
        expect(service.isCommitting()).toBe(false);
        await trashing;
        expect(committingListener).not.toHaveBeenCalled();
    });
});
