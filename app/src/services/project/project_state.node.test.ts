import { describe, expect, it, vi } from 'vitest'
import type { MarkdownFile, ProjectCard, ProjectReference } from '../../data/data_types'
import { ProjectState } from './project_state'

const WORKING_FOLDER = 'design'
const project: ProjectReference = { branch: 'main', id: 'project' }

function createState() {
    return new ProjectState((cards) => cards, () => undefined)
}

function createFile(path: string, title: string): MarkdownFile {
    return { content: `---\ntitle: ${title}\n---\n\n# ${title}\n\nBody`, path, sha: `${path}-sha` }
}

describe('ProjectState', () => {
    it('rebuilds the snapshot when project files are replaced', () => {
        const state = createState()
        const file = createFile('design/F-1-first.md', 'First')

        state.replaceProject(project)
        state.replaceProjectFiles([file], WORKING_FOLDER, ['design/F-1-first.md'])

        expect(state.files).toEqual([file])
        expect(state.snapshot?.activeCards.map((card) => card.path)).toEqual(['design/F-1-first.md'])
        expect(state.snapshot?.repositoryFiles).toEqual(['design/F-1-first.md'])
    })

    it('keeps files and snapshot together when committed files merge', () => {
        const state = createState()
        const originalFile = createFile('design/F-1-first.md', 'First')
        const updatedFile = { ...originalFile, content: originalFile.content.replace('Body', 'Updated'), sha: 'updated-sha' }
        const newFile = createFile('design/F-2-second.md', 'Second')

        state.replaceProject(project)
        state.replaceProjectFiles([originalFile], WORKING_FOLDER, [])
        state.mergeCommittedFiles([updatedFile, newFile], WORKING_FOLDER)

        expect(state.files.map((file) => file.path)).toEqual(['design/F-1-first.md', 'design/F-2-second.md'])
        expect(state.files[0]).toEqual(updatedFile)
        expect(state.snapshot?.activeCards.map((card) => card.path)).toEqual(['design/F-1-first.md', 'design/F-2-second.md'])
    })

    it('merges companion writes and removes a deleted file from loaded and repository state', () => {
        const state = createState()
        const firstFile = createFile('design/F-1-first.md', 'First')
        const secondFile = createFile('design/F-2-second.md', 'Second')
        const updatedSecondFile = { ...secondFile, content: secondFile.content.replace('Body', 'Updated'), sha: 'updated-sha' }

        state.replaceProjectFiles([firstFile, secondFile], WORKING_FOLDER, [firstFile.path, secondFile.path])
        state.deleteFile(firstFile.path, [updatedSecondFile], WORKING_FOLDER)

        expect(state.files).toEqual([updatedSecondFile])
        expect(state.snapshot?.activeCards.map((card) => card.path)).toEqual([secondFile.path])
        expect(state.snapshot?.repositoryFiles).toEqual([secondFile.path])
    })

    it('reports active card transitions after snapshot changes', () => {
        const activeCardsChanged = vi.fn()
        const state = new ProjectState((cards) => cards, activeCardsChanged)
        const originalFile = createFile('design/F-1-first.md', 'First')
        const updatedFile = { ...originalFile, content: originalFile.content.replace('First', 'Renamed') }
        const newFile = createFile('design/F-2-second.md', 'Second')

        state.replaceProjectFiles([originalFile], WORKING_FOLDER, [])
        state.replaceProjectFiles([updatedFile, newFile], WORKING_FOLDER, [])
        state.resetLoadedProject()

        expect(activeCardsChanged).toHaveBeenCalledTimes(3)
        expect(activeCardsChanged.mock.calls[0][0]).toEqual([])
        expect(activeCardsChanged.mock.calls[0][1].map((card: ProjectCard) => card.path)).toEqual(['design/F-1-first.md'])
        expect(activeCardsChanged.mock.calls[1][0][0].header.title).toBe('First')
        expect(activeCardsChanged.mock.calls[1][1].map((card: ProjectCard) => card.path)).toEqual([
            'design/F-1-first.md',
            'design/F-2-second.md',
        ])
        expect(activeCardsChanged.mock.calls[2][1]).toEqual([])
    })

    it('detects stale project and agent-conversation loads', () => {
        const state = createState()
        state.replaceProject(project)
        const firstProjectToken = state.beginProjectLoad()
        const firstAgentToken = state.beginAgentConversationLoad()

        expect(state.isCurrentLoad(project, firstProjectToken)).toBe(true)
        expect(state.isCurrentAgentConversationLoad(firstAgentToken)).toBe(true)

        state.beginProjectLoad()
        state.beginAgentConversationLoad()

        expect(state.isCurrentLoad(project, firstProjectToken)).toBe(false)
        expect(state.isCurrentAgentConversationLoad(firstAgentToken)).toBe(false)
    })
})
