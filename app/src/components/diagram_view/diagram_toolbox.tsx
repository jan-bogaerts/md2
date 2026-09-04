import { Box, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import {
    useCallback, useId, useState, useSyncExternalStore,
    type SyntheticEvent,
} from 'react';
import {
    diagramEditSessionService,
    type DiagramToolboxSection,
} from '../../services/diagrams/diagram_edit_session_service';
import { ResizablePopper } from '../resizable_popper';

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
    session?: {
        getActiveToolboxSectionSnapshot: () => DiagramToolboxSection;
        setActiveToolboxSection: (section: DiagramToolboxSection) => void;
        subscribeActiveToolboxSection: (listener: () => void) => () => void;
    };
}

/** Floating shell for diagram tools. Tool leaves are added by their focused feature jobs. */
export function DiagramToolbox({
    boundaryElement,
    session = diagramEditSessionService,
}: DiagramToolboxProps) {
    const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null);
    const titleId = useId();
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
                />
            </ResizablePopper>
        </>
    );
}
