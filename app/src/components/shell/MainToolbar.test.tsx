import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainToolbar } from './MainToolbar'

describe('MainToolbar', () => {
    afterEach(cleanup)

    it('hides the hamburger button on desktop', () => {
        render(<MainToolbar isMobile={false} mode="light" onOpenMenu={vi.fn()} onToggleTheme={vi.fn()} />)

        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('opens the menu from the hamburger button on mobile', () => {
        const onOpenMenu = vi.fn()
        render(<MainToolbar isMobile mode="light" onOpenMenu={onOpenMenu} onToggleTheme={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

        expect(onOpenMenu).toHaveBeenCalledTimes(1)
    })

    it('toggles the theme from the toolbar', () => {
        const onToggleTheme = vi.fn()
        render(<MainToolbar isMobile={false} mode="light" onOpenMenu={vi.fn()} onToggleTheme={onToggleTheme} />)

        fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

        expect(onToggleTheme).toHaveBeenCalledTimes(1)
    })
})
