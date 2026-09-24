import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKDOWN_STYLE_PRESETS, type MarkdownStyleConfig } from '../../theme/theme_config'
import { AppThemeProvider } from '../../theme/theme_provider'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownStylePreview } from './markdown_style_preview'

const buildMarkdownContentSxMock = vi.hoisted(() => vi.fn((config: MarkdownStyleConfig) => ({'& .mdxeditor-content p': { fontFamily: config.body.fontFamily }})))

vi.mock('../editor/markdown_style_sx', () => ({ buildMarkdownContentSx: buildMarkdownContentSxMock }))

const handleSectionChange = vi.fn()

function PreviewHarness() {
    const { markdownContentSx, markdownStyleConfig } = useAppTheme()
    const [initialMarkdownContentSx] = useState({ value: markdownContentSx })
    const [config, setConfig] = useState<MarkdownStyleConfig>(MARKDOWN_STYLE_PRESETS.modern)
    const handleChangeDraft = () => setConfig(MARKDOWN_STYLE_PRESETS.handwritten)

    return (
        <>
            <button onClick={handleChangeDraft} type="button">Change draft</button>
            <span>active-font:{markdownStyleConfig.body.fontFamily}</span>
            <span>active-style-stable:{String(initialMarkdownContentSx.value === markdownContentSx)}</span>
            <MarkdownStylePreview config={config} onSectionChange={handleSectionChange} />
        </>
    )
}

describe('MarkdownStylePreview', () => {
    beforeEach(() => {
        buildMarkdownContentSxMock.mockClear()
        handleSectionChange.mockClear()
    })

    afterEach(() => {
        cleanup()
        window.localStorage.clear()
    })

    it('updates from its explicit draft without changing the active global style', () => {
        render(
            <AppThemeProvider>
                <PreviewHarness />
            </AppThemeProvider>,
        )
        const preview = screen.getByLabelText('Markdown style preview')
        const initialClassName = preview.className

        fireEvent.click(screen.getByRole('button', { name: 'Change draft' }))

        expect(preview.className).not.toBe(initialClassName)
        expect(screen.getByText(`active-font:${MARKDOWN_STYLE_PRESETS.modern.body.fontFamily}`)).toBeInTheDocument()
        expect(screen.getByText('active-style-stable:true')).toBeInTheDocument()
    })

    it('memoizes the derived style by config identity', () => {
        const { rerender } = render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)

        rerender(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)
        expect(buildMarkdownContentSxMock).toHaveBeenCalledTimes(1)

        rerender(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.serif} onSectionChange={handleSectionChange} />)
        expect(buildMarkdownContentSxMock).toHaveBeenCalledTimes(2)
        expect(buildMarkdownContentSxMock).toHaveBeenLastCalledWith(MARKDOWN_STYLE_PRESETS.serif)
    })

    it('opens the style popover for a clicked preview element', () => {
        render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)

        fireEvent.click(screen.getByLabelText('Edit Title 2 style'))

        expect(screen.getByRole('heading', { name: 'Title 2 style' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Font size for Title 2' })).toHaveValue(MARKDOWN_STYLE_PRESETS.modern.title2.fontSize)
    })

    it('opens the innermost section when clicking the link inside the body paragraph', () => {
        render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)

        fireEvent.click(screen.getByText('example link'))

        expect(screen.getByRole('heading', { name: 'Links style' })).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: 'Body style' })).not.toBeInTheDocument()
    })

    it('opens the style popover with Enter on a focused preview element', () => {
        render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)
        const codeBlock = screen.getByLabelText('Edit Code blocks style')

        codeBlock.focus()
        fireEvent.keyDown(codeBlock, { key: 'Enter' })

        expect(screen.getByRole('heading', { name: 'Code blocks style' })).toBeInTheDocument()
    })

    it('reports field changes with the section and updated style', () => {
        render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)

        fireEvent.click(screen.getByLabelText('Edit Body style'))
        fireEvent.change(screen.getByRole('textbox', { name: 'Font size for Body' }), { target: { value: '1.2rem' } })

        const expectedStyle = { ...MARKDOWN_STYLE_PRESETS.modern.body, fontSize: '1.2rem' }
        expect(handleSectionChange).toHaveBeenCalledWith('body', expectedStyle)
    })

    it('closes the style popover with Escape', async () => {
        render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} onSectionChange={handleSectionChange} />)

        fireEvent.click(screen.getByLabelText('Edit Body style'))
        fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape' })

        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Body style' })).not.toBeInTheDocument())
    })
})
