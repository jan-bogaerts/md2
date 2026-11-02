import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiagramChangeReviewButton } from './diagram_change_review_button'

describe('DiagramChangeReviewButton', () => {
    it('uses add-card accessible label and tooltip', async () => {
        const open = vi.fn()
        render(<DiagramChangeReviewButton review={{ open }} />)

        const button = screen.getByRole('button', { name: 'Add card to implement diagram' })
        fireEvent.mouseOver(button)

        expect(await screen.findByRole('tooltip')).toHaveTextContent('Add card to implement diagram')
        fireEvent.click(button)
        expect(open).toHaveBeenCalledOnce()
    })
})
