import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import { DEFAULT_PROJECT_CONFIG, type ProjectConfig, type StorageService } from '../../data/data_types'
import { projectStatsService } from '../../services/stats/project_stats_service'
import { completedReleaseIdentity } from '../../services/stats/stats_options'
import { AppThemeProvider } from '../../theme/theme_provider'
import { formatTokenCount } from '../agents/token_count_format'
import { DialogDisplay } from '../dialog_display'
import { StatsContent } from './stats_content'

const metricsHeader = [
    'recorded_at', 'record_type', 'provider', 'limit_id', 'window_id', 'window_duration_minutes',
    'resets_at', 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens',
    'total_tokens', 'used_percent', 'used_percent_delta',
].join(',')
const config: ProjectConfig = {
    ...DEFAULT_PROJECT_CONFIG,
    actionsFolder: 'design/actions',
    archivedFolder: 'design/archived',
    projectFolder: 'design',
    releasesFolder: 'design/history',
    workingFolder: 'design/active',
}

function storage(files: Record<string, string>): StorageService {
    return {
        checkoutBranch: vi.fn(), commit: vi.fn(), createProject: vi.fn(), deleteFile: vi.fn(), deleteFolder: vi.fn(),
        listBranches: vi.fn(), listRepositories: vi.fn(), listRepositoryFiles: vi.fn(async () => Object.keys(files)),
        listTopLevelFolders: vi.fn(), loadActionFiles: vi.fn(), loadProject: vi.fn(), loadProjectConfig: vi.fn(),
        loadProjectRoot: vi.fn(), loadTextFile: vi.fn(async (_project, path) => ({ content: files[path], path })),
        moveFiles: vi.fn(), push: vi.fn(), saveProjectConfig: vi.fn(),
    }
}

function metricsStorage(content: string) {
    return storage({ 'design/usage_metrics.csv': content })
}

function renderContent() {
    return render(<AppThemeProvider><DialogDisplay /><StatsContent /></AppThemeProvider>)
}

function activityWithRecords(records: Record<string, unknown>[]) {
    return JSON.stringify({actionSettings: {}, conversations: [], origin: { cardInternalId: 'card-1', kind: 'card' }, records, version: 4})
}

