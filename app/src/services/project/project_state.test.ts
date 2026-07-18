import { describe, expect, it } from 'vitest'
import type { MarkdownFile, ProjectReference } from '../../data/data_types'
import { ProjectState } from './project_state'

const WORKING_FOLDER = 'design'
const project: ProjectReference = { branch: 'main', id: 'project' }

function createState() {
    return new ProjectState((cards) => cards)
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
