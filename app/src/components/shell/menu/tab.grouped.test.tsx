import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Tab } from './tab'

describe('Tab', () => {
    afterEach(cleanup)

    it('renders its children', () => {
        render(
            <Tab>
                <div>section content</div>
            </Tab>,
        )

        expect(screen.getByText('section content')).toBeInTheDocument()
    })
})