describe('StatsContent', () => {
    afterEach(() => {
        cleanup()
        projectStatsService.clear()
    })

    it('shows local accessibility text and current chart values', async () => {
        const metrics = `${metricsHeader}\r\n2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,\r\n`
        projectStatsService.setControls({activityGranularity: 'day', activityMetric: 'tokens', dataset: 'activityOverTime', endUtc: null, startUtc: null})
        projectStatsService.bindProject({ config, project: { branch: 'main', id: 'project' }, storage: metricsStorage(metrics) })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.getByRole('heading', { name: 'Project stats' })).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Dataset' })).toBeNull()
        expect(screen.getByRole('listitem')).toHaveAccessibleName(/Project tokens: 10/u)
        expect(screen.getByRole('listitem')).not.toHaveAccessibleName(/2026-08-12T00:00:00.000Z/u)
        expect(screen.getByTestId('stats-chart-panel')).toHaveStyle({ flex: '1' })
    })

    it('abbreviates or spells out token counts as the stored format changes', async () => {
        const metrics = `${metricsHeader}
2026-08-12T10:00:00.000Z,token_usage,codex,,,,,300000,100000,28913,0,428913,,
`
        projectStatsService.setControls({ activityGranularity: 'day', activityMetric: 'tokens', dataset: 'activityOverTime' })
        projectStatsService.bindProject({ config, project: { branch: 'main', id: 'token-format' }, storage: metricsStorage(metrics) })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.getByText(formatTokenCount(428913))).toBeInTheDocument()

        act(() => projectStatsService.setControls({ shortTokenCounts: false }))

        const formattedTokenCount = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(428913);
        await waitFor(() => expect(screen.getByText(formattedTokenCount)).toBeInTheDocument());
    })

    it('renders and reports malformed-source errors without partial chart data', async () => {
        projectStatsService.bindProject({ config, project: { branch: 'main', id: 'project' }, storage: metricsStorage('broken') })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.getByRole('heading', { name: 'Stats unavailable' })).toBeInTheDocument()
        await waitFor(() => expect(screen.getByLabelText('Error message')).toHaveTextContent('Invalid usage metrics CSV header'))
        expect(screen.queryByRole('listitem')).toBeNull()
    })

    it('shows valid token data with a warning when malformed account usage is skipped', async () => {
        const malformedAccountRow = '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window,0,broken,,,,,,50,'
        const tokenRow = '2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,'
        projectStatsService.setControls({ activityMetric: 'tokens', dataset: 'activityOverTime' })
        projectStatsService.bindProject({
            config,
            project: { branch: 'main', id: 'warning-project' },
            storage: metricsStorage(`${metricsHeader}\r\n${malformedAccountRow}\r\n${tokenRow}\r\n`),
        })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.getByRole('listitem')).toHaveAccessibleName(/Project tokens: 10/u)
        expect(screen.getAllByText('Malformed account_usage row 2 was skipped.').length).toBeGreaterThan(0)
        await waitFor(() => expect(screen.getByLabelText('Error message')).toHaveTextContent('Malformed account_usage row 2 was skipped.'))
    })

    it('renders the chart surface belonging to the selected dataset', async () => {
        const metrics = `${metricsHeader}\r\n2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,\r\n`
        projectStatsService.setControls({ activityGranularity: 'month', activityMetric: 'tokens', dataset: 'activityOverTime' })
        projectStatsService.bindProject({ config, project: { branch: 'main', id: 'controls' }, storage: metricsStorage(metrics) })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.queryByRole('combobox', { name: 'Activity metric' })).toBeNull()
        expect(screen.getByRole('list')).toBeInTheDocument()

        act(() => projectStatsService.setControls({ dataset: 'usageComparison' }))

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Project token usage (totals)' })).toBeInTheDocument())
        expect(screen.getByRole('heading', { name: 'Project token usage (average per action)' })).toBeInTheDocument()
    })

    it('shows the empty state for a release without activity', async () => {
        const origin = { cardInternalId: 'card-1', kind: 'card' }
        const currentRecord = {
            commits: [], completedAt: '2026-08-12T10:00:00.000Z', conversationIds: [],
            details: { command: 'review', output: '', type: 'command' }, origin, rootActionId: 'review',
            rootActionLabel: 'Review', runId: 'current-run', startedAt: '2026-08-12T09:00:00.000Z', status: 'completed',
        }
        const releaseRecord = {
            ...currentRecord,
            completedAt: '2026-08-13T10:00:00.000Z',
            rootActionId: 'ship',
            rootActionLabel: 'Ship',
            runId: 'release-run',
        }
        projectStatsService.setControls({ activityMetric: 'actions', dataset: 'activityOverTime' })
        projectStatsService.bindProject({
            config,
            project: { branch: 'main', id: 'releases' },
            storage: storage({
                'design/activity/card__card-1.json': activityWithRecords([currentRecord]),
                'design/history/empty/README.md': 'Empty release',
                'design/history/v1/card__card-1.json': activityWithRecords([releaseRecord]),
            }),
        })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        act(() => projectStatsService.setControls({ releaseIdentity: completedReleaseIdentity('v1') }))

        await waitFor(() => expect(projectStatsService.getSnapshot().rows).toEqual([expect.objectContaining({ actionId: 'ship', value: 1 })]))

        act(() => projectStatsService.setControls({ releaseIdentity: completedReleaseIdentity('empty') }))

        await waitFor(() => expect(screen.getByText('No stats data matches current filters.')).toBeInTheDocument())
    })

    it('shows all account series and scope warning without account selectors', async () => {
        const accountRows = [
            '2026-08-12T09:00:00.000Z,account_usage,codex,weekly,window-a,10080,2026-08-17T00:00:00.000Z,,,,,,50,2',
            '2026-08-12T09:30:00.000Z,account_usage,claude,five-hour,window-b,300,2026-08-12T14:00:00.000Z,,,,,,40,4',
        ]
        projectStatsService.setControls({ dataset: 'usageComparison' })
        projectStatsService.bindProject({
            config,
            project: { branch: 'main', id: 'account' },
            storage: metricsStorage([metricsHeader, ...accountRows].join('\r\n')),
        })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.getByText(/Account usage may include other projects and external CLI sessions/u)).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Account provider' })).toBeNull()
        expect(screen.queryByRole('combobox', { name: 'Account limit' })).toBeNull()
        expect(screen.queryByRole('combobox', { name: 'Account window' })).toBeNull()
        expect(screen.getByLabelText('Account usage chart legend')).toHaveTextContent('codex / weekly / window-a')
        expect(screen.getByLabelText('Account usage chart legend')).toHaveTextContent('claude / five-hour / window-b')
        expect(screen.getAllByLabelText('Zero baseline')).toHaveLength(9)
        expect(screen.getAllByTestId('stats-chart-viewport')).toHaveLength(1)
    })

    it('shows agent performance exclusion reasons above chart', async () => {
        const origin = { cardInternalId: 'card-1', kind: 'card' }
        const storedConversation = {
            actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F_1.md', completedAt: '2026-08-12T10:00:00.000Z',
            entries: [], id: 'conversation-1', providerSessions: [], startedAt: '2026-08-12T09:00:00.000Z',
            status: 'completed', title: 'Review', viewed: true,
        }
        const record = {
            commits: [], completedAt: '2026-08-12T10:00:00.000Z', conversationIds: ['conversation-1'],
            details: { agent: 'codex', model: 'gpt-5', type: 'agent' }, origin, rootActionId: 'review',
            rootActionLabel: 'Review', rootConversationId: 'conversation-1', runId: 'run-1',
            startedAt: '2026-08-12T09:00:00.000Z', status: 'completed',
        }
        const activity = JSON.stringify({ actionSettings: {}, conversations: [storedConversation], origin, records: [record], version: 4 })
        projectStatsService.setControls({ dataset: 'agentPerformance', performanceMetric: 'duration' })
        projectStatsService.bindProject({
            config,
            project: { branch: 'main', id: 'coverage' },
            storage: storage({ 'design/activity/card__card-1.json': activity }),
        })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        expect(screen.getByText(/1 sample excluded: 1 missing measured timer/u)).toBeInTheDocument()
    })

    it('stacks duration bars per agent and per card, and keeps other duration aggregations unstacked', async () => {
        const origin = { cardInternalId: 'card-1', kind: 'card' }
        const storedConversation = {
            actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F_1.md', completedAt: '2026-08-12T10:00:00.000Z',
            entries: [], id: 'conversation-1', providerSessions: [], startedAt: '2026-08-12T09:00:00.000Z',
            status: 'completed', timer: { breakdown: { reasoningMs: 20_000, toolMs: 50_000 }, elapsedMs: 100_000, runningStartedAt: null },
            title: 'Review', viewed: true,
        }
        const record = {
            commits: [], completedAt: '2026-08-12T10:00:00.000Z', conversationIds: ['conversation-1'],
            details: { agent: 'codex', model: 'gpt-5', type: 'agent' }, origin, rootActionId: 'review',
            rootActionLabel: 'Review', rootConversationId: 'conversation-1', runId: 'run-1',
            startedAt: '2026-08-12T09:00:00.000Z', status: 'completed',
        }
        const activity = JSON.stringify({ actionSettings: {}, conversations: [storedConversation], origin, records: [record], version: 4 })
        projectStatsService.setControls({ dataset: 'agentPerformance', performanceAggregation: 'sum', performanceMetric: 'duration' })
        projectStatsService.bindProject({
            config,
            project: { branch: 'main', id: 'stacked' },
            storage: storage({ 'design/activity/card__card-1.json': activity }),
        })
        await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
        renderContent()

        await waitFor(() => expect(screen.getByRole('list')).toHaveAttribute('data-chart-mode', 'groupedStacked'))
        expect(screen.getAllByTestId('stats-legend-swatch')).toHaveLength(4)

        projectStatsService.setControls({ performanceAggregation: 'median' })
        await waitFor(() => expect(screen.getByRole('list')).toHaveAttribute('data-chart-mode', 'grouped'))

        projectStatsService.setControls({ dataset: 'totals', totalsGrouping: 'card', totalsMetric: 'duration' })
        await waitFor(() => expect(screen.getByRole('list')).toHaveAttribute('data-chart-mode', 'stacked'))
        expect(screen.getAllByTestId('stats-legend-swatch').map((swatch) => swatch.getAttribute('data-series-identity')))
            .toEqual(['tool', 'reasoning', 'agent', 'unmeasured'])
    })
})
