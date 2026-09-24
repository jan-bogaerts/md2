import { ToggleButton, ToggleButtonGroup, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined';
import ViewStreamOutlined from '@mui/icons-material/ViewStreamOutlined';
import TabOutlined from '@mui/icons-material/TabOutlined';
import { useCallback, useSyncExternalStore, type ReactNode, type SyntheticEvent } from 'react';
import {
    diagramComparisonLayoutService,
    type DiagramComparisonLayoutService,
    type DiagramComparisonMode,
} from './diagram_comparison_layout_service';

const MODE_ICONS: Record<DiagramComparisonMode, ReactNode> = {
    horizontal: <ViewStreamOutlined fontSize="small" />,
    tabbed: <TabOutlined fontSize="small" />,
    vertical: <ViewColumnOutlined fontSize="small" />,
};
const MODES: readonly { label: string, value: DiagramComparisonMode }[] = [
    { label: 'Vertical', value: 'vertical' },
    { label: 'Horizontal', value: 'horizontal' },
    { label: 'Tabbed', value: 'tabbed' },
];

/** Comparison-layout selector bound only to layout service state. */
export function DiagramComparisonMenuControl({ layoutService = diagramComparisonLayoutService }: {
    layoutService?: DiagramComparisonLayoutService;
}) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const comparisonMode = useSyncExternalStore(
        layoutService.subscribeComparisonMode,
        layoutService.getComparisonModeSnapshot,
        layoutService.getComparisonModeSnapshot,
    );
    const renderedMode = isMobile ? 'tabbed' : comparisonMode;
    const handleChange = useCallback((_event: SyntheticEvent, mode: DiagramComparisonMode | null) => {
        if (mode) layoutService.setComparisonMode(mode);
    }, [layoutService]);

    return (
        <ToggleButtonGroup aria-label="Diagram comparison layout" exclusive onChange={handleChange} size="small" value={renderedMode}>
            {MODES.map(({ label, value }) => (
                <Tooltip key={value} title={`${label} comparison`}>
                    <span>
                        <ToggleButton aria-label={label} disabled={isMobile && value !== 'tabbed'} sx={{ height: 34, width: 34 }} value={value}>
                            {MODE_ICONS[value]}
                        </ToggleButton>
                    </span>
                </Tooltip>
            ))}
        </ToggleButtonGroup>
    );
}
