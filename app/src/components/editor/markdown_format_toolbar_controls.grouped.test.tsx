import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'

function renderControls(readOnly = false) {
    return render(
        <AppThemeProvider>
            <MarkdownFormatToolbarControls readOnly={readOnly} />
        </AppThemeProvider>,
    )
}

describe('MarkdownFormatToolbarControls', () => {
    afterEach(() => {
        cleanup()
    })

    it('offers the link control without the built in insert image control', () => {
        renderControls()

        expect(screen.getByTestId('create-link')).toBeInTheDocument()
        expect(screen.queryByTestId('insert-image')).not.toBeInTheDocument()
    })

    it('hides every insert control while read only', () => {
        renderControls(true)

        expect(screen.queryByTestId('create-link')).not.toBeInTheDocument()
        expect(screen.queryByTestId('insert-image')).not.toBeInTheDocument()
    })
})
