import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentInstructionsService } from '../../services/agent_instructions/agent_instructions_service'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { projectAccessService } from '../../services/project/project_access_service'
import { createStorage } from '../../services/test_support/data_service_test_support'
import { AppThemeProvider } from '../../theme/theme_provider'
import { instructionMarkdownDataSource } from '../editor/instruction_markdown_data_source'
import { InstructionEditor } from './instruction_editor'
import { TabBar } from './tab_bar'

describe('InstructionEditor', () => {
    afterEach(() => {
        cleanup()
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        agentInstructionsService.clear()
        projectAccessService.setReadOnly(false)
        vi.restoreAllMocks()
    })

    it('renders txt content in MarkdownEditor and shows full path in tab tooltip', async () => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'project' },
            runningAgents: [],
            snapshot: { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        await agentInstructionsService.load(
            { branch: 'main', id: 'project' },
            ['README.txt'],
            createStorage({ loadTextFile: vi.fn(async (_project, path) => ({ content: 'Plain agent guidance', path })) }),
        )
        openFilesService.init({ actionService, agentInstructionsService, dataService })
        instructionMarkdownDataSource.init(dataService)
        const file = agentInstructionsService.getFile('README.txt')
        if (!file) throw new Error('Missing instruction file')
        openFilesService.openDocument(file)
        projectAccessService.setReadOnly(true)

        render(
            <AppThemeProvider>
                <TabBar actionsFolder="design/actions" cardTypes={[]} />
                <InstructionEditor />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('tab', { name: 'README.txt' })).toHaveAttribute('title', 'README.txt')
        expect(await screen.findByText('Plain agent guidance')).toBeInTheDocument()
        expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    })
})
