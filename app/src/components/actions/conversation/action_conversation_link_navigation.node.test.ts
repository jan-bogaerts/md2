import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../data/electron_action_bridge'
import { actionService } from '../../../services/actions/action_service'
import { dataService } from '../../../services/data/data_service'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../../services/project/workspace_view_service'
import { worktreeService } from '../../../services/project/worktree_service'
import {
    isLocalFileLink,
    openActionConversationLink,
    resolveActionConversationLinkPath,
    resolveConversationRepositoryRoot,
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
        cardSeparator: '_',
        cardTypes: [],
        diagramFooter: 'Save to {{diagram-file}}.',
        diagramsFolder: 'design/diagrams',
        diffCommand: '',
        projectFolder: 'design',
        pushMode: 'manual',
        releasesFolder: 'design/releases',
        states: [],
        workingFolder: 'design',
    })
    vi.spyOn(worktreeService, 'getRecords').mockReturnValue([])
}

describe('action conversation link navigation', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('classifies repository paths and Windows paths as local while preserving web links', () => {
        expect(isLocalFileLink('design/F_89_links.md')).toBe(true)
        expect(isLocalFileLink('C:\\repo\\design\\F_89_links.md')).toBe(true)
        expect(isLocalFileLink('C:%5Crepo%5Cdesign%5CF_89_links.md')).toBe(true)
        expect(isLocalFileLink('/C:/repo/design/F_89_links.md')).toBe(true)
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
        expect(resolveActionConversationLinkPath(
            '/C:/repo/design/F_89_links.md:12',
            'C:/repo',
            REPOSITORY_FILES,
        )).toBe('design/F_89_links.md')
    })

    it('leaves missing and out-of-repository targets for desktop validation', () => {
        expect(resolveActionConversationLinkPath(
            '../outside.md',
            'C:/repo',
            REPOSITORY_FILES,
        )).toBeNull()
        expect(resolveActionConversationLinkPath(
            'D:/other/file.md',
            'C:/repo',
            REPOSITORY_FILES,
        )).toBeNull()
        expect(resolveActionConversationLinkPath(
            'design/missing.md',
            'C:/repo',
            REPOSITORY_FILES,
        )).toBeNull()
    })

    it('opens project Markdown in text view', async () => {
        mockLoadedProject()
        const setViewMode = vi.spyOn(workspaceViewService, 'setViewMode')
        const open = vi.spyOn(workspaceNavigationService, 'open').mockImplementation(() => undefined)

        await openActionConversationLink('C:\\repo\\design\\F_89_links.md:12', null)

        expect(setViewMode).toHaveBeenCalledWith('text')
        expect(open).toHaveBeenCalledWith('design/F_89_links.md')
    })

    it('opens loaded project action JSON in text view', async () => {
        mockLoadedProject()
        vi.spyOn(actionService, 'getActionByPath').mockReturnValue({ sourcePath: 'design/actions/review.json' } as never)
        const setViewMode = vi.spyOn(workspaceViewService, 'setViewMode')
        const open = vi.spyOn(workspaceNavigationService, 'open').mockImplementation(() => undefined)

        await openActionConversationLink('design/actions/review.json', null)

        expect(setViewMode).toHaveBeenCalledWith('text')
        expect(open).toHaveBeenCalledWith('design/actions/review.json')
    })

    it('opens another repository file in configured external editor', async () => {
        mockLoadedProject()
        const openInEditor = vi.fn(async () => undefined)
        setActionBridgeOverride({ openInEditor } as unknown as ElectronActionBridge)

        await openActionConversationLink('app/src/app.tsx', null)

        expect(openInEditor).toHaveBeenCalledWith({ path: 'app/src/app.tsx', repositoryRoot: 'C:/repo' })
    })

    it('removes a browser-style leading slash before opening an absolute Windows path', async () => {
        mockLoadedProject()
        const openInEditor = vi.fn(async () => undefined)
        setActionBridgeOverride({ openInEditor } as unknown as ElectronActionBridge)

        await openActionConversationLink('/C:/repo/app/src/app.tsx:33', null)

        expect(openInEditor).toHaveBeenCalledWith({ path: 'C:/repo/app/src/app.tsx:33', repositoryRoot: 'C:/repo' })
    })

    it('uses current card worktree assignment on every click', async () => {
        mockLoadedProject()
        const state = dataService.getState()
        const card: Card = {
            agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true, path: 'design/F-1.md',
            header: { affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'F-1', internalId: 'card-1', owner: null, policy: {}, references: [], status: 'design', title: 'Card', worktree: 1 },
        }
        if (!state.snapshot) throw new Error('Missing test snapshot')
        state.snapshot.activeCards.push(card)
        vi.mocked(worktreeService.getRecords).mockReturnValue([
            { branch: 'card-1', error: null, parkingBranch: 'parking/1', path: 'C:/worktrees/1', status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true },
            { branch: 'card-2', error: null, parkingBranch: 'parking/2', path: 'C:/worktrees/2', status: { ahead: 0, baseAhead: 0, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true },
        ])
        const openInEditor = vi.fn(async () => undefined)
        setActionBridgeOverride({ openInEditor } as unknown as ElectronActionBridge)

        await openActionConversationLink('src/only.js:12', 'card-1')
        card.header.worktree = 2
        await openActionConversationLink('src/only.js:12', 'card-1')
        card.header.worktree = null
        await openActionConversationLink('src/only.js:12', 'card-1')

        expect(openInEditor).toHaveBeenNthCalledWith(1, { path: 'src/only.js:12', repositoryRoot: 'C:/worktrees/1' })
        expect(openInEditor).toHaveBeenNthCalledWith(2, { path: 'src/only.js:12', repositoryRoot: 'C:/worktrees/2' })
        expect(openInEditor).toHaveBeenNthCalledWith(3, { path: 'src/only.js:12', repositoryRoot: 'C:/repo' })
    })

    it('rejects invalid current worktree assignment without primary fallback', () => {
        const snapshot = { activeCards: [{ header: { internalId: 'card-1', worktree: 1 } }], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
        const worktrees = [{ error: 'folder missing', path: 'C:/worktrees/1', valid: false }]

        expect(() => resolveConversationRepositoryRoot('card-1', 'C:/repo', snapshot as never, worktrees as never))
            .toThrow('Assigned worktree 1 is invalid')
    })
})
