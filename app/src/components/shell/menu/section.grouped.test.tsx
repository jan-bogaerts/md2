import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Section } from './section'

describe('Section', () => {
    afterEach(cleanup)

    it('renders its children in a group named by the label', () => {
        render(
            <Section label="Project">
                <button type="button">Push</button>
            </Section>,
        )

        expect(screen.getByRole('button', { name: 'Push' })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Project' })).toBeInTheDocument()
    })

    it('does not render a visible group caption', () => {
        render(
            <Section label="Project">
                <button type="button">Push</button>
            </Section>,
        )

        expect(screen.queryByText('Project')).not.toBeInTheDocument()
    })
})
