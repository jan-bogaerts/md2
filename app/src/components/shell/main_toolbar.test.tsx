import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainToolbar } from './main_toolbar'

const toolbarAction = <button type="button">Action</button>

describe('MainToolbar', () => {
    afterEach(cleanup)

    it('hides the hamburger button on desktop', () => {
        render(<MainToolbar action={toolbarAction} isMobile={false} onOpenMenu={vi.fn()} />)

        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('opens the menu from the hamburger button on mobile', () => {
        const onOpenMenu = vi.fn()
        render(<MainToolbar action={toolbarAction} isMobile onOpenMenu={onOpenMenu} />)

        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

        expect(onOpenMenu).toHaveBeenCalledTimes(1)
    })
})
