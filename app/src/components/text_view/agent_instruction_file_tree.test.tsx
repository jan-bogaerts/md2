import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSnapshot } from '../../data/data_types'
import { agentInstructionsService } from '../../services/agent_instructions/agent_instructions_service'
import { actionService } from '../../services/actions/action_service'
import { dataService, type DataServiceState } from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { createStorage } from '../../services/test_support/data_service_test_support'
import { AppThemeProvider } from '../../theme/theme_provider'
import { FileTreeView } from './file_tree_view'

describe('agent instruction file tree', () => {
    afterEach(() => {
        cleanup()
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        agentInstructionsService.clear()
        vi.restoreAllMocks()
    })

    it('shows flat full paths, has no structural actions, and opens instruction documents', async () => {
        const project = { branch: 'main', id: 'project' }
        const snapshot: ProjectSnapshot = { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
        const state: DataServiceState = {
            project,
            runningAgents: [],
            snapshot,
        }
        vi.spyOn(dataService, 'getState').mockReturnValue(state)
        await agentInstructionsService.load(
            project,
            ['docs/AGENTS.md', '.github/copilot-instructions.md'],
            createStorage({ loadTextFile: vi.fn(async (_project, path) => ({ content: path, path })) }),
        )
        openFilesService.init({ actionService, agentInstructionsService, dataService })

        render(
            <AppThemeProvider>
                <FileTreeView
                    actionsFolder="design/actions"
                    cardTypes={[]}
                    onCreateFolder={vi.fn()}
                    onCreateMarkdownFile={vi.fn()}
                    onDeleteFile={vi.fn()}
                    onDeleteFolder={vi.fn()}
                    onLeftPanelInteraction={vi.fn()}
                    projectFolder="design"
                    statusColors={new Map()}
                    workingFolder="design"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'agent instructions 2' }))
        const instructionButton = screen.getByRole('button', { name: 'docs/AGENTS.md' })
        const instructionRow = instructionButton.closest<HTMLElement>('[role="treeitem"]')
        if (!instructionRow) throw new Error('Missing instruction tree row')
        expect(screen.getByRole('button', { name: '.github/copilot-instructions.md' })).toBeInTheDocument()
        expect(within(instructionRow).queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
        expect(within(instructionRow).queryByRole('button', { name: /Delete/u })).not.toBeInTheDocument()

        act(() => fireEvent.click(instructionButton))

        expect(openFilesService.getSnapshot().activeDocument?.kind).toBe('instruction')
        expect(screen.getByRole('button', { name: 'New folder' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'New Markdown file' })).toBeDisabled()
    })
})
