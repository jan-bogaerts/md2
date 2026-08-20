import { describe, expect, it, vi } from 'vitest'
import type { CommitRequest, ProjectConfig, StorageService } from '../../data/data_types'
import { createActivityFile } from '../../../../shared/card_activity.mjs'
import {
    createAgentTokenUsageSummary,
    legacySummaryUsage,
    serializeAgentTokenUsageSummary,
} from '../../../../shared/agent_token_usage_summary.mjs'
import { ProjectAgentTokenUsageService } from './project_agent_token_usage_service'
import { DEFAULT_PROJECT_CONFIG } from '../../data/data_types'

const project = { branch: 'main', id: 'project' }
const config: ProjectConfig = {
    ...DEFAULT_PROJECT_CONFIG,
    archivedFolder: 'design/archived',
    projectFolder: 'design',
    pushMode: 'manual',
    releasesFolder: 'design/history',
    workingFolder: 'design/active',
}

function activity(cardInternalId: string, totalTokens: number) {
    const value = createActivityFile({ cardInternalId, kind: 'card' })
    value.conversations.push({
        actionId: 'review',
        cardInternalId,
        cardPath: `design/${cardInternalId}.md`,
        completedAt: '2026-08-17T10:01:00.000Z',
        entries: [],
        hasExplicitTitle: true,
        id: `conversation-${cardInternalId}`,
        providerSessions: [],
        startedAt: '2026-08-17T10:00:00.000Z',
        status: 'completed',
        title: 'Review',
        usage: { cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens },
        viewed: true,
    })

    return JSON.stringify(value)
}

function legacyActivity(cardInternalId: string, totalTokens: number, version: 1 | 2 | 3) {
    const value = JSON.parse(activity(cardInternalId, totalTokens))
    value.version = version
    if (version !== 3) delete value.actionSettings

    return JSON.stringify(value)
}

function activityWithUnrecognizedLegacyPermissions(cardInternalId: string) {
    const value = JSON.parse(legacyActivity(cardInternalId, 99, 3))
    value.records = [{
        details: {
            accessLevel: 'read-only',
            agent: 'codex',
            approvalPolicy: 'never',
            type: 'agent',
        },
        type: 'action',
    }]

    return JSON.stringify(value)
}

function deferred<T>() {
    let resolvePromise: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => {
        resolvePromise = resolve
    })

    return { promise, resolve: resolvePromise }
}

function summary(totalTokens = 0) {
    return serializeAgentTokenUsageSummary(createAgentTokenUsageSummary(legacySummaryUsage(totalTokens)))
}

function storage(files: Record<string, string>) {
    const commit = vi.fn(async (request: CommitRequest) => {
        request.files.forEach((file) => {
            files[file.path] = file.content
        })

        return []
    })
    const value = {
        commit,
        listRepositoryFiles: vi.fn(async () => Object.keys(files)),
        loadTextFile: vi.fn(async (_project, path: string) => {
            const content = files[path]
            if (content === undefined) throw new Error(`Missing ${path}`)

            return { content, path }
        }),
        push: vi.fn(),
    } as unknown as StorageService

    return { commit, storage: value }
}

