import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './markdown_editor'

describe('MarkdownEditor', () => {
    afterEach(cleanup)

    it('renders the editing surface seeded with the markdown value', () => {
        render(<MarkdownEditor markdown={'# Title\n\nBody'} onChange={vi.fn()} />)

        expect(screen.getByRole('textbox')).toHaveValue('# Title\n\nBody')
    })

    it('propagates edits as markdown through onChange', () => {
        const onChange = vi.fn()
        render(<MarkdownEditor markdown="original" onChange={onChange} />)

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'edited' } })

        expect(onChange).toHaveBeenCalledWith('edited')
    })

    it('marks the toolbar sticky when requested for mobile layout', () => {
        const { container, rerender } = render(<MarkdownEditor markdown="" onChange={vi.fn()} stickyToolbar />)

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()

        rerender(<MarkdownEditor markdown="" onChange={vi.fn()} stickyToolbar={false} />)

        expect(container.querySelector('[data-sticky-toolbar="false"]')).not.toBeNull()
    })
})
