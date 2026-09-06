import { Box, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useSyncExternalStore, type ReactNode, type SyntheticEvent } from 'react'
import {
    diagramComparisonLayoutService, type DiagramComparisonLayoutService, type DiagramComparisonMode,
} from './diagram_comparison_layout_service'

interface DiagramComparisonLayoutProps {
    horizontalComparison: ReactNode
    layoutService?: DiagramComparisonLayoutService
    tabbedComparison: ReactNode
    verticalComparison: ReactNode
}

/** Selects one stable comparison layout without observing diagram or edit-session state. */
export function DiagramComparisonLayout({
    horizontalComparison,
    layoutService = diagramComparisonLayoutService,
    tabbedComparison,
    verticalComparison,
}: DiagramComparisonLayoutProps) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const comparisonMode = useSyncExternalStore(
        layoutService.subscribeComparisonMode,
        layoutService.getComparisonModeSnapshot,
        layoutService.getComparisonModeSnapshot,
    )
    const handleModeChange = useCallback((_event: SyntheticEvent, mode: DiagramComparisonMode | null) => {
        if (!mode) return

        layoutService.setComparisonMode(mode)
    }, [layoutService])
    const comparisonByMode: Record<DiagramComparisonMode, ReactNode> = {
        horizontal: horizontalComparison,
        tabbed: tabbedComparison,
        vertical: verticalComparison,
    }
    const renderedMode = isMobile ? 'tabbed' : comparisonMode

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
            <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 1, minWidth: 0, pb: 1 }}>
                <Typography color="text.secondary" sx={{ flexShrink: 0 }} variant="body2">Layout</Typography>
                <ToggleButtonGroup
                    aria-label="Diagram comparison layout"
                    exclusive
                    onChange={handleModeChange}
                    size="small"
                    sx={{
                        bgcolor: 'custom.track',
                        borderRadius: 1,
                        display: 'flex',
                        flex: 1,
                        minWidth: 0,
                        p: 0.375,
                        '& .MuiToggleButtonGroup-grouped': {
                            border: 0,
                            borderRadius: '6px !important',
                            flex: 1,
                            minWidth: 0,
                            px: 1,
                        },
                        '& .Mui-selected': { bgcolor: 'background.paper', color: 'primary.main' },
                    }}
                    value={renderedMode}
                >
                    <ToggleButton disabled={isMobile} value="vertical">Vertical</ToggleButton>
                    <ToggleButton disabled={isMobile} value="horizontal">Horizontal</ToggleButton>
                    <ToggleButton value="tabbed">Tabbed</ToggleButton>
                </ToggleButtonGroup>
            </Box>
            <Box aria-label="Selected diagram comparison" sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}>
                {comparisonByMode[renderedMode]}
            </Box>
        </Box>
    )
}
