import type { ProjectReference, StorageService } from '../../data/data_types';
import type { PrimaryChange } from '../../data/primary_change_types';
import { dialogService } from '../dialog_service';
import { register } from '../service_injector';

export const PRIMARY_CHANGES_OPEN_EVENT = 'open';
export const PRIMARY_CHANGES_LIST_EVENT = 'changes';
export const PRIMARY_CHANGES_MESSAGE_EVENT = 'message';
export const PRIMARY_CHANGES_BUSY_EVENT = 'busy';

const NO_CHANGES: PrimaryChange[] = [];

interface PrimaryChangesServiceDependencies {
    storage: StorageService;
}

interface PrimaryChangesReview {
    project: ProjectReference;
    resolve: (confirmed: boolean) => void;
}

/** Owns the review of uncommitted primary worktree changes that blocks a worktree integration. */
export class PrimaryChangesService extends EventTarget {
    private busy = false;
    private changes: PrimaryChange[] = NO_CHANGES;
    private dependencies: PrimaryChangesServiceDependencies | null = null;
    private message = '';
    private activeReview: PrimaryChangesReview | null = null;

    constructor() {
        super();
        register('primaryChangesService', this);
    }

    init(dependencies: PrimaryChangesServiceDependencies) {
        this.finishReview(false);
        this.dependencies = dependencies;
    }

    clear() {
        this.finishReview(false);
        this.dependencies = null;
    }

    isOpen() {
        return !!this.activeReview;
    }

    isBusy() {
        return this.busy;
    }

    getChanges() {
        return this.changes;
    }

    getMessage() {
        return this.message;
    }

    /** Opens the review dialog; resolves true after the listed changes were committed, false on cancel. */
    review(project: ProjectReference, changes: PrimaryChange[]) {
        if (this.activeReview) throw new Error('A primary changes review is already open');

        const reviewResult = new Promise<boolean>((resolve) => {
            this.activeReview = { project, resolve };
        });
        this.setChanges(changes);
        this.setMessage('');
        this.dispatchEvent(new Event(PRIMARY_CHANGES_OPEN_EVENT));

        return reviewResult;
    }

    setMessage(message: string) {
        if (this.message === message) return;

        this.message = message;
        this.dispatchEvent(new Event(PRIMARY_CHANGES_MESSAGE_EVENT));
    }

    async trash(path: string) {
        const { project, storage } = this.requireReview();
        if (this.busy) return;
        if (!storage.trashPrimaryChange) throw new Error('Moving files to the trash requires Electron local mode');

        this.setBusy(true);
        try {
            const trashRequest = { path, project };
            const changes = await storage.trashPrimaryChange(trashRequest);
            this.setChanges(changes);
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Could not move ${path} to the trash` });
        } finally {
            this.setBusy(false);
        }
    }

    /** OK is allowed when idle and either nothing is left to commit or a commit message was entered. */
    canConfirm() {
        return !this.busy && (this.changes.length === 0 || this.message.trim().length > 0);
    }

    async confirm() {
        const { project, storage } = this.requireReview();
        if (!this.canConfirm()) return;
        if (!storage.commitPrimaryChanges) throw new Error('Committing project changes requires Electron local mode');

        this.setBusy(true);
        try {
            if (this.changes.length > 0) {
                const commitRequest = { message: this.message, paths: this.changes.map(({ path }) => path), project };
                await storage.commitPrimaryChanges(commitRequest);
            }
        } catch (error) {
            this.setBusy(false);
            dialogService.error(error, { fallbackMessage: 'Could not commit project changes' });
            return;
        }
        this.finishReview(true);
    }

    cancel() {
        if (this.busy) return;

        this.finishReview(false);
    }

    private finishReview(confirmed: boolean) {
        const activeReview = this.activeReview;
        if (!activeReview) return;

        this.activeReview = null;
        this.setBusy(false);
        this.setChanges(NO_CHANGES);
        this.setMessage('');
        this.dispatchEvent(new Event(PRIMARY_CHANGES_OPEN_EVENT));
        activeReview.resolve(confirmed);
    }

    private setChanges(changes: PrimaryChange[]) {
        if (this.changes === changes) return;

        this.changes = changes;
        this.dispatchEvent(new Event(PRIMARY_CHANGES_LIST_EVENT));
    }

    private setBusy(busy: boolean) {
        if (this.busy === busy) return;

        this.busy = busy;
        this.dispatchEvent(new Event(PRIMARY_CHANGES_BUSY_EVENT));
    }

    private requireReview() {
        if (!this.activeReview) throw new Error('No primary changes review is open');
        if (!this.dependencies) throw new Error('Primary changes service is not initialized');

        return { project: this.activeReview.project, storage: this.dependencies.storage };
    }
}

export const primaryChangesService = new PrimaryChangesService();
