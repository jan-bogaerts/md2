import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiagramPasteButton } from './diagram_paste_button'

afterEach(() => cleanup())

describe('DiagramPasteButton', () => {
    it('starts one paste and exposes accessible label and tooltip', async () => {
        const pasteService = { paste: vi.fn(async () => true) }
        render(<DiagramPasteButton pasteService={pasteService} />)
        const button = screen.getByRole('button', { name: 'Paste' })

        expect(button).toBeEnabled()
        fireEvent.mouseOver(button)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Paste diagram objects')
        fireEvent.click(button)

        expect(pasteService.paste).toHaveBeenCalledOnce()
    })
})
