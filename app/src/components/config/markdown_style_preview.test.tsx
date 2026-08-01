import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKDOWN_STYLE_PRESETS, type MarkdownStyleConfig } from '../../theme/theme_config'
import { AppThemeProvider } from '../../theme/theme_provider'
import { useAppTheme } from '../../theme/use_app_theme'
import { MarkdownStylePreview } from './markdown_style_preview'

const buildMarkdownContentSxMock = vi.hoisted(() => vi.fn((config: MarkdownStyleConfig) => ({'& .mdxeditor-content p': { fontFamily: config.body.fontFamily }})))

vi.mock('../editor/markdown_style_sx', () => ({ buildMarkdownContentSx: buildMarkdownContentSxMock }))

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
            <MarkdownStylePreview config={config} />
        </>
    )
}

describe('MarkdownStylePreview', () => {
    beforeEach(() => {
        buildMarkdownContentSxMock.mockClear()
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
        const { rerender } = render(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} />)

        rerender(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.modern} />)
        expect(buildMarkdownContentSxMock).toHaveBeenCalledTimes(1)

        rerender(<MarkdownStylePreview config={MARKDOWN_STYLE_PRESETS.serif} />)
        expect(buildMarkdownContentSxMock).toHaveBeenCalledTimes(2)
        expect(buildMarkdownContentSxMock).toHaveBeenLastCalledWith(MARKDOWN_STYLE_PRESETS.serif)
    })
})
