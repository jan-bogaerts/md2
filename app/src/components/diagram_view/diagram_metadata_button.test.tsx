import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiagramMetadataButton } from './diagram_metadata_button'

afterEach(cleanup)

describe('DiagramMetadataButton', () => {
    it('opens metadata details as a one-shot action', () => {
        const details = { open: vi.fn(() => true) }
        render(<DiagramMetadataButton details={details} />)
        const button = screen.getByRole('button', { name: 'Metadata' })

        expect(button).not.toHaveAttribute('aria-pressed')
        fireEvent.click(button)

        expect(details.open).toHaveBeenCalledWith({ objectKind: 'meta' })
    })
})
