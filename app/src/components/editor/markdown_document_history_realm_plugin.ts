import { activeEditor$, addComposerChild$, markdown$, realmPlugin, rootEditor$, setMarkdown$ } from '@mdxeditor/editor'
import { markdownDocumentHistoryStore$ } from './markdown_document_history_cell'
import { MarkdownDocumentHistoryPlugin } from './markdown_document_history_plugin'
import type { MarkdownDocumentHistoryStore } from './markdown_document_history_store'

interface MarkdownDocumentHistoryPluginParams {
    documentId: string
    historyStore: MarkdownDocumentHistoryStore
    markdown: string
    onBeforeSwitch: (documentId: string, markdown: string) => string
    onDidSwitch: (markdown: string) => void
}

/** Connects a document identity and its history store to an MDXEditor realm. */
export const markdownDocumentHistoryPlugin = realmPlugin<MarkdownDocumentHistoryPluginParams>({
    init(realm, params) {
        if (!params) throw new Error('Markdown document history plugin requires parameters')

        realm.register(markdownDocumentHistoryStore$)
        realm.pub(markdownDocumentHistoryStore$, params.historyStore)
        realm.pub(addComposerChild$, MarkdownDocumentHistoryPlugin)
    },
    postInit(realm, params) {
        if (!params) throw new Error('Markdown document history plugin requires parameters')

        const editor = realm.getValue(rootEditor$)
        if (!editor) throw new Error('Cannot initialize Markdown document history without an editor')

        params.historyStore.attachEditor(editor, params.documentId, params.markdown)
    },
    update(realm, params) {
        if (!params) throw new Error('Markdown document history plugin requires parameters')
        if (params.historyStore.isActiveDocument(params.documentId)) return

        const editor = realm.getValue(rootEditor$)
        if (!editor) throw new Error('Cannot switch Markdown document history without an editor')

        const currentMarkdown = params.onBeforeSwitch(params.documentId, params.markdown)
        realm.pub(activeEditor$, editor)
        params.historyStore.switchDocument(
            params.documentId,
            params.markdown,
            currentMarkdown,
            (markdown) => realm.pub(setMarkdown$, markdown),
        )
        params.onDidSwitch(realm.getValue(markdown$))
    },
})
