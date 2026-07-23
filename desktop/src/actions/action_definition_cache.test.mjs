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

function createCache(initialFiles) {
    const currentFiles = new Map(initialFiles.map((file) => [file.path, file]));
    const localGitService = {
        loadActionFile: vi.fn(async (_project, actionPath) => currentFiles.get(actionPath)),
        loadActionFiles: vi.fn(async () => initialFiles),
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
        const { cache, localGitService } = createCache([firstFile]);
        await cache.startProject(project, 'actions');
        localGitService.loadActionFiles.mockResolvedValueOnce([secondFile]);
        localGitService.loadActionFile.mockResolvedValueOnce(secondFile);

        await cache.startProject({ ...project, rootPath: 'C:/other' }, 'other-actions');

        await expect(cache.resolve('first', [])).rejects.toThrow('Unknown action: first');
        await expect(cache.resolve('second', [])).resolves.toMatchObject({ id: 'second' });
    });
});
