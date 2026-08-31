import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownAttachmentControl } from './markdown_attachment_control'

afterEach(cleanup)

describe('MarkdownAttachmentControl', () => {
    it('exposes tooltip name and forwards multiple selected files', async () => {
        const onFiles = vi.fn()
        const { container } = render(<MarkdownAttachmentControl disabled={false} onFiles={onFiles} />)
        const input = container.querySelector('input[type="file"]') as HTMLInputElement
        const files = [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')]

        const button = screen.getByRole('button', { name: 'Attach files' })
        expect(button).toBeEnabled()
        fireEvent.mouseOver(button)
        expect(await screen.findByText('Attach files', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
        expect(input).toHaveAttribute('multiple')
        fireEvent.change(input, { target: { files } })

        expect(onFiles).toHaveBeenCalledWith(files)
        expect(input.value).toBe('')
    })

    it('keeps disabled picker button unusable', () => {
        render(<MarkdownAttachmentControl disabled onFiles={vi.fn()} />)

        expect(screen.getByRole('button', { name: 'Attach files' })).toBeDisabled()
    })
})