describe('ProjectAgentTokenUsageService', () => {
    it('migrates every card activity total into project and existing-release legacy baselines', async () => {
        const files = {
            'design/activity/card__active.json': activity('active', 10),
            'design/history/v1/card__released.json': activity('released', 20),
            'design/activity/project.json': activity('ignored-project-file', 999),
        }
        const harness = storage(files)
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()

        await service.load(project, config, harness.storage, reportFailure)

        expect(service.getSnapshot()?.projectUsage).toMatchObject({ legacyTotalTokens: 30, totalTokens: 30 })
        expect(service.getSnapshot()?.releases.v1).toMatchObject({ legacyTotalTokens: 20, totalTokens: 20 })
        const committed = harness.commit.mock.calls[0][0].files[0]
        expect(committed.path).toBe('design/agent_token_usage.json')
        expect(committed.content).not.toContain('card__')
        expect(harness.storage.loadTextFile).not.toHaveBeenCalledWith(project, 'design/agent_token_usage.json')
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it.each([1, 2, 3] as const)('migrates version %s card activity into the summary', async (version) => {
        const activityPath = `design/activity/card__legacy-${version}.json`
        const harness = storage({ [activityPath]: legacyActivity(`legacy-${version}`, 12, version) })
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()

        await service.load(project, config, harness.storage, reportFailure)

        expect(service.getSnapshot()?.projectUsage).toMatchObject({ legacyTotalTokens: 12, totalTokens: 12 })
        expect(harness.commit).toHaveBeenCalledOnce()
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('skips activity with unrecognized legacy permissions and migrates remaining activity', async () => {
        const files = {
            'design/activity/card__invalid.json': activityWithUnrecognizedLegacyPermissions('invalid'),
            'design/activity/card__valid.json': activity('valid', 12),
        }
        const harness = storage(files)
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()

        await service.load(project, config, harness.storage, reportFailure)

        expect(service.getSnapshot()?.projectUsage).toMatchObject({ legacyTotalTokens: 12, totalTokens: 12 })
        expect(harness.commit).toHaveBeenCalledOnce()
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('reports and preserves a malformed existing summary', async () => {
        const malformed = '{"schemaVersion":1,"projectUsage":{}}'
        const harness = storage({ 'design/agent_token_usage.json': malformed })
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()

        await expect(service.load(project, config, harness.storage, reportFailure))
            .rejects.toThrow('Malformed agent token usage summary')
        expect(harness.commit).not.toHaveBeenCalled()
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('loads a valid stored summary without scanning activity or writing', async () => {
        const content = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary())
        const harness = storage({ 'design/agent_token_usage.json': content })
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()

        await service.load(project, config, harness.storage, reportFailure)

        expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(0)
        expect(harness.storage.listRepositoryFiles).toHaveBeenCalledOnce()
        expect(harness.storage.loadTextFile).toHaveBeenCalledWith(project, 'design/agent_token_usage.json')
        expect(harness.commit).not.toHaveBeenCalled()
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('preserves an unreadable existing summary without migrating', async () => {
        const failure = new Error('Summary read failed')
        const harness = storage({ 'design/agent_token_usage.json': summary() })
        harness.storage.loadTextFile = vi.fn(async () => {
            throw failure
        })
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()

        await expect(service.load(project, config, harness.storage, reportFailure)).rejects.toBe(failure)

        expect(harness.commit).not.toHaveBeenCalled()
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('reloads an added or changed stored summary without migration', async () => {
        const files = { 'design/agent_token_usage.json': summary(10) }
        const harness = storage(files)
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()
        await service.load(project, config, harness.storage, reportFailure)
        files['design/agent_token_usage.json'] = summary(20)

        service.handleRepositoryChange({ changeKind: 'changed', path: 'design/agent_token_usage.json' })

        await vi.waitFor(() => expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(20))
        expect(harness.commit).not.toHaveBeenCalled()
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('migrates without reporting when a listed summary disappears before reading', async () => {
        const files = { 'design/agent_token_usage.json': summary(10) }
        const harness = storage(files)
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()
        await service.load(project, config, harness.storage, reportFailure)
        const listRepositoryFiles = vi.mocked(harness.storage.listRepositoryFiles)
        listRepositoryFiles.mockResolvedValueOnce(['design/agent_token_usage.json'])
        listRepositoryFiles.mockResolvedValueOnce([])
        vi.mocked(harness.storage.loadTextFile!).mockRejectedValueOnce(
            new Error("ENOENT: no such file or directory, open 'design/agent_token_usage.json'"),
        )

        service.handleRepositoryChange({ changeKind: 'changed', path: 'design/agent_token_usage.json' })

        await vi.waitFor(() => expect(harness.commit).toHaveBeenCalledOnce())
        expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(0)
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('rebuilds a removed summary once when removal events overlap', async () => {
        const files: Record<string, string> = {
            'design/activity/card__active.json': activity('active', 15),
            'design/agent_token_usage.json': summary(5),
        }
        const harness = storage(files)
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()
        await service.load(project, config, harness.storage, reportFailure)
        delete files['design/agent_token_usage.json']
        vi.mocked(harness.storage.loadTextFile!).mockClear()

        service.handleRepositoryChange({ changeKind: 'removed', path: 'design/agent_token_usage.json' })
        service.handleRepositoryChange({ changeKind: 'removed', path: 'design/agent_token_usage.json' })

        await vi.waitFor(() => expect(harness.commit).toHaveBeenCalledOnce())
        expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(15)
        expect(harness.storage.loadTextFile).not.toHaveBeenCalledWith(project, 'design/agent_token_usage.json')
        expect(reportFailure).not.toHaveBeenCalled()
    })

    it('keeps the last valid summary and reports one malformed background refresh', async () => {
        const files = { 'design/agent_token_usage.json': summary(10) }
        const harness = storage(files)
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()
        await service.load(project, config, harness.storage, reportFailure)
        files['design/agent_token_usage.json'] = '{broken'

        service.handleRepositoryChange({ changeKind: 'changed', path: 'design/agent_token_usage.json' })
        service.handleRepositoryChange({ changeKind: 'changed', path: 'design/agent_token_usage.json' })

        await vi.waitFor(() => expect(reportFailure).toHaveBeenCalledOnce())
        expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(10)
        expect(harness.commit).not.toHaveBeenCalled()
    })

    it('does not apply or commit migration work superseded by another branch load', async () => {
        const activityLoad = deferred<{ content: string; path: string }>()
        const firstHarness = storage({ 'design/activity/card__active.json': activity('active', 15) })
        firstHarness.storage.loadTextFile = vi.fn(async (_project, path) => {
            if (path !== 'design/activity/card__active.json') throw new Error(`Unexpected path ${path}`)

            return activityLoad.promise
        })
        const secondHarness = storage({ 'design/agent_token_usage.json': summary(25) })
        const service = new ProjectAgentTokenUsageService()
        const reportFailure = vi.fn()
        const firstLoad = service.load(project, config, firstHarness.storage, reportFailure)
        await vi.waitFor(() => expect(firstHarness.storage.loadTextFile).toHaveBeenCalledOnce())

        const secondLoad = service.load({ ...project, branch: 'other' }, config, secondHarness.storage, reportFailure)
        activityLoad.resolve({ content: activity('active', 15), path: 'design/activity/card__active.json' })
        await Promise.all([firstLoad, secondLoad])

        expect(firstHarness.commit).not.toHaveBeenCalled()
        expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(25)
        expect(reportFailure).not.toHaveBeenCalled()
    })
})
