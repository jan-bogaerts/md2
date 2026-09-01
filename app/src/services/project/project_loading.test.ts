import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { DEFAULT_DIAGRAM_FOOTER, DEFAULT_STATES, defaultColumnAccent, type AgentConversation, type CommitRequest, type MarkdownFile, type ProjectWatchEvent, type StorageProjectFiles, type StorageService } from '../../data/data_types'
import type { RawActionDefinition } from '../../data/action_types'
import { actionService } from '../actions/action_service'
import { configService } from '../config/config_service'
import { cardCollectionFieldChangedEvent, cardFieldChangedEvent, type DataService } from '../data/data_service'
import { CARD_FIELDS } from '../data/card_events'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage, type DialogSeverity } from '../dialog_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { GLOBAL_PROGRESS_EVENT, globalProgressService, type GlobalProgress } from '../global_progress_service'
import { conversation, createDataService, createDeferred, createStorage, files, storageFiles, waitForWorkerTurn } from '../test_support/data_service_test_support'
import { markdownParsingService } from '../data/markdown_parsing_service'
import { RemoteControlStorageService } from '../data/remote_control_storage_service'
import { openFilesService } from '../open_files_service'
import { useCardColumnCards } from '../../components/card_view/use_card_column_cards'
import { useCardBody, useCardMetadata, useCardTitle } from '../../components/card_view/use_project_card'
import { mergeConflictService } from './merge_conflict_service'
import { createAgentTokenUsageSummary, serializeAgentTokenUsageSummary } from '../../../../shared/agent_token_usage_summary.mjs'
import type { ElectronDataBridge } from '../../data/electron_data_bridge'
import { LocalGitStorageService } from '../data/local_git_storage_service'
import { projectAgentTokenUsageService } from '../agents/project_agent_token_usage_service'

function loadedTextPaths(mock: unknown) {
    const calls = (mock as { mock: { calls: unknown[][] } }).mock.calls

    return calls.map((call) => call[1])
}

class ProjectLoadingMockWebSocket extends EventTarget {
    static instances: ProjectLoadingMockWebSocket[] = []

    readyState = 0
    sent: string[] = []

    constructor() {
        super()
        ProjectLoadingMockWebSocket.instances.push(this)
    }

    send(message: string) {
        this.sent.push(message)
    }

    open() {
        this.readyState = 1
        this.dispatchEvent(new Event('open'))
    }

    close() {
        this.readyState = 3
        this.dispatchEvent(new Event('close'))
    }

    receive(message: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }))
    }
}

async function flushPromises() {
    await Promise.resolve()
    await Promise.resolve()
}

function actionDefinition(id: string, overrides: Record<string, unknown> = {}): RawActionDefinition {
    return { command: 'run', description: id, id: `action-${id}`, label: id, type: 'command', ...overrides } as RawActionDefinition
}

function recordDialogMessages(severity: DialogSeverity) {
    const messages: string[] = []
    const handleDialogMessage = (event: Event) => {
        const message = (event as CustomEvent<DialogServiceMessage>).detail
        if (message.severity === severity) messages.push(message.message)
    }
    dialogService.addEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage)

    return {
        messages,
        stop: () => dialogService.removeEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage),
    }
}

function activityContent(
    origin: { cardInternalId: string; kind: 'card' } | { kind: 'project' },
    conversations: AgentConversation[],
) {
    return JSON.stringify({
        actionSettings: {},
        conversations: conversations.map((conversation) => Object.fromEntries(
            Object.entries(conversation).filter(([fieldName]) => fieldName !== 'path'),
        )),
        origin,
        records: [],
        version: 4,
    })
}

