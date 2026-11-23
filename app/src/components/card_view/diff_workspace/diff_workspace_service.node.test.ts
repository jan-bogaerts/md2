import { afterEach, describe, expect, it, vi } from 'vitest';
import { dialogService } from '../../../services/dialog_service';
import { DiffWorkspaceService } from './diff_workspace_service';
import type { DiffWorkspaceEntry, DiffWorkspaceFileContent, DiffWorkspaceSource } from './diff_workspace_types';

interface Deferred<Value> {
    promise: Promise<Value>;
    reject: (error: unknown) => void;
    resolve: (value: Value) => void;
}

function deferred<Value>(): Deferred<Value> {
    let resolve: (value: Value) => void = () => undefined;
    let reject: (error: unknown) => void = () => undefined;
    const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, reject, resolve };
}

function patchContent(patch: string): DiffWorkspaceFileContent {
    return { kind: 'patch', result: { commit: 'abc', files: [], patch } };
}

const ENTRIES: DiffWorkspaceEntry[] = [{ path: 'app/a.ts' }, { path: 'docs/a.ts' }, { changeType: 'renamed', oldPath: 'old.ts', path: 'new.ts' }];

function createSource(key = 'commit:abc', entries = ENTRIES) {
    const loadFile = vi.fn(async (entry: DiffWorkspaceEntry) => patchContent(`patch ${entry.path}`));
    const loadManifest = vi.fn(async () => entries);
    const source: DiffWorkspaceSource = { key, loadFile, loadManifest };

    return { loadFile, loadManifest, source };
}

