import { useTheme } from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import type { StatsChartRow } from '../../services/stats/project_stats_types';
import { assignSeriesColorsFromKeys, seriesColorInputs, type StatsSeriesPalettes } from './stats_series_colors';
import { StatsSeriesColorsContext } from './stats_series_colors_context';

interface StatsSeriesColorProviderProps {
    children: ReactNode;
    rows: StatsChartRow[];
}

/** Allocates colors once across every chart in one stats view. */
export function StatsSeriesColorProvider({ children, rows }: StatsSeriesColorProviderProps) {
    const theme = useTheme();
    const palettes: StatsSeriesPalettes = { groups: theme.palette.custom.chartPalettes, neutral: theme.palette.custom.chartPalette };
    const inputsKey = JSON.stringify(seriesColorInputs(rows, Object.keys(palettes.groups)));
    const palettesKey = JSON.stringify(palettes);
    const colors = useMemo(() => assignSeriesColorsFromKeys(inputsKey, palettesKey), [inputsKey, palettesKey]);

    return <StatsSeriesColorsContext value={colors}>{children}</StatsSeriesColorsContext>;
}
