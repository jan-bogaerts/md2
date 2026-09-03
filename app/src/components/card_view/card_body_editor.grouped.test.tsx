import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { DEFAULT_CARD_TYPES } from '../../data/data_types'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import type { MarkdownDocumentTarget } from '../editor/markdown_data_source'
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
        cardTypes: DEFAULT_CARD_TYPES,
        dataSource: cardMarkdownDataSource,
        historyStore: new MarkdownDocumentHistoryStore(),
        isFullscreen: false,
        onToggleFullscreen: vi.fn(),
        statusColors: new Map(),
        ...overrides,
    }
}

describe('CardBodyEditor', () => {
    const target = { document: { kind: 'card' } } as MarkdownDocumentTarget

    beforeEach(() => {
        cardMarkdownDataSource.setActiveTarget('board-card', target)
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockReturnValue('# Alpha\n\nOriginal body')
        vi.spyOn(cardMarkdownDataSource, 'edit').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockReturnValue(null)
    })

    afterEach(() => {
        cleanup()
        cardMarkdownDataSource.setActiveTarget('board-card', null)
        vi.restoreAllMocks()
    })

    it('loads body through board-card data source binding', () => {
        renderCardBodyEditor(editorProps())

        expect(screen.getByRole('textbox')).toHaveValue('# Alpha\n\nOriginal body')
        expect(screen.getByRole('button', { name: 'Attach files' })).toBeInTheDocument()
        expect(cardMarkdownDataSource.getMarkdown).toHaveBeenCalledWith(target)
    })

    it('commits outgoing document target when editor unmounts', () => {
        const { unmount } = renderCardBodyEditor(editorProps())
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Alpha\n\nEdited body' } })

        unmount()

        expect(cardMarkdownDataSource.commit).toHaveBeenCalledWith('board-card', target, '# Alpha\n\nEdited body')
    })

    it.each([
        { isMobile: false, layout: 'desktop' },
        { isMobile: true, layout: 'mobile' },
    ])('keeps toolbar sticky on $layout', ({ isMobile }) => {
        const { container } = renderCardBodyEditor(editorProps({ isMobile }))

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('hides fullscreen control on mobile', () => {
        renderCardBodyEditor(editorProps({ isMobile: true }))

        expect(screen.queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument()
    })

    it('keeps fullscreen control on desktop', () => {
        renderCardBodyEditor(editorProps())

        expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument()
    })
})
