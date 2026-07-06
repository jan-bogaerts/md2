import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Menu } from './menu'

describe('Menu', () => {
    afterEach(cleanup)

    it('renders its children', () => {
        render(
            <Menu>
                <div>tab content</div>
            </Menu>,
        )

        expect(screen.getByText('tab content')).toBeInTheDocument()
    })
})
