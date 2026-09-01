import {
    Alert, Box, Breadcrumbs, Button, CircularProgress, Fab, Menu, MenuItem, Paper, Tooltip, Typography,
} from '@mui/material'
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { actionsForContext, diagramContext } from '../../data/action_context'
import { dialogService } from '../../services/dialog_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { diagramViewService, type DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { useActions } from '../hooks/use_actions'
import { useWorkspaceView } from '../hooks/use_workspace_view'
import { ActionPopup } from '../actions/run/popup/action_popup'

function interactiveDiagramElement(target: EventTarget | null, container: HTMLElement) {
    if (!(target instanceof Element)) return null
    const element = target.closest('[data-diagram-id][data-diagram-label]')

    return element && container.contains(element) ? element : null
}

function reportNavigationFailure(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram navigation failed' })
}

interface DiagramViewProps {
    service?: DiagramViewService
}

/** Full workspace surface for navigating generated SVG diagrams. */
export function DiagramView({ service = diagramViewService }: DiagramViewProps) {
    const { viewMode } = useWorkspaceView()
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
    const { actions } = useActions()
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

    const openMenuForElement = (container: HTMLDivElement, element: Element, left: number, top: number) => {
        const diagramId = snapshot.index.activePath.at(-1)
        const itemId = element.getAttribute('data-diagram-id')?.trim()
        const itemLabel = element.getAttribute('data-diagram-label')?.trim()
        if (!diagramId || !itemId || !itemLabel) return
        service.openItemMenu({ anchorElement: container, diagramId, itemId, itemLabel, left, top })
    }

    const handleSvgClick = (event: MouseEvent<HTMLDivElement>) => {
        const element = interactiveDiagramElement(event.target, event.currentTarget)
        if (element) openMenuForElement(event.currentTarget, element, event.clientX, event.clientY)
    }

    const handleSvgKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        const element = interactiveDiagramElement(event.target, event.currentTarget)
        if (!element) return
        event.preventDefault()
        const bounds = element.getBoundingClientRect()
        openMenuForElement(event.currentTarget, element, bounds.left, bounds.bottom)
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
    const handleFabClick = (event: MouseEvent<HTMLButtonElement>) => service.openRootPopup(event.currentTarget)

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
    ) : snapshot.currentSvgError ? (
        <Alert severity="warning">Diagram unavailable: {snapshot.currentSvgError}</Alert>
    ) : (
        <Box
            aria-label="Active diagram"
            dangerouslySetInnerHTML={{ __html: snapshot.currentSvg ?? '' }}
            onClick={handleSvgClick}
            onKeyDown={handleSvgKeyDown}
            sx={{
                alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center', minHeight: 0, overflow: 'auto',
                '& > svg': { height: '100%', maxWidth: '100%', width: '100%' },
                '& [data-diagram-id]': { cursor: 'pointer' },
                '& [data-diagram-id]:focus': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
        />
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
                <Tooltip title="Diagram action">
                    <Fab
                        aria-label="Diagram action"
                        color="primary"
                        onClick={handleFabClick}
                        sx={{ bottom: 2, position: 'fixed', right: 2, zIndex: 'appBar' }}
                    >
                        <AccountTreeOutlined />
                    </Fab>
                </Tooltip>
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
                    initialActionId={snapshot.popup.initialActionId}
                    onClose={handleClosePopup}
                />
            ) : null}
        </Box>
    )
}
