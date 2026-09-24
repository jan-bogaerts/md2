import { Box, useMediaQuery, useTheme } from '@mui/material'
import { useSyncExternalStore, type ReactNode } from 'react'
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
    const comparisonByMode: Record<DiagramComparisonMode, ReactNode> = {
        horizontal: horizontalComparison,
        tabbed: tabbedComparison,
        vertical: verticalComparison,
    }
    const renderedMode = isMobile ? 'tabbed' : comparisonMode

    return (
        <Box aria-label="Selected diagram comparison" sx={{ display: 'flex', flex: 1, height: '100%', minHeight: 0, minWidth: 0, overflow: 'auto' }}>
            {comparisonByMode[renderedMode]}
        </Box>
    )
}