describe('ProjectLoading', () => {
    afterEach(() => {
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        vi.useRealTimers()
        delete window.md2Actions
        actionService.clear()
        configService.clear()
        globalProgressService.finish()
        vi.unstubAllGlobals()
    })

    it('reports project watcher startup failures', async () => {
        configService.init()
        let reportWatchError: (error: Error) => void = () => {
            throw new Error('Watcher error callback not registered')
        }
        const storage = createStorage({
            watchProject: vi.fn((_project, _onChange, _onRestored, onError) => {
                reportWatchError = onError

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const warnings = recordDialogMessages('warning')

        try {
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            reportWatchError(new Error('Native watcher unavailable'))

            expect(warnings.messages).toContain(
                'Project file watching could not be loaded and was skipped. Native watcher unavailable',
            )
        } finally {
            warnings.stop()
        }
    })

    it('creates a missing summary through the local bridge without reading the absent path', async () => {
        configService.init()
        const project = { branch: 'main', id: 'C:/repo', rootPath: 'C:/repo' }
        const commit = vi.fn(async () => [])
        const loadTextFile = vi.fn(async () => {
            throw new Error('ENOENT: agent_token_usage.json')
        })
        const bridge = {
            commit,
            hasPendingPush: vi.fn(async () => false),
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md']),
            loadActionFiles: vi.fn(async () => []),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: 'design', pushMode: 'manual', workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadTextFile,
            getMergeConflictSession: vi.fn(async () => null),
            onMergeConflictSessionChanged: vi.fn(() => vi.fn()),
            onWorktreesChanged: vi.fn(() => vi.fn()),
            watchProject: vi.fn(() => vi.fn()),
        } as unknown as ElectronDataBridge
        const storage = new LocalGitStorageService()
        storage.init({ bridge })
        const service = createDataService()
        const warnings = recordDialogMessages('warning')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject(project)

            expect(loadTextFile).not.toHaveBeenCalled()
            expect(commit).toHaveBeenCalledWith(expect.objectContaining({files: [expect.objectContaining({ path: 'design/agent_token_usage.json' })]}))
            expect(warnings.messages).toEqual([])
            expect(captureError).not.toHaveBeenCalled()
        } finally {
            warnings.stop()
            captureError.mockRestore()
        }
    })

    it('reports one handled warning when a watched summary becomes malformed', async () => {
        configService.init()
        let summaryContent = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary())
        let watchChange: (event: ProjectWatchEvent) => void = () => undefined
        const storage = createStorage({
            loadTextFile: vi.fn(async (_project, path) => ({ content: summaryContent, path })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        const warnings = recordDialogMessages('warning')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            const previousSummary = projectAgentTokenUsageService.getSnapshot()
            summaryContent = '{broken'

            watchChange({ changeKind: 'changed', path: 'agent_token_usage.json' })
            watchChange({ changeKind: 'changed', path: 'agent_token_usage.json' })

            await vi.waitFor(() => expect(warnings.messages).toHaveLength(1))
            expect(warnings.messages[0]).toContain('Agent token usage could not be loaded and was skipped.')
            expect(captureError).toHaveBeenCalledOnce()
            expect(projectAgentTokenUsageService.getSnapshot()).toBe(previousSummary)
        } finally {
            warnings.stop()
            captureError.mockRestore()
        }
    })

    it('reports a primary project-load failure once with the original error', async () => {
        configService.init()
        const error = new Error('Project root unavailable')
        const storage = createStorage({
            loadProjectRoot: vi.fn(async () => {
                throw error
            }),
        })
        const service = createDataService()
        const errors = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })

            await expect(service.projectLoading.openProject({ branch: 'main', id: 'project' })).rejects.toBe(error)

            expect(errors.messages).toEqual(['Project root unavailable'])
            expect(captureError).toHaveBeenCalledTimes(1)
            expect(captureError).toHaveBeenCalledWith(error)
        } finally {
            errors.stop()
            captureError.mockRestore()
        }
    })

    it('does not inspect or repair card activity during project load', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const validReference = `${activityPath}#conversation=agent-1`
        const rootFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${activityPath}\n---\n`,
            path: 'design/F-1-root.md',
        }
        const otherFile: MarkdownFile = {
            content: `---\nid: F-2\ninternalId: other-card\ntitle: Other\nstatus: active\nagents:\n  - ${activityPath}\n---\n`,
            path: 'design/F-2-other.md',
        }
        const repairedConversation = { ...conversation(validReference), actionId: 'implement' }
        const malformedActivity = JSON.stringify({
            ...JSON.parse(activityContent({ cardInternalId: 'root-card', kind: 'card' }, [repairedConversation])),
            actionSettings: { broken: { agent: 'codex' } },
        })
        const loadTextFile = vi.fn(async (_project, path) => path === 'agent_token_usage.json'
            ? { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }
            : { content: malformedActivity, path: activityPath })
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', rootFile.path, otherFile.path, activityPath]),
            loadProject: vi.fn(async () => ({ files: [rootFile, otherFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [rootFile, otherFile], workingFolder: 'design' })),
            loadTextFile,
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        expect(storage.commit).not.toHaveBeenCalled()
        expect(loadedTextPaths(loadTextFile)).toEqual(['agent_token_usage.json'])
        expect(storage.loadAgentConversation).not.toHaveBeenCalled()
        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual([activityPath])
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([])
        expect(service.getState().snapshot?.activeCards[1].header.agentLogReferences).toEqual([activityPath])
        expect(repairedConversation.actionId).toBe('implement')
    })

    it('migrates card conversation references in one batched save', async () => {
        configService.init()
        const activityPath = 'design/activity/card__shared.json'
        const firstFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: card-1\ntitle: First\nstatus: active\nagents:\n  - ${activityPath}#conversation=agent-1\n  - ${activityPath}#conversation=agent-2\n---\n`,
            path: 'design/F-1-first.md',
        }
        const secondFile: MarkdownFile = {
            content: `---\nid: F-2\ninternalId: card-2\ntitle: Second\nstatus: active\nagents:\n  - ${activityPath}#conversation=agent-3\n---\n`,
            path: 'design/F-2-second.md',
        }
        const commit = vi.fn(async (request: CommitRequest) => request.files.filter(() => false))
        const storage = createStorage({
            commit,
            loadProject: vi.fn(async () => ({ files: [firstFile, secondFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [firstFile, secondFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(commit).toHaveBeenCalledOnce()
        const migrationCommit = commit.mock.calls[0]?.[0]
        expect(migrationCommit?.files).toHaveLength(2)
        expect(migrationCommit?.files.every(({ content }) => !content.includes('#conversation='))).toBe(true)
        expect(service.getState().snapshot?.activeCards.map(({ header }) => header.agentLogReferences))
            .toEqual([[activityPath], [activityPath]])
    })

    it('keeps a failed reference migration pending for retry', async () => {
        configService.init()
        const activityPath = 'design/activity/card__card-1.json'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: card-1\ntitle: Card\nstatus: active\nagents:\n  - ${activityPath}#conversation=agent-1\n---\n`,
            path: 'design/F-1-card.md',
        }
        const failure = new Error('Migration commit failed')
        const storage = createStorage({
            commit: vi.fn(async () => {
                throw failure
            }),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await expect(service.projectLoading.openProject({ branch: 'main', id: 'project' })).rejects.toBe(failure)

        expect(service.getPersistenceSnapshot().hasPendingFileCommit).toBe(true)
    })

    it('reports conflicting activity paths without changing or saving the card', async () => {
        configService.init()
        const firstReference = 'design/activity/card__first.json#conversation=agent-1'
        const secondReference = 'design/activity/card__second.json#conversation=agent-2'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: card-1\ntitle: Card\nstatus: active\nagents:\n  - ${firstReference}\n  - ${secondReference}\n---\n`,
            path: 'design/F-1-card.md',
        }
        const warnings = recordDialogMessages('warning')
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        try {
            service.init({ storage })

            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(storage.commit).not.toHaveBeenCalled()
            expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences)
                .toEqual([firstReference, secondReference])
            expect(warnings.messages.some((message) => message.includes('multiple activity files'))).toBe(true)
        } finally {
            warnings.stop()
        }
    })

    it('does not inspect clean activity during project load', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const reference = `${activityPath}#conversation=agent-1`
        const rootFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${activityPath}\n---\n`,
            path: 'design/F-1-root.md',
        }
        const sourceConversation = conversation(reference)
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', rootFile.path, activityPath]),
            loadProject: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => path === 'agent_token_usage.json'
                ? { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }
                : {
                    content: activityContent({ cardInternalId: 'root-card', kind: 'card' }, [sourceConversation]),
                    path: activityPath,
                }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(loadedTextPaths(storage.loadTextFile)).toEqual(['agent_token_usage.json'])
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([])
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('loads project conversations only through the requested storage API', async () => {
        configService.init()
        const projectActivityPath = 'activity/project.json'
        const reference = `${projectActivityPath}#conversation=project-agent`
        const projectConversation = {
            ...conversation(reference),
            actionId: null,
            cardInternalId: null,
            cardPath: null,
            id: 'project-agent',
        }
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [
                'agent_token_usage.json',
                ...storageFiles.map(({ path }) => path),
                projectActivityPath,
            ]),
            listAgentConversationReferences: vi.fn(async () => [reference]),
            loadAgentConversation: vi.fn(async () => projectConversation),
            loadTextFile: vi.fn(async (_project, path) => path === 'agent_token_usage.json'
                ? { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }
                : {
                    content: activityContent({ kind: 'project' }, [projectConversation]),
                    path: projectActivityPath,
                }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        expect(loadedTextPaths(storage.loadTextFile)).toEqual(['agent_token_usage.json'])
        expect(storage.listAgentConversationReferences).not.toHaveBeenCalled()
        expect(storage.loadAgentConversation).not.toHaveBeenCalled()
        await expect(service.listAgentConversations({ kind: 'project' })).resolves.toEqual([projectConversation])

        expect(storage.listAgentConversationReferences).toHaveBeenCalledTimes(1)
        expect(storage.loadAgentConversation).toHaveBeenCalledTimes(1)
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('does not parse or repair malformed history when reopening a project', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        let storedCard: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${activityPath}\n---\n`,
            path: 'design/F-1-root.md',
        }
        let storedActivity: MarkdownFile = { content: '{broken', path: activityPath }
        const commit = vi.fn(async (request: CommitRequest) => {
            for (const file of request.files) {
                if (file.path === storedCard.path) storedCard = file
                if (file.path === activityPath) storedActivity = file
            }

            return []
        })
        const loadTextFile = vi.fn(async (_project, path) => path === 'agent_token_usage.json'
            ? { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }
            : storedActivity)
        const storage = createStorage({
            commit,
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', storedCard.path, activityPath]),
            loadProject: vi.fn(async () => ({ files: [storedCard], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [storedCard], workingFolder: 'design' })),
            loadTextFile,
        })
        const service = createDataService()
        service.init({ storage })
        const project = { branch: 'main', id: 'project' }

        await service.projectLoading.openProject(project)
        await service.projectLoading.openProject(project)
        expect(storedActivity.content).toBe('{broken')
        expect(loadedTextPaths(loadTextFile)).toEqual(['agent_token_usage.json', 'agent_token_usage.json'])
        expect(commit).not.toHaveBeenCalled()
    })

    it('leaves future-version and missing-file history references untouched during project load', async () => {
        configService.init()
        const futurePath = 'design/activity/card__root-card.json'
        const missingPath = 'design/activity/card__missing-card.json'
        const futureReference = `${futurePath}#conversation=future`
        const missingReference = `${missingPath}#conversation=missing`
        const rootFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${futureReference}\n  - ${missingReference}\n---\n`,
            path: 'design/F-1-root.md',
        }
        const loadTextFile = vi.fn(async (_project, path) => path === 'agent_token_usage.json'
            ? { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }
            : { content: JSON.stringify({ version: 5 }), path: futurePath })
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', rootFile.path, futurePath]),
            loadProject: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
            loadTextFile,
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        expect(storage.commit).not.toHaveBeenCalled()
        expect(loadedTextPaths(loadTextFile)).toEqual(['agent_token_usage.json'])
        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual([futureReference, missingReference])
    })

    it('does not schedule a repair batch for malformed history', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const validReference = `${activityPath}#conversation=agent-1`
        const rootFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${activityPath}\n---\n`,
            path: 'design/F-1-root.md',
        }
        const sourceConversation = { ...conversation(validReference), actionId: null }
        const malformedActivity = JSON.stringify({
            ...JSON.parse(activityContent({ cardInternalId: 'root-card', kind: 'card' }, [sourceConversation])),
            actionSettings: { broken: { agent: 'codex' } },
        })
        const repairError = new Error('Git commit failed')
        const commitShouldFail = true
        const commit = vi.fn(async (): Promise<MarkdownFile[]> => {
            if (commitShouldFail) throw repairError

            return []
        })
        const storage = createStorage({
            commit,
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', rootFile.path, activityPath]),
            loadProject: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => path === 'agent_token_usage.json'
                ? { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }
                : { content: malformedActivity, path: activityPath }),
        })
        const dialogs = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        const service = createDataService()

        try {
            service.init({ storage })

            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            expect(dialogs.messages).toEqual([])
            expect(loadedTextPaths(storage.loadTextFile)).toEqual(['agent_token_usage.json'])
            expect(commit).not.toHaveBeenCalled()
            expect(captureError).not.toHaveBeenCalled()
            expect(service.getPersistenceSnapshot().hasPendingFileCommit).toBe(false)
            expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual([activityPath])
            expect(sourceConversation.actionId).toBeNull()
            expect(repairError.message).toBe('Git commit failed')
            expect(commitShouldFail).toBe(true)
        } finally {
            dialogs.stop()
            captureError.mockRestore()
        }
    })

    it('blocks project navigation while an invalid action draft remains unsaved', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'first' })
        actionService.loadFromFiles([{
            content: JSON.stringify(actionDefinition('run')),
            path: 'actions/run.json',
        }])
        actionService.draftStore.updateDraft('action-run', { ...actionDefinition('run'), label: '' })

        await expect(service.projectLoading.openProject({ branch: 'main', id: 'second' }))
            .rejects.toThrow(/invalid unsaved changes/u)

        expect(service.getState().project?.id).toBe('first')
        expect(actionService.draftStore.getDraft('action-run').definition.label).toBe('')
    })

    it('blocks project switching until a deleted dirty action is recovered or discarded', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'first' })
        actionService.loadFromFiles([{
            content: JSON.stringify(actionDefinition('run')),
            path: 'actions/run.json',
        }])
        actionService.draftStore.updateDraft('action-run', { ...actionDefinition('run'), label: '' })
        actionService.reloadFromFiles([], [{ origin: 'external', path: 'actions/run.json' }])

        await expect(service.projectLoading.openProject({ branch: 'main', id: 'second' }))
            .rejects.toThrow(/requires explicit recovery or discard/u)
        expect(service.getState().project?.id).toBe('first')

        actionService.draftStore.discardDeletedDraft('action-run')
        await service.projectLoading.openProject({ branch: 'main', id: 'second' })
        expect(service.getState().project?.id).toBe('second')
    })

    it('derives project states from active cards when config does not define them', async () => {
        configService.init()
        const rootFiles = [
            { ...files[0], content: files[0].content.replace('status: active', 'status: design') },
            { content: '---\nid: F-2\ninternalId: ready-card\ntitle: Ready\nstatus: ready for implementation\n---\n', path: 'design/F-2-ready.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.states).toEqual([
            { alwaysVisible: true, color: defaultColumnAccent(1), state: 'design' },
            { alwaysVisible: true, color: defaultColumnAccent(2), state: 'ready for implementation' },
            { alwaysVisible: true, color: defaultColumnAccent(0), state: 'new' },
            { alwaysVisible: true, color: defaultColumnAccent(3), state: 'to fix' },
            { alwaysVisible: true, color: defaultColumnAccent(4), state: 'ready' },
        ])
    })

    it('uses default states when config and active cards have no states', async () => {
        configService.init()
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.states).toEqual(DEFAULT_STATES)
    })

    it('assigns and saves a visible shade when opening a project without config', async () => {
        configService.init()
        const storage = createStorage({ loadProjectConfig: vi.fn(async () => null) })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.backgroundShade).toMatch(/^(amber|blue|green|purple|red)$/u)
        expect(storage.saveProjectConfig).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            expect.objectContaining({
                backgroundShade: expect.stringMatching(/^(amber|blue|green|purple|red)$/u),
                diagramFooter: DEFAULT_DIAGRAM_FOOTER,
                diagramsFolder: 'diagrams',
            }),
        )
    })

    it('renames card files one at a time while publishing global progress', async () => {
        configService.init()
        const pendingFile = { content: '# Notes', path: 'design/notes.txt' }
        const updatedPendingFile = { ...pendingFile, content: '# Notes\n\nSaved during migration' }
        let persistedFiles = [...storageFiles, pendingFile]
        const commit = vi.fn<StorageService['commit']>(async (request) => {
            const committedFilesByPath = new Map(request.files.map((file) => [file.path, file]))
            persistedFiles = persistedFiles.map((file) => committedFilesByPath.get(file.path) ?? file)

            return request.files
        })
        const loadProject = vi.fn(async () => ({ files: persistedFiles, workingFolder: 'design' }))
        const storage = createStorage({
            commit,
            loadProject,
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, cardSeparator: '-' as const, projectFolder: '', pushMode: 'auto' as const, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: persistedFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        commit.mockClear()
        loadProject.mockClear()
        vi.mocked(storage.moveFiles).mockImplementation(async (request) => {
            for (const move of request.moves) {
                persistedFiles = [
                    ...persistedFiles.filter(({ path }) => path !== move.fromPath && path !== move.toPath),
                    { content: move.content, path: move.toPath },
                ]
            }
            if (vi.mocked(storage.moveFiles).mock.calls.length === 1) service.cards.saveFile(updatedPendingFile)
        })
        const progressStates: Array<GlobalProgress | null> = []
        const handleProgress = (event: Event) => {
            progressStates.push((event as CustomEvent<GlobalProgress | null>).detail)
        }
        globalProgressService.addEventListener(GLOBAL_PROGRESS_EVENT, handleProgress)

        const renamedCount = await service.projectLoading.updateCardSeparator('-', '_')

        globalProgressService.removeEventListener(GLOBAL_PROGRESS_EVENT, handleProgress)
        expect(renamedCount).toBe(2)
        expect(storage.moveFiles).toHaveBeenCalledTimes(2)
        expect(storage.moveFiles).toHaveBeenNthCalledWith(1, expect.objectContaining({
            moves: [expect.objectContaining({
                content: expect.stringContaining('id: F_1'),
                fromPath: 'design/F-1-root.md',
                toPath: 'design/F_1_root.md',
            })],
        }))
        expect(storage.moveFiles).toHaveBeenNthCalledWith(2, expect.objectContaining({
            moves: [expect.objectContaining({
                fromPath: 'design/history/F-3-old.md',
                toPath: 'design/history/F_3_old.md',
            })],
        }))
        expect(progressStates).toContainEqual(expect.objectContaining({ completed: 1, total: 2 }))
        expect(progressStates.at(-1)).toBeNull()
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        expect(commit).toHaveBeenCalledWith(expect.objectContaining({files: [updatedPendingFile]}))
        expect(persistedFiles.find(({ path }) => path === pendingFile.path)?.content).toBe(updatedPendingFile.content)
        expect(commit.mock.invocationCallOrder[0]).toBeLessThan(loadProject.mock.invocationCallOrder.at(-1) ?? 0)
    })

    it('keeps configured project states instead of deriving card states', async () => {
        configService.init()
        const configuredStates = [{ alwaysVisible: true, state: 'configured' }]
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', states: configuredStates, workingFolder: 'design' }))})
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.states).toEqual([
            { ...configuredStates[0], color: defaultColumnAccent(0) },
        ])
    })
    it('loads action files from the configured actions folder into the action service on open', async () => {
        configService.init()
        const actionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const storage = createStorage({ loadActionFiles: vi.fn(async () => [actionFile]) })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(storage.loadActionFiles).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'actions')
        expect(actionService.getActions().map((action) => action.id)).toContain('action-do')
    })

    it('opens project with usable actions and reports collected action problems', async () => {
        configService.init()
        const warnings = recordDialogMessages('warning')
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [
                { content: JSON.stringify({ ...actionDefinition('do'), name: 'Old name' }), path: 'actions/do.json' },
                { content: '{ invalid', path: 'actions/bad.json' },
                { content: JSON.stringify({ command: 'npm test' }), path: 'actions/defaulted.json' },
            ]),
        })
        const service = createDataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot).not.toBeNull()
        expect(actionService.getActions().map(({ id }) => id)).toEqual(expect.arrayContaining(['action-do', 'action-actions-defaulted']))
        expect(warnings.messages.join('\n')).toContain('actions/bad.json')
        expect(warnings.messages.join('\n')).toContain('Missing id')
        warnings.stop()
    })

    it('uses defaults and keeps opening when project configuration and actions cannot be loaded', async () => {
        configService.init()
        const warnings = recordDialogMessages('warning')
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => {
                throw new Error('actions unavailable')
            }),
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'invalid' as never })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = createDataService()

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards).toEqual([])
            expect(snapshot.backgroundCards.map(({ path }) => path)).toEqual(['design/F-1-root.md'])
            expect(actionService.getActions().map(({ id }) => id)).toEqual([
                'md2.custom-prompt',
                'md2.convert-remarkable-images-to-text',
            ])
            expect(warnings.messages.join('\n')).toContain('Project configuration could not be loaded')
            expect(warnings.messages.join('\n')).toContain('Actions could not be loaded')
        } finally {
            warnings.stop()
        }
    })

    it('skips a card that fails to parse while keeping other cards available', async () => {
        configService.init()
        const warnings = recordDialogMessages('warning')
        const invalidFile = { content: '# Invalid', path: 'design/F-2-invalid.md' }
        const originalParseCard = markdownParsingService.parseCard
        const parseCard = vi.spyOn(markdownParsingService, 'parseCard').mockImplementation((file, workingFolder) => {
            if (file.path === invalidFile.path) throw new Error('invalid test card')

            return originalParseCard(file, workingFolder)
        })
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [files[0], invalidFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], invalidFile], workingFolder: 'design' })),
        })
        const service = createDataService()

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards.map(({ path }) => path)).toEqual(['design/F-1-root.md'])
            expect(warnings.messages).toContain(`Some project files could not be loaded and were skipped: ${invalidFile.path}`)
        } finally {
            parseCard.mockRestore()
            warnings.stop()
        }
    })

    it('loads project files and actions from folders inside the configured project folder', async () => {
        configService.init()
        const projectFile = { ...files[0], path: 'projects/demo/design/F-1-root.md' }
        const projectNote = { content: '# Project note', path: 'projects/demo/notes/project-note.md' }
        const actionFile = {
            content: JSON.stringify(actionDefinition('do')),
            path: 'projects/demo/actions/do.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: [projectFile, projectNote], workingFolder: 'projects/demo' })),
            loadProjectConfig: vi.fn(async () => ({ actionsFolder: 'actions', backgroundShade: 'blue' as const, projectFolder: 'projects/demo', workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [projectFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(storage.loadActionFiles).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'projects/demo/actions')
        expect(storage.loadProjectRoot).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'projects/demo/design')
        expect(storage.loadProject).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            'projects/demo',
            'projects/demo/design',
        )
        expect(service.getState().snapshot?.workingFolder).toBe('projects/demo/design')
        expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(['projects/demo/design/F-1-root.md'])
        await vi.waitFor(() => {
            expect(service.getState().snapshot?.backgroundCards.map((card) => card.path)).toEqual(['projects/demo/notes/project-note.md'])
        })
        expect(service.getConfig()?.actionsFolder).toBe('projects/demo/actions')
        expect(storage.listAgentConversationReferences).not.toHaveBeenCalled()
    })

    it('dispatches the root snapshot before loading background subfolder and history cards', async () => {
        configService.init()
        const rootFiles = [files[0]]
        const backgroundFile = files[1]
        const archivedFile = {
            content: files[1].content.replace('old-card', 'archived-card'),
            path: 'design/archived/F-4-archived.md',
        }
        const otherFile = {
            content: files[1].content.replace('old-card', 'note-card'),
            path: 'design/notes/F-5-note.md',
        }
        const backgroundFiles = [backgroundFile, archivedFile, otherFile]
        const fullProject = createDeferred<StorageProjectFiles>()
        const snapshots: Array<ReturnType<DataService['getState']>['snapshot']> = []
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [rootFiles[0].path, ...backgroundFiles.map((file) => file.path)]),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        service.addEventListener('changed', () => {
            snapshots.push(service.getState().snapshot)
        })

        const openedSnapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(openedSnapshot.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])
        expect(openedSnapshot.backgroundCards).toHaveLength(0)
        expect(snapshots.filter((snapshot) => snapshot !== null)[0]?.backgroundCards).toHaveLength(0)
        expect(storage.loadProjectRoot).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design')
        expect(storage.loadProjectRoot).toHaveBeenCalledOnce()
        expect(storage.loadProject).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, '', 'design')
        expect(storage.loadProject).toHaveBeenCalledOnce()

        fullProject.resolve({ files: backgroundFiles, workingFolder: '' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.backgroundCards.map((card) => card.path)).toEqual(backgroundFiles.map((file) => file.path))
        })
        expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(rootFiles.map((file) => file.path))
        const rootPaths = new Set(rootFiles.map((file) => file.path))
        expect(backgroundFiles.some((file) => rootPaths.has(file.path))).toBe(false)
    })

    it('merges a stale background load without replacing newer owned card state', async () => {
        configService.init()
        configService.set('react.autoCommitDelayMs', 30000)
        const rootFile = files[0]
        const backgroundFile = files[1]
        const fullProject = createDeferred<StorageProjectFiles>()
        const commit = vi.fn<StorageService['commit']>(async (request) => request.files)
        const storage = createStorage({
            commit,
            listRepositoryFiles: vi.fn(async () => [rootFile.path, backgroundFile.path]),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: [rootFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const ownedCard = service.getState().snapshot?.activeCards[0]
        if (!ownedCard) throw new Error('Expected loaded card')
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'

        await service.cards.moveCard(ownedCard.path, 'ready', 0)
        service.cards.addAgentLogReference(ownedCard.path, reference)
        fullProject.resolve({ files: [rootFile, backgroundFile], workingFolder: 'design' })

        await vi.waitFor(() => expect(service.getState().snapshot?.backgroundCards).toHaveLength(1))
        const mergedCard = service.getState().snapshot?.activeCards[0]
        expect(mergedCard).toBe(ownedCard)
        expect(mergedCard?.header.status).toBe('ready')
        expect(mergedCard?.header.agentLogReferences).toEqual(['design/activity/card__root-card.json'])

        await service.cards.flushPendingCommits()
        const persisted = commit.mock.calls.at(-1)?.[0].files.find(({ path }) => path === ownedCard.path)
        expect(persisted?.content).toContain('status: ready')
        expect(persisted?.content).toContain('  - design/activity/card__root-card.json')
        expect(persisted?.content).not.toContain('#conversation=')
    })

    it('reports background project load failures while keeping the root snapshot available', async () => {
        configService.init()
        const error = new Error('network down')
        const errors = recordDialogMessages('error')
        const storage = createStorage({
            loadProject: vi.fn(async () => {
                throw error
            }),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = createDataService()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])

            await vi.waitFor(() => {
                expect(errors.messages).toContain('Background project data failed to load - search and history may be incomplete. network down')
            })

            expect(captureError).toHaveBeenCalledWith(error)
            expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])
        } finally {
            errors.stop()
            captureError.mockRestore()
        }
    })

    it('does not report failures from a superseded background project load', async () => {
        configService.init()
        const firstFullProject = createDeferred<StorageProjectFiles>()
        const errors = recordDialogMessages('error')
        const loadProject = vi.fn<StorageService['loadProject']>(async () => firstFullProject.promise)
        loadProject.mockImplementationOnce(async () => firstFullProject.promise)
        loadProject.mockImplementationOnce(async () => ({ files: [files[0]], workingFolder: 'design' }))
        const storage = createStorage({
            loadProject,
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = createDataService()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            await service.projectLoading.openProject({ branch: 'main', id: 'other' })

            firstFullProject.reject(new Error('old load failed'))
            await waitForWorkerTurn()

            expect(errors.messages).toHaveLength(0)
            expect(captureError).not.toHaveBeenCalled()
        } finally {
            errors.stop()
            captureError.mockRestore()
        }
    })

    it('imports external root markdown files after the full project load', async () => {
        configService.init()
        const externalFile = { content: '# Notes\n\nBody', path: 'design/notes.md', sha: 'sha-notes' }
        const rootFiles = [files[0], externalFile]
        const fullFiles = [files[0], files[1], externalFile]
        const notices = recordDialogMessages('success')
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: fullFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = createDataService()

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            await vi.waitFor(() => {
                expect(storage.moveFiles).toHaveBeenCalledWith({
                    branch: 'main',
                    message: 'Import 1 external file',
                    moves: [expect.objectContaining({
                        fromPath: 'design/notes.md',
                        sha: 'sha-notes',
                        toPath: 'design/F-4-notes.md',
                    })],
                })
            })

            const importedCard = service.getState().snapshot?.activeCards.find((card) => card.path === 'design/F-4-notes.md')
            expect(importedCard?.header).toMatchObject({ id: 'F-4', status: 'active', title: 'Notes' })
            expect(importedCard?.header.internalId).toBeTruthy()
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/notes.md')).toBe(false)
            expect(notices.messages).toContain('Imported 1 external file as new cards.')
            expect(trackEvent).toHaveBeenCalledWith('external_file_import')
        } finally {
            notices.stop()
            trackEvent.mockRestore()
        }
    })

    it('does not repeat imports for complete conforming cards', async () => {
        configService.init()
        const completeFile = {
            content: '---\nid: F-4\ninternalId: uuid-4\ntitle: Imported\nstatus: new\n---\n\n# Imported',
            path: 'design/F-4-imported.md',
        }
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [...storageFiles, completeFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], completeFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await waitForWorkerTurn()

        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('reports import failures and keeps source files loaded unchanged', async () => {
        configService.init()
        const externalFile = { content: '# Notes\n\nBody', path: 'design/notes.md', sha: 'sha-notes' }
        const errors = recordDialogMessages('error')
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [...storageFiles, externalFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], externalFile], workingFolder: 'design' })),
            moveFiles: vi.fn(async () => {
                throw new Error('commit failed')
            }),
        })
        const service = createDataService()

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            await vi.waitFor(() => {
                expect(errors.messages).toContain('commit failed')
            })

            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/notes.md')).toBe(true)
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-4-notes.md')).toBe(false)
            expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        } finally {
            errors.stop()
        }
    })

    it('reloads actions when the local actions folder watcher reports json changes', async () => {
        vi.useFakeTimers()
        configService.init()
        const actionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([actionFile])
            .mockResolvedValueOnce([])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).toContain('action-do')

        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).not.toContain('action-do')
    })

    it('does not reload project files when an activity checkpoint changes', async () => {
        vi.useFakeTimers()
        configService.init()
        const loadActionFiles = vi.fn(async () => [])
        const loadFile = vi.fn()
        let watchChange: (event: { changeKind: 'changed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        loadActionFiles.mockClear()
        loadFile.mockClear()

        watchChange({ changeKind: 'changed', path: 'design/activity/card__card-1.json' })
        await vi.advanceTimersByTimeAsync(1000)

        expect(loadActionFiles).not.toHaveBeenCalled()
        expect(loadFile).not.toHaveBeenCalled()
    })

    it('marks an action watcher event during its commit as a local publication echo', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 1000)
        const initialFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const commit = createDeferred<StorageProjectFiles['files']>()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            commit: vi.fn(() => commit.promise),
            loadActionFiles: vi.fn(async () => [initialFile]),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        actionService.draftStore.updateDraft('action-do', { ...actionDefinition('do'), label: 'Local edit' })
        await vi.advanceTimersByTimeAsync(1000)
        expect(storage.commit).toHaveBeenCalledOnce()

        watchChange({ changeKind: 'changed', path: initialFile.path })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getDefinitionByPath(initialFile.path)?.label).toBe('Local edit')
        expect(actionService.draftStore.getDraft('action-do').conflict).toBeNull()
        commit.resolve([])
        await vi.advanceTimersByTimeAsync(0)
    })

    it('ignores a markdown watcher event received during its local commit', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 1000)
        const commit = createDeferred<StorageProjectFiles['files']>()
        const loadFile = vi.fn(async () => files[0])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            commit: vi.fn(() => commit.promise),
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const conflicts = recordDialogMessages('error')
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        try {
            service.cards.updateCardBody(files[0].path, '# Root\n\nLocal edit')
            await vi.advanceTimersByTimeAsync(1000)
            expect(storage.commit).toHaveBeenCalledOnce()

            watchChange({ changeKind: 'changed', path: files[0].path })
            await vi.advanceTimersByTimeAsync(150)

            expect(loadFile).not.toHaveBeenCalled()
            expect(conflicts.messages).toEqual([])
        } finally {
            commit.resolve([])
            await vi.advanceTimersByTimeAsync(0)
            conflicts.stop()
        }
    })

    it('surfaces action reload validation errors while loading other usable actions', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const invalidActionFile = { content: JSON.stringify(actionDefinition('bad', { type: 'bad' })), path: 'actions/bad.json' }
        const replacementActionFile = { content: JSON.stringify(actionDefinition('replacement')), path: 'actions/replacement.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([validActionFile])
            .mockResolvedValueOnce([invalidActionFile, replacementActionFile])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/bad.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).toContain('action-replacement')
        expect(actionService.getActions().map((action) => action.id)).not.toContain('action-do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })

    it('loads usable actions from a batch and reports only invalid files', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const invalidFirstActionFile = { content: JSON.stringify(actionDefinition('bad', { type: 'bad' })), path: 'actions/bad.json' }
        const changedSecondActionFile = { content: JSON.stringify(actionDefinition('more')), path: 'actions/more.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([validActionFile])
            .mockResolvedValueOnce([invalidFirstActionFile, changedSecondActionFile])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/bad.json' })
        watchChange({ changeKind: 'changed', path: 'actions/more.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).toContain('action-more')
        expect(actionService.getActions().map((action) => action.id)).not.toContain('action-do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).not.toContain('actions/more.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })

    it('imports a new external markdown file when the watcher reports it', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({ content: '# New external note', path: 'design/free-note.md' })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'added', path: 'design/free-note.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Import 1 external file',
            moves: [expect.objectContaining({
                fromPath: 'design/free-note.md',
                toPath: 'design/F-4-new-external-note.md',
            })],
        })
        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-4-new-external-note.md')
        expect(card?.header.status).toBe('active')
        expect(card?.header.internalId).toBeTruthy()
    })

    it('imports an external markdown file once when watcher reloads overlap', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const externalFile = { content: '# New external note', path: 'design/free-note.md' }
        const firstLoad = createDeferred<typeof externalFile>()
        const move = createDeferred<void>()
        const loadFile = vi.fn()
            .mockImplementationOnce(async () => firstLoad.promise)
            .mockImplementationOnce(async () => externalFile)
        const storage = createStorage({
            loadFile,
            moveFiles: vi.fn(async () => move.promise),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'added', path: externalFile.path })
        await vi.advanceTimersByTimeAsync(50)
        watchChange({ changeKind: 'changed', path: externalFile.path })
        await vi.advanceTimersByTimeAsync(50)
        firstLoad.resolve(externalFile)
        await vi.advanceTimersByTimeAsync(0)

        expect(storage.moveFiles).toHaveBeenCalledTimes(1)
        move.resolve()
        await vi.advanceTimersByTimeAsync(0)

        expect(storage.moveFiles).toHaveBeenCalledTimes(1)
    })

    it('updates markdown content when the watcher reports an external edit', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternally changed',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('Externally changed')
    })

    it('reloads content restored externally to an earlier app value', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'changed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const externalFile = {
            content: files[0].content.replace('# Root', '# External'),
            path: files[0].path,
        }
        const loadFile = vi.fn()
            .mockResolvedValueOnce(externalFile)
            .mockResolvedValueOnce(files[0])
        const storage = createStorage({
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: files[0].path })
        await vi.advanceTimersByTimeAsync(150)
        expect(service.getState().snapshot?.activeCards[0].content).toContain('# External')

        watchChange({ changeKind: 'changed', path: files[0].path })
        await vi.advanceTimersByTimeAsync(150)
        expect(service.getState().snapshot?.activeCards[0].content).toContain('# Root')
    })

    it('verifies conflict state instead of parsing watcher updates for active conflict paths', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'changed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadFile = vi.fn()
        const storage = createStorage({
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const isConflictedPath = vi.spyOn(mergeConflictService, 'isConflictedPath').mockReturnValue(true)
        const verifyCurrentSession = vi.spyOn(mergeConflictService, 'verifyCurrentSession').mockResolvedValue(undefined)

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(loadFile).not.toHaveBeenCalled()
        expect(verifyCurrentSession).toHaveBeenCalledOnce()
        isConflictedPath.mockRestore()
        verifyCurrentSession.mockRestore()
    })

    it('keeps a committed worktree assignment when another markdown file reloads', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const changedBackgroundFile = {
            content: '---\ninternalId: old-card\n---\n\n# Externally changed',
            path: 'design/history/F-3-old.md',
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => changedBackgroundFile),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        service.cards.updateCardWorktree('design/F-1-root.md', 1)
        await service.cards.flushPendingCommits()
        watchChange({ changeKind: 'changed', path: changedBackgroundFile.path })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.header.worktree).toBe(1)
    })

    it('refreshes mobile project state for remotely watched markdown additions, changes, and removals', async () => {
        vi.useFakeTimers()
        ProjectLoadingMockWebSocket.instances = []
        vi.stubGlobal('WebSocket', ProjectLoadingMockWebSocket)
        configService.init()
        const remoteStorage = new RemoteControlStorageService()
        remoteStorage.init({ endpoint: 'ws://127.0.0.1:1234' })
        const storage = createStorage({
            loadFile: remoteStorage.loadFile.bind(remoteStorage),
            watchProject: remoteStorage.watchProject.bind(remoteStorage),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const socket = ProjectLoadingMockWebSocket.instances[0]
        if (!socket) throw new Error('Remote-control socket was not created')

        socket.open()
        await flushPromises()
        const watchRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        expect(watchRequest.method).toBe('watchProject')
        socket.receive({ id: watchRequest.id, result: { subscriptionId: 'watch-1' } })
        socket.receive({
            event: 'watchProject',
            payload: {
                event: { changeKind: 'changed', path: 'design/F-1-root.md' },
                requestId: watchRequest.id,
                subscriptionId: 'watch-1',
            },
        })
        await vi.advanceTimersByTimeAsync(50)
        const loadRequest = JSON.parse(socket.sent[1]) as { id: string, method: string, params: unknown[] }
        expect(loadRequest).toMatchObject({
            method: 'loadFile',
            params: [{ branch: 'main', id: 'project' }, 'design/F-1-root.md'],
        })
        socket.receive({
            id: loadRequest.id,
            result: {
                content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\n---\n\n# Root\n\nRemote agent change',
                path: 'design/F-1-root.md',
            },
        })
        await vi.advanceTimersByTimeAsync(0)

        const card = service.getState().snapshot?.activeCards.find(({ path }) => path === 'design/F-1-root.md')
        expect(card?.content).toContain('Remote agent change')

        socket.receive({
            event: 'watchProject',
            payload: {
                event: { changeKind: 'added', path: 'design/F-2-mobile.md' },
                requestId: watchRequest.id,
                subscriptionId: 'watch-1',
            },
        })
        await vi.advanceTimersByTimeAsync(50)
        const addedLoadRequest = JSON.parse(socket.sent[2]) as { id: string, method: string, params: unknown[] }
        expect(addedLoadRequest).toMatchObject({
            method: 'loadFile',
            params: [{ branch: 'main', id: 'project' }, 'design/F-2-mobile.md'],
        })
        socket.receive({
            id: addedLoadRequest.id,
            result: {
                content: '---\nid: F-2\ninternalId: mobile-card\ntitle: Mobile\nstatus: active\n---\n\n# Mobile',
                path: 'design/F-2-mobile.md',
            },
        })
        await vi.advanceTimersByTimeAsync(0)
        expect(service.getState().snapshot?.activeCards.some(({ path }) => path === 'design/F-2-mobile.md')).toBe(true)

        socket.receive({
            event: 'watchProject',
            payload: {
                event: { changeKind: 'removed', path: 'design/F-1-root.md' },
                requestId: watchRequest.id,
                subscriptionId: 'watch-1',
            },
        })
        await vi.advanceTimersByTimeAsync(800)

        expect(service.getState().snapshot?.activeCards.some(({ path }) => path === 'design/F-1-root.md')).toBe(false)
    })

    it('publishes granular card and collection events for a remotely watched status change', async () => {
        vi.useFakeTimers()
        ProjectLoadingMockWebSocket.instances = []
        vi.stubGlobal('WebSocket', ProjectLoadingMockWebSocket)
        configService.init()
        const remoteStorage = new RemoteControlStorageService()
        remoteStorage.init({ endpoint: 'ws://127.0.0.1:1234' })
        const storage = createStorage({
            loadFile: remoteStorage.loadFile.bind(remoteStorage),
            watchProject: remoteStorage.watchProject.bind(remoteStorage),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const socket = ProjectLoadingMockWebSocket.instances[0]
        if (!socket) throw new Error('Remote-control socket was not created')
        const cardPath = 'design/F-1-root.md'
        const publishedEvents: string[] = []
        const recordEvent = (event: Event) => publishedEvents.push(event.type)
        const board = renderHook(() => ({
            activePaths: useCardColumnCards('active', service),
            body: useCardBody(cardPath, service),
            metadata: useCardMetadata(cardPath, service),
            readyPaths: useCardColumnCards('ready', service),
        }))
        const titleRendered = vi.fn()
        const title = renderHook(() => {
            titleRendered(useCardTitle(cardPath, service))

            return null
        })
        const initialTitleRenderCount = titleRendered.mock.calls.length
        for (const field of CARD_FIELDS) {
            service.addEventListener(cardFieldChangedEvent(cardPath, field), recordEvent)
            service.addEventListener(cardCollectionFieldChangedEvent(field), recordEvent)
        }

        socket.open()
        await flushPromises()
        const watchRequest = JSON.parse(socket.sent[0]) as { id: string, method: string }
        socket.receive({ id: watchRequest.id, result: { subscriptionId: 'watch-1' } })
        await vi.advanceTimersByTimeAsync(0)
        publishedEvents.length = 0
        socket.receive({
            event: 'watchProject',
            payload: {
                event: { changeKind: 'changed', path: cardPath },
                requestId: watchRequest.id,
                subscriptionId: 'watch-1',
            },
        })
        await vi.advanceTimersByTimeAsync(50)
        const loadRequest = JSON.parse(socket.sent[1]) as { id: string }
        socket.receive({
            id: loadRequest.id,
            result: { ...files[0], content: files[0].content.replace('status: active', 'status: ready') },
        })
        await vi.advanceTimersByTimeAsync(0)

        const card = service.getState().snapshot?.activeCards.find(({ path }) => path === cardPath)
        expect(card?.header.status).toBe('ready')
        expect(board.result.current.activePaths).toEqual([])
        expect(board.result.current.readyPaths).toEqual([cardPath])
        expect(board.result.current.metadata?.header.status).toBe('ready')
        expect(board.result.current.body).toContain('# Root')
        expect(titleRendered).toHaveBeenCalledTimes(initialTitleRenderCount)
        expect(publishedEvents).toEqual([
            cardFieldChangedEvent(cardPath, 'ordering'),
            cardCollectionFieldChangedEvent('ordering'),
            cardFieldChangedEvent(cardPath, 'status'),
            cardCollectionFieldChangedEvent('status'),
        ])
        board.unmount()
        title.unmount()
    })

    it('restores remote project watching and resynchronizes a status change made while disconnected', async () => {
        vi.useFakeTimers()
        ProjectLoadingMockWebSocket.instances = []
        vi.stubGlobal('WebSocket', ProjectLoadingMockWebSocket)
        configService.init()
        const remoteStorage = new RemoteControlStorageService()
        remoteStorage.init({ endpoint: 'ws://127.0.0.1:1234' })
        let currentFiles = storageFiles
        const loadProject = vi.fn(async () => ({ files: currentFiles, workingFolder: 'design' }))
        const loadFile = vi.fn(async (_project, path: string) => {
            const file = currentFiles.find((candidate) => candidate.path === path)
            if (!file) throw new Error(`Missing test file: ${path}`)

            return file
        })
        const storage = createStorage({
            loadFile,
            loadProject,
            watchProject: remoteStorage.watchProject.bind(remoteStorage),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const firstSocket = ProjectLoadingMockWebSocket.instances[0]
        if (!firstSocket) throw new Error('Remote-control socket was not created')
        const cardPath = 'design/F-1-root.md'
        const board = renderHook(() => ({
            activePaths: useCardColumnCards('active', service),
            body: useCardBody(cardPath, service),
            metadata: useCardMetadata(cardPath, service),
            readyPaths: useCardColumnCards('ready', service),
        }))
        const publishedEvents: string[] = []
        const recordEvent = (event: Event) => publishedEvents.push(event.type)
        for (const field of CARD_FIELDS) {
            service.addEventListener(cardFieldChangedEvent(cardPath, field), recordEvent)
            service.addEventListener(cardCollectionFieldChangedEvent(field), recordEvent)
        }

        firstSocket.open()
        await flushPromises()
        const firstWatchRequest = JSON.parse(firstSocket.sent[0]) as { id: string, method: string }
        expect(firstWatchRequest.method).toBe('watchProject')
        firstSocket.receive({ id: firstWatchRequest.id, result: { subscriptionId: 'watch-1' } })
        await vi.advanceTimersByTimeAsync(0)
        publishedEvents.length = 0
        firstSocket.close()
        currentFiles = storageFiles.map((file) => file.path === cardPath
            ? { ...file, content: file.content.replace('status: active', 'status: ready').replace('# Root', '# Updated remotely') }
            : file)

        const reconnection = remoteStorage.connect()
        const secondSocket = ProjectLoadingMockWebSocket.instances[1]
        if (!secondSocket) throw new Error('Replacement remote-control socket was not created')
        secondSocket.open()
        await reconnection
        await flushPromises()
        expect(secondSocket.sent).toHaveLength(1)
        const restoredWatchRequest = JSON.parse(secondSocket.sent[0]) as { id: string, method: string }
        expect(restoredWatchRequest.method).toBe('watchProject')
        secondSocket.receive({ id: restoredWatchRequest.id, result: { subscriptionId: 'watch-2' } })
        await act(async () => {
            await vi.advanceTimersByTimeAsync(50)
        })

        expect(loadProject).toHaveBeenCalledTimes(2)
        expect(loadFile).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, cardPath)
        expect(board.result.current.activePaths).toEqual([])
        expect(board.result.current.readyPaths).toEqual([cardPath])
        expect(board.result.current.metadata?.header.status).toBe('ready')
        expect(board.result.current.body).toContain('# Updated remotely')
        expect(publishedEvents).toEqual([
            cardFieldChangedEvent(cardPath, 'body'),
            cardCollectionFieldChangedEvent('body'),
            cardFieldChangedEvent(cardPath, 'ordering'),
            cardCollectionFieldChangedEvent('ordering'),
            cardFieldChangedEvent(cardPath, 'status'),
            cardCollectionFieldChangedEvent('status'),
        ])
        board.unmount()
    })

    it('removes a markdown card when the watcher reports deletion', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'removed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(749)
        expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-1-root.md')).toBe(true)
        await vi.advanceTimersByTimeAsync(51)

        expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-1-root.md')).toBe(false)
        expect(storage.loadFile).not.toHaveBeenCalled()
    })

    it('keeps a markdown card when a removal is followed by recreation during the grace period', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const recreatedFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\n---\n\n# Root\n\nRecreated',
            path: 'design/F-1-root.md',
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => recreatedFile),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'removed', path: recreatedFile.path })
        await vi.advanceTimersByTimeAsync(500)
        watchChange({ changeKind: 'changed', path: recreatedFile.path })
        await vi.advanceTimersByTimeAsync(300)

        const card = service.getState().snapshot?.activeCards.find(({ path }) => path === recreatedFile.path)
        expect(card?.content).toContain('Recreated')
    })

    it('debounces repeated markdown watcher events for the same file', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadFile = vi.fn(async () => ({
            content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nLatest',
            path: 'design/F-1-root.md',
        }))
        const storage = createStorage({
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(49)
        expect(loadFile).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)

        expect(loadFile).toHaveBeenCalledTimes(1)
    })

    it('ignores self-echo markdown watcher events when content matches memory', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => files[0]),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('# Root')
    })

    it('ignores the watcher echo of a committed card rename while the card is still being edited', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        let movedContent = ''
        const storage = createStorage({
            commit: vi.fn(async (request) => {
                const move = request.moves?.[0]
                if (move) movedContent = move.content

                return []
            }),
            loadFile: vi.fn(async (_project, path) => ({ content: movedContent, path })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const conflicts = recordDialogMessages('error')
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        openFilesService.init({ actionService, dataService: service })
        const projectCard = service.getState().snapshot?.activeCards.find(({ path }) => path === 'design/F-1-root.md')
        if (!projectCard) throw new Error('Expected loaded card')
        const document = openFilesService.openDocument(projectCard)
        if (document.kind !== 'card') throw new Error('Expected card document')

        try {
            await service.cards.updateCardTitle('design/F-1-root.md', 'Renamed Root')
            document.updateDraft({ content: '# Renamed Root\n\nStill typing' }, 'list-card')
            watchChange({ changeKind: 'added', path: 'design/F-1-renamed-root.md' })
            await vi.advanceTimersByTimeAsync(150)

            expect(conflicts.messages).toEqual([])
        } finally {
            conflicts.stop()
        }
    })

    it('reports a conflict and keeps local markdown content when unsaved edits exist', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternal',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const conflicts = recordDialogMessages('error')
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        try {
            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')
            watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
            await vi.advanceTimersByTimeAsync(150)

            expect(conflicts.messages[0]).toContain('External change ignored for design/F-1-root.md')
            expect(captureError).not.toHaveBeenCalled()
            const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
            expect(card?.content).toContain('Local draft')
        } finally {
            conflicts.stop()
        }
    })

    it('ignores an external card change while its canonical draft is dirty but not queued', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'changed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternal',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const conflicts = recordDialogMessages('error')
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        openFilesService.init({ actionService, dataService: service })
        const projectCard = service.getState().snapshot?.activeCards[0]
        if (!projectCard) throw new Error('Expected loaded card')
        const document = openFilesService.openDocument(projectCard)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ content: '# Root\n\nLocal draft' }, 'list-card')

        try {
            watchChange({ changeKind: 'changed', path: projectCard.path })
            await vi.advanceTimersByTimeAsync(150)

            expect(conflicts.messages[0]).toContain(`External change ignored for ${projectCard.path}`)
            expect(document.getDraft().content).toContain('Local draft')
        } finally {
            conflicts.stop()
        }
    })

    it('drops the watcher echo of a flushed save without reporting a conflict for newer pending edits', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 1000)
        let watchChange: (event: { changeKind: 'changed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        let committedFile: MarkdownFile | null = null
        const storage = createStorage({
            commit: vi.fn(async (request) => {
                committedFile = request.files[0] ?? committedFile

                return []
            }),
            loadFile: vi.fn(async () => {
                if (!committedFile) throw new Error('Nothing committed yet')

                return committedFile
            }),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        const conflicts = recordDialogMessages('error')
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        try {
            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nFirst edit')
            await vi.advanceTimersByTimeAsync(1100)
            expect(storage.commit).toHaveBeenCalled()

            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nSecond edit')
            watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
            await vi.advanceTimersByTimeAsync(100)

            expect(conflicts.messages).toEqual([])
            const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
            expect(card?.content).toContain('Second edit')
        } finally {
            conflicts.stop()
        }
    })

    it('classifies a Markdown watcher event after commit completion from persisted content', async () => {
        configService.init()
        let persistedFile = files[0]
        let watchChange: (event: ProjectWatchEvent) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadFile = vi.fn(async () => persistedFile)
        const storage = createStorage({
            commit: vi.fn(async (request: CommitRequest) => {
                persistedFile = request.files.find(({ path }) => path === persistedFile.path) ?? persistedFile

                return []
            }),
            listRepositoryFiles: vi.fn(async () => [persistedFile.path]),
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        const conflicts = recordDialogMessages('error')
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        try {
            service.cards.updateCardBody(persistedFile.path, '# Root\n\nLocal late echo')
            await service.cards.flushPendingCommits()
            watchChange({ changeKind: 'changed', path: persistedFile.path })

            await vi.waitFor(() => expect(loadFile).toHaveBeenCalledOnce())
            expect(conflicts.messages).toEqual([])
            expect(service.getState().snapshot?.activeCards[0].content).toContain('Local late echo')
        } finally {
            conflicts.stop()
        }
    })

    it('defers a watcher event during persistence and does not require another event', async () => {
        configService.init()
        const commit = createDeferred<MarkdownFile[]>()
        let deferCommit = false
        let persistedFile = files[0]
        let watchChange: (event: ProjectWatchEvent) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadFile = vi.fn(async () => persistedFile)
        const storage = createStorage({
            commit: vi.fn(async (request: CommitRequest) => {
                persistedFile = request.files.find(({ path }) => path === persistedFile.path) ?? persistedFile
                if (!deferCommit) return []

                return await commit.promise
            }),
            listRepositoryFiles: vi.fn(async () => [persistedFile.path]),
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        vi.mocked(storage.commit).mockClear()
        deferCommit = true

        service.cards.updateCardBody(persistedFile.path, '# Root\n\nDuring persistence')
        const flush = service.cards.flushPendingCommits()
        expect(storage.commit).toHaveBeenCalledOnce()
        watchChange({ changeKind: 'unknown', path: persistedFile.path })
        await Promise.resolve()
        expect(loadFile).not.toHaveBeenCalled()

        commit.resolve([])
        await flush
        await flushPromises()
        expect(loadFile).toHaveBeenCalledOnce()
        expect(service.getState().snapshot?.activeCards[0].content).toContain('During persistence')
    })

    it('treats late source and target rename notifications as local without action reload', async () => {
        configService.init()
        const sourcePath = 'actions/review.json'
        const targetPath = 'actions/review-later.json'
        const definition = actionDefinition('review', { label: 'Review later' })
        let actionFiles = [{ content: JSON.stringify(actionDefinition('review')), path: sourcePath }]
        let watchChange: (event: ProjectWatchEvent) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadActionFiles = vi.fn(async () => actionFiles)
        const storage = createStorage({
            commit: vi.fn(async (request: CommitRequest) => {
                const move = request.moves?.[0]
                if (move) actionFiles = [{ content: move.content, path: move.toPath }]

                return []
            }),
            listRepositoryFiles: vi.fn(async () => actionFiles.map(({ path }) => path)),
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        const reloadFromFiles = vi.spyOn(actionService, 'reloadFromFiles')
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        loadActionFiles.mockClear()

        await service.persistActionFile(
            { content: JSON.stringify(definition), path: targetPath },
            definition.id,
            sourcePath,
            vi.fn(),
        )
        await service.cards.flushPendingCommits()
        watchChange({ changeKind: 'added', path: targetPath })
        watchChange({ changeKind: 'removed', path: sourcePath })

        await flushPromises()
        expect(loadActionFiles).toHaveBeenCalledTimes(1)
        expect(reloadFromFiles).not.toHaveBeenCalled()
    })

    it('routes persisted content that contradicts a local outcome through external conflict handling', async () => {
        configService.init()
        let persistedFile = files[0]
        let watchChange: (event: ProjectWatchEvent) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            commit: vi.fn(async (request: CommitRequest) => {
                persistedFile = request.files.find(({ path }) => path === persistedFile.path) ?? persistedFile

                return []
            }),
            listRepositoryFiles: vi.fn(async () => [persistedFile.path]),
            loadFile: vi.fn(async () => persistedFile),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        service.cards.updateCardBody(persistedFile.path, '# Root\n\nExpected local')
        await service.cards.flushPendingCommits()
        persistedFile = { ...persistedFile, content: persistedFile.content.replace('Expected local', 'External overwrite') }
        watchChange({ changeKind: 'changed', path: persistedFile.path })
        await vi.waitFor(() => expect(service.getState().snapshot?.activeCards[0].content).toContain('External overwrite'))

        expect(service.getState().snapshot?.activeCards[0].content).toContain('External overwrite')
    })

    it('recognizes filesystem effects after failure and keeps the restored batch retryable', async () => {
        configService.init()
        let persistedFile = files[0]
        let failNextCommit = false
        let watchChange: (event: ProjectWatchEvent) => void = () => {
            throw new Error('Watcher not registered')
        }
        const commit = vi.fn(async (request: CommitRequest) => {
            persistedFile = request.files.find(({ path }) => path === persistedFile.path) ?? persistedFile
            if (failNextCommit) {
                failNextCommit = false
                throw new Error('commit failed after write')
            }

            return []
        })
        const storage = createStorage({
            commit,
            listRepositoryFiles: vi.fn(async () => [persistedFile.path]),
            loadFile: vi.fn(async () => persistedFile),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        const conflicts = recordDialogMessages('error')
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        commit.mockClear()
        failNextCommit = true

        try {
            service.cards.updateCardBody(persistedFile.path, '# Root\n\nPartially written')
            await expect(service.cards.flushPendingCommits()).rejects.toThrow('commit failed after write')
            watchChange({ changeKind: 'changed', path: persistedFile.path })
            await flushPromises()
            expect(storage.loadFile).toHaveBeenCalledOnce()
            expect(conflicts.messages.some((message) => message.includes('External change ignored'))).toBe(false)

            await service.cards.flushPendingCommits()
            expect(commit).toHaveBeenCalledTimes(2)
        } finally {
            conflicts.stop()
        }
    })

    it('verifies retained local outcomes when project watching is restored', async () => {
        configService.init()
        let persistedFile = files[0]
        let watchRestored = () => {
            throw new Error('Watcher restoration callback not registered')
        }
        const loadFile = vi.fn(async () => persistedFile)
        const storage = createStorage({
            commit: vi.fn(async (request: CommitRequest) => {
                persistedFile = request.files.find(({ path }) => path === persistedFile.path) ?? persistedFile

                return []
            }),
            listRepositoryFiles: vi.fn(async () => [persistedFile.path]),
            loadFile,
            loadProject: vi.fn(async () => ({ files: [persistedFile], workingFolder: 'design' })),
            watchProject: vi.fn((_project, _onChange, onRestored) => {
                watchRestored = onRestored

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        loadFile.mockClear()

        service.cards.updateCardBody(persistedFile.path, '# Root\n\nSaved while disconnected')
        await service.cards.flushPendingCommits()
        watchRestored()

        await vi.waitFor(() => expect(loadFile).toHaveBeenCalledOnce())
        expect(service.getState().snapshot?.activeCards[0].content).toContain('Saved while disconnected')
    })
})
