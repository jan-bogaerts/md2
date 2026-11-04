import { describe, expect, it } from 'vitest'
import {
    MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT,
    MarkdownLocalSearchKeyboardService,
} from './markdown_local_search_keyboard_service'

describe('MarkdownLocalSearchKeyboardService', () => {
    it('reports Escape handled only when an open search subscriber accepts it', () => {
        const service = new MarkdownLocalSearchKeyboardService();
        const event = { key: 'Escape' } as KeyboardEvent;

        expect(service.handleKeyDown(event)).toBe(false);
        service.addEventListener(MARKDOWN_LOCAL_SEARCH_ESCAPE_REQUESTED_EVENT, (request) => request.preventDefault());
        expect(service.handleKeyDown(event)).toBe(true);
        expect(service.handleKeyDown({ key: 'Enter' } as KeyboardEvent)).toBe(false);
    });
});
