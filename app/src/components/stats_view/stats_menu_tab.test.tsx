import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_AGENT_PROFILES } from '../../data/agent_profiles'
import { DEFAULT_PROJECT_CONFIG, type ProjectConfig, type StorageService } from '../../data/data_types'
import { ProjectStatsService, projectStatsService } from '../../services/stats/project_stats_service'
import { completedReleaseIdentity } from '../../services/stats/stats_options'
import { AppThemeProvider } from '../../theme/theme_provider'
import { DialogDisplay } from '../dialog_display'
import { StatsMenuTab } from './stats_menu_tab'
import { downloadStatsCsv } from './stats_csv'

vi.mock('./stats_csv', () => ({ downloadStatsCsv: vi.fn() }))

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
const origin = { cardInternalId: 'card-1', kind: 'card' }
const storedConversation = {
    actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F_1.md', completedAt: '2026-08-12T10:00:00.000Z',
    entries: [], id: 'conversation-1', providerSessions: [], startedAt: '2026-08-12T09:00:00.000Z',
    status: 'completed', timer: { breakdown: { reasoningMs: 20_000, toolMs: 50_000 }, elapsedMs: 100_000, runningStartedAt: null },
    title: 'Review', viewed: true,
}
const agentRecord = {
    commits: [], completedAt: '2026-08-12T10:00:00.000Z', conversationIds: ['conversation-1'],
    details: { agent: 'codex', model: 'gpt-5', type: 'agent' }, origin, rootActionId: 'review',
    rootActionLabel: 'Review', rootConversationId: 'conversation-1', runId: 'run-1',
    startedAt: '2026-08-12T09:00:00.000Z', status: 'completed',
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

function activityStorage(files: Record<string, string> = {}) {
    return storage({
        'design/activity/card__card-1.json': JSON.stringify({
            actionSettings: {}, conversations: [storedConversation], origin, records: [agentRecord], version: 4,
        }),
        ...files,
    })
}

function renderTab(service?: ProjectStatsService) {
    return render(<AppThemeProvider><DialogDisplay /><StatsMenuTab service={service} /></AppThemeProvider>)
}

async function openStats(id: string, storageService: StorageService) {
    projectStatsService.bindProject({ config, project: { branch: 'main', id }, storage: storageService })
    await projectStatsService.open([], BUILTIN_AGENT_PROFILES)
}

function chooseOption(comboboxName: string, optionName: string) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: comboboxName }))
    fireEvent.click(screen.getByRole('option', { name: optionName }))
}

