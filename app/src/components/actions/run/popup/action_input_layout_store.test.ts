import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionInputLayoutStore } from './action_input_layout_store';
import { applicationStorage, ApplicationStorage } from '../../../../services/storage/application_storage';
import type { ElectronApplicationStateBridge } from '../../../../services/storage/electron_application_state_bridge';

const COMMAND_KEY = 'md2.commandActionInputHeight';
const AGENT_KEY = 'md2.actionPromptHeight';
const QUESTIONS_KEY = 'md2.actionQuestionsBlockHeight';
const stores: ActionInputLayoutStore[] = [];

function createStore(kind: 'command' | 'agent', height = 500) {
    const store = new ActionInputLayoutStore(kind);
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
    store.attachContainer(container);
    stores.push(store);
    return { container, store };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
    stores.forEach((store) => store.dispose());
    stores.length = 0;
    delete window.md2ApplicationState;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('ActionInputLayoutStore', () => {
    it('starts command height independently of the existing agent setting', () => {
        window.localStorage.setItem(AGENT_KEY, '250');
        const command = createStore('command').store;
        const agent = createStore('agent').store;
        command.setInput(false, null);
        agent.setInput(false, null);
        expect(command.getSnapshot().value).not.toBe(agent.getSnapshot().value);
        expect(window.localStorage.getItem(COMMAND_KEY)).toBeNull();
    });

    it('grows command input downward and agent input upward, with isolated persistence', () => {
        const command = createStore('command').store;
        const agent = createStore('agent').store;
        command.setInput(false, null);
        agent.setInput(false, null);
        const commandStart = command.getSnapshot().value;
        const agentStart = agent.getSnapshot().value;
        command.beginResize(100);
        command.moveResize(150);
        command.finishResize();
        expect(command.getSnapshot().value).toBe(commandStart + 50);
        expect(agent.getSnapshot().value).toBe(agentStart);
        expect(window.localStorage.getItem(AGENT_KEY)).toBeNull();
        const savedCommand = window.localStorage.getItem(COMMAND_KEY);
        agent.beginResize(150);
        agent.moveResize(100);
        agent.finishResize();
        expect(agent.getSnapshot().value).toBe(agentStart + 50);
        expect(window.localStorage.getItem(COMMAND_KEY)).toBe(savedCommand);
        expect(window.localStorage.getItem(AGENT_KEY)).toBe(String(agentStart + 50));
        command.beginResize(150);
        command.moveResize(125);
        command.finishResize();
        expect(command.getSnapshot().value).toBe(commandStart + 25);
    });

    it('restores command allocation from storage after reopening with a fresh store', () => {
        const original = createStore('command').store;
        original.setInput(false, null);
        original.resizeByKey('ArrowDown');
        original.dispose();
        const reopened = createStore('command').store;
        reopened.setInput(false, null);
        expect(reopened.getSnapshot().value).toBe(original.getSnapshot().value);
        reopened.resizeByKey('ArrowUp');
        expect(reopened.getSnapshot().value).toBeLessThan(original.getSnapshot().value);
        expect(reopened.resizeByKey('Enter')).toBe(false);
    });

    it('preserves allocation while empty and rejects empty-input resizing', () => {
        const { store } = createStore('command');
        store.setInput(false, null);
        store.resizeByKey('ArrowDown');
        const saved = window.localStorage.getItem(COMMAND_KEY);
        const height = store.getSnapshot().value;
        store.setInput(true, null);
        store.beginResize(100);
        store.moveResize(200);
        store.finishResize();
        expect(store.resizeByKey('ArrowDown')).toBe(false);
        expect(window.localStorage.getItem(COMMAND_KEY)).toBe(saved);
        store.setInput(false, null);
        expect(store.getSnapshot().value).toBe(height);
    });

    it('recomputes limits on popup resize and restores saved preference on expansion', () => {
        window.localStorage.setItem(COMMAND_KEY, '300');
        const { store, container } = createStore('command');
        store.setInput(false, null);
        vi.mocked(container.getBoundingClientRect).mockReturnValue({ height: 120 } as DOMRect);
        window.dispatchEvent(new Event('resize'));
        expect(store.getSnapshot().value).toBeGreaterThanOrEqual(0);
        expect(store.getSnapshot().value).toBeLessThan(120);
        expect(store.getSnapshot().minimum).toBeLessThanOrEqual(store.getSnapshot().maximum);
        expect(window.localStorage.getItem(COMMAND_KEY)).toBe('300');
        vi.mocked(container.getBoundingClientRect).mockReturnValue({ height: 800 } as DOMRect);
        window.dispatchEvent(new Event('resize'));
        expect(store.getSnapshot().value).toBe(300);
    });

    it('observes allocation changes and disconnects on unmount', () => {
        const observe = vi.fn();
        const disconnect = vi.fn();
        let notifyResize: ResizeObserverCallback | null = null;
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) { notifyResize = callback; }
            observe = observe;
            disconnect = disconnect;
        });
        const { store, container } = createStore('agent');
        store.setInput(false, null);
        expect(observe).toHaveBeenCalledWith(container);
        vi.mocked(container.getBoundingClientRect).mockReturnValue({ height: 100 } as DOMRect);
        if (!notifyResize) throw new Error('Resize observer was not attached');
        (notifyResize as ResizeObserverCallback)([], {} as ResizeObserver);
        expect(store.getSnapshot().value).toBeLessThan(100);
        store.dispose();
        expect(disconnect).toHaveBeenCalled();
    });

    it('subtracts fixed content and gaps while retaining adjacent-region space', () => {
        const { store, container } = createStore('command', 200);
        const controls = document.createElement('div');
        const adjacent = document.createElement('div');
        adjacent.setAttribute('data-layout-adjacent', '');
        container.style.rowGap = '8px';
        container.append(controls, adjacent);
        vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue({ height: 50 } as DOMRect);
        store.setInput(false, null);
        window.dispatchEvent(new Event('resize'));
        expect(store.getSnapshot().maximum).toBeLessThan(200 - 50 - 8);
        store.beginResize(0);
        store.moveResize(10000);
        store.finishResize();
        expect(store.getSnapshot().value).toBe(store.getSnapshot().maximum);
    });

    it('keeps both question regions nonnegative in a tiny popup and persists only question allocation', () => {
        const { store } = createStore('agent', 50);
        store.setInput(true, 'question-1');
        store.resizeByKey('ArrowUp');
        const snapshot = store.getSnapshot();
        expect(snapshot.promptHeight).toBeGreaterThanOrEqual(0);
        expect(snapshot.questionsMinHeight).toBeGreaterThanOrEqual(0);
        expect(snapshot.promptHeight + snapshot.questionsMinHeight).toBeLessThanOrEqual(snapshot.maximum);
        expect(window.localStorage.getItem(QUESTIONS_KEY)).not.toBeNull();
        expect(window.localStorage.getItem(AGENT_KEY)).toBeNull();
        expect(window.localStorage.getItem(COMMAND_KEY)).toBeNull();
        store.activatePrompt('Answer');
        expect(store.getSnapshot().primaryRegion).toBe('prompt');
        store.setInput(false, 'question-2');
        expect(store.getSnapshot().primaryRegion).toBe('questions');
        store.setInput(false, null);
        expect(store.getSnapshot().blockHeight).toBeNull();
    });

    it('reports an unsized question allocation within its accessible bounds', () => {
        const { store } = createStore('agent', 180);
        store.setInput(false, 'question');
        const snapshot = store.getSnapshot();
        expect(snapshot.blockHeight).toBeNull();
        expect(snapshot.value).toBeLessThanOrEqual(snapshot.maximum);
        expect(snapshot.value).toBeGreaterThanOrEqual(snapshot.minimum);
    });

    it('notifies only after layout data changes and supports unsubscribe', () => {
        const { store } = createStore('command');
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        const initial = store.getSnapshot();
        store.setInput(true, null);
        expect(store.getSnapshot()).toBe(initial);
        expect(listener).not.toHaveBeenCalled();
        store.setInput(false, null);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        store.resizeByKey('ArrowDown');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('restores command height through the desktop storage bridge after application restart', async () => {
        const values: Record<string, string> = { 'md2.localStorageMigrationComplete': '1' };
        const bridge: ElectronApplicationStateBridge = {
            read: vi.fn(async (key) => key === null ? { ...values } : values[key] ?? null),
            remove: vi.fn(async (key) => { delete values[key]; }),
            write: vi.fn(async (key, value) => { values[key] = value; return value; }),
        };
        window.md2ApplicationState = bridge;
        const storage = new ApplicationStorage();
        await storage.initialize();
        vi.spyOn(applicationStorage, 'getItem').mockImplementation(storage.getItem.bind(storage));
        vi.spyOn(applicationStorage, 'setItem').mockImplementation(storage.setItem.bind(storage));
        const { store } = createStore('command');
        store.setInput(false, null);
        store.resizeByKey('ArrowDown');
        expect(bridge.write).toHaveBeenCalledWith(COMMAND_KEY, String(store.getSnapshot().value));
        store.dispose();
        const restartedStorage = new ApplicationStorage();
        await restartedStorage.initialize();
        vi.mocked(applicationStorage.getItem).mockImplementation(restartedStorage.getItem.bind(restartedStorage));
        const restarted = createStore('command').store;
        restarted.setInput(false, null);
        expect(restarted.getSnapshot().value).toBe(store.getSnapshot().value);
        expect(window.localStorage.getItem(COMMAND_KEY)).toBeNull();
    });
});
