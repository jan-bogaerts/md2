import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainToolbar } from './main_toolbar'

const toolbarAction = <button type="button">Action</button>

describe('MainToolbar', () => {
    afterEach(cleanup)

    it('hides the hamburger button on desktop', () => {
        render(<MainToolbar action={toolbarAction} isMobile={false} onOpenConfig={vi.fn()} onOpenMenu={vi.fn()} />)

        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('opens the menu from the hamburger button on mobile', () => {
        const onOpenMenu = vi.fn()
        render(<MainToolbar action={toolbarAction} isMobile onOpenConfig={vi.fn()} onOpenMenu={onOpenMenu} />)

        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

        expect(onOpenMenu).toHaveBeenCalledTimes(1)
    })

    it('opens config from the toolbar button', () => {
        const onOpenConfig = vi.fn()
        render(<MainToolbar action={toolbarAction} isMobile={false} onOpenConfig={onOpenConfig} onOpenMenu={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Open config' }))

        expect(onOpenConfig).toHaveBeenCalledTimes(1)
    })
})
