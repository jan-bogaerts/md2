import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StatsChartRow } from '../../services/stats/project_stats_service';
import { AppThemeProvider } from '../../theme/theme_provider';
import { StatsBarChart } from './stats_bar_chart';
import { StatsUsageComparisonCharts } from './stats_usage_comparison_charts';

function row(overrides: Partial<StatsChartRow> = {}): StatsChartRow {
    return {
        actionId: null,
        actionType: null,
        accessibleLabel: '18 Aug; codex; 5 tokens; exact context',
        agent: null,
        available: true,
        chartRole: 'primary',
        displayLabel: '18 Aug',
        grouping: 'day',
        identity: 'codex',
        denominator: null,
        limitId: null,
        metric: 'tokens',
        numerator: null,
        provider: null,
        sampleCount: null,
        seriesIdentity: 'codex',
        seriesLabel: 'Codex',
        stackIdentity: null,
        stackLabel: null,
        statusCounts: null,
        tooltip: 'Local 18 Aug; UTC 2026-08-18T00:00:00.000Z to 2026-08-19T00:00:00.000Z; 5 tokens',
        unit: 'tokens',
        utcBucketEnd: '2026-08-19T00:00:00.000Z',
        utcBucketStart: '2026-08-18T00:00:00.000Z',
        value: 5,
        windowId: null,
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
        expect(screen.getByTestId('stats-bar')).toHaveStyle({ top: '130px' });
    });

    it('labels unavailable zero values without changing their numeric row value', () => {
        renderChart(<StatsBarChart rows={[row({ accessibleLabel: 'Account usage unavailable', available: false, value: 0 })]} />);

        expect(screen.getByText('Unavailable')).toBeInTheDocument();
        expect(screen.getByRole('listitem')).toHaveAccessibleName('Account usage unavailable');
        expect(screen.queryByTestId('stats-bar')).toBeNull();
    });

    it('keeps grouped bars inside one fixed bucket slot', () => {
        renderChart(<StatsBarChart mode="grouped" rows={[
            row({ identity: 'codex' }),
            row({ identity: 'claude', seriesIdentity: 'claude', seriesLabel: 'Claude' }),
        ]} />);

        expect(screen.getAllByTestId('stats-bucket')).toHaveLength(1);
        expect(screen.getByTestId('stats-bucket')).toHaveStyle({ flex: '0 0 112px', width: '112px' });
        expect(screen.getByTestId('stats-bar-slot')).toHaveStyle({ width: '72px' });
        expect(screen.getAllByTestId('stats-bar')).toHaveLength(2);
    });

    it('renders grouped stacks as one bar per agent with action segments', () => {
        const { container } = renderChart(<StatsBarChart mode="groupedStacked" rows={[
            row({ actionId: 'review', agent: 'codex', identity: 'codex-review', stackIdentity: 'agent:codex', stackLabel: 'codex' }),
            row({ actionId: 'test', agent: 'codex', identity: 'codex-test', seriesIdentity: 'test', seriesLabel: 'Test', stackIdentity: 'agent:codex', stackLabel: 'codex' }),
            row({ actionId: 'review', agent: 'claude', identity: 'claude-review', stackIdentity: 'agent:claude', stackLabel: 'claude' }),
        ]} />);

        expect(container.querySelectorAll('[data-stack-identity]')).toHaveLength(2);
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(screen.getByText('codex')).toBeInTheDocument();
        expect(screen.getByText('claude')).toBeInTheDocument();
    });

    it('renders five usage comparison charts in required order', () => {
        renderChart(<StatsUsageComparisonCharts rows={[
            row({ chartRole: 'accountUsage', unit: 'percentagePoints' }),
            row({ chartRole: 'projectTokens' }),
            row({ chartRole: 'tokensPerAccountUsage' }),
            row({ chartRole: 'actionsPerAccountUsage' }),
            row({ chartRole: 'activity' }),
        ]} />);

        expect(screen.getAllByRole('heading').map(({ textContent }) => textContent)).toEqual([
            'Account usage',
            'Project token usage',
            'Tokens per percent account usage',
            'Actions per percent account usage',
            'Project activity',
        ]);
        expect(screen.getByRole('list', { name: 'Project token usage chart' })).toHaveAttribute('data-chart-mode', 'grouped');
        expect(screen.getByRole('list', { name: 'Project activity chart' })).toHaveAttribute('data-chart-mode', 'groupedStacked');
        expect(screen.queryByTestId('stats-chart-viewport')).toBeNull();
    });
});
