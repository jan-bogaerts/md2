import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardBodyEditor } from './card_body_editor'
import type { ProjectCard } from '../../data/data_types'

function card(overrides: Partial<ProjectCard> = {}): ProjectCard {
    return {
        content: '# Alpha\n\nOriginal body',
        header: {
            affects: [], after: null, id: 'F-1', internalId: 'f-1', owner: null, policy: {}, status: 'todo',
            title: 'Alpha',
        },
        isActive: true,
        path: 'design/F-1-a.md',
        ...overrides,
    }
}

describe('CardBodyEditor', () => {
    afterEach(cleanup)

    it('seeds the editor with the card body only', () => {
        render(<CardBodyEditor card={card()} onBodyChange={vi.fn()} />)

        expect(screen.getByRole('textbox')).toHaveValue('# Alpha\n\nOriginal body')
    })

    it('reports body edits with the card path so the header stays with DataService', () => {
        const onBodyChange = vi.fn()
        render(<CardBodyEditor card={card()} onBodyChange={onBodyChange} />)

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Alpha\n\nEdited body' } })

        expect(onBodyChange).toHaveBeenCalledWith('design/F-1-a.md', '# Alpha\n\nEdited body')
    })

    it('keeps the toolbar sticky on mobile', () => {
        const { container } = render(<CardBodyEditor card={card()} isMobile onBodyChange={vi.fn()} />)

        expect(container.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })
})
