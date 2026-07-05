import { describe, expect, it, vi } from 'vitest'
import type { ElectronDataBridge } from '../data/electron_data_bridge'
import type { CommitRequest } from '../data/data_types'
import { LocalGitStorageService } from './local_git_storage_service'

function createBridge(overrides: Partial<ElectronDataBridge> = {}): ElectronDataBridge {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
        createProject: vi.fn(),
        listBranches: vi.fn(),
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
        loadProjectConfig: vi.fn(),
        openProjectFolder: vi.fn(),
        push: vi.fn().mockResolvedValue(undefined),
        saveProjectConfig: vi.fn(),
        watchProject: vi.fn().mockReturnValue(() => undefined),
        ...overrides,
    }
}

describe('LocalGitStorageService binary write path', () => {
    it('forwards base64 asset files to the bridge unchanged', async () => {
        const commit = vi.fn().mockResolvedValue(undefined)
        const bridge = createBridge({ commit })
        const service = new LocalGitStorageService()
        service.init({ bridge })

        const request: CommitRequest = {
            branch: 'main',
            files: [
                { content: '# Card', encoding: 'utf-8', path: 'design/F-1-card.md' },
                { content: 'aW1hZ2U=', encoding: 'base64', path: 'design/note.png' },
            ],
            message: 'Import Remarkable images',
        }

        await service.commit(request)

        expect(commit).toHaveBeenCalledWith(request)
        expect(commit.mock.calls[0][0].files[1].encoding).toBe('base64')
    })
})
