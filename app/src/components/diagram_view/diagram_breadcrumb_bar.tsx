import AddOutlined from '@mui/icons-material/AddOutlined';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import { Box, Breadcrumbs, Button, IconButton, Menu, MenuItem, Tooltip } from '@mui/material';
import type { MouseEvent } from 'react';
import { useMemo, useSyncExternalStore } from 'react';
import { actionsForContext, diagramContext } from '../../data/action_context';
import { dialogService } from '../../services/dialog_service';
import type { DiagramRecord } from '../../services/diagrams/diagram_index';
import type { DiagramViewService } from '../../services/diagrams/diagram_view_service';
import { useActions } from '../hooks/use_actions';

const ROOT_DIAGRAM_CONTEXT = diagramContext('root');

function reportFailure(error: unknown, fallbackMessage: string) {
    dialogService.error(error, { fallbackMessage });
}

function diagramTitle(record: DiagramRecord, actions: ReturnType<typeof useActions>['actions']) {
    const label = actions.find(({ id }) => id === record.actionId)?.label ?? record.label;

    return record.createdAt ? `${label} - ${new Date(record.createdAt).toLocaleString()}` : label;
}

interface DiagramBreadcrumbBarProps {
    service: DiagramViewService;
}

/** Overlay navigation and action controls for active diagram path. */
export function DiagramBreadcrumbBar({ service }: DiagramBreadcrumbBarProps) {
    const index = useSyncExternalStore(service.subscribeIndex, service.getIndexSnapshot, service.getIndexSnapshot);
    const rootMenu = useSyncExternalStore(
        service.subscribeRootMenu,
        service.getRootMenuSnapshot,
        service.getRootMenuSnapshot,
    );
    const selectedItem = useSyncExternalStore(
        service.subscribeCurrentSelectedItem,
        service.getCurrentSelectedItemSnapshot,
        service.getCurrentSelectedItemSnapshot,
    );
    const { actions } = useActions();
    const rootActions = useMemo(() => actionsForContext(actions, ROOT_DIAGRAM_CONTEXT), [actions]);
    const activeRecords = index.activePath.map((id) => index.diagrams[id]);
    const rootDiagrams = service.getRootDiagrams();

    const handleBack = () => {
        void service.navigateBack().catch((error: unknown) => reportFailure(error, 'Diagram navigation failed'));
    };
    const handleRootCrumb = (event: MouseEvent<HTMLButtonElement>) => service.openRootMenu(event.currentTarget);
    const handleCrumbClick = (event: MouseEvent<HTMLElement>) => {
        const item = (event.target as Element).closest<HTMLElement>('[data-diagram-breadcrumb-index]');
        if (!item) return;
        const breadcrumbIndex = Number(item.dataset.diagramBreadcrumbIndex);
        void service.navigateToCrumb(breadcrumbIndex)
            .catch((error: unknown) => reportFailure(error, 'Diagram navigation failed'));
    };
    const handleRootMenuClose = () => service.closeRootMenu();
    const handleRootMenuClick = (event: MouseEvent<HTMLElement>) => {
        const newItem = (event.target as Element).closest<HTMLElement>('[data-diagram-new-root]');
        if (newItem) {
            try {
                service.openNewRootPopup(newItem);
            } catch (error) {
                reportFailure(error, 'Diagram action could not be opened');
            }

            return;
        }
        const savedItem = (event.target as Element).closest<HTMLElement>('[data-diagram-root-id]');
        if (!savedItem?.dataset.diagramRootId) return;
        void service.navigateToSavedDiagram(savedItem.dataset.diagramRootId)
            .catch((error: unknown) => reportFailure(error, 'Diagram navigation failed'));
    };
    const handleAdd = (event: MouseEvent<HTMLButtonElement>) => {
        try {
            service.openSelectedItemPopup(event.currentTarget);
        } catch (error) {
            reportFailure(error, 'Child diagram action could not be opened');
        }
    };

    if (activeRecords.length === 0) return null;

    return (
        <Box
            aria-label="Diagram breadcrumb bar"
            sx={{ alignItems: 'center', display: 'flex', gap: 0.5, left: 1, maxWidth: 'calc(100% - 16px)', position: 'absolute', top: 1, zIndex: 4 }}
        >
            <Tooltip title="Back">
                <span>
                    <IconButton
                        aria-label="Back"
                        disabled={index.activePath.length <= 1}
                        onClick={handleBack}
                        size="small"
                    >
                        <ArrowBackOutlined />
                    </IconButton>
                </span>
            </Tooltip>
            <Breadcrumbs aria-label="Diagram breadcrumb" onClick={handleCrumbClick}>
                {activeRecords.map((record, recordIndex) => recordIndex === 0 ? (
                    <Button
                        aria-expanded={!!rootMenu}
                        aria-haspopup="menu"
                        key={record.id}
                        onClick={handleRootCrumb}
                        size="small"
                        variant="text"
                    >
                        {record.label}
                    </Button>
                ) : (
                    <Button
                        data-diagram-breadcrumb-index={recordIndex}
                        disabled={recordIndex === activeRecords.length - 1}
                        key={record.id}
                        size="small"
                        variant="text"
                    >
                        {record.label}
                    </Button>
                ))}
            </Breadcrumbs>
            <Tooltip title={selectedItem ? 'Add child diagram' : 'Select a diagram item to add a child diagram'}>
                <span>
                    <IconButton aria-label="Add child diagram" disabled={!selectedItem} onClick={handleAdd} size="small">
                        <AddOutlined />
                    </IconButton>
                </span>
            </Tooltip>
            <Menu
                anchorEl={rootMenu?.anchorElement}
                onClick={handleRootMenuClick}
                onClose={handleRootMenuClose}
                open={!!rootMenu}
                slotProps={{ list: { 'aria-label': 'Root diagrams' } }}
            >
                {rootDiagrams.map((record) => (
                    <MenuItem data-diagram-root-id={record.id} key={record.id}>
                        {diagramTitle(record, actions)}
                    </MenuItem>
                ))}
                <MenuItem data-diagram-new-root disabled={rootActions.length === 0}>New</MenuItem>
            </Menu>
        </Box>
    );
}
