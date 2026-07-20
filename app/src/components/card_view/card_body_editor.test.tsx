import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { MarkdownEditorStateStore } from '../editor/markdown_editor_state_store'
import { CardBodyEditor } from './card_body_editor'

function renderCardBodyEditor(props: Parameters<typeof CardBodyEditor>[0]) {
    return render(
        <AppThemeProvider>
            <CardBodyEditor {...props} />
        </AppThemeProvider>,
    )
}

function editorProps(overrides: Partial<Parameters<typeof CardBodyEditor>[0]> = {}): Parameters<typeof CardBodyEditor>[0] {
    return {
        historyStore: new MarkdownDocumentHistoryStore(),
        isFullscreen: false,
        onToggleFullscreen: vi.fn(),
        stateStore: new MarkdownEditorStateStore(),
        ...overrides,
    }
}

describe('CardBodyEditor', () => {
    beforeEach(() => {
        cardMarkdownDataSource.setActiveDocument('board-card', 'f-1')
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockReturnValue('# Alpha\n\nOriginal body')
        vi.spyOn(cardMarkdownDataSource, 'edit').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
    })

    afterEach(() => {
        cleanup()
        cardMarkdownDataSource.setActiveDocument('board-card', null)
        vi.restoreAllMocks()
    })

    it('loads body through board-card data source binding', () => {
        renderCardBodyEditor(editorProps())

        expect(screen.getByRole('textbox')).toHaveValue('# Alpha\n\nOriginal body')
        expect(cardMarkdownDataSource.getMarkdown).toHaveBeenCalledWith('f-1')
    })

    it('commits outgoing document ID when editor unmounts', () => {
        const { unmount } = renderCardBodyEditor(editorProps())
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Alpha\n\nEdited body' } })

        unmount()

        expect(cardMarkdownDataSource.commit).toHaveBeenCalledWith('board-card', 'f-1', '# Alpha\n\nEdited body')
    })

    it('publishes dirty state without parent callback', () => {
        const stateStore = new MarkdownEditorStateStore()
        renderCardBodyEditor(editorProps({ stateStore }))

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Alpha\n\nEdited body' } })

        expect(stateStore.getSnapshot()).toBe(true)
    })

    it('keeps toolbar sticky on mobile', () => {
        const { container } = renderCardBodyEditor(editorProps({ isMobile: true }))

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })
})
