import {
    Alert, Box, Breadcrumbs, Button, CircularProgress, Menu, MenuItem, Paper, Tooltip, Typography,
} from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import type { MouseEvent } from 'react'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { actionsForContext, diagramContext } from '../../data/action_context'
import { dialogService } from '../../services/dialog_service'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { diagramViewService, type DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { useActions } from '../hooks/use_actions'
import { useWorkspaceView } from '../hooks/use_workspace_view'
import { ActionPopup } from '../actions/run/popup/action_popup'
import { MovableFab } from '../movable_fab'
import { DiagramRenderer } from './diagram_renderer'
import { DiagramLegend } from './diagram_legend'
import { DiagramComparison } from './diagram_comparison'
import { DiagramComparisonLayout } from './diagram_comparison_layout'
import {
    diagramComparisonLayoutService, type DiagramComparisonLayoutService,
} from './diagram_comparison_layout_service'
import type { DiagramSelection } from './diagram_selection'
import { TabbedDiagramComparison } from './tabbed_diagram_comparison'
import { VerticalDiagramComparison } from './vertical_diagram_comparison'

const ROOT_DIAGRAM_CONTEXT = diagramContext('root')

function reportNavigationFailure(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram navigation failed' })
}

interface DiagramViewProps {
    editSession?: DiagramEditSessionService
    geometry?: DiagramGeometryService
    layoutService?: DiagramComparisonLayoutService
    service?: DiagramViewService
}

/** Full workspace surface for navigating validated diagram data. */
export function DiagramView({
    editSession = diagramEditSessionService,
    geometry = diagramGeometryService,
    layoutService = diagramComparisonLayoutService,
    service = diagramViewService,
}: DiagramViewProps) {
    const { viewMode } = useWorkspaceView()
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
    const editSessionSnapshot = useSyncExternalStore(
        editSession.subscribeSession,
        editSession.getSessionSnapshot,
        editSession.getSessionSnapshot,
    )
    const { actions } = useActions()
    const rootActions = useMemo(() => actionsForContext(actions, ROOT_DIAGRAM_CONTEXT), [actions])
    const activeRecords = snapshot.index.activePath.map((id) => snapshot.index.diagrams[id])
    const selectedContext = useMemo(() => snapshot.menu
        ? diagramContext('child', snapshot.menu.diagramId, snapshot.menu.itemId, snapshot.menu.itemLabel)
        : null, [snapshot.menu])
    const childActions = useMemo(
        () => selectedContext ? actionsForContext(actions, selectedContext) : [],
        [actions, selectedContext],
    )
    const savedChildren = snapshot.menu
        ? service.getSavedChildren(snapshot.menu.diagramId, snapshot.menu.itemId)
        : []
    const rootDiagrams = snapshot.index.activePath.length === 0 ? service.getRootDiagrams() : []
    const diagramTitle = (record: DiagramRecord) => {
        const label = actions.find(({ id }) => id === record.actionId)?.label ?? record.label

        return record.createdAt ? `${label} - ${new Date(record.createdAt).toLocaleString()}` : label
    }

    useEffect(() => {
        if (viewMode !== 'diagrams') return
        void service.open().catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Diagram view could not be opened' })
        })
    }, [service, viewMode])

    const handleDiagramSelect = (anchorElement: HTMLElement, selection: DiagramSelection) => {
        const diagramId = snapshot.index.activePath.at(-1)
        if (!diagramId) return
        const { id: itemId, label: itemLabel, left, top } = selection
        service.openItemMenu({ anchorElement, diagramId, itemId, itemLabel, left, top })
    }

    const handleMenuClick = (event: MouseEvent<HTMLElement>) => {
        const item = (event.target as Element).closest<HTMLElement>('[data-diagram-menu-kind]')
        const kind = item?.dataset.diagramMenuKind
        const id = item?.dataset.diagramMenuId
        if (!kind || !id) return
        if (kind === 'action') {
            service.openChildPopup(id)
            return
        }
        void service.navigateToSavedDiagram(id).catch(reportNavigationFailure)
    }

    const handleBreadcrumbClick = (event: MouseEvent<HTMLElement>) => {
        const item = (event.target as Element).closest<HTMLElement>('[data-diagram-breadcrumb-index]')
        if (!item) return
        const index = Number(item.dataset.diagramBreadcrumbIndex)
        void service.navigateToCrumb(index).catch(reportNavigationFailure)
    }

    const handleBack = () => void service.navigateBack().catch(reportNavigationFailure)
    const handleRetry = () => void service.open().catch((error: unknown) => {
        dialogService.error(error, { fallbackMessage: 'Diagram view could not be opened' })
    })
    const handleRootDiagramClick = (event: MouseEvent<HTMLElement>) => {
        const item = (event.target as Element).closest<HTMLElement>('[data-diagram-root-id]')
        if (!item?.dataset.diagramRootId) return
        void service.navigateToSavedDiagram(item.dataset.diagramRootId).catch(reportNavigationFailure)
    }
    const handleCloseMenu = () => service.closeItemMenu()
    const handleClosePopup = () => service.closePopup()
    const handleFabActivate = (anchorElement: HTMLElement) => service.openRootPopup(anchorElement)
    const handleFabDragStart = () => service.closePopup()
    const handleCollapseLegend = () => service.collapseLegend()
    const handleExpandLegend = () => service.expandLegend()
    const handleMoveLegend = (position: { left: number, top: number }) => service.moveLegend(position)

    const content = snapshot.status === 'loading' ? (
        <Box sx={{ alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center' }}><CircularProgress aria-label="Loading diagrams" /></Box>
    ) : snapshot.status === 'error' ? (
        <Alert action={<Button color="inherit" onClick={handleRetry} size="small">Retry</Button>} severity="error">{snapshot.error}</Alert>
    ) : snapshot.index.activePath.length === 0 ? (
        <Paper
            elevation={0}
            onClick={handleRootDiagramClick}
            sx={{ alignItems: 'center', border: '1.5px dashed', borderColor: 'custom.borderStrong', borderRadius: '10px', display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 1 }}
        >
            <AccountTreeOutlined sx={{ color: 'custom.text4' }} />
            <Typography color="custom.text4" variant="body2">
                {rootDiagrams.length === 0 ? 'Run a diagram action to create the first diagram.' : 'Open a saved diagram to continue.'}
            </Typography>
            {rootDiagrams.map((record) => (
                <Button data-diagram-root-id={record.id} key={record.id} size="small" variant="text">{diagramTitle(record)}</Button>
            ))}
        </Paper>
    ) : snapshot.currentDiagramError ? (
        <Alert severity="warning">Diagram unavailable: {snapshot.currentDiagramError}</Alert>
    ) : (
        <Box aria-label="Active diagram" sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            <Box
                aria-label="Diagram scroller"
                sx={{ alignItems: 'flex-start', display: 'flex', height: '100%', justifyContent: 'flex-start', overflow: 'auto' }}
            >
                {snapshot.currentDiagram ? (
                    editSessionSnapshot ? (
                        <DiagramComparisonLayout
                            horizontalComparison={(
                                <DiagramComparison
                                    currentDiagram={snapshot.currentDiagram}
                                    geometry={geometry}
                                    layoutService={layoutService}
                                    onCurrentSelect={handleDiagramSelect}
                                    session={editSession}
                                />
                            )}
                            layoutService={layoutService}
                            tabbedComparison={(
                                <TabbedDiagramComparison
                                    currentDiagram={snapshot.currentDiagram}
                                    geometry={geometry}
                                    layoutService={layoutService}
                                    onCurrentSelect={handleDiagramSelect}
                                    session={editSession}
                                />
                            )}
                            verticalComparison={(
                                <VerticalDiagramComparison
                                    currentDiagram={snapshot.currentDiagram}
                                    geometry={geometry}
                                    layoutService={layoutService}
                                    onCurrentSelect={handleDiagramSelect}
                                    session={editSession}
                                />
                            )}
                        />
                    ) : <DiagramRenderer data={snapshot.currentDiagram} onSelect={handleDiagramSelect} />
                ) : null}
            </Box>
            {snapshot.currentDiagram ? (
                <DiagramLegend
                    collapsed={snapshot.legend.collapsed}
                    data={snapshot.currentDiagram}
                    onCollapse={handleCollapseLegend}
                    onExpand={handleExpandLegend}
                    onMove={handleMoveLegend}
                    position={snapshot.legend.position}
                />
            ) : null}
        </Box>
    )

    return (
        <Box
            aria-label="Diagram view"
            sx={{ bgcolor: 'background.default', display: viewMode === 'diagrams' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden', p: 2.5 }}
        >
            <Box sx={{ alignItems: 'center', display: 'flex', flexShrink: 0, gap: 1, mb: 2 }}>
                <Tooltip title="Back">
                    <span>
                        <Button
                            aria-label="Back"
                            disabled={snapshot.index.activePath.length <= 1}
                            onClick={handleBack}
                            startIcon={<ArrowBackOutlined />}
                            variant="outlined"
                        >
                            Back
                        </Button>
                    </span>
                </Tooltip>
                <Breadcrumbs aria-label="Diagram breadcrumb" onClick={handleBreadcrumbClick}>
                    {activeRecords.map((record, index) => (
                        <Button
                            data-diagram-breadcrumb-index={index}
                            disabled={index === activeRecords.length - 1}
                            key={record.id}
                            size="small"
                            variant="text"
                        >
                            {record.label}
                        </Button>
                    ))}
                </Breadcrumbs>
            </Box>
            {content}
            {snapshot.status === 'ready' ? (
                <MovableFab
                    ariaLabel="Diagram action"
                    disabled={rootActions.length === 0}
                    onActivate={handleFabActivate}
                    onDragStart={handleFabDragStart}
                    tooltip={rootActions.length === 0 ? 'No root diagram actions configured' : 'Diagram action'}
                >
                    <AccountTreeOutlined />
                </MovableFab>
            ) : null}
            <Menu
                anchorPosition={snapshot.menu ? { left: snapshot.menu.left, top: snapshot.menu.top } : undefined}
                anchorReference="anchorPosition"
                onClick={handleMenuClick}
                onClose={handleCloseMenu}
                open={!!snapshot.menu}
            >
                <Typography color="custom.text3" sx={{ px: 2, py: 0.75 }} variant="overline">Actions</Typography>
                {childActions.length > 0 ? childActions.map((action) => (
                    <MenuItem data-diagram-menu-id={action.id} data-diagram-menu-kind="action" key={action.id}>{action.label}</MenuItem>
                )) : <MenuItem disabled>No child actions</MenuItem>}
                <Typography color="custom.text3" sx={{ px: 2, py: 0.75 }} variant="overline">Saved diagrams</Typography>
                {savedChildren.length > 0 ? savedChildren.map((record) => (
                    <MenuItem data-diagram-menu-id={record.id} data-diagram-menu-kind="saved" key={record.id}>
                        {diagramTitle(record)}
                    </MenuItem>
                )) : <MenuItem disabled>No saved diagrams</MenuItem>}
            </Menu>
            {snapshot.popup ? (
                <ActionPopup
                    anchorElement={snapshot.popup.anchorElement}
                    context={snapshot.popup.context}
                    draggable
                    initialActionId={snapshot.popup.initialActionId}
                    onClose={handleClosePopup}
                />
            ) : null}
        </Box>
    )
}
