import {
    Alert, Box, Button, CircularProgress, Paper, Typography,
} from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import type { MouseEvent } from 'react'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { actionsForContext, diagramContext } from '../../data/action_context'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { diagramViewService, type DiagramViewService } from '../../services/diagrams/diagram_view_service'
import {
    diagramEmphasisService, type DiagramEmphasisService,
} from '../../services/diagrams/diagram_emphasis_service'
import { useActions } from '../hooks/use_actions'
import { useWorkspaceView } from '../hooks/use_workspace_view'
import { DiagramActionPopup } from './diagram_action_popup'
import { DiagramAgentFab } from './diagram_agent_fab'
import { DiagramLegend } from './diagram_legend'
import { DiagramItemMenu } from './diagram_item_menu'
import { DiagramComparison } from './diagram_comparison'
import { DiagramComparisonLayout } from './diagram_comparison_layout'
import {
    diagramComparisonLayoutService, type DiagramComparisonLayoutService,
} from './diagram_comparison_layout_service'
import type { DiagramSelection } from './diagram_selection'
import { TabbedDiagramComparison } from './tabbed_diagram_comparison'
import { VerticalDiagramComparison } from './vertical_diagram_comparison'
import { DiagramCurrentViewport } from './diagram_current_viewport'
import { DiagramNewPane } from './diagram_new_pane'
import { DiagramBreadcrumbBar } from './diagram_breadcrumb_bar'

const ROOT_DIAGRAM_CONTEXT = diagramContext('root')

function reportNavigationFailure(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram navigation failed' })
}

interface DiagramViewProps {
    editSession?: DiagramEditSessionService
    emphasis?: DiagramEmphasisService
    geometry?: DiagramGeometryService
    layoutService?: DiagramComparisonLayoutService
    selection?: DiagramSelectionService
    service?: DiagramViewService
}

