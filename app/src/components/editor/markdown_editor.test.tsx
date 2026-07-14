import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { THEME_MODE_STORAGE_KEY } from '../../theme/use_theme_settings'
import { MARKDOWN_STYLE_PRESETS } from '../../theme/theme_config'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownEditor } from './markdown_editor'
import { flushMarkdownEditors } from './markdown_editor_flush'
import { buildMarkdownContentSx } from './markdown_style_sx'

function renderEditor(markdown = '') {
    return render(
        <AppThemeProvider>
            <MarkdownEditor markdown={markdown} onChange={vi.fn()} />
        </AppThemeProvider>,
    )
}

function MarkdownEditorWithStyleControl() {
    const { setMarkdownStyle } = useAppTheme()
    const handleSetSerif = () => {
        setMarkdownStyle('serif')
    }

    return (
        <>
            <button onClick={handleSetSerif} type="button">Serif</button>
            <MarkdownEditor markdown="" onChange={vi.fn()} />
        </>
    )
}

describe('MarkdownEditor', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
    })

    it('renders the editing surface seeded with the markdown value', () => {
        renderEditor('# Title\n\nBody')

        expect(screen.getByRole('textbox')).toHaveValue('# Title\n\nBody')
    })

    it('does not propagate edits while typing', () => {
        const onChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onChange).not.toHaveBeenCalled()
    })

    it('flushes pending edits through onChange on unmount', () => {
        const onChange = vi.fn()
        const { unmount } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })
        unmount()

        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited')
    })

    it('flushes pending edits when the app-level flush runs', () => {
        const onChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })
        flushMarkdownEditors()

        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited')
    })

    it('does not flush again when the content did not change since the last flush', () => {
        const onChange = vi.fn()
        const { unmount } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })
        flushMarkdownEditors()
        unmount()

        expect(onChange).toHaveBeenCalledExactlyOnceWith('edited')
    })

    it('renders the formatting toolbar inside the markdown editor', () => {
        renderEditor()

        expect(screen.getByTestId('mdx-editor')).toContainElement(screen.getByTestId('mdx-editor-toolbar'))
    })

    it('uses the MDXEditor palette matching the app theme', () => {
        window.localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark')

        renderEditor()

        expect(screen.getByTestId('mdx-editor')).toHaveClass('dark-theme')
    })

    it('marks the toolbar sticky when requested for mobile layout', () => {
        const { container, rerender } = render(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} stickyToolbar />
            </AppThemeProvider>,
        )

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()

        rerender(
            <AppThemeProvider>
                <MarkdownEditor markdown="" onChange={vi.fn()} stickyToolbar={false} />
            </AppThemeProvider>,
        )

        expect(container.querySelector('[data-sticky-toolbar="false"]')).not.toBeNull()
    })

    it('maps markdown sections to scoped content selectors', () => {
        const styleSx = buildMarkdownContentSx(MARKDOWN_STYLE_PRESETS.handwritten)

        expect(styleSx).toMatchObject({
            '& .mdxeditor-content h1': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.title1.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.title1.fontSize,
                fontStyle: 'normal',
                fontWeight: 700,
                textDecoration: 'none',
            },
            '& .mdxeditor-content p': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.body.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.body.fontSize,
            },
            '& .mdxeditor-content a': {textDecoration: 'underline'},
            '& .mdxeditor-content blockquote, & .mdxeditor-content blockquote p': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.blockquote.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.blockquote.fontSize,
                fontStyle: 'italic',
            },
            '& .mdxeditor-content :not(pre) > code': {fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.inlineCode.fontFamily},
            '& .mdxeditor-content pre, & .mdxeditor-content pre code': {fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.codeBlock.fontFamily},
            '& .mdxeditor-content table, & .mdxeditor-content th, & .mdxeditor-content td': {fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.table.fontFamily},
        })
    })

    it('updates editor styles when the markdown preset changes', () => {
        const { container } = render(
            <AppThemeProvider>
                <MarkdownEditorWithStyleControl />
            </AppThemeProvider>,
        )
        const editorWrapper = container.querySelector('[data-sticky-toolbar="false"]')
        const initialClassName = editorWrapper?.className

        fireEvent.click(screen.getByRole('button', { name: 'Serif' }))

        expect(editorWrapper?.className).not.toBe(initialClassName)
    })
})
