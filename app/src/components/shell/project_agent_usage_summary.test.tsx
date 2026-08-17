import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, Card, ProjectSnapshot } from '../../data/data_types'
import { ProjectAgentUsageSummary } from './project_agent_usage_summary'

const { projectConfig, projectState, summaryService } = vi.hoisted(() => {
    const summary = {
        projectUsage: {
            cachedInputTokens: 0, inputTokens: 0, legacyTotalTokens: 56,
            outputTokens: 0, reasoningTokens: 0, totalTokens: 56,
        },
        releases: {
            v1: {
                cachedInputTokens: 0, inputTokens: 0, legacyTotalTokens: 32,
                outputTokens: 0, reasoningTokens: 0, totalTokens: 32,
            },
        },
        schemaVersion: 1,
    }

    return {
        projectConfig: {
            archivedFolder: 'design/records/archived',
            projectFolder: 'design',
            releasesFolder: 'design/records/releases',
        },
        projectState: { snapshot: null as ProjectSnapshot | null },
        summaryService: { getSnapshot: () => summary, subscribe: () => () => undefined },
    }
})

vi.mock('../hooks/use_project_config', () => ({ useProjectConfig: () => projectConfig }))
vi.mock('../hooks/use_project_state', () => ({ useProjectState: () => projectState }))
vi.mock('../../services/agents/project_agent_token_usage_service', () => ({ projectAgentTokenUsageService: summaryService }))

function conversation(id: string, totalTokens: number): AgentConversation {
    return {
        actionId: null,
        cardInternalId: id,
        cardPath: id,
        completedAt: 'now',
        entries: [],
        hasExplicitTitle: true,
        id,
        path: `logs/${id}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: 'Run',
        viewed: true,
        usage: { cachedInputTokens: 0, inputTokens: totalTokens, outputTokens: 0, reasoningTokens: 0, totalTokens },
    }
}

function card(path: string, totalTokens: number): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [conversation(path, totalTokens)],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, references: [], status: 'done', title: path,
        },
        hasFrontmatter:true,
        isActive: !path.includes('/history/'),
        path,
    }
}

describe('ProjectAgentUsageSummary', () => {
    afterEach(() => {
        cleanup()
        projectState.snapshot = null
    })

    it('reads configured archived and release usage details', () => {
        projectState.snapshot = {
            activeCards: [card('design/F-1.md', 16)],
            backgroundCards: [
                card('design/records/releases/v1/F-2.md', 32),
                card('design/records/archived/F-3.md', 8),
            ],
            repositoryFiles: [],
            workingFolder: 'design',
        }

        render(<ProjectAgentUsageSummary />)

        expect(screen.getByRole('button', { name: 'Agent token usage summary' })).toHaveTextContent('56 tokens')
        fireEvent.click(screen.getByRole('button', { name: 'Agent token usage summary' }))
        expect(screen.getByRole('heading', { name: 'Project agent usage' })).toBeInTheDocument()
        expect(screen.getByText('Current')).toBeInTheDocument()
        expect(screen.getByText('Archived')).toBeInTheDocument()
        expect(screen.getByText('v1')).toBeInTheDocument()
        expect(screen.getByText('tokens: 56')).toBeInTheDocument()
    })

    it('opens shared details in a mobile dialog', () => {
        render(<ProjectAgentUsageSummary mobile />)

        const button = screen.getByRole('button', { name: 'Agent token usage summary' })
        button.focus()
        expect(button).toHaveFocus()
        fireEvent.click(button)

        expect(screen.getByRole('dialog', { name: 'Project agent usage' })).toHaveFocus()
    })
})
