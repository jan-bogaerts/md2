import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_CONFIG, type ProjectConfig, type StorageService } from '../../data/data_types'
import { projectStatsService } from '../../services/stats/project_stats_service'
import { AppThemeProvider } from '../../theme/theme_provider'
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

function storage(content: string): StorageService {
    return {
        checkoutBranch: vi.fn(), commit: vi.fn(), createProject: vi.fn(), deleteFile: vi.fn(), deleteFolder: vi.fn(),
        listBranches: vi.fn(), listRepositories: vi.fn(), listRepositoryFiles: vi.fn(async () => ['design/usage_metrics.csv']),
        listTopLevelFolders: vi.fn(), loadActionFiles: vi.fn(), loadProject: vi.fn(), loadProjectConfig: vi.fn(),
        loadProjectRoot: vi.fn(), loadTextFile: vi.fn(async () => ({ content, path: 'design/usage_metrics.csv' })),
        moveFiles: vi.fn(), push: vi.fn(), saveProjectConfig: vi.fn(),
    }
}

function renderContent() {
    return render(<AppThemeProvider><DialogDisplay /><StatsContent /></AppThemeProvider>)
}

describe('StatsContent', () => {
    afterEach(() => {
        cleanup()
        projectStatsService.clear()
    })

    it('shows controls, local bucket label, UTC accessibility text, and current chart values', async () => {
        const metrics = `${metricsHeader}\r\n2026-08-12T10:00:00.000Z,token_usage,codex,,,,,3,2,4,1,10,,\r\n`
        projectStatsService.setControls({
            activityMetric: 'tokens', dataset: 'activityOverTime', endUtc: null, granularity: 'day', startUtc: null,
            totalsGrouping: 'card', totalsMetric: 'duration',
        })
        projectStatsService.bindProject({ config, project: { branch: 'main', id: 'project' }, storage: storage(metrics) })
        await projectStatsService.open([])
        renderContent()

        expect(screen.getByRole('heading', { name: 'Project stats' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Dataset' })).toHaveTextContent('Activity over time')
        expect(screen.getByRole('listitem')).toHaveAccessibleName(/10 tokens.*UTC bucket boundary 2026-08-12T00:00:00.000Z/u)

        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Granularity' }))
        fireEvent.click(screen.getByRole('option', { name: 'Month' }))
        expect(projectStatsService.getSnapshot().controls.granularity).toBe('month')
    })

    it('renders and reports malformed-source errors without partial chart data', async () => {
        projectStatsService.bindProject({ config, project: { branch: 'main', id: 'project' }, storage: storage('broken') })
        await projectStatsService.open([])
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
            storage: storage(`${metricsHeader}\r\n${malformedAccountRow}\r\n${tokenRow}\r\n`),
        })
        await projectStatsService.open([])
        renderContent()

        expect(screen.getByRole('listitem')).toHaveAccessibleName(/10 tokens/u)
        expect(screen.getAllByText('Malformed account_usage row 2 was skipped.').length).toBeGreaterThan(0)
        await waitFor(() => expect(screen.getByLabelText('Error message')).toHaveTextContent('Malformed account_usage row 2 was skipped.'))
    })
})
