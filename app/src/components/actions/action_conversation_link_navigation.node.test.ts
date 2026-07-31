import { afterEach, describe, expect, it, vi } from 'vitest'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import { workspaceNavigationService } from '../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import {
    isLocalFileLink,
    openActionConversationLink,
    resolveActionConversationLinkPath,
} from './action_conversation_link_navigation'

const REPOSITORY_FILES = [
    'app/src/app.tsx',
    'design/F_89_links.md',
    'design/actions/review.json',
]

function mockLoadedProject() {
    vi.spyOn(dataService, 'getState').mockReturnValue({
        project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
        runningAgents: [],
        snapshot: {
            activeCards: [],
            backgroundCards: [],
            repositoryFiles: REPOSITORY_FILES,
            workingFolder: 'design',
        },
    })
    vi.spyOn(dataService, 'getConfig').mockReturnValue({
        actionsFolder: 'design/actions',
        archivedFolder: 'design/archived',
        backgroundShade: 'blue',
        cardBodyTemplate: '',
        cardSeparator: '_',
        cardTypes: [],
        diffCommand: '',
        projectFolder: 'design',
        pushMode: 'manual',
        releasesFolder: 'design/releases',
        states: [],
        workingFolder: 'design',
    })
}

describe('action conversation link navigation', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('classifies repository paths and Windows paths as local while preserving web links', () => {
        expect(isLocalFileLink('design/F_89_links.md')).toBe(true)
        expect(isLocalFileLink('C:\\repo\\design\\F_89_links.md')).toBe(true)
        expect(isLocalFileLink('file:///C:/repo/design/F_89_links.md')).toBe(true)
        expect(isLocalFileLink('https://example.com/file.md')).toBe(false)
        expect(isLocalFileLink('mailto:test@example.com')).toBe(false)
        expect(isLocalFileLink('#details')).toBe(false)
    })

    it('normalizes relative and absolute Windows paths to canonical repository paths', () => {
        expect(resolveActionConversationLinkPath(
            '.\\design\\F_89_links.md',
            'C:\\repo',
            REPOSITORY_FILES,
        )).toBe('design/F_89_links.md')
        expect(resolveActionConversationLinkPath(
            'c:%5Crepo%5Cdesign%5CF_89_links.md',
            'C:\\repo',
            REPOSITORY_FILES,
        )).toBe('design/F_89_links.md')
    })

    it('rejects missing and out-of-repository targets', () => {
        expect(() => resolveActionConversationLinkPath(
            '../outside.md',
            'C:/repo',
            REPOSITORY_FILES,
        )).toThrow('outside the active repository')
        expect(() => resolveActionConversationLinkPath(
            'D:/other/file.md',
            'C:/repo',
            REPOSITORY_FILES,
        )).toThrow('outside the active repository')
        expect(() => resolveActionConversationLinkPath(
            'design/missing.md',
            'C:/repo',
            REPOSITORY_FILES,
        )).toThrow('target does not exist')
    })

    it('opens project Markdown in text view', async () => {
        mockLoadedProject()
        const setViewMode = vi.spyOn(workspaceViewService, 'setViewMode')
        const open = vi.spyOn(workspaceNavigationService, 'open').mockImplementation(() => undefined)

        await openActionConversationLink('C:\\repo\\design\\F_89_links.md')

        expect(setViewMode).toHaveBeenCalledWith('text')
        expect(open).toHaveBeenCalledWith('design/F_89_links.md')
    })

    it('opens loaded project action JSON in text view', async () => {
        mockLoadedProject()
        vi.spyOn(actionService, 'getActionByPath').mockReturnValue({ sourcePath: 'design/actions/review.json' } as never)
        const setViewMode = vi.spyOn(workspaceViewService, 'setViewMode')
        const open = vi.spyOn(workspaceNavigationService, 'open').mockImplementation(() => undefined)

        await openActionConversationLink('design/actions/review.json')

        expect(setViewMode).toHaveBeenCalledWith('text')
        expect(open).toHaveBeenCalledWith('design/actions/review.json')
    })

    it('opens another repository file in VS Code', async () => {
        mockLoadedProject()
        const openInEditor = vi.fn(async () => undefined)
        setActionBridgeOverride({ openInEditor } as unknown as ElectronActionBridge)

        await openActionConversationLink('app/src/app.tsx')

        expect(openInEditor).toHaveBeenCalledWith({ line: 1, path: 'app/src/app.tsx' })
    })
})
