import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownFormatToolbarControls } from './markdown_format_toolbar_controls'

function renderControls(readOnly = false, onAttachFiles?: (files: File[]) => void) {
    return render(
        <AppThemeProvider>
            <MarkdownFormatToolbarControls onAttachFiles={onAttachFiles} readOnly={readOnly} />
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

    it('renders the attach files button directly after the link control', () => {
        renderControls(false, vi.fn())

        const attachButton = screen.getByRole('button', { name: 'Attach files' })
        expect(screen.getByTestId('create-link').nextElementSibling).toContainElement(attachButton)
    })

    it('omits the attach files button without an attach handler', () => {
        renderControls()

        expect(screen.queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()
    })

    it('hides the attach files button while read only', () => {
        renderControls(true, vi.fn())

        expect(screen.queryByRole('button', { name: 'Attach files' })).not.toBeInTheDocument()
    })

    it('forwards selected files to the attach handler', () => {
        const onAttachFiles = vi.fn()
        const { container } = renderControls(false, onAttachFiles)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const files = [new File(['one'], 'one.txt')]

        fireEvent.change(input, { target: { files } })

        expect(onAttachFiles).toHaveBeenCalledWith(files)
    })
})
