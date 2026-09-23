import {
    Box,
    Button,
    ButtonGroup,
    ClickAwayListener,
    MenuItem,
    MenuList,
    Paper,
    Popper,
    Tooltip,
} from '@mui/material';
import ArrowDropDownOutlined from '@mui/icons-material/ArrowDropDownOutlined';
import { useCallback, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data';
import {
    diagramEditSessionService,
    type DiagramCreationTool,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramEdgeDrawingService,
    type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service';
import {
    diagramGroupDrawingService,
    type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service';
import {
    diagramNodePlacementService,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service';
import {
    diagramFragmentDialogService,
    type DiagramFragmentDialogService,
} from './diagram_fragment_dialog_service';
import { DiagramCreationToolSample } from './diagram_creation_tool_sample';
import { diagramCreationTools, type DiagramCreationToolDefinition } from './diagram_creation_tools';

interface DiagramAddControlProps {
    drawing?: Pick<DiagramEdgeDrawingService, 'activate'>;
    fragmentDialog?: Pick<DiagramFragmentDialogService, 'openCreate'>;
    groupDrawing?: Pick<DiagramGroupDrawingService, 'activate'>;
    placement?: Pick<DiagramNodePlacementService, 'activate'>;
    session?: DiagramEditSessionService;
}

function activateCreationTool(
    definition: DiagramCreationToolDefinition,
    dependencies: Required<Omit<DiagramAddControlProps, 'session'>> & { session: DiagramEditSessionService },
) {
    const { drawing, fragmentDialog, groupDrawing, placement, session } = dependencies;
    if (definition.category === 'node') return placement.activate(definition.definition);
    if (definition.category === 'edge') return drawing.activate({ kind: definition.edgeKind });
    if (definition.category === 'group') return groupDrawing.activate();

    session.setActiveTool('fragment');
    fragmentDialog.openCreate();

    return true;
}

/** Attached Add button and keyboard-accessible creation-tool popper. */
export function DiagramAddControl({
    drawing = diagramEdgeDrawingService,
    fragmentDialog = diagramFragmentDialogService,
    groupDrawing = diagramGroupDrawingService,
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramAddControlProps) {
    const [dropdownButton, setDropdownButton] = useState<HTMLButtonElement | null>(null);
    const [open, setOpen] = useState(false);
    const diagramType = useSyncExternalStore(
        useCallback((listener) => session.subscribeMetadataField('type', listener), [session]),
        useCallback(() => session.getMetadataFieldSnapshot('type') as DiagramType | null, [session]),
        useCallback(() => session.getMetadataFieldSnapshot('type') as DiagramType | null, [session]),
    );
    const flowPreset = useSyncExternalStore(
        useCallback((listener) => session.subscribeMetadataField('preset', listener), [session]),
        useCallback(() => session.getMetadataFieldSnapshot('preset') as DiagramFlowPreset | null, [session]),
        useCallback(() => session.getMetadataFieldSnapshot('preset') as DiagramFlowPreset | null, [session]),
    );
    const lastSelectedTool = useSyncExternalStore(
        session.subscribeLastSelectedCreationTool,
        session.getLastSelectedCreationToolSnapshot,
        session.getLastSelectedCreationToolSnapshot,
    );
    const activeTool = useSyncExternalStore(
        session.subscribeActiveTool,
        session.getActiveToolSnapshot,
        session.getActiveToolSnapshot,
    );
    const nodeIds = useSyncExternalStore(
        useCallback((listener) => session.subscribeCollectionMembership('node', listener), [session]),
        session.getNodeIdsSnapshot,
        session.getNodeIdsSnapshot,
    );
    const hasMindmapRoot = nodeIds.some((nodeId) => session.getNodeFieldSnapshot(nodeId, 'kind') === 'root');
    const definitions = useMemo(
        () => diagramType ? diagramCreationTools(diagramType, flowPreset, hasMindmapRoot) : [],
        [diagramType, flowPreset, hasMindmapRoot],
    );
    const selectedDefinition = definitions.find(({ tool }) => tool === lastSelectedTool) ?? null;
    const activate = useCallback((definition: DiagramCreationToolDefinition) => {
        activateCreationTool(definition, { drawing, fragmentDialog, groupDrawing, placement, session });
    }, [drawing, fragmentDialog, groupDrawing, placement, session]);
    const handleAdd = useCallback(() => {
        if (selectedDefinition) activate(selectedDefinition);
    }, [activate, selectedDefinition]);
    const handleToggle = useCallback(() => setOpen((currentOpen) => !currentOpen), []);
    const handleClose = useCallback(() => setOpen(false), []);
    const handleMenuKeyDown = useCallback((event: KeyboardEvent<HTMLUListElement>) => {
        if (event.key !== 'Escape') return;

        event.preventDefault();
        setOpen(false);
        dropdownButton?.focus();
    }, [dropdownButton]);
    const handleToolClick = useCallback((tool: DiagramCreationTool) => {
        const definition = definitions.find((candidate) => candidate.tool === tool);
        if (!definition) throw new Error(`Diagram creation tool is unavailable: ${tool}`);

        activate(definition);
        setOpen(false);
        dropdownButton?.focus();
    }, [activate, definitions, dropdownButton]);
    const selectedLabel = selectedDefinition?.label ?? 'tool';
    const addSelected = activeTool !== 'select' && activeTool !== 'pan';

    return (
        <>
            <ButtonGroup aria-label="Add diagram object" size="small" variant="outlined">
                <Tooltip title={selectedDefinition ? `Add ${selectedDefinition.label}` : 'Choose an Add tool'}>
                    <span>
                        <Button
                            aria-label={`Add ${selectedLabel}`}
                            aria-pressed={addSelected}
                            disabled={!selectedDefinition}
                            onClick={handleAdd}
                            sx={{ height: 34, minWidth: 34, px: 1, ...(addSelected ? { bgcolor: 'custom.primaryBg', color: 'primary.main' } : {}) }}
                        >
                            {selectedDefinition ? <DiagramCreationToolSample definition={selectedDefinition} /> : null}
                        </Button>
                    </span>
                </Tooltip>
                <Tooltip title="Choose Add tool">
                    <Button
                        aria-expanded={open}
                        aria-haspopup="menu"
                        aria-label="Choose Add tool"
                        onClick={handleToggle}
                        ref={setDropdownButton}
                        sx={{ height: 34, minWidth: 34, px: 0.5 }}
                    >
                        <ArrowDropDownOutlined />
                    </Button>
                </Tooltip>
            </ButtonGroup>
            <Popper anchorEl={dropdownButton} open={open} placement="bottom-start" sx={{ zIndex: 'tooltip' }}>
                <ClickAwayListener onClickAway={handleClose}>
                    <Paper elevation={8} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.75, mt: 0.5 }}>
                        <MenuList aria-label="Add diagram tool" autoFocusItem={open} onKeyDown={handleMenuKeyDown}>
                            {definitions.map((definition) => {
                                const handleClick = () => handleToolClick(definition.tool);

                                return (
                                    <MenuItem key={`${definition.category}:${definition.tool}`} onClick={handleClick} selected={definition.tool === lastSelectedTool}>
                                        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, minWidth: 120 }}>
                                            <DiagramCreationToolSample definition={definition} />
                                            {definition.label}
                                        </Box>
                                    </MenuItem>
                                );
                            })}
                        </MenuList>
                    </Paper>
                </ClickAwayListener>
            </Popper>
        </>
    );
}