/** Full workspace surface for navigating validated diagram data. */
export function DiagramView({
    editSession = diagramEditSessionService,
    emphasis = diagramEmphasisService,
    geometry = diagramGeometryService,
    layoutService = diagramComparisonLayoutService,
    selection = diagramSelectionService,
    service = diagramViewService,
}: DiagramViewProps) {
    const { viewMode } = useWorkspaceView()
    const currentDiagram = useSyncExternalStore(
        service.subscribeCurrentDiagram,
        service.getCurrentDiagramSnapshot,
        service.getCurrentDiagramSnapshot,
    )
    const currentDiagramError = useSyncExternalStore(
        service.subscribeCurrentDiagramError,
        service.getCurrentDiagramErrorSnapshot,
        service.getCurrentDiagramErrorSnapshot,
    )
    const error = useSyncExternalStore(service.subscribeError, service.getErrorSnapshot, service.getErrorSnapshot)
    const index = useSyncExternalStore(service.subscribeIndex, service.getIndexSnapshot, service.getIndexSnapshot)
    const status = useSyncExternalStore(service.subscribeStatus, service.getStatusSnapshot, service.getStatusSnapshot)
    const editSessionSnapshot = useSyncExternalStore(
        editSession.subscribeSession,
        editSession.getSessionSnapshot,
        editSession.getSessionSnapshot,
    )
    const { actions } = useActions()
    const rootActions = useMemo(() => actionsForContext(actions, ROOT_DIAGRAM_CONTEXT), [actions])
    const rootActionIds = useMemo(() => rootActions.map(({ id }) => id), [rootActions])
    const rootDiagrams = index.activePath.length === 0 ? service.getRootDiagrams() : []
    const diagramTitle = (record: DiagramRecord) => {
        const label = actions.find(({ id }) => id === record.actionId)?.label ?? record.label

        return record.createdAt ? `${label} - ${new Date(record.createdAt).toLocaleString()}` : label
    }

    useEffect(() => {
        if (viewMode !== 'diagrams') return
        emphasis.start()
        void service.open().catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Diagram view could not be opened' })
        })
        void dataService.listAgentConversations(ROOT_DIAGRAM_CONTEXT).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not load diagram agent conversations' })
        })
    }, [emphasis, service, viewMode])

    const handleDiagramSelect = (_anchorElement: HTMLElement, selection: DiagramSelection) => {
        const diagramId = index.activePath.at(-1)
        if (!diagramId) return
        const { id: itemId, label: itemLabel, objectKind } = selection
        service.selectCurrentObject({ activeDiagramId: diagramId, itemId, itemLabel, objectKind })
        emphasis.moveTargetIfActive({ diagramId, objectId: itemId, objectKind, surface: 'current' })
    }

    const handleDiagramContextMenu = (anchorElement: HTMLElement, selection: DiagramSelection) => {
        const diagramId = index.activePath.at(-1)
        if (!diagramId) return
        const { id: itemId, label: itemLabel, left, objectKind, top } = selection
        service.openItemMenu({ anchorElement, diagramId, itemId, itemLabel, left, objectKind, surface: 'current', top })
    }

    const handleRetry = () => void service.open().catch((error: unknown) => {
        dialogService.error(error, { fallbackMessage: 'Diagram view could not be opened' })
    })
    const handleRootDiagramClick = (event: MouseEvent<HTMLElement>) => {
        const item = (event.target as Element).closest<HTMLElement>('[data-diagram-root-id]')
        if (!item?.dataset.diagramRootId) return
        void service.navigateToSavedDiagram(item.dataset.diagramRootId).catch(reportNavigationFailure)
    }
    const content = status === 'loading' ? (
        <Box sx={{ alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center' }}><CircularProgress aria-label="Loading diagrams" /></Box>
    ) : status === 'error' ? (
        <Alert action={<Button color="inherit" onClick={handleRetry} size="small">Retry</Button>} severity="error">{error}</Alert>
    ) : index.activePath.length === 0 ? (
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
    ) : currentDiagramError ? (
        <Alert severity="warning">Diagram unavailable: {currentDiagramError}</Alert>
    ) : (
        <Box aria-label="Active diagram" sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            <Box aria-label="Diagram content" sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                {currentDiagram ? (
                    editSessionSnapshot?.creationSourceDiagramId ? (
                        <DiagramNewPane
                            emphasis={emphasis}
                            geometry={geometry}
                            selection={selection}
                            session={editSession}
                            viewService={service}
                        />
                    ) : editSessionSnapshot ? (
                        <DiagramComparisonLayout
                            horizontalComparison={(
                                <DiagramComparison
                                    currentDiagram={currentDiagram}
                                    emphasis={emphasis}
                                    geometry={geometry}
                                    layoutService={layoutService}
                                    onCurrentContextMenu={handleDiagramContextMenu}
                                    onCurrentSelect={handleDiagramSelect}
                                    selection={selection}
                                    session={editSession}
                                    viewService={service}
                                />
                            )}
                            layoutService={layoutService}
                            tabbedComparison={(
                                <TabbedDiagramComparison
                                    currentDiagram={currentDiagram}
                                    emphasis={emphasis}
                                    geometry={geometry}
                                    layoutService={layoutService}
                                    onCurrentContextMenu={handleDiagramContextMenu}
                                    onCurrentSelect={handleDiagramSelect}
                                    selection={selection}
                                    session={editSession}
                                    viewService={service}
                                />
                            )}
                            verticalComparison={(
                                <VerticalDiagramComparison
                                    currentDiagram={currentDiagram}
                                    emphasis={emphasis}
                                    geometry={geometry}
                                    layoutService={layoutService}
                                    onCurrentContextMenu={handleDiagramContextMenu}
                                    onCurrentSelect={handleDiagramSelect}
                                    selection={selection}
                                    session={editSession}
                                    viewService={service}
                                />
                            )}
                        />
                    ) : (
                        <DiagramCurrentViewport
                            data={currentDiagram}
                            emphasis={emphasis}
                            onContextMenu={handleDiagramContextMenu}
                            onSelect={handleDiagramSelect}
                            service={service}
                        />
                    )
                ) : null}
            </Box>
            {currentDiagram ? (
                <DiagramLegend
                    data={currentDiagram}
                    creationSession={!!editSessionSnapshot?.creationSourceDiagramId}
                    service={service}
                    session={editSessionSnapshot ? editSession : null}
                />
            ) : null}
            <DiagramBreadcrumbBar service={service} />
        </Box>
    )

    return (
        <Box
            aria-label="Diagram view"
            sx={{ bgcolor: 'background.default', display: viewMode === 'diagrams' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
        >
            {content}
            {status === 'ready' ? (
                <DiagramAgentFab rootActionIds={rootActionIds} service={service} />
            ) : null}
            <DiagramItemMenu emphasis={emphasis} service={service} />
            <DiagramActionPopup service={service} visible={viewMode === 'diagrams'} />
        </Box>
    )
}
