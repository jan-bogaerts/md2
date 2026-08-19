import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StatsChartRow } from '../../services/stats/project_stats_service';
import { AppThemeProvider } from '../../theme/theme_provider';
import { StatsBarChart } from './stats_bar_chart';
import { StatsUsageComparisonCharts } from './stats_usage_comparison_charts';

function row(overrides: Partial<StatsChartRow> = {}): StatsChartRow {
    return {
        accessibleLabel: '18 Aug; codex; 5 tokens; exact context',
        available: true,
        chartRole: 'primary',
        displayLabel: '18 Aug',
        grouping: 'day',
        identity: 'codex',
        metric: 'tokens',
        sampleCount: null,
        seriesIdentity: 'codex',
        seriesLabel: 'Codex',
        stackIdentity: null,
        statusCounts: null,
        tooltip: 'Local 18 Aug; UTC 2026-08-18T00:00:00.000Z to 2026-08-19T00:00:00.000Z; 5 tokens',
        unit: 'tokens',
        utcBucketEnd: '2026-08-19T00:00:00.000Z',
        utcBucketStart: '2026-08-18T00:00:00.000Z',
        value: 5,
        ...overrides,
    };
}

function renderChart(component: React.ReactNode) {
    return render(<AppThemeProvider>{component}</AppThemeProvider>);
}

describe('StatsBarChart', () => {
    afterEach(cleanup);

    it('shows upper-left series legend, short date, value-only label, and complete accessible context', () => {
        renderChart(<StatsBarChart mode="grouped" rows={[row()]} />);

        expect(screen.getByLabelText('Stats bar chart legend')).toHaveTextContent('Codex');
        expect(screen.getByText('18 Aug')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByRole('listitem')).toHaveAccessibleName('18 Aug; codex; 5 tokens; exact context');
    });

    it('positions corrections against a zero baseline', () => {
        renderChart(<StatsBarChart rows={[row({ unit: 'percentagePoints', value: -2 })]} />);

        expect(screen.getByLabelText('Zero baseline')).toBeInTheDocument();
        expect(screen.getByText('-2 pp')).toBeInTheDocument();
        expect(screen.getByRole('listitem').firstElementChild).toHaveStyle({ top: '130px' });
    });

    it('labels unavailable zero values without changing their numeric row value', () => {
        renderChart(<StatsBarChart rows={[row({ accessibleLabel: 'Account usage unavailable', available: false, value: 0 })]} />);

        expect(screen.getByText('Unavailable')).toBeInTheDocument();
        expect(screen.getByRole('listitem')).toHaveAccessibleName('Account usage unavailable');
    });

    it('renders three separately named usage comparison charts', () => {
        renderChart(<StatsUsageComparisonCharts rows={[
            row({ chartRole: 'activity' }),
            row({ chartRole: 'projectTokens' }),
            row({ chartRole: 'accountUsage', unit: 'percentagePoints' }),
        ]} />);

        expect(screen.getByRole('heading', { name: 'Project activity' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Project token usage' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Account usage' })).toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Project token usage chart' })).toHaveAttribute('data-chart-mode', 'grouped');
        expect(screen.queryByTestId('stats-chart-viewport')).toBeNull();
    });
});
