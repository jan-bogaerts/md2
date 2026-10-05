import type { CardOpenDocument } from '../../services/open_files_service';
import { MarkdownDataSourceBase, type MarkdownBindingKind, type MarkdownDocumentTarget } from './data_sources/markdown_data_source';

/** In-process document boundary for real-editor integration tests. */
export class MarkdownReliabilityDataSourceFixture extends MarkdownDataSourceBase {
    private readonly values = new Map<CardOpenDocument, string>();

    addDocument(markdown: string): MarkdownDocumentTarget {
        const document = Object.assign(new EventTarget(), { kind: 'card' as const }) as CardOpenDocument;
        this.values.set(document, markdown);
        return { document };
    }

    getMarkdown(target: MarkdownDocumentTarget) {
        const markdown = this.values.get(target.document as CardOpenDocument);
        if (markdown === undefined) throw new Error('Test document is missing');
        return markdown;
    }

    edit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
        if (!this.getActiveTarget(binding)) throw new Error('Test binding is inactive');
        this.values.set(target.document as CardOpenDocument, markdown);
    }

    commit(binding: MarkdownBindingKind, target: MarkdownDocumentTarget, markdown: string) {
        this.edit(binding, target, markdown);
        return true;
    }
}
