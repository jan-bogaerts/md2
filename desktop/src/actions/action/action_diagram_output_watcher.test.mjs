import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionDiagramOutputWatcher } = require('./action_diagram_output_watcher');

const validDiagram = JSON.stringify({
    edges: [],
    meta: { description: 'Valid', title: 'Valid', type: 'architecture', version: 1 },
    nodes: [{ id: 'node', label: 'Node', role: 'focal' }],
});

describe('ActionDiagramOutputWatcher', () => {
    it('ignores missing, partial, invalid, and unrelated files before accepting later valid JSON', async () => {
        let content = null;
        let handleEvents;
        const unsubscribe = vi.fn(async () => undefined);
        const subscribe = vi.fn(async (_root, listener) => {
            handleEvents = listener;

            return { unsubscribe };
        });
        const readFile = vi.fn(async () => {
            if (content === null) {
                const error = new Error('missing');
                error.code = 'ENOENT';
                throw error;
            }

            return content;
        });
        const handleReady = vi.fn();
        const handleError = vi.fn();
        const watcher = new ActionDiagramOutputWatcher({
            diagramFile: 'C:/repo/design/diagrams/output.json',
            handleError,
            handleReady,
            projectRoot: 'C:/repo',
        }, { readFile, subscribe });

        await watcher.start();
        content = '{';
        handleEvents(null, [{ path: 'C:/repo/design/diagrams/output.json' }]);
        await watcher.checkPromise;
        content = JSON.stringify({ nope: true });
        handleEvents(null, [{ path: 'C:/repo/design/diagrams/output.json' }]);
        await watcher.checkPromise;
        content = validDiagram;
        handleEvents(null, [{ path: 'C:/repo/other.json' }]);
        await watcher.checkPromise;
        expect(handleReady).not.toHaveBeenCalled();

        handleEvents(null, [{ path: 'C:/repo/design/diagrams/output.json' }]);
        await watcher.checkPromise;

        expect(handleReady).toHaveBeenCalledOnce();
        expect(handleError).not.toHaveBeenCalled();
        await watcher.close();
        expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it('reports read and subscription failures', async () => {
        const readFailure = new Error('diagram read failed');
        const handleError = vi.fn();
        const watcher = new ActionDiagramOutputWatcher({
            diagramFile: 'C:/repo/design/diagrams/output.json',
            handleError,
            handleReady: vi.fn(),
            projectRoot: 'C:/repo',
        }, {
            readFile: vi.fn(async () => { throw readFailure; }),
            subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })),
        });

        await expect(watcher.start()).rejects.toThrow('diagram read failed');
        await watcher.close();
        expect(handleError).not.toHaveBeenCalled();
        await expect(new ActionDiagramOutputWatcher({
            diagramFile: 'C:/repo/design/diagrams/output.json',
            handleError,
            handleReady: vi.fn(),
            projectRoot: 'C:/repo',
        }, { subscribe: vi.fn(async () => { throw new Error('watch failed'); }) }).start()).rejects.toThrow('watch failed');
    });
});