describe('StatsMenuTab', () => {
    afterEach(() => {
        cleanup()
        projectStatsService.clear()
        vi.mocked(downloadStatsCsv).mockClear()
    })

    it('groups the controls into labelled sections without stacked captions', async () => {
        await openStats('sections', activityStorage())
        renderTab()

        expect(within(screen.getByRole('group', { name: 'Dataset' })).getByRole('combobox', { name: 'Dataset' })).toBeInTheDocument()
        expect(within(screen.getByRole('group', { name: 'Filters' })).getByRole('combobox', { name: 'Releases' })).toBeInTheDocument()
        expect(within(screen.getByRole('group', { name: 'Filters' })).getByRole('button', { name: 'Date range' })).toBeInTheDocument()
        expect(within(screen.getByRole('group', { name: 'Export' })).getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
        expect(screen.queryByText('Dataset')).toBeNull()
        expect(screen.queryByText('Token numbers')).toBeNull()
    })

    it('switches datasets and shows only the controls belonging to the selection', async () => {
        projectStatsService.setControls({ activityGranularity: 'month', activityMetric: 'actions', dataset: 'activityOverTime' })
        await openStats('controls', activityStorage())
        renderTab()

        expect(screen.getByRole('combobox', { name: 'Activity metric' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Activity granularity' })).toHaveTextContent('Month')

        chooseOption('Dataset', 'Agent/model performance')

        expect(projectStatsService.getSnapshot().controls.dataset).toBe('agentPerformance')
        expect(screen.getByRole('combobox', { name: 'Performance metric' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Performance aggregation' })).toHaveTextContent('Average')
        expect(screen.getByRole('combobox', { name: 'Performance granularity' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Action filter' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Agent filter' })).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Model filter' })).toBeNull()
        expect(screen.queryByRole('combobox', { name: 'Activity metric' })).toBeNull()

        chooseOption('Performance grouping', 'Model')

        expect(screen.getByRole('combobox', { name: 'Model filter' })).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Agent filter' })).toBeNull()

        chooseOption('Dataset', 'Project usage vs account usage')

        expect(screen.getByRole('combobox', { name: 'Usage granularity' })).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Performance metric' })).toBeNull()

        chooseOption('Dataset', 'Totals by Card/Action')

        expect(screen.getByRole('combobox', { name: 'Totals grouping' })).toBeInTheDocument()
        chooseOption('Totals metric', 'Estimated cost')
        expect(projectStatsService.getSnapshot().controls.totalsMetric).toBe('cost')

        // Returning to a dataset keeps the values its controls carried before the switch.
        chooseOption('Dataset', 'Activity over time')
        expect(screen.getByRole('combobox', { name: 'Activity granularity' })).toHaveTextContent('Month')
    })

    it('keeps the entity filters multi-select, showing All when empty and a joined list otherwise', async () => {
        projectStatsService.setControls({ dataset: 'agentPerformance', performanceGrouping: 'agent', performanceMetric: 'duration' })
        await openStats('filters', activityStorage())
        renderTab()

        expect(screen.getByRole('combobox', { name: 'Action filter' })).toHaveTextContent('All')

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Action filter' }))
        fireEvent.click(screen.getByRole('option', { name: 'Review' }))

        expect(projectStatsService.getSnapshot().controls.performanceActionIds).toEqual(['review'])
        // The menu stays open for a second pick, which is what multi-select means here.
        expect(screen.getByRole('listbox')).toBeInTheDocument()

        fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })

        await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
        expect(screen.getByRole('combobox', { name: 'Action filter' })).toHaveTextContent('review')
    })

    it('changes the release filter and the token number format', async () => {
        await openStats('releases', activityStorage({ 'design/history/v1/card__card-1.json': JSON.stringify({
            actionSettings: {}, conversations: [storedConversation], origin, records: [agentRecord], version: 4,
        }) }))
        renderTab()

        expect(screen.getByRole('combobox', { name: 'Releases' })).toHaveTextContent('Current release')
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Releases' }))
        expect(screen.getAllByRole('option').map(({ textContent }) => textContent)).toEqual(['Current release', 'v1'])
        fireEvent.click(screen.getByRole('option', { name: 'v1' }))
        expect(projectStatsService.getSnapshot().controls.releaseIdentity).toBe(completedReleaseIdentity('v1'))

        expect(screen.getByRole('combobox', { name: 'Token number format' })).toHaveTextContent('Shortened (1.2K)')
        chooseOption('Token number format', 'Exact (1,234)')
        expect(projectStatsService.getSnapshot().controls.shortTokenCounts).toBe(false)
    })

    it('applies date range edits from the popover and keeps them across close and reopen', async () => {
        await openStats('range', activityStorage())
        renderTab()

        expect(screen.queryByLabelText('Range start local time')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Date range' }))

        const start = await screen.findByLabelText('Range start local time')
        fireEvent.change(start, { target: { value: '2026-08-12T00:00' } })

        const appliedStart = projectStatsService.getSnapshot().controls.startUtc
        expect(appliedStart).toBe(new Date('2026-08-12T00:00').toISOString())

        fireEvent.keyDown(screen.getByLabelText('Range end local time'), { key: 'Escape' })

        await waitFor(() => expect(screen.queryByLabelText('Range start local time')).toBeNull())
        expect(projectStatsService.getSnapshot().controls.startUtc).toBe(appliedStart)

        fireEvent.click(screen.getByRole('button', { name: 'Date range' }))

        expect(await screen.findByLabelText('Range start local time')).toHaveValue('2026-08-12T00:00')
    })

    it('exports the current rows and disables the export when no rows match', async () => {
        projectStatsService.setControls({ activityMetric: 'actions', dataset: 'activityOverTime' })
        await openStats('export', activityStorage())
        renderTab()

        expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
        expect(downloadStatsCsv).toHaveBeenCalledWith('activityOverTime', projectStatsService.getSnapshot().rows)

        act(() => projectStatsService.setControls({ startUtc: '2030-01-01T00:00:00.000Z' }))

        await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled())
    })

    it('shows the controls disabled while stats are loading, and reports nothing itself', async () => {
        const service = new ProjectStatsService()
        service.bindProject({
            config,
            project: { branch: 'main', id: 'loading' },
            storage: storage({ 'design/usage_metrics.csv': metricsHeader }),
        })
        const loaded = service.open([], BUILTIN_AGENT_PROFILES)
        renderTab(service)

        expect(screen.getByRole('combobox', { name: 'Dataset' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Date range' })).toBeDisabled()
        expect(screen.queryByRole('progressbar')).toBeNull()
        expect(screen.queryByRole('alert')).toBeNull()

        await act(async () => { await loaded })
        service.clear()
    })

    it('shows the controls disabled after a failed load without raising a dialog', async () => {
        const service = new ProjectStatsService()
        service.bindProject({ config, project: { branch: 'main', id: 'broken' }, storage: metricsStorage('broken') })
        await service.open([], BUILTIN_AGENT_PROFILES)
        renderTab(service)

        expect(service.getSnapshot().status).toBe('error')
        expect(screen.getByRole('combobox', { name: 'Dataset' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
        expect(screen.queryByLabelText('Error message')).toBeNull()

        service.clear()
    })
})
