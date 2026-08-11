import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DownloadProgress, ElectronUpdateBridge, UpdateInfo } from '../../data/electron_update_bridge'
import { UpdateNotification } from './update_notification'

const updateInfo: UpdateInfo = { downloadUrl: 'https://x/md2-Setup-0.3.0.exe', version: '0.3.0' }

function installBridge() {
    let pushAvailable: (info: UpdateInfo) => void = () => undefined
    let pushProgress: (progress: DownloadProgress) => void = () => undefined
    const bridge: ElectronUpdateBridge = {
        downloadUpdate: vi.fn().mockResolvedValue(undefined),
        onDownloadProgress: vi.fn((callback: (progress: DownloadProgress) => void) => {
            pushProgress = callback

            return () => undefined
        }),
        onUpdateAvailable: vi.fn((callback: (info: UpdateInfo) => void) => {
            pushAvailable = callback

            return () => undefined
        }),
    }
    window.md2Updates = bridge

    return {
        bridge,
        emitAvailable: (info: UpdateInfo) => act(() => pushAvailable(info)),
        emitProgress: (progress: DownloadProgress) => act(() => pushProgress(progress)),
    }
}

describe('UpdateNotification', () => {
    afterEach(() => {
        delete window.md2Updates
        cleanup()
    })

    it('renders nothing outside Electron', () => {
        const { container } = render(<UpdateNotification />)

        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing until an update is announced', () => {
        installBridge()
        render(<UpdateNotification />)

        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
    })

    it('shows the version and Install button when an update is available', () => {
        const { emitAvailable } = installBridge()
        render(<UpdateNotification />)

        emitAvailable(updateInfo)

        expect(screen.getByText('Version 0.3.0 is available.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
    })

    it('starts the download and swaps to a progress bar that advances', () => {
        const { bridge, emitAvailable, emitProgress } = installBridge()
        render(<UpdateNotification />)
        emitAvailable(updateInfo)

        fireEvent.click(screen.getByRole('button', { name: 'Install' }))

        expect(bridge.downloadUpdate).toHaveBeenCalledWith(updateInfo.downloadUrl)
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()

        emitProgress({ received: 25, total: 100 })
        const progressBar = screen.getByRole('progressbar')
        expect(progressBar).toHaveAttribute('aria-valuenow', '25')

        emitProgress({ received: 60, total: 100 })
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    })

    it('shows the launching state when the download completes', () => {
        const { emitAvailable, emitProgress } = installBridge()
        render(<UpdateNotification />)
        emitAvailable(updateInfo)
        fireEvent.click(screen.getByRole('button', { name: 'Install' }))

        emitProgress({ received: 100, total: 100 })

        expect(screen.getByText('Launching installer…')).toBeInTheDocument()
    })

    it('hides on dismiss and does not re-offer the same update', () => {
        const { emitAvailable } = installBridge()
        render(<UpdateNotification />)
        emitAvailable(updateInfo)

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
        expect(screen.queryByText('Version 0.3.0 is available.')).not.toBeInTheDocument()

        emitAvailable(updateInfo)
        expect(screen.queryByText('Version 0.3.0 is available.')).not.toBeInTheDocument()
    })
})
