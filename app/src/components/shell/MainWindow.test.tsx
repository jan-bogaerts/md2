import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainWindow } from './MainWindow'

function renderWindow(overrides?: Partial<Parameters<typeof MainWindow>[0]>) {
    return render(
        <MainWindow
            agents={[]}
            leftPanel={<div>Left content</div>}
            mode="light"
            onStatusInfoChange={vi.fn()}
            onToggleTheme={vi.fn()}
            rightPanel={<div>Right content</div>}
            statusInfo=""
            {...overrides}
        />,
    )
}

function mockMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

describe('MainWindow', () => {
    afterEach(() => {
        cleanup()
        mockMatchMedia(false)
    })

    it('shows both panels and the status bar on desktop', () => {
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByText('Left content')).toBeInTheDocument()
        expect(screen.getByText('Right content')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('moves the left panel into a hamburger drawer on mobile', () => {
        mockMatchMedia(true)
        renderWindow()

        expect(screen.queryByText('Left content')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        expect(screen.getByText('Left content')).toBeInTheDocument()
    })
})
