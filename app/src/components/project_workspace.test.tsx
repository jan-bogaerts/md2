import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from './project_workspace'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import { configService } from '../services/config_service'
import { telemetryService } from '../services/telemetry_service'
import { workspaceNavigationService } from '../services/workspace_navigation_service'

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
        listRepositoryFiles: vi.fn(async () => ['app/src/app.tsx', 'design/F-1-root.md']),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(async (request) => {
            for (const move of request.moves) {
                const existingIndex = files.findIndex((file) => file.path === move.fromPath)
                if (existingIndex >= 0) files.splice(existingIndex, 1)
                files.push({ content: move.content, path: move.toPath })
            }
        }),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

describe('ProjectWorkspace', () => {
    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
        delete window.md2Data
    })

    it('opens a local project and shows root cards in the card view before background cards', async () => {
        window.md2Data = createBridge()

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))

        expect(await screen.findByText('Root')).toBeInTheDocument()
        expect(screen.getByText('F-1')).toBeInTheDocument()
        expect(screen.getByText('active')).toBeInTheDocument()
        expect(screen.getByText('Background cards loaded: 1')).toBeInTheDocument()
    })

    it('creates a new feature card through the data service', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        await screen.findByText('Root')

        fireEvent.change(screen.getByLabelText('New card title'), { target: { value: 'New Card' } })
        fireEvent.change(screen.getByLabelText('New card body'), { target: { value: 'Body' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create Feature' }))

        await waitFor(() => expect(bridge.commit).toHaveBeenCalled())
        expect(await screen.findByText('New Card')).toBeInTheDocument()
    })

    it('completes a release from the project controls', async () => {
        const bridge = createBridge()
        window.md2Data = bridge
        const prompt = vi.spyOn(window, 'prompt').mockReturnValue('v1')

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Complete release...' }))

        await waitFor(() => expect(bridge.moveFiles).toHaveBeenCalled())
        expect(await screen.findByText('Background cards loaded: 2')).toBeInTheDocument()

        prompt.mockRestore()
    })

    it('opens a card in the text view as a tab from the card body dialog', async () => {
        window.md2Data = createBridge()

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        fireEvent.click(await screen.findByText('Root'))
        fireEvent.click(await screen.findByRole('button', { name: 'Open in file mode' }))

        expect(await screen.findByRole('tab', { name: /Root/ })).toBeInTheDocument()
        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
    })

    it('switches to the text view from the view toggle', async () => {
        window.md2Data = createBridge()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        await screen.findByText('Root')

        fireEvent.click(screen.getByRole('button', { name: 'Text' }))

        expect(screen.getByLabelText('File tree')).toBeInTheDocument()
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('reveals a navigated card and keeps the current card view', async () => {
        window.md2Data = createBridge()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        render(<ProjectWorkspace accessToken={null} isGithubAuthenticated={false} />)
        fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
        await screen.findByText('Root')

        act(() => workspaceNavigationService.open('design/F-1-root.md'))

        expect(screen.getByRole('heading', { name: 'Active cards' })).toBeInTheDocument()
        const selected = document.querySelector('[data-selected="true"]')
        expect(selected).not.toBeNull()
        expect(selected).toHaveTextContent('Root')
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })
})
