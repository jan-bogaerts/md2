import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { APP_USER_MODEL_ID, registerRecentProjectsJumpList } = require('./recent_projects_jump_list');

const RECENT_KEY = 'md2.recentLocalRepositories';
const originalPlatform = process.platform;

function createApp(options = {}) {
    return {
        isPackaged: options.isPackaged ?? true,
        setAppUserModelId: vi.fn(),
        setJumpList: vi.fn(() => options.jumpListResult ?? 'ok'),
    };
}

function createStore(initialValue) {
    const values = new Map([[RECENT_KEY, initialValue]]);
    const changeListeners = [];

    return {
        get: vi.fn((key, fallback) => values.get(key) ?? fallback),
        onDidChange: vi.fn((key, listener) => changeListeners.push({ key, listener })),
        set(key, value) {
            values.set(key, value);
            changeListeners.filter((entry) => entry.key === key).forEach((entry) => entry.listener());
        },
    };
}

function setPlatform(platform) {
    Object.defineProperty(process, 'platform', { configurable: true, value: platform });
}

describe('registerRecentProjectsJumpList', () => {
    beforeEach(() => setPlatform('win32'));

    afterEach(() => setPlatform(originalPlatform));

    it('does nothing when unpackaged', () => {
        const app = createApp({ isPackaged: false });
        const applicationStateStore = createStore(JSON.stringify(['C:\\repo']));

        registerRecentProjectsJumpList({ app, applicationStateStore, errorReporter: vi.fn() });

        expect(app.setAppUserModelId).not.toHaveBeenCalled();
        expect(app.setJumpList).not.toHaveBeenCalled();
        expect(applicationStateStore.onDidChange).not.toHaveBeenCalled();
    });

    it('does nothing outside Windows', () => {
        setPlatform('linux');
        const app = createApp();

        registerRecentProjectsJumpList({ app, applicationStateStore: createStore(null), errorReporter: vi.fn() });

        expect(app.setJumpList).not.toHaveBeenCalled();
    });

    it('sets the app user model id and one recent project task per folder', () => {
        const app = createApp();
        const applicationStateStore = createStore(JSON.stringify(['C:\\work\\repo', 'D:\\']));

        registerRecentProjectsJumpList({ app, applicationStateStore, errorReporter: vi.fn() });

        expect(app.setAppUserModelId).toHaveBeenCalledWith(APP_USER_MODEL_ID);
        expect(app.setJumpList).toHaveBeenCalledWith([{
            type: 'custom',
            name: 'Recent projects',
            items: [
                {
                    type: 'task', title: 'repo', description: 'C:\\work\\repo', program: process.execPath,
                    args: '"C:\\work\\repo"', iconPath: process.execPath, iconIndex: 0,
                },
                {
                    type: 'task', title: 'D:\\', description: 'D:\\', program: process.execPath,
                    args: '"D:\\"', iconPath: process.execPath, iconIndex: 0,
                },
            ],
        }]);
    });

    it('clears the Jump List when no recent folders exist', () => {
        const app = createApp();

        registerRecentProjectsJumpList({ app, applicationStateStore: createStore(JSON.stringify([])), errorReporter: vi.fn() });

        expect(app.setJumpList).toHaveBeenCalledWith(null);
    });

    it('reports invalid stored values and clears the Jump List', () => {
        const app = createApp();
        const errorReporter = vi.fn();

        registerRecentProjectsJumpList({ app, applicationStateStore: createStore('{not json'), errorReporter });

        expect(errorReporter).toHaveBeenCalledWith(expect.any(Error));
        expect(app.setJumpList).toHaveBeenCalledWith(null);
    });

    it('re-applies the Jump List when the recent folders change', () => {
        const app = createApp();
        const applicationStateStore = createStore(JSON.stringify([]));
        registerRecentProjectsJumpList({ app, applicationStateStore, errorReporter: vi.fn() });

        applicationStateStore.set(RECENT_KEY, JSON.stringify(['C:\\repo']));

        expect(app.setJumpList).toHaveBeenCalledTimes(2);
        expect(app.setJumpList.mock.calls[1][0][0].items[0].description).toBe('C:\\repo');
    });

    it('reports a failed Jump List update without throwing', () => {
        const app = createApp({ jumpListResult: 'customCategoryAccessDeniedError' });
        const errorReporter = vi.fn();

        registerRecentProjectsJumpList({ app, applicationStateStore: createStore(JSON.stringify(['C:\\repo'])), errorReporter });

        expect(errorReporter).toHaveBeenCalledWith(new Error('Jump List update failed: customCategoryAccessDeniedError'));
    });
});
