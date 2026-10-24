import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../data/data_types';
import type { PrimaryChange } from '../../data/primary_change_types';
import { dialogService } from '../dialog_service';
import { PRIMARY_CHANGES_LIST_EVENT, PRIMARY_CHANGES_MESSAGE_EVENT, PrimaryChangesService } from './primary_changes_service';

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };
const untrackedChange: PrimaryChange = { path: 'later.txt', tracked: false, onDisk: true, kind: 'untracked' };
const modifiedChange: PrimaryChange = { path: 'base.txt', tracked: true, onDisk: true, kind: 'modified' };
const deletedChange: PrimaryChange = { path: 'base.txt', tracked: true, onDisk: false, kind: 'deleted' };

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
});
