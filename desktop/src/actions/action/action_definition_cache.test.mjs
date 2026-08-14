import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionDefinitionCache } = require('./action_definition_cache');

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' };

function actionFile(id, overrides = {}) {
    return {
        content: JSON.stringify({
            command: id,
            description: `${id} description`,
            id,
            label: id,
            type: 'command',
            ...overrides,
        }),
        path: `actions/${id}.json`,
    };
}

function missingFileError(actionPath) {
    const error = new Error(`ENOENT: no such file or directory, open '${actionPath}'`);
    error.code = 'ENOENT';

    return error;
}

function createCache(initialFiles) {
    const currentFiles = new Map(initialFiles.map((file) => [file.path, file]));
    const localGitService = {
        loadActionFile: vi.fn(async (_project, actionPath) => {
            const file = currentFiles.get(actionPath);
            if (!file) throw missingFileError(actionPath);

            return file;
        }),
        loadActionFiles: vi.fn(async () => [...currentFiles.values()]),
    };
    const cache = new ActionDefinitionCache({ localGitService });

    return { cache, currentFiles, localGitService };
}

describe('ActionDefinitionCache', () => {
    it('indexes all ids once and re-reads only requested action', async () => {
        const files = [actionFile('first'), actionFile('second')];
        const { cache, currentFiles, localGitService } = createCache(files);
        await cache.startProject(project, 'actions');
        currentFiles.set('actions/second.json', actionFile('second', { command: 'current command' }));

        await expect(cache.resolve('second', [])).resolves.toMatchObject({ command: 'current command', id: 'second' });
        expect(localGitService.loadActionFiles).toHaveBeenCalledOnce();
        expect(localGitService.loadActionFile).toHaveBeenCalledOnce();
        expect(localGitService.loadActionFile).toHaveBeenCalledWith(project, 'actions/second.json');
    });

    it('re-reads linked definitions without reading unrelated definitions', async () => {
        const files = [
            actionFile('before'),
            actionFile('main', { onBefore: ['before'] }),
            actionFile('unrelated'),
        ];
        const { cache, localGitService } = createCache(files);
        await cache.startProject(project, 'actions');

        await expect(cache.resolve('main', [])).resolves.toMatchObject({
            id: 'main',
            onBefore: [expect.objectContaining({ id: 'before' })],
        });
        expect(localGitService.loadActionFile.mock.calls.map((call) => call[1]))
            .toEqual(['actions/main.json', 'actions/before.json']);
    });

    it('refreshes a renamed root path once and keeps using the new path', async () => {
        const oldFile = actionFile('main');
        const newFile = { ...actionFile('main', { command: 'current command' }), path: 'actions/current-name.json' };
        const { cache, currentFiles, localGitService } = createCache([oldFile]);
        await cache.startProject(project, 'actions');
        currentFiles.delete(oldFile.path);
        currentFiles.set(newFile.path, newFile);

        await expect(cache.resolve('main', [])).resolves.toMatchObject({ command: 'current command', id: 'main' });
        await expect(cache.resolve('main', [])).resolves.toMatchObject({ command: 'current command', id: 'main' });
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2);
        expect(localGitService.loadActionFile.mock.calls.map((call) => call[1]))
            .toEqual(['actions/main.json', 'actions/current-name.json', 'actions/current-name.json']);
    });

    it.each([
        ['onBefore', { onBefore: ['linked'] }, 'onBefore'],
        ['on', { on: [{ actionId: 'linked', condition: 'main' }] }, 'on'],
        ['onAfter', { onAfter: ['linked'] }, 'onAfter'],
    ])('refreshes a renamed linked action used through %s', async (_label, link, field) => {
        const oldLinkedFile = actionFile('linked');
        const newLinkedFile = { ...actionFile('linked', { command: 'current linked command' }), path: 'actions/current-linked.json' };
        const { cache, currentFiles, localGitService } = createCache([actionFile('main', link), oldLinkedFile]);
        await cache.startProject(project, 'actions');
        currentFiles.delete(oldLinkedFile.path);
        currentFiles.set(newLinkedFile.path, newLinkedFile);

        const action = await cache.resolve('main', []);

        if (field === 'on') expect(action.on[0].action).toMatchObject({ command: 'current linked command', id: 'linked' });
        else expect(action[field][0]).toMatchObject({ command: 'current linked command', id: 'linked' });
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2);
        expect(localGitService.loadActionFile.mock.calls.map((call) => call[1]))
            .toEqual(['actions/main.json', 'actions/linked.json', 'actions/main.json', 'actions/current-linked.json']);
    });

    it('refreshes once before reporting a truly missing action', async () => {
        const { cache, localGitService } = createCache([actionFile('other')]);
        await cache.startProject(project, 'actions');

        await expect(cache.resolve('missing', [])).rejects.toThrow('Unknown action: missing');
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2);
        expect(localGitService.loadActionFile).not.toHaveBeenCalled();
    });

    it('does not refresh again when the retried current path also disappears', async () => {
        const oldFile = actionFile('main');
        const newFile = { ...actionFile('main'), path: 'actions/current-name.json' };
        const { cache, currentFiles, localGitService } = createCache([oldFile]);
        await cache.startProject(project, 'actions');
        currentFiles.delete(oldFile.path);
        currentFiles.set(newFile.path, newFile);
        localGitService.loadActionFile.mockRejectedValue(missingFileError('action disappeared'));

        await expect(cache.resolve('main', [])).rejects.toMatchObject({ code: 'ENOENT' });
        expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2);
        expect(localGitService.loadActionFile).toHaveBeenCalledTimes(2);
    });

    it('does not publish a stale refresh after the project switches', async () => {
        const oldFile = actionFile('old');
        const newFile = actionFile('new');
        const { promise, resolve } = Promise.withResolvers();
        const { cache, currentFiles, localGitService } = createCache([oldFile]);
        await cache.startProject(project, 'actions');
        currentFiles.delete(oldFile.path);
        localGitService.loadActionFiles.mockImplementationOnce(async () => promise);

        const oldResolution = cache.resolve('old', []);
        await vi.waitFor(() => expect(localGitService.loadActionFiles).toHaveBeenCalledTimes(2));
        currentFiles.set(newFile.path, newFile);
        await cache.startProject({ ...project, rootPath: 'C:/other' }, 'other-actions');
        resolve([oldFile]);

        await expect(oldResolution).rejects.toThrow('Unknown action: old');
        await expect(cache.resolve('new', [])).resolves.toMatchObject({ id: 'new' });
        expect(localGitService.loadActionFile.mock.calls.at(-1))
            .toEqual([{ ...project, rootPath: 'C:/other' }, 'actions/new.json']);
    });

    it('propagates non-ENOENT reads without refreshing paths', async () => {
        const { cache, localGitService } = createCache([actionFile('main')]);
        const permissionError = Object.assign(new Error('Access denied'), { code: 'EACCES' });
        await cache.startProject(project, 'actions');
        localGitService.loadActionFile.mockRejectedValueOnce(permissionError);

        await expect(cache.resolve('main', [])).rejects.toBe(permissionError);
        expect(localGitService.loadActionFiles).toHaveBeenCalledOnce();
    });

    it('keeps builtin actions transparent without reading a file', async () => {
        const { cache, localGitService } = createCache([]);
        await cache.startProject(project, 'actions');

        await expect(cache.resolve('md2.convert-remarkable-images-to-text', []))
            .resolves.toMatchObject({ builtin: true, id: 'md2.convert-remarkable-images-to-text' });
        expect(localGitService.loadActionFile).not.toHaveBeenCalled();
    });

    it('rebuilds id paths on project switch', async () => {
        const firstFile = actionFile('first');
        const secondFile = actionFile('second');
        const { cache, currentFiles } = createCache([firstFile]);
        await cache.startProject(project, 'actions');
        currentFiles.clear();
        currentFiles.set(secondFile.path, secondFile);

        await cache.startProject({ ...project, rootPath: 'C:/other' }, 'other-actions');

        await expect(cache.resolve('first', [])).rejects.toThrow('Unknown action: first');
        await expect(cache.resolve('second', [])).resolves.toMatchObject({ id: 'second' });
    });
});
