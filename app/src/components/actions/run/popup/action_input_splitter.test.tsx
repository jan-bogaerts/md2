import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionInputLayoutStore } from './action_input_layout_store';
import { ActionInputSplitter } from './action_input_splitter';

const CONTAINER_HEIGHT = 500;
const POINTER_Y = 100;
const stores: ActionInputLayoutStore[] = [];

function createStore() {
    const store = new ActionInputLayoutStore('command');
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ height: CONTAINER_HEIGHT } as DOMRect);
    store.attachContainer(container);
    store.setInput(false, null);
    stores.push(store);
    return store;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
    stores.forEach((store) => store.dispose());
    stores.length = 0;
    vi.restoreAllMocks();
});

describe('ActionInputSplitter', () => {
    it('finishes an active resize when pointer capture is lost', () => {
        const store = createStore();
        render(<ActionInputSplitter store={store} />);
        const separator = screen.getByRole('separator', { name: 'Resize command input' });
        fireEvent.pointerDown(separator, { clientY: POINTER_Y, pointerId: 1 });
        expect(store.getSnapshot().resizing).toBe(true);
        fireEvent.lostPointerCapture(separator, { pointerId: 1 });
        expect(store.getSnapshot().resizing).toBe(false);
    });
});
