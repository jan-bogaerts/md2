import { describe, expect, it, vi } from 'vitest';
import type { ProjectWatchEvent } from '../../data/data_types';
import { JsonDataService } from './json_data_service';

function createDeferred<T>() {
    let resolveDeferred: (value: T) => void = () => undefined;
    const promise = new Promise<T>((resolve) => {
        resolveDeferred = resolve;
    });

    return { promise, resolve: resolveDeferred };
}

function createHarness(content = '{"value":1}') {
    let state = {
        project: { branch: 'main', id: 'project' },
        runningAgents: [],
        snapshot: { activeCards: [], backgroundCards: [], repositoryFiles: ['data.json'], workingFolder: 'design' },
    };
    const dataOwner = Object.assign(new EventTarget(), {
        getState: () => state,
        loadLocalJsonFile: vi.fn(async (path: string) => ({ content, path })),
        loadRepositoryTextFile: vi.fn(async (path: string) => ({ content, path })),
    });
    const dialogs = { warning: vi.fn() };
    const openFilesOwner = Object.assign(new EventTarget(), { discardDocument: vi.fn() });
    const projectAccess = { getSnapshot: () => false };
    const service = new JsonDataService();
    service.init({ dataOwner, dialogs: dialogs as never, openFilesOwner, projectAccess });
    const publish = (detail: ProjectWatchEvent) => dataOwner.dispatchEvent(new CustomEvent('repositoryChanged', { detail }));
    const setState = (nextState: typeof state) => {
        state = nextState;
        dataOwner.dispatchEvent(new Event('changed'));
    };

    return { dataOwner, dialogs, openFilesOwner, publish, service, setState };
}

describe('JsonDataService', () => {
    it('loads, parses, and reuses one document per project path', async () => {
        const { dataOwner, service } = createHarness();

        const first = await service.open('data.json');
        const second = await service.open('data.json');

        expect(first).toBe(second);
        expect(first.getValue()).toEqual({ value: 1 });
        expect(dataOwner.loadRepositoryTextFile).toHaveBeenCalledOnce();
    });

    it('loads and reuses an editable local document by absolute path', async () => {
        const { dataOwner, service } = createHarness();

        const first = await service.openLocal('C:/shared/data.json');
        const second = await service.openLocal('C:/shared/data.json');

        expect(first).toBe(second);
        expect(first.persistence).toBe('local');
        expect(first.readOnly).toBe(false);
        expect(dataOwner.loadLocalJsonFile).toHaveBeenCalledOnce();
    });

    it('shares one in-flight load between concurrent opens', async () => {
        const harness = createHarness();
        const deferredLoad = createDeferred<{ content: string; path: string }>();
        harness.dataOwner.loadRepositoryTextFile.mockImplementationOnce(() => deferredLoad.promise);

        const first = harness.service.open('data.json');
        const second = harness.service.open('data.json');
        deferredLoad.resolve({ content: '{"value":1}', path: 'data.json' });

        await expect(first).resolves.toBe(await second);
        expect(harness.dataOwner.loadRepositoryTextFile).toHaveBeenCalledOnce();
    });

    it('rejects a load completed after the active project changes', async () => {
        const harness = createHarness();
        const deferredLoad = createDeferred<{ content: string; path: string }>();
        harness.dataOwner.loadRepositoryTextFile.mockImplementationOnce(() => deferredLoad.promise);

        const opening = harness.service.open('data.json');
        harness.setState({
            project: { branch: 'main', id: 'other-project' },
            runningAgents: [],
            snapshot: { activeCards: [], backgroundCards: [], repositoryFiles: ['data.json'], workingFolder: 'design' },
        });
        deferredLoad.resolve({ content: '{"value":1}', path: 'data.json' });

        await expect(opening).rejects.toThrow('Active project changed');
        expect(harness.service.find('data.json')).toBeNull();
    });

    it('rejects missing and malformed files without retaining a document', async () => {
        const missing = createHarness();
        await expect(missing.service.open('missing.json')).rejects.toThrow('does not exist');

        const malformed = createHarness('{');
        await expect(malformed.service.open('data.json')).rejects.toThrow('Invalid JSON');
        expect(malformed.service.find('data.json')).toBeNull();
    });

    it('reloads a clean document after external change', async () => {
        const harness = createHarness();
        const document = await harness.service.open('data.json');
        harness.dataOwner.loadRepositoryTextFile.mockResolvedValueOnce({ content: '{"value":2}', path: 'data.json' });

        harness.publish({ changeKind: 'changed', path: 'data.json' });
        await vi.waitFor(() => expect(document.getValue()).toEqual({ value: 2 }));
    });

    it('invalidates a clean document when external content is malformed', async () => {
        const harness = createHarness();
        const document = await harness.service.open('data.json');
        harness.dataOwner.loadRepositoryTextFile.mockResolvedValueOnce({ content: '{', path: 'data.json' });

        harness.publish({ changeKind: 'changed', path: 'data.json' });
        await vi.waitFor(() => expect(document.getSnapshot().unavailableReason).toContain('Invalid JSON'));

        expect(harness.service.find('data.json')).toBeNull();
        expect(harness.openFilesOwner.discardDocument).toHaveBeenCalledWith(document);
    });

    it('keeps dirty draft and warns after external change', async () => {
        const harness = createHarness();
        const document = await harness.service.open('data.json');
        document.setCurrentChild('value', 2);
        harness.dataOwner.loadRepositoryTextFile.mockClear();

        harness.publish({ changeKind: 'changed', path: 'data.json' });

        expect(document.getValue()).toEqual({ value: 2 });
        expect(document.getSnapshot().externalConflict).toBe(true);
        expect(harness.dataOwner.loadRepositoryTextFile).not.toHaveBeenCalled();
        expect(harness.dialogs.warning).toHaveBeenCalledWith(
            expect.stringContaining('Local draft was kept'),
            expect.objectContaining({ title: 'JSON file changed externally' }),
        );

        harness.publish({ changeKind: 'changed', path: 'data.json' });
        expect(harness.dialogs.warning).toHaveBeenCalledOnce();
    });

    it('invalidates and closes a clean document removed externally', async () => {
        const harness = createHarness();
        const document = await harness.service.open('data.json');

        harness.publish({ changeKind: 'removed', path: 'data.json' });

        expect(harness.service.find('data.json')).toBeNull();
        expect(document.getSnapshot().unavailableReason).toContain('removed outside');
        expect(harness.openFilesOwner.discardDocument).toHaveBeenCalledWith(document);
    });

    it('releases a document after its final open-files registration is removed', async () => {
        const harness = createHarness();
        const document = await harness.service.open('data.json');

        harness.openFilesOwner.dispatchEvent(new CustomEvent('removed', { detail: { document } }));

        expect(harness.service.find('data.json')).toBeNull();
    });
});
