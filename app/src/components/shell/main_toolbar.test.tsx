import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainToolbar } from './main_toolbar'

const toolbarAction = <button type="button">Action</button>
const search = <input aria-label="Search project" />

const DRAG = 'drag'
const NO_DRAG = 'no-drag'

function appRegion(element: HTMLElement) {
    return (element.style as unknown as Record<string, string>).WebkitAppRegion
}

describe('MainToolbar', () => {
    afterEach(cleanup)

    it('hides the hamburger button on desktop', () => {
        render(<MainToolbar action={toolbarAction} isMobile={false} onOpenConfig={vi.fn()} onOpenMenu={vi.fn()} search={search} />)

        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('opens the menu from the hamburger button on mobile', () => {
        const onOpenMenu = vi.fn()
        render(<MainToolbar action={toolbarAction} isMobile onOpenConfig={vi.fn()} onOpenMenu={onOpenMenu} search={search} />)

        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

        expect(onOpenMenu).toHaveBeenCalledTimes(1)
    })

    it('opens config from the toolbar button', () => {
        const onOpenConfig = vi.fn()
        render(<MainToolbar action={toolbarAction} isMobile={false} onOpenConfig={onOpenConfig} onOpenMenu={vi.fn()} search={search} />)

        fireEvent.click(screen.getByRole('button', { name: 'Open config' }))

        expect(onOpenConfig).toHaveBeenCalledTimes(1)
    })

    it('makes the bar draggable while keeping the search controls non-draggable', () => {
        const { container } = render(
            <MainToolbar action={toolbarAction} isMobile={false} onOpenConfig={vi.fn()} onOpenMenu={vi.fn()} search={search} />,
        )

        const bar = container.querySelector('.MuiToolbar-root') as HTMLElement
        const searchRegion = screen.getByRole('textbox', { name: 'Search project' }).parentElement as HTMLElement

        expect(appRegion(bar)).toBe(DRAG)
        expect(appRegion(searchRegion)).toBe(NO_DRAG)
    })
})
