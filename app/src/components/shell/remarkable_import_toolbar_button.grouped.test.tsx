import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, StorageService } from '../../data/data_types'
import type { RemarkableBridge } from '../../data/remarkable_bridge'
import { configService } from '../../services/config/config_service'
import { dataService } from '../../services/data/data_service'
import { RemarkableImportToolbarButton } from './remarkable_import_toolbar_button'

function card(): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '# Goal',
        header: { affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'F-1', internalId: null, owner: null, policy: {}, references: [], status: 'new', title: 'Card' },
        hasFrontmatter:true,
        isActive: true,
        path: 'design/F-1-card.md',
    }
}

function createStorage(): StorageService {
    return {
        checkoutBranch: vi.fn(),
        commit: vi.fn(),
        createProject: vi.fn(),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        listBranches: vi.fn(),
        listRepositories: vi.fn(),
        listRepositoryFiles: vi.fn(),
        listTopLevelFolders: vi.fn(),
        loadActionFiles: vi.fn(),
        loadProject: vi.fn(),
        loadProjectConfig: vi.fn(),
        loadProjectRoot: vi.fn(),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
    }
}

function createBridge(): RemarkableBridge {
    return {
        importFiles: vi.fn(),
        listImageFiles: vi.fn(),
        testConnection: vi.fn(),
    }
}

describe('RemarkableImportToolbarButton', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: null })
        dataService.init({ storage: createStorage() })
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('opens the Remarkable import dialog from the toolbar action', () => {
        render(<RemarkableImportToolbarButton activeCards={[card()]} bridge={createBridge()} isProjectOpen />)

        fireEvent.click(screen.getByRole('button', { name: 'Import from Remarkable' }))

        expect(screen.getByRole('dialog', { name: 'Remarkable import' })).toBeInTheDocument()
        expect(screen.getByLabelText('Host')).toBeInTheDocument()
    })

    it('hides the toolbar action without an open project', () => {
        render(<RemarkableImportToolbarButton activeCards={[card()]} bridge={createBridge()} isProjectOpen={false} />)

        expect(screen.queryByRole('button', { name: 'Import from Remarkable' })).toBeNull()
    })
})
