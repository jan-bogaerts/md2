import { Box, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import {
    useCallback, useId, useState, useSyncExternalStore,
    type SyntheticEvent,
} from 'react';
import {
    diagramEditSessionService,
    type DiagramPersistentTool,
    type DiagramToolboxSection,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service';
import { ResizablePopper } from '../resizable_popper';
import {
    DiagramComponentNodeButton,
    type DiagramComponentNodePlacement,
    type DiagramComponentNodeSession,
} from './diagram_component_node_button';
import {
    DiagramDecisionNodeButton,
} from './diagram_decision_node_button';
import {
    DiagramEndNodeButton,
    type DiagramEndNodePlacement,
    type DiagramEndNodeSession,
} from './diagram_end_node_button';
import { DiagramCopyButton } from './diagram_copy_button';
import { DiagramCutButton } from './diagram_cut_button';
import { DiagramDeleteButton } from './diagram_delete_button';
import { DiagramPasteButton } from './diagram_paste_button';
import {
    DiagramParticipantButton,
} from './diagram_participant_button';
import {
    DiagramStartNodeButton,
    type DiagramStartNodePlacement,
    type DiagramStartNodeSession,
} from './diagram_start_node_button';
import {
    DiagramStepNodeButton,
    type DiagramStepNodePlacement,
    type DiagramStepNodeSession,
} from './diagram_step_node_button';
import { DiagramToolboxToolButton } from './diagram_toolbox_tool_button';
import { DiagramZoomInButton } from './diagram_zoom_in_button';
import { DiagramZoomOutButton } from './diagram_zoom_out_button';
import { useCancelDiagramInteractionOnEscape } from './use_diagram_tool';

const DIAGRAM_TOOLBOX_SIZE_STORAGE_KEY = 'md2.diagramToolboxSize';
const TOOLBOX_SECTIONS: readonly { id: DiagramToolboxSection, label: string }[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'nodes', label: 'Nodes' },
    { id: 'edges', label: 'Edges' },
    { id: 'groups', label: 'Groups' },
    { id: 'others', label: 'Others' },
];
const INITIAL_TOOLBOX_SIZE = { height: 200, width: 360 };
const MINIMUM_TOOLBOX_SIZE = { height: 120, width: 280 };

interface DiagramToolboxProps {
    boundaryElement: HTMLElement | null;
    placement?: DiagramComponentNodePlacement & DiagramEndNodePlacement & DiagramStartNodePlacement & DiagramStepNodePlacement;
    session?: Omit<DiagramComponentNodeSession, 'getMetadataFieldSnapshot' | 'subscribeMetadataField'>
    & DiagramEndNodeSession & DiagramStartNodeSession & DiagramStepNodeSession & {
        getActiveToolboxSectionSnapshot: () => DiagramToolboxSection;
        getActiveToolSnapshot: () => DiagramPersistentTool;
        getViewportScaleSnapshot: () => number;
        cancelActiveInteraction: () => boolean;
        setActiveTool: (tool: DiagramPersistentTool) => void;
        setActiveToolboxSection: (section: DiagramToolboxSection) => void;
        subscribeActiveTool: (listener: () => void) => () => void;
        subscribeActiveToolboxSection: (listener: () => void) => () => void;
        subscribeViewportScale: (listener: () => void) => () => void;
        zoomIn: () => boolean;
        zoomOut: () => boolean;
    };
}

/** Floating shell for diagram tools. Tool leaves are added by their focused feature jobs. */
export function DiagramToolbox({
    boundaryElement,
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramToolboxProps) {
    const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null);
    const titleId = useId();
    useCancelDiagramInteractionOnEscape(session);
    const activeSection = useSyncExternalStore(
        session.subscribeActiveToolboxSection,
        session.getActiveToolboxSectionSnapshot,
        session.getActiveToolboxSectionSnapshot,
    );
    const handleSectionChange = useCallback((_event: SyntheticEvent, section: DiagramToolboxSection) => {
        session.setActiveToolboxSection(section);
    }, [session]);

    return (
        <>
            <Box
                aria-hidden="true"
                ref={setAnchorElement}
                sx={{ height: 0, position: 'absolute', right: 2, top: 5, width: 0 }}
            />
            <ResizablePopper
                anchorElement={anchorElement}
                boundaryElement={boundaryElement}
                closeOnEscape={false}
                focusOnMount={false}
                initialSize={INITIAL_TOOLBOX_SIZE}
                labelId={titleId}
                minimumSize={MINIMUM_TOOLBOX_SIZE}
                open={!!anchorElement && !!boundaryElement}
                paperSx={{
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1.75,
                    boxShadow: 8,
                    flexDirection: 'column',
                }}
                placement="bottom-end"
                resizeFromAllSides
                resizeLabel="Resize diagram toolbox"
                storageKey={DIAGRAM_TOOLBOX_SIZE_STORAGE_KEY}
            >
                <Typography id={titleId} sx={{ px: 1.5, pt: 1.25 }} variant="subtitle2">
                    Diagram tools
                </Typography>
                <Tabs
                    aria-label="Diagram tool sections"
                    onChange={handleSectionChange}
                    scrollButtons="auto"
                    value={activeSection}
                    variant="scrollable"
                >
                    {TOOLBOX_SECTIONS.map(({ id, label }) => (
                        <Tab
                            aria-controls={`${titleId}-${id}-panel`}
                            id={`${titleId}-${id}-tab`}
                            key={id}
                            label={<Tooltip title={label}><Box component="span">{label}</Box></Tooltip>}
                            value={id}
                        />
                    ))}
                </Tabs>
                <Box
                    aria-labelledby={`${titleId}-${activeSection}-tab`}
                    id={`${titleId}-${activeSection}-panel`}
                    role="tabpanel"
                    sx={{ alignContent: 'flex-start', display: 'flex', flex: 1, flexWrap: 'wrap', gap: 1, overflow: 'auto', p: 1.5 }}
                >
                    {activeSection === 'edit' && (
                        <>
                            <DiagramToolboxToolButton
                                label="Select"
                                session={session}
                                tool="select"
                                tooltip="Select diagram objects"
                            />
                            <DiagramZoomInButton session={session} />
                            <DiagramZoomOutButton session={session} />
                            <DiagramCopyButton />
                            <DiagramPasteButton />
                            <DiagramCutButton />
                            <DiagramDeleteButton />
                        </>
                    )}
                    {activeSection === 'nodes' && (
                        <>
                            <DiagramComponentNodeButton placement={placement} session={session} />
                            <DiagramParticipantButton placement={placement} session={session} />
                            <DiagramStartNodeButton placement={placement} session={session} />
                            <DiagramEndNodeButton placement={placement} session={session} />
                            <DiagramStepNodeButton placement={placement} session={session} />
                            <DiagramDecisionNodeButton placement={placement} session={session} />
                        </>
                    )}
                </Box>
            </ResizablePopper>
        </>
    );
}
