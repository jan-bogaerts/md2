import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggleButton } from './theme_toggle_button'

describe('ThemeToggleButton', () => {
    afterEach(cleanup)

    it('toggles the theme', () => {
        const onToggleTheme = vi.fn()
        render(<ThemeToggleButton onToggleTheme={onToggleTheme} />)

        fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

        expect(onToggleTheme).toHaveBeenCalledTimes(1)
    })
})
