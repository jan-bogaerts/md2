import { describe, expect, it, vi } from 'vitest'
import type { CommitRequest, ProjectConfig, StorageService } from '../../data/data_types'
import { createActivityFile } from '../../../../shared/card_activity.mjs'
import { createAgentTokenUsageSummary, serializeAgentTokenUsageSummary } from '../../../../shared/agent_token_usage_summary.mjs'
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

function storage(files: Record<string, string>) {
    const commit = vi.fn(async (request: CommitRequest) => {
        void request

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

        await service.load(project, config, harness.storage)

        expect(service.getSnapshot()?.projectUsage).toMatchObject({ legacyTotalTokens: 30, totalTokens: 30 })
        expect(service.getSnapshot()?.releases.v1).toMatchObject({ legacyTotalTokens: 20, totalTokens: 20 })
        const committed = harness.commit.mock.calls[0][0].files[0]
        expect(committed.path).toBe('design/agent_token_usage.json')
        expect(committed.content).not.toContain('card__')
    })

    it('reports and preserves a malformed existing summary', async () => {
        const malformed = '{"schemaVersion":1,"projectUsage":{}}'
        const harness = storage({ 'design/agent_token_usage.json': malformed })
        const service = new ProjectAgentTokenUsageService()

        await expect(service.load(project, config, harness.storage)).rejects.toThrow('Malformed agent token usage summary')
        expect(harness.commit).not.toHaveBeenCalled()
    })

    it('loads a valid stored summary without scanning activity or writing', async () => {
        const content = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary())
        const harness = storage({ 'design/agent_token_usage.json': content })
        const service = new ProjectAgentTokenUsageService()

        await service.load(project, config, harness.storage)

        expect(service.getSnapshot()?.projectUsage.totalTokens).toBe(0)
        expect(harness.storage.listRepositoryFiles).not.toHaveBeenCalled()
        expect(harness.commit).not.toHaveBeenCalled()
    })
})
