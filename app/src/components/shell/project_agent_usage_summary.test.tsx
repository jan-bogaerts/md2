import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, ProjectCard, ProjectSnapshot } from '../../data/data_types'
import { ProjectAgentUsageSummary } from './project_agent_usage_summary'

const { projectConfig, projectState } = vi.hoisted(() => ({
    projectConfig: { projectFolder: 'design' },
    projectState: { snapshot: null as ProjectSnapshot | null },
}))

vi.mock('../hooks/use_project_config', () => ({ useProjectConfig: () => projectConfig }))
vi.mock('../hooks/use_project_state', () => ({ useProjectState: () => projectState }))

function conversation(id: string, totalTokens: number): AgentConversation {
    return {
        actionId: null,
        cardInternalId: id,
        cardPath: id,
        completedAt: 'now',
        events: [],
        hasExplicitTitle: true,
        id,
        messages: [],
        path: `logs/${id}.json`,
        providerSessions: [],
        startedAt: 'now',
        status: 'completed',
        title: 'Run',
        usage: { cachedInputTokens: 0, inputTokens: totalTokens, outputTokens: 0, reasoningTokens: 0, totalTokens },
    }
}

function card(path: string, totalTokens: number): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [conversation(path, totalTokens)],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status: 'done', title: path,
        },
        headerFields: {},
        isActive: !path.includes('/history/'),
        path,
    }
}

describe('ProjectAgentUsageSummary', () => {
    afterEach(() => {
        cleanup()
        projectState.snapshot = null
    })

    it('reads project usage and opens current-version and release details', () => {
        projectState.snapshot = {
            activeCards: [card('design/F-1.md', 16)],
            backgroundCards: [card('design/history/v1/F-2.md', 32)],
            repositoryFiles: [],
            workingFolder: 'design',
        }

        render(<ProjectAgentUsageSummary />)

        expect(screen.getByRole('button', { name: 'Agent token usage summary' })).toHaveTextContent('48 tokens')
        fireEvent.click(screen.getByRole('button', { name: 'Agent token usage summary' }))
        expect(screen.getByRole('heading', { name: 'Project agent usage' })).toBeInTheDocument()
        expect(screen.getByText('Current')).toBeInTheDocument()
        expect(screen.getByText('v1')).toBeInTheDocument()
        expect(screen.getByText('tokens: 48')).toBeInTheDocument()
    })
})
