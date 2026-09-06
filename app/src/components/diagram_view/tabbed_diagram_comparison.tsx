import { Box, Paper, Tab, Tabs, Typography } from '@mui/material'
import { memo, useCallback, useId, useSyncExternalStore, type SyntheticEvent } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { diagramMoveService, type DiagramMoveService } from '../../services/diagrams/diagram_move_service'
import { diagramResizeService, type DiagramResizeService } from '../../services/diagrams/diagram_resize_service'
import {
    diagramEdgeDrawingService, type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service'
import {
    diagramGroupDrawingService, type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service'
import {
    diagramNodePlacementService, type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import {
    diagramComparisonLayoutService, type DiagramComparisonLayoutService, type DiagramComparisonTab,
} from './diagram_comparison_layout_service'
import { DiagramRenderer } from './diagram_renderer'
import type { DiagramSelection } from './diagram_selection'
import { DiagramNewPane } from './diagram_new_pane'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

interface TabbedDiagramComparisonProps {
    currentDiagram: PositionedDiagramData
    details?: DiagramObjectDetailsService
    drawing?: DiagramEdgeDrawingService
    geometry?: DiagramGeometryService
    groupDrawing?: DiagramGroupDrawingService
    layoutService?: DiagramComparisonLayoutService
    movement?: DiagramMoveService
    onCurrentSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    placement?: DiagramNodePlacementService
    resize?: DiagramResizeService
    review?: DiagramChangeReviewService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

const CurrentDiagram = memo(DiagramRenderer)

/** Accessible tab layout that keeps both diagram surfaces mounted and their view state intact. */
export function TabbedDiagramComparison({
    currentDiagram,
    details = diagramObjectDetailsService,
    drawing = diagramEdgeDrawingService,
    geometry = diagramGeometryService,
    groupDrawing = diagramGroupDrawingService,
    layoutService = diagramComparisonLayoutService,
    movement = diagramMoveService,
    onCurrentSelect,
    placement = diagramNodePlacementService,
    resize = diagramResizeService,
    review = diagramChangeReviewService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: TabbedDiagramComparisonProps) {
    const comparisonId = useId()
    const activeTab = useSyncExternalStore(
        layoutService.subscribeActiveTab,
        layoutService.getActiveTabSnapshot,
        layoutService.getActiveTabSnapshot,
    )
    const handleTabChange = useCallback((_event: SyntheticEvent, tab: DiagramComparisonTab) => {
        layoutService.setActiveTab(tab)
    }, [layoutService])
    const currentTabId = `${comparisonId}-current-tab`
    const currentPanelId = `${comparisonId}-current-panel`
    const newTabId = `${comparisonId}-new-tab`
    const newPanelId = `${comparisonId}-new-panel`

    return (
        <Box
            aria-label="Tabbed diagram comparison"
            sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}
        >
            <Tabs
                aria-label="Diagram comparison"
                onChange={handleTabChange}
                sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    flexShrink: 0,
                    minHeight: 40,
                    '& .MuiTabs-indicator': { height: 2 },
                    '& .MuiTab-root': { color: 'text.secondary', minHeight: 40, py: 0, textTransform: 'none' },
                    '& .MuiTab-root.Mui-selected': { color: 'primary.main' },
                }}
                value={activeTab}
            >
                <Tab aria-controls={currentPanelId} id={currentTabId} label="Current" value="current" />
                <Tab aria-controls={newPanelId} id={newTabId} label="New" value="new" />
            </Tabs>
            <Paper
                aria-labelledby={currentTabId}
                elevation={0}
                hidden={activeTab !== 'current'}
                id={currentPanelId}
                role="tabpanel"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}
            >
                <Typography color="custom.colHead" sx={{ mb: 1 }} variant="overline">Current</Typography>
                <CurrentDiagram data={currentDiagram} onSelect={onCurrentSelect} />
            </Paper>
            <Paper
                aria-labelledby={newTabId}
                elevation={0}
                hidden={activeTab !== 'new'}
                id={newPanelId}
                role="tabpanel"
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
            >
                <Typography color="custom.colHead" sx={{ flexShrink: 0, px: 2, pt: 2 }} variant="overline">New</Typography>
                <DiagramNewPane
                    details={details}
                    drawing={drawing}
                    geometry={geometry}
                    groupDrawing={groupDrawing}
                    movement={movement}
                    placement={placement}
                    resize={resize}
                    review={review}
                    selection={selection}
                    session={session}
                    toolboxVisible={activeTab === 'new'}
                />
            </Paper>
        </Box>
    )
}
