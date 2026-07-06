import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Section } from './section'

describe('Section', () => {
    afterEach(cleanup)

    it('renders its children and the label', () => {
        render(
            <Section label="Project">
                <button type="button">Push</button>
            </Section>,
        )

        expect(screen.getByRole('button', { name: 'Push' })).toBeInTheDocument()
        expect(screen.getByText('Project')).toBeInTheDocument()
    })

    it('renders the label after the button group in DOM order', () => {
        const { container } = render(
            <Section label="Project">
                <button type="button">Push</button>
            </Section>,
        )

        const wrapper = container.firstElementChild
        expect(wrapper?.children).toHaveLength(2)

        const [buttonGroup, labelElement] = Array.from(wrapper?.children ?? [])
        expect(buttonGroup.textContent).toContain('Push')
        expect(labelElement.textContent).toBe('Project')
    })
})
