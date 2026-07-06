import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigPage } from './config_page'
import { configService } from '../../services/config_service'

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

describe('ConfigPage', () => {
    afterEach(() => {
        cleanup()
        configService.clear()
        window.history.pushState(null, '', '/config')
        mockMatchMedia(false)
        window.localStorage.clear()
    })

    it('renders typed editors with descriptions', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)

        expect(screen.getByRole('switch', { name: 'Startup splash' })).toBeInTheDocument()
        expect(screen.getByLabelText('GitHub scopes')).toBeInTheDocument()
        expect(screen.getByLabelText('Auto commit delay')).toBeInTheDocument()
        expect(screen.getByText('OAuth scopes requested when connecting GitHub.')).toBeInTheDocument()
    })

    it('saves draft edits into active config', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(configService.get('react.showStartupSplash')).toBe(false)
    })

    it('cancels draft edits without changing active config', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(configService.get('react.showStartupSplash')).toBe(true)
        expect(window.location.pathname).toBe('/')
    })

    it('uses vertical section tabs on desktop', () => {
        mockMatchMedia(false)
        configService.init({ desktopConfig: { agent: 'codex', projectLocationMode: 'folder' } })
        configService.loadProjectConfig(null)

        render(<ConfigPage hash="#project" />)

        expect(screen.getByRole('tablist', { name: 'Config sections' })).toHaveAttribute('aria-orientation', 'vertical')
        expect(screen.getByRole('tab', { name: 'Project' })).toHaveAttribute('href', '#project')
        expect(screen.getByRole('tab', { name: 'Desktop' })).toBeInTheDocument()
    })

    it('uses horizontal section tabs on mobile', () => {
        mockMatchMedia(true)
        configService.init()

        render(<ConfigPage hash="#connection" />)

        expect(screen.getByRole('tablist', { name: 'Config sections' })).not.toHaveAttribute('aria-orientation', 'vertical')
    })

    it('pushes desktop config edits through the electron bridge on save', () => {
        mockMatchMedia(false)
        const setDesktopConfig = vi.fn()
        window.md2Config = {
            getDesktopConfig: () => ({ agent: 'codex', projectLocationMode: 'folder' }),
            setDesktopConfig,
        }
        configService.init({ desktopConfig: { agent: 'codex', projectLocationMode: 'folder' } })

        render(<ConfigPage hash="#desktop" />)
        configService.setDraftValue('desktop.agent', 'system')
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(setDesktopConfig).toHaveBeenCalledWith({ agent: 'system', projectLocationMode: 'folder' })

        delete window.md2Config
    })

    it('never touches the desktop bridge in web mode', () => {
        mockMatchMedia(false)
        configService.init()

        render(<ConfigPage hash="" />)
        fireEvent.click(screen.getByRole('switch', { name: 'Startup splash' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(window.md2Config).toBeUndefined()
    })
})
