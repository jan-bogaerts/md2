import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../../../data/data_types'
import { agentInstructionsService } from '../../../services/agent_instructions/agent_instructions_service'
import { ManagedOpenDocument } from '../../../services/managed_open_document'
import type { InstructionOpenDocument } from '../../../services/open_files_service'
import { projectAccessService } from '../../../services/project/project_access_service'
import { createStorage } from '../../../services/test_support/data_service_test_support'
import { InstructionMarkdownDataSource } from './instruction_markdown_data_source'

const PROJECT: ProjectReference = { branch: 'main', id: 'project' }

async function createSetup(path = 'AGENTS.md') {
    const file = { content: '# Initial', path }
    await agentInstructionsService.load(PROJECT, [file.path], createStorage({loadTextFile: vi.fn(async () => file)}))
    const document = new ManagedOpenDocument('instruction', file.path, file, { content: file.content }) as unknown as InstructionOpenDocument
    const owner = Object.assign(new EventTarget(), {getSnapshot: () => ({ activeDocument: document, documents: [document] })})
    const persistence = { scheduleFileCommit: vi.fn() }
    const dataSource = new InstructionMarkdownDataSource()
    dataSource.init(persistence, owner)

    return { dataSource, document, persistence, target: { document } as const }
}

describe('InstructionMarkdownDataSource', () => {
    beforeEach(() => projectAccessService.setReadOnly(false))

    afterEach(() => {
        agentInstructionsService.clear()
        projectAccessService.setReadOnly(false)
        vi.restoreAllMocks()
    })

    it('updates owned content before document subscribers and acknowledges successful saves', async () => {
        const { dataSource, document, persistence, target } = await createSetup()
        let contentSeenByDocumentSubscriber = ''
        document.addEventListener('changed', () => {
            contentSeenByDocumentSubscriber = agentInstructionsService.getFile(document.path)?.content ?? ''
        })

        dataSource.edit('list-instruction', target, '# Local')

        expect(contentSeenByDocumentSubscriber).toBe('# Local')
        expect(document.dirty).toBe(true)
        expect(dataSource.commit('list-instruction', target, '# Local')).toBe(true)
        expect(persistence.scheduleFileCommit).toHaveBeenCalledWith(
            { content: '# Local', path: 'AGENTS.md' },
            'Update AGENTS.md',
            expect.objectContaining({ document }),
        )

        const saveReference = persistence.scheduleFileCommit.mock.calls[0]?.[2]
        saveReference?.acknowledge()
        expect(document.dirty).toBe(false)
    })

    it('rejects edits in project read-only mode', async () => {
        const { dataSource, persistence, target } = await createSetup()
        projectAccessService.setReadOnly(true)

        expect(dataSource.commit('list-instruction', target, '# Blocked')).toBe(false)
        expect(agentInstructionsService.getFile('AGENTS.md')?.content).toBe('# Initial')
        expect(persistence.scheduleFileCommit).not.toHaveBeenCalled()
    })

    it('saves txt instructions as text at their original path', async () => {
        const { dataSource, persistence, target } = await createSetup('README.txt')

        dataSource.edit('list-instruction', target, 'Plain UTF-8 guidance')
        expect(dataSource.commit('list-instruction', target, 'Plain UTF-8 guidance')).toBe(true)

        expect(persistence.scheduleFileCommit).toHaveBeenCalledWith(
            { content: 'Plain UTF-8 guidance', path: 'README.txt' },
            'Update README.txt',
            expect.any(Object),
        )
    })
})
