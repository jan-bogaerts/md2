import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from './ProjectWorkspace'
import type { ElectronDataBridge } from '../data/electronDataBridge'

function createBridge(): ElectronDataBridge {
    const files = [
        { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n---\n\n# Root', path: 'design/F-1-root.md' },
        { content: '# Old', path: 'design/history/F-2-old.md' },
    ]

    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async (request) => {
            files.push(...request.files)
        }),
        createProject: vi.fn(async (project) => project),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('ProjectWorkspace', () => {
    afterEach(() => {
        cleanup()
        window.localStorage.clear()
        delete window.md2Data
    })

    it('opens a local project and shows root cards before background cards', async () => {
        window.md2Data = createBridge()

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))

        expect(await screen.findByRole('button', { name: 'F-1 Root' })).toBeInTheDocument()
        expect(screen.getByText('Background cards loaded: 1')).toBeInTheDocument()
    })

    it('creates a new feature card through the data service', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        await screen.findByRole('button', { name: 'F-1 Root' })

        fireEvent.change(screen.getByLabelText('New card title'), { target: { value: 'New Card' } })
        fireEvent.change(screen.getByLabelText('New card body'), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create Feature' }))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalled())
        expect(await screen.findByRole('button', { name: 'F-3 New Card' })).toBeInTheDocument()
    })
})
