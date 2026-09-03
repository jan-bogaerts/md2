import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as mdxEditor from '@mdxeditor/editor'
import { INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MarkdownListIndentToolbarControls } from './markdown_list_indent_toolbar_controls'

const originalMatchMedia = window.matchMedia

function setSmallScreen(isSmallScreen: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: isSmallScreen,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

function renderControls() {
    return render(
        <AppThemeProvider>
            <MarkdownListIndentToolbarControls />
        </AppThemeProvider>,
    )
}

describe('MarkdownListIndentToolbarControls', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        window.matchMedia = originalMatchMedia
    })

    it('shows accessible controls and tooltips on small screens', async () => {
        setSmallScreen(true)
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue({ dispatchCommand: vi.fn(), focus: vi.fn() } as never)
        renderControls()

        const increaseButton = screen.getByRole('button', { name: 'Increase indent' })
        expect(screen.getByRole('button', { name: 'Decrease indent' })).toBeInTheDocument()

        fireEvent.mouseOver(increaseButton)

        expect(await screen.findByRole('tooltip')).toHaveTextContent('Increase indent')
    })

    it('hides both controls above the small-screen breakpoint', () => {
        setSmallScreen(false)
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue({ dispatchCommand: vi.fn(), focus: vi.fn() } as never)
        renderControls()

        expect(screen.queryByRole('button', { name: 'Increase indent' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Decrease indent' })).not.toBeInTheDocument()
    })

    it('disables both controls without an active editor', () => {
        setSmallScreen(true)
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue(null)
        renderControls()

        expect(screen.getByRole('button', { name: 'Increase indent' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Decrease indent' })).toBeDisabled()
    })

    it.each([
        ['Increase indent', INDENT_CONTENT_COMMAND],
        ['Decrease indent', OUTDENT_CONTENT_COMMAND],
    ])('dispatches %s once and then returns focus', (accessibleName, command) => {
        setSmallScreen(true)
        const activeEditor = { dispatchCommand: vi.fn(), focus: vi.fn() }
        vi.spyOn(mdxEditor, 'useCellValue').mockReturnValue(activeEditor as never)
        renderControls()

        fireEvent.click(screen.getByRole('button', { name: accessibleName }))

        expect(activeEditor.dispatchCommand).toHaveBeenCalledExactlyOnceWith(command, undefined)
        expect(activeEditor.focus).toHaveBeenCalledOnce()
        expect(activeEditor.dispatchCommand.mock.invocationCallOrder[0])
            .toBeLessThan(activeEditor.focus.mock.invocationCallOrder[0])
    })
})
