import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../../theme/theme_provider';
import type { CardOpenDocument } from '../../services/open_files_service';
import {
    MarkdownDataSourceBase,
    type MarkdownDocumentTarget,
} from './data_sources/markdown_data_source';

const routeJsonProjectLink = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../services/json/json_link_navigation', () => ({ routeJsonProjectLink }));

import { MarkdownDocumentHistoryStore } from './history/markdown_document_history_store';
import { MarkdownEditor } from './markdown_editor';

class LinkTestDataSource extends MarkdownDataSourceBase {
    readonly commit = vi.fn(() => true);
    readonly edit = vi.fn();
    private readonly markdown = '[data](data.json) [web](https://example.com/data.json)';
    private readonly target: MarkdownDocumentTarget;

    constructor() {
        super();
        const document = Object.assign(new EventTarget(), {
            kind: 'card' as const,
            path: 'design/card.md',
        }) as CardOpenDocument;
        this.target = { document };
        this.setActiveTarget('list-card', this.target);
    }

    getMarkdown() { return this.markdown; }
}

describe('MarkdownEditor JSON links', () => {
    afterEach(() => {
        cleanup();
        routeJsonProjectLink.mockClear();
    });

    it('routes project JSON anchors with containing document path and leaves other links to router result', () => {
        const dataSource = new LinkTestDataSource();
        render(
            <AppThemeProvider>
                <MarkdownEditor
                    binding="list-card"
                    dataSource={dataSource}
                    historyStore={new MarkdownDocumentHistoryStore()}
                />
            </AppThemeProvider>,
        );

        const link = screen.getByRole('link', { name: 'data' });
        fireEvent.click(link);

        expect(routeJsonProjectLink).toHaveBeenCalledWith('design/card.md', 'data.json', link);
    });
});
