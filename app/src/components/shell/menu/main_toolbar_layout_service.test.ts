import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainToolbarLayoutService } from './main_toolbar_layout_service';

let resizeObserver: TestResizeObserver;

class TestResizeObserver {
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
    }

    notify() {
        this.callback([], this as unknown as ResizeObserver);
    }
}

function createResizeObserver(callback: ResizeObserverCallback) {
    resizeObserver = new TestResizeObserver(callback);

    return resizeObserver;
}

function measuredElement(width: number, left = 0) {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(left, 0, width, 44));

    return element;
}

function createElements() {
    const project = measuredElement(0);
    const name = document.createElement('span');
    name.dataset.testid = 'project-name-label';
    Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 600 });
    project.appendChild(name);
    const search = measuredElement(260);
    const metrics = measuredElement(230);
    metrics.dataset.searchMetrics = '';
    metrics.style.columnGap = '8px';
    const label = measuredElement(90);
    label.dataset.searchLabel = '';
    const word = measuredElement(40);
    word.dataset.searchWord = '';
    metrics.append(label, word);
    search.appendChild(metrics);

    return {
        navigation: measuredElement(180), project, safeArea: measuredElement(1200, 84), search,
        toolbar: measuredElement(1284), utilities: measuredElement(32),
    };
}

describe('MainToolbarLayoutService', () => {
    beforeEach(() => vi.stubGlobal('ResizeObserver', createResizeObserver));
    afterEach(() => vi.unstubAllGlobals());

    it('updates from native safe-area resize events, including removal of the reserved space', () => {
        const service = new MainToolbarLayoutService();
        const elements = createElements();
        service.connect(elements);
        const windowed = service.getSnapshot();

        vi.mocked(elements.safeArea.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 1284, 44));
        resizeObserver.notify();

        expect(service.getSnapshot().titleWidth).toBeGreaterThanOrEqual(windowed.titleWidth);
        expect(service.getSnapshot().titleLeft).not.toBe(windowed.titleLeft);
        service.disconnect();
    });

    it('keeps a stable snapshot and does not notify when measurements have not changed', () => {
        const service = new MainToolbarLayoutService();
        const listener = vi.fn();
        service.addEventListener('layoutChanged', listener);
        service.connect(createElements());
        const snapshot = service.getSnapshot();
        listener.mockClear();

        resizeObserver.notify();

        expect(service.getSnapshot()).toBe(snapshot);
        expect(listener).not.toHaveBeenCalled();
        service.disconnect();
    });

    it('remeasures the title after the project label changes without waiting for a window resize', async () => {
        const service = new MainToolbarLayoutService();
        const elements = createElements();
        service.connect(elements);
        const name = elements.project.firstElementChild as HTMLElement;
        Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 100 });

        name.textContent = 'Another project';

        await waitFor(() => expect(service.getSnapshot().titleWidth).toBeLessThan(600));
        expect(service.getSnapshot().titleWidth).toBeGreaterThanOrEqual(100);
        service.disconnect();
    });

    it('leaves room for fractional title glyph widths when scrollWidth rounds down', () => {
        const service = new MainToolbarLayoutService();
        const elements = createElements();
        const name = elements.project.firstElementChild as HTMLElement;
        Object.defineProperty(name, 'scrollWidth', { configurable: true, value: 100 });
        vi.spyOn(name, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100.4, 20));

        service.connect(elements);

        expect(service.getSnapshot().titleWidth).toBeGreaterThanOrEqual(name.getBoundingClientRect().width);
        service.disconnect();
    });

    it('disconnects observers and ignores late callbacks after the toolbar unmounts', () => {
        const service = new MainToolbarLayoutService();
        const elements = createElements();
        service.connect(elements);
        const snapshot = service.getSnapshot();

        service.disconnect();
        vi.mocked(elements.safeArea.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 500, 44));
        resizeObserver.notify();

        expect(resizeObserver.disconnect).toHaveBeenCalledOnce();
        expect(service.getSnapshot()).toBe(snapshot);
    });
});
