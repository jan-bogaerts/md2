import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MARKDOWN_STYLE_PRESETS } from '../../theme/theme_config'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownEditor } from './markdown_editor'
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

    it('propagates edits as markdown through onChange', () => {
        const onChange = vi.fn()
        render(
            <AppThemeProvider>
                <MarkdownEditor markdown="original" onChange={onChange} />
            </AppThemeProvider>,
        )

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onChange).toHaveBeenCalledWith('edited')
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
            },
            '& .mdxeditor-content p, & .mdxeditor-content ul, & .mdxeditor-content ol, & .mdxeditor-content li': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.body.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.body.fontSize,
            },
            '& .mdxeditor-content blockquote, & .mdxeditor-content small': {
                fontFamily: MARKDOWN_STYLE_PRESETS.handwritten.caption.fontFamily,
                fontSize: MARKDOWN_STYLE_PRESETS.handwritten.caption.fontSize,
                fontStyle: 'italic',
            },
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
