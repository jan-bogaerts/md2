import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallback, useState, type ReactNode } from 'react'
import type { StorageService } from '../../../data/data_types'
import type { ElectronDataBridge } from '../../../data/electron_data_bridge'
import { configService } from '../../../services/config_service'
import { dataService } from '../../../services/data_service'
import { ProjectToolbarMenu } from '../project_toolbar_menu'
import { ProjectWorkspace } from '../../project_workspace'
import { AppMenu } from './app_menu'

function createBridge(): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        openProjectFolder: vi.fn(async () => ({ branch: 'main', id: 'local', rootPath: 'C:/repo' })),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn(() => vi.fn()),
    }
}

function createResetStorage(): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        listBranches: vi.fn(async () => []),
        listRepositories: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => []),
        listTopLevelFolders: vi.fn(async () => []),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
    }
}

function renderSurface() {
    function Surface() {
        const [leftPanelContent, setLeftPanelContent] = useState<ReactNode>(null)
        const handleLeftPanelInteraction = useCallback(() => undefined, [])

        return (
            <>
                <ProjectToolbarMenu accessToken="token" isGithubAuthenticated={false} />
                <AppMenu />
                {leftPanelContent}
                <ProjectWorkspace onLeftPanelContentChange={setLeftPanelContent} onLeftPanelInteraction={handleLeftPanelInteraction} />
            </>
        )
    }

    return render(
        <Surface />,
    )
}

async function openLocalProject() {
    fireEvent.click(screen.getByRole('button', { name: 'Project' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open project...' }))
    await screen.findByRole('heading', { name: 'Open project' })
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Source' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Local' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose local folder...' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveTextContent('main'))
    fireEvent.click(screen.getByRole('button', { name: 'Open Local' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open project' })).toBeNull())
}

describe('AppMenu', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        dataService.init({ storage: createResetStorage() })
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
        delete window.md2Data
        vi.restoreAllMocks()
    })

    it('hides the Push button when no project is open', () => {
        renderSurface()

        expect(screen.queryByRole('button', { name: 'Push' })).toBeNull()
        expect(dataService.getState().project).toBeNull()
    })

    it('hides the Push button when the open project uses auto push mode', async () => {
        const bridge = createBridge()
        window.md2Data = bridge

        renderSurface()
        await openLocalProject()

        expect(screen.queryByRole('button', { name: 'Push' })).toBeNull()
    })

    it('pushes the current manual project when the Push button is clicked', async () => {
        const bridge = createBridge()
        bridge.loadProjectConfig = vi.fn(async () => ({ pushMode: 'manual' }))
        window.md2Data = bridge

        renderSurface()
        await openLocalProject()

        const pushButton = screen.getByRole('button', { name: 'Push' })
        expect(pushButton).not.toBeDisabled()

        fireEvent.click(pushButton)

        await waitFor(() => expect(bridge.push).toHaveBeenCalled())
    })

    it('surfaces a push failure through the existing workspace error alert', async () => {
        const bridge = createBridge()
        bridge.loadProjectConfig = vi.fn(async () => ({ pushMode: 'manual' }))
        bridge.push = vi.fn(async () => {
            throw new Error('push failed')
        })
        window.md2Data = bridge

        renderSurface()
        await openLocalProject()

        fireEvent.click(screen.getByRole('button', { name: 'Push' }))

        expect(await screen.findByText('push failed')).toBeInTheDocument()
    })
})