async function settle() {
    await Promise.resolve();
    await Promise.resolve();
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DiffWorkspaceService', () => {
    it('loads only the manifest when a source is set and starts on the Files tab', async () => {
        const service = new DiffWorkspaceService();
        const { loadFile, loadManifest, source } = createSource();

        service.setSource(source);
        expect(service.getManifest()).toEqual({ status: 'loading' });
        await settle();

        expect(loadManifest).toHaveBeenCalledTimes(1);
        expect(service.getManifest()).toEqual({ entries: ENTRIES, status: 'ready' });
        expect(service.getActivePath()).toBeNull();
        expect(service.getOpenPaths()).toEqual([]);
        expect(loadFile).not.toHaveBeenCalled();
    });

    it('opens one tab per path, reuses it, and loads only the activated file once', async () => {
        const service = new DiffWorkspaceService();
        const { loadFile, source } = createSource();
        service.setSource(source);
        await settle();

        service.openFile('app/a.ts');
        expect(service.getFileState('app/a.ts')).toEqual({ status: 'loading' });
        await settle();
        service.openFile('docs/a.ts');
        await settle();
        service.showFiles();
        service.openFile('app/a.ts');

        expect(service.getOpenPaths()).toEqual(['app/a.ts', 'docs/a.ts']);
        expect(service.getActivePath()).toBe('app/a.ts');
        expect(loadFile).toHaveBeenCalledTimes(2);
        expect(loadFile).toHaveBeenNthCalledWith(1, { path: 'app/a.ts' });
        expect(service.getFileState('app/a.ts')).toEqual({ content: patchContent('patch app/a.ts'), status: 'ready' });
    });

    it('ignores paths that are not in the manifest', async () => {
        const service = new DiffWorkspaceService();
        const { loadFile, source } = createSource();
        service.setSource(source);
        await settle();

        service.openFile('missing.ts');

        expect(service.getOpenPaths()).toEqual([]);
        expect(loadFile).not.toHaveBeenCalled();
    });

    it('marks a file with an empty patch as empty', async () => {
        const service = new DiffWorkspaceService();
        const { loadFile, source } = createSource();
        loadFile.mockResolvedValueOnce(patchContent('  '));
        service.setSource(source);
        await settle();

        service.openFile('app/a.ts');
        await settle();

        expect(service.getFileState('app/a.ts')).toEqual({ status: 'empty' });
    });

    it('keeps a file failure scoped to its tab and retries it on the next activation', async () => {
        const reportError = vi.spyOn(dialogService, 'error');
        const service = new DiffWorkspaceService();
        const { loadFile, source } = createSource();
        const failure = new Error('file vanished');
        loadFile.mockRejectedValueOnce(failure);
        service.setSource(source);
        await settle();

        service.openFile('app/a.ts');
        await settle();
        service.openFile('docs/a.ts');
        await settle();

        expect(service.getFileState('app/a.ts')).toEqual({ error: failure, status: 'error' });
        expect(service.getFileState('docs/a.ts').status).toBe('ready');
        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not load diff for app/a.ts' });

        service.openFile('app/a.ts');
        await settle();
        expect(service.getFileState('app/a.ts').status).toBe('ready');
    });

    it('reports manifest failures without opening tabs', async () => {
        const reportError = vi.spyOn(dialogService, 'error');
        const service = new DiffWorkspaceService();
        const { loadManifest, source } = createSource();
        const failure = new Error('assigned worktree missing');
        loadManifest.mockRejectedValueOnce(failure);

        service.setSource(source);
        await settle();

        expect(service.getManifest()).toEqual({ error: failure, status: 'error' });
        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not load changed files' });
    });

    it('rejects stale manifest and file responses after the source changes', async () => {
        const service = new DiffWorkspaceService();
        const first = createSource('commit:first');
        const pendingFile = deferred<DiffWorkspaceFileContent>();
        first.loadFile.mockReturnValueOnce(pendingFile.promise);
        service.setSource(first.source);
        await settle();
        service.openFile('app/a.ts');

        const second = createSource('commit:second', [{ path: 'other.ts' }]);
        const pendingManifest = deferred<DiffWorkspaceEntry[]>();
        second.loadManifest.mockReturnValueOnce(pendingManifest.promise);
        service.setSource(second.source);
        pendingFile.resolve(patchContent('stale'));
        await settle();

        expect(service.getFileState('app/a.ts')).toEqual({ status: 'loading' });
        expect(service.getOpenPaths()).toEqual([]);
        expect(service.getActivePath()).toBeNull();

        const third = createSource('commit:third', [{ path: 'third.ts' }]);
        service.setSource(third.source);
        pendingManifest.resolve([{ path: 'other.ts' }]);
        await settle();

        expect(service.getManifest()).toEqual({ entries: [{ path: 'third.ts' }], status: 'ready' });
    });

    it('keeps the workspace when the same source key is set again', async () => {
        const service = new DiffWorkspaceService();
        const { loadManifest, source } = createSource();
        service.setSource(source);
        await settle();
        service.openFile('app/a.ts');

        service.setSource(createSource().source);

        expect(loadManifest).toHaveBeenCalledTimes(1);
        expect(service.getOpenPaths()).toEqual(['app/a.ts']);
    });

    it('resets tabs, active tab, and cache and publishes granular events', async () => {
        const service = new DiffWorkspaceService();
        const { source } = createSource();
        service.setSource(source);
        await settle();
        service.openFile('app/a.ts');
        await settle();
        const fileListener = vi.fn();
        const activeListener = vi.fn();
        const otherFileListener = vi.fn();
        service.subscribeFile('app/a.ts')(fileListener);
        service.subscribeFile('docs/a.ts')(otherFileListener);
        service.subscribeActivePath(activeListener);

        service.reset();

        expect(service.getOpenPaths()).toEqual([]);
        expect(service.getActivePath()).toBeNull();
        expect(service.getManifest()).toEqual({ status: 'loading' });
        expect(service.getFileState('app/a.ts')).toEqual({ status: 'loading' });
        expect(fileListener).toHaveBeenCalledTimes(1);
        expect(activeListener).toHaveBeenCalledTimes(1);
        expect(otherFileListener).not.toHaveBeenCalled();
    });
});
