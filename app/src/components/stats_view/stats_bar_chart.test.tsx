import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatsChartRow } from '../../services/stats/project_stats_types';
import { createAppTheme } from '../../theme/app_theme';
import { AppThemeProvider } from '../../theme/theme_provider';
import { StatsBarChart } from './stats_bar_chart';
import { StatsUsageComparisonCharts } from './stats_usage_comparison_charts';

const CSS_COLOR_VALUE_COUNT = 0x1000000;

function row(overrides: Partial<StatsChartRow> = {}): StatsChartRow {
    return {
        actionId: null,
        actionType: null,
        accessibleLabel: '18 Aug; codex; 5 tokens; exact context',
        aggregation: null,
        agent: null,
        available: true,
        chartRole: 'primary',
        displayLabel: '18 Aug',
        grouping: 'day',
        identity: 'codex',
        denominator: null,
        deviation: null,
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

function seriesRows(count: number) {
    return Array.from({ length: count }, (_, index) => row({
        accessibleLabel: `Series ${index}`,
        identity: `series-${index}`,
        seriesIdentity: `series-${index}`,
        seriesLabel: `Series ${index}`,
        value: index + 1,
    }));
}

function renderedColors(elements: HTMLElement[]) {
    return elements.map((element) => getComputedStyle(element).backgroundColor);
}

describe('StatsBarChart', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('shows upper-left series legend, short date, value-only label, and complete accessible context', () => {
        renderChart(<StatsBarChart mode="grouped" rows={[row()]} />);

        expect(screen.getByLabelText('Stats bar chart legend')).toHaveTextContent('Codex');
        expect(screen.getByText('18 Aug')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByRole('listitem')).toHaveAccessibleName('18 Aug; codex; 5 tokens; exact context');
        expect(screen.getByLabelText('Stats bar chart legend')).toHaveStyle({ left: '0', position: 'sticky' });
        expect(screen.getByTestId('stats-chart-canvas')).toHaveStyle({ flex: '1' });
        expect(screen.getByTestId('stats-bar')).toHaveStyle({ height: 'calc(100% - 20px)' });
    });

    it('assigns every prepared palette color once before generating overflow colors', () => {
        const theme = createAppTheme('light');
        const palette = theme.palette.custom.chartPalette;
        const random = vi.spyOn(Math, 'random');

        render(<ThemeProvider theme={theme}><StatsBarChart mode="grouped" rows={seriesRows(palette.length)} /></ThemeProvider>);
        const bars = screen.getAllByTestId('stats-bar');
        const colors = renderedColors(bars);

        expect(new Set(colors).size).toBe(palette.length);
        palette.forEach((color, index) => expect(bars[index]).toHaveStyle({ backgroundColor: color }));
        expect(random).not.toHaveBeenCalled();
    });

    it('generates unique overflow colors after prepared colors run out', () => {
        const theme = createAppTheme('light');
        const palette = theme.palette.custom.chartPalette;
        const random = vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0.01)
            .mockReturnValueOnce(0.02);

        render(<ThemeProvider theme={theme}><StatsBarChart mode="grouped" rows={seriesRows(palette.length + 2)} /></ThemeProvider>);
        const bars = screen.getAllByTestId('stats-bar');
        const colors = renderedColors(bars);

        expect(new Set(colors).size).toBe(palette.length + 2);
        palette.forEach((color, index) => expect(bars[index]).toHaveStyle({ backgroundColor: color }));
        expect(random).toHaveBeenCalledTimes(2);
    });

    it('retries when a generated overflow color collides with an assigned color', () => {
        const theme = createAppTheme('light');
        const palette = theme.palette.custom.chartPalette;
        const firstPreparedColorValue = Number.parseInt(palette[0].slice(1), 16);
        const random = vi.spyOn(Math, 'random')
            .mockReturnValueOnce(firstPreparedColorValue / CSS_COLOR_VALUE_COUNT)
            .mockReturnValueOnce(0.01);

        render(<ThemeProvider theme={theme}><StatsBarChart mode="grouped" rows={seriesRows(palette.length + 1)} /></ThemeProvider>);
        const colors = renderedColors(screen.getAllByTestId('stats-bar'));

        expect(new Set(colors).size).toBe(palette.length + 1);
        expect(random).toHaveBeenCalledTimes(2);
    });

    it('uses one color for every legend and bar occurrence of a series identity', () => {
        renderChart(<StatsBarChart mode="grouped" rows={seriesRows(3)} />);
        const bars = screen.getAllByTestId('stats-bar');
        const swatches = screen.getAllByTestId('stats-legend-swatch');

        for (const bar of bars) {
            const swatch = swatches.find(({ dataset }) => dataset.seriesIdentity === bar.dataset.seriesIdentity);

            expect(swatch).toBeDefined();
            expect(getComputedStyle(bar).backgroundColor).toBe(getComputedStyle(swatch!).backgroundColor);
        }
    });

    it('keeps overflow colors stable across value-only rerenders', () => {
        const theme = createAppTheme('light');
        const initialRows = seriesRows(theme.palette.custom.chartPalette.length + 1);
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.01);
        const view = render(
            <ThemeProvider theme={theme}><StatsBarChart mode="grouped" rows={initialRows} /></ThemeProvider>,
        );
        const initialColors = renderedColors(screen.getAllByTestId('stats-bar'));

        view.rerender(
            <ThemeProvider theme={theme}>
                <StatsBarChart mode="grouped" rows={initialRows.map((currentRow) => ({ ...currentRow, value: currentRow.value * 2 }))} />
            </ThemeProvider>,
        );

        expect(renderedColors(screen.getAllByTestId('stats-bar'))).toEqual(initialColors);
        expect(random).toHaveBeenCalledTimes(1);
    });

    it('rebuilds prepared and overflow colors when theme palette changes', () => {
        const lightTheme = createAppTheme('light');
        const darkTheme = createAppTheme('dark');
        const rows = seriesRows(lightTheme.palette.custom.chartPalette.length + 1);
        const random = vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0.01)
            .mockReturnValueOnce(0.02);
        const view = render(<ThemeProvider theme={lightTheme}><StatsBarChart mode="grouped" rows={rows} /></ThemeProvider>);
        const lightColors = renderedColors(screen.getAllByTestId('stats-bar'));

        view.rerender(<ThemeProvider theme={darkTheme}><StatsBarChart mode="grouped" rows={rows} /></ThemeProvider>);
        const darkColors = renderedColors(screen.getAllByTestId('stats-bar'));

        expect(darkColors[0]).not.toBe(lightColors[0]);
        expect(darkColors.at(-1)).not.toBe(lightColors.at(-1));
        expect(random).toHaveBeenCalledTimes(2);
    });

    it('allocates overflow colors independently between chart instances', () => {
        const theme = createAppTheme('light');
        const rows = seriesRows(theme.palette.custom.chartPalette.length + 1);
        const random = vi.spyOn(Math, 'random').mockReturnValue(0.01);

        render(
            <ThemeProvider theme={theme}>
                <StatsBarChart ariaLabel="First chart" mode="grouped" rows={rows} />
                <StatsBarChart ariaLabel="Second chart" mode="grouped" rows={rows} />
            </ThemeProvider>,
        );
        const firstColors = renderedColors(within(screen.getByRole('list', { name: 'First chart' })).getAllByTestId('stats-bar'));
        const secondColors = renderedColors(within(screen.getByRole('list', { name: 'Second chart' })).getAllByTestId('stats-bar'));

        expect(firstColors).toEqual(secondColors);
        expect(random).toHaveBeenCalledTimes(2);
    });

    it('positions corrections against a zero baseline', () => {
        renderChart(<StatsBarChart rows={[row({ unit: 'percent', value: -2 })]} />);

        expect(screen.getByLabelText('Zero baseline')).toBeInTheDocument();
        expect(screen.getByText('-2%')).toBeInTheDocument();
        expect(screen.getByTestId('stats-bar')).toHaveStyle({ top: '50%' });
    });

    it('labels account usage as percent instead of percentage points', () => {
        renderChart(<StatsBarChart rows={[row({ unit: 'percent', value: 27.88 })]} />);

        expect(screen.getByText(/27[,.]88%/u)).toBeInTheDocument();
        expect(screen.queryByText(/pp/u)).toBeNull();
    });

    it('labels unavailable zero values without changing their numeric row value', () => {
        renderChart(<StatsBarChart rows={[row({ accessibleLabel: 'Account usage unavailable', available: false, value: 0 })]} />);

        expect(screen.getByText('Unavailable')).toBeInTheDocument();
        expect(screen.getByRole('listitem')).toHaveAccessibleName('Account usage unavailable');
        expect(screen.queryByTestId('stats-bar')).toBeNull();
    });

    it('formats cost values as USD', () => {
        renderChart(<StatsBarChart rows={[row({ unit: 'dollars', value: 1.25 })]} />);

        expect(screen.getByText(new Intl.NumberFormat(undefined, { currency: 'USD', style: 'currency' }).format(1.25)))
            .toBeInTheDocument();
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

    it('centres value labels beyond bar width without intercepting pointer events', () => {
        renderChart(<StatsBarChart mode="grouped" rows={[row({ value: 123_456 })]} />);
        const formattedNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(123_456);

        expect(screen.getByText(formattedNumber)).toHaveStyle({
            left: '50%',
            maxWidth: '112px',
            pointerEvents: 'none',
            transform: 'translateX(-50%)',
            width: 'max-content',
        });
    });

    it('renders a deviation whisker and scales its upper cap into the chart domain', () => {
        renderChart(<StatsBarChart rows={[row({ deviation: 5, value: 10 })]} />);

        expect(screen.getByTestId('stats-deviation-whisker')).toHaveStyle({ pointerEvents: 'none', top: 'calc(0% + 20px)' });
        expect(screen.getByTestId('stats-bar')).toHaveStyle({ height: 'calc(66.66666666666666% - 13.333333333333332px)' });
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
        expect(screen.getByText('10')).toHaveStyle({
            left: '50%',
            maxWidth: '112px',
            pointerEvents: 'none',
            transform: 'translateX(-50%)',
            width: 'max-content',
        });
    });

    it('shows each stacked action tooltip with its action value', async () => {
        renderChart(<StatsBarChart mode="stacked" rows={[
            row({ identity: 'implement', tooltip: '1 Aug\nAction: Implement\nValue: 5', value: 5 }),
            row({ identity: 'review', seriesIdentity: 'review', seriesLabel: 'Review', tooltip: '1 Aug; Review: 3', value: 3 }),
        ]} />);
        const bars = screen.getAllByTestId('stats-bar');

        fireEvent.mouseOver(bars[0]);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Action: Implement');
        fireEvent.mouseLeave(bars[0]);
        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
        fireEvent.mouseOver(bars[1]);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Review: 3');
    });

    it('renders six usage comparison charts in required order', () => {
        renderChart(<StatsUsageComparisonCharts tokenAggregation="total" rows={[
            row({ chartRole: 'accountUsage', unit: 'percent' }),
            row({ chartRole: 'projectTokens' }),
            row({ chartRole: 'tokensPerAccountUsage' }),
            row({ chartRole: 'tokensPerDollar', unit: 'tokensPerDollar' }),
            row({ chartRole: 'actionsPerAccountUsage' }),
            row({ chartRole: 'activity' }),
        ]} />);

        expect(screen.getAllByRole('heading').map(({ textContent }) => textContent)).toEqual([
            'Account usage',
            'Project token usage (totals)',
            'Tokens per percent account usage',
            'Tokens per dollar',
            'Actions per percent account usage',
            'Project activity',
        ]);
        expect(screen.getByRole('list', { name: 'Project token usage (totals) chart' })).toHaveAttribute('data-chart-mode', 'grouped');
        expect(screen.getByRole('list', { name: 'Project activity chart' })).toHaveAttribute('data-chart-mode', 'groupedStacked');
        expect(screen.getByRole('heading', { name: 'Account usage' })).toHaveStyle({ left: '0', position: 'sticky' });
        expect(screen.queryByTestId('stats-chart-viewport')).toBeNull();
    });
});
