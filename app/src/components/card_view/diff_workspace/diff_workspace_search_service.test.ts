import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffWorkspaceSearchService } from './diff_workspace_search_service';

function viewport(html: string) {
    const element = document.createElement('div');
    element.innerHTML = html;
    document.body.append(element);

    return element;
}

function keyEvent(key: string, ctrlKey = false) {
    return { altKey: false, ctrlKey, key, metaKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('DiffWorkspaceSearchService', () => {
    it('ignores Ctrl+F until an active tab viewport is registered', () => {
        const service = new DiffWorkspaceSearchService();
        const event = keyEvent('f', true);

        service.handleKeyDown(event);

        expect(service.getOpen()).toBe(false);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('opens with Ctrl+F and consumes Escape only while open', () => {
        const service = new DiffWorkspaceSearchService();
        service.registerViewport(viewport('<button data-path="a.ts">a.ts</button>'), 'files', '[data-path]');

        service.handleKeyDown(keyEvent('f', true));
        expect(service.getOpen()).toBe(true);

        const escape = keyEvent('Escape');
        service.handleKeyDown(escape);
        expect(service.getOpen()).toBe(false);
        expect(escape.stopPropagation).toHaveBeenCalled();

        const secondEscape = keyEvent('Escape');
        service.handleKeyDown(secondEscape);
        expect(secondEscape.stopPropagation).not.toHaveBeenCalled();
    });

    it('limits file-tab matches to the registered text selector', () => {
        const service = new DiffWorkspaceSearchService();
        service.registerViewport(viewport('<span>12</span><span class="diff-code">value 12</span>'), 'file', '.diff-code');

        service.setDraftTerm('12');
        service.submitSearch();

        expect(service.getResultCount()).toBe(1);
        expect(window.getSelection()?.toString()).toBe('12');
    });

    it('recalculates results for a newly registered tab and keeps the term', () => {
        const service = new DiffWorkspaceSearchService();
        const unregister = service.registerViewport(viewport('<span class="diff-code">alpha alpha</span>'), 'file', '.diff-code');
        service.setDraftTerm('alpha');
        service.submitSearch();
        expect(service.getResultCount()).toBe(2);

        unregister();
        service.registerViewport(viewport('<button data-path="alpha.ts">alpha.ts</button>'), 'files', '[data-path]');

        expect(service.getDraftTerm()).toBe('alpha');
        expect(service.getResultCount()).toBe(1);
        expect(service.getActiveMatchIndex()).toBeNull();
    });

    it('clears term, match case, results, and row on reset', () => {
        const service = new DiffWorkspaceSearchService();
        service.registerViewport(viewport('<span class="diff-code">Alpha</span>'), 'file', '.diff-code');
        service.openSearch();
        service.toggleCaseSensitive();
        service.setDraftTerm('Alpha');
        service.submitSearch();

        service.reset();

        expect(service.getOpen()).toBe(false);
        expect(service.getCaseSensitive()).toBe(false);
        expect(service.getDraftTerm()).toBe('');
        expect(service.getSubmittedTerm()).toBe('');
        expect(service.getResultCount()).toBeNull();
    });
});
