import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    error: vi.fn(),
    open: vi.fn(),
    openJsonData: vi.fn(),
    openJsonDocument: vi.fn(),
    openJsonPopupDocument: vi.fn((document) => document),
    repositoryFiles: ['design/data.json'],
    viewMode: 'cards' as 'cards' | 'text',
}));

vi.mock('../data/data_service', () => ({ dataService: { getState: () => ({ snapshot: { repositoryFiles: mocks.repositoryFiles } }) } }));
vi.mock('../dialog_service', () => ({ dialogService: { error: mocks.error } }));
vi.mock('../open_files_service', () => ({
    openFilesService: {
        openJsonDocument: mocks.openJsonDocument,
        openJsonPopupDocument: mocks.openJsonPopupDocument,
    },
}));
vi.mock('../project/workspace_view_service', () => ({ workspaceViewService: { getSnapshot: () => ({ viewMode: mocks.viewMode }) } }));
vi.mock('../card_popup_service', () => ({ cardPopupService: { openJsonData: mocks.openJsonData } }));
vi.mock('./json_data_service', () => ({ jsonDataService: { open: mocks.open } }));

import { routeJsonProjectLink } from './json_link_navigation';

describe('routeJsonProjectLink', () => {
    beforeEach(() => {
        mocks.error.mockReset();
        mocks.open.mockReset();
        mocks.openJsonData.mockReset();
        mocks.openJsonDocument.mockReset();
        mocks.openJsonPopupDocument.mockClear();
        mocks.viewMode = 'cards';
    });

    it('opens parsed JSON in managed card popup', async () => {
        const document = { kind: 'json', path: 'design/data.json' };
        const anchor = documentElement();
        mocks.open.mockResolvedValue(document);

        expect(routeJsonProjectLink('design/card.md', 'data.json', anchor)).toBe(true);
        await vi.waitFor(() => expect(mocks.openJsonData).toHaveBeenCalledWith(document, anchor));
        expect(mocks.openJsonDocument).not.toHaveBeenCalled();
    });

    it('opens parsed JSON in list-view tab', async () => {
        const document = { kind: 'json', path: 'design/data.json' };
        const anchor = documentElement();
        mocks.viewMode = 'text';
        mocks.open.mockResolvedValue(document);

        expect(routeJsonProjectLink('design/card.md', 'data.json', anchor)).toBe(true);
        await vi.waitFor(() => expect(mocks.openJsonDocument).toHaveBeenCalledWith(document));
        expect(mocks.openJsonData).not.toHaveBeenCalled();
    });

    it('reports missing, unreadable, or malformed JSON without opening UI', async () => {
        const failure = new Error('Invalid JSON in design/data.json');
        mocks.open.mockRejectedValue(failure);

        expect(routeJsonProjectLink('design/card.md', 'data.json', documentElement())).toBe(true);
        await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith(failure, expect.any(Object)));
        expect(mocks.openJsonData).not.toHaveBeenCalled();
        expect(mocks.openJsonDocument).not.toHaveBeenCalled();
    });

    it.each(['https://example.com/data.json', '#anchor', 'note.md', '../../outside.json'])(
        'keeps normal link behavior for %s',
        (href) => {
            expect(routeJsonProjectLink('design/card.md', href, documentElement())).toBe(false);
            expect(mocks.open).not.toHaveBeenCalled();
        },
    );
});

function documentElement() {
    return window.document.createElement('a');
}
