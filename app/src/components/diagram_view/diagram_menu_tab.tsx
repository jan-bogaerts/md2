import { Divider } from '@mui/material';
import { useSyncExternalStore } from 'react';
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramViewService,
    type DiagramViewService,
} from '../../services/diagrams/diagram_view_service';
import { Section } from '../shell/menu/section';
import { Tab } from '../shell/menu/tab';
import { DiagramAddControl } from './diagram_add_control';
import { DiagramChangeReviewButton } from './diagram_change_review_button';
import { DiagramComparisonMenuControl } from './diagram_comparison_menu_control';
import { DiagramCopyButton } from './diagram_copy_button';
import { DiagramCutButton } from './diagram_cut_button';
import { DiagramDeleteButton } from './diagram_delete_button';
import { DiagramEditButton } from './diagram_edit_button';
import { DiagramLegendButton } from './diagram_legend_button';
import { DiagramMenuToolButton } from './diagram_menu_tool_button';
import { DiagramMetadataButton } from './diagram_metadata_button';
import { DiagramPasteButton } from './diagram_paste_button';
import { DiagramFormattingControls } from './diagram_formatting_controls';

/** Diagram app-menu content. Changing diagram state rerenders only subscribed leaf controls. */
export function DiagramMenuTab({
    session = diagramEditSessionService,
    viewService = diagramViewService,
}: {
    session?: DiagramEditSessionService;
    viewService?: DiagramViewService;
}) {
    const editSession = useSyncExternalStore(
        session.subscribeSession,
        session.getSessionSnapshot,
        session.getSessionSnapshot,
    );

    return (
        <Tab>
            {!editSession ? (
                <>
                    <Section label="Diagram"><DiagramEditButton session={session} viewService={viewService} /></Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Formatting"><DiagramFormattingControls store={viewService} surface="Current" /></Section>
                </>
            ) : (
                <>
                    <Section label="Tools">
                        <DiagramMenuToolButton session={session} tool="select" />
                        <DiagramMenuToolButton session={session} tool="pan" />
                        <DiagramAddControl session={session} />
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Clipboard">
                        <DiagramCutButton session={session} />
                        <DiagramCopyButton session={session} />
                        <DiagramPasteButton />
                        <DiagramDeleteButton />
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Review and metadata">
                        <DiagramChangeReviewButton />
                        <DiagramMetadataButton />
                        <DiagramLegendButton />
                    </Section>
                    <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                    <Section label="Formatting">
                        <DiagramFormattingControls store={session} surface="New" />
                        {!editSession.creationSourceDiagramId ? <DiagramFormattingControls store={viewService} surface="Current" /> : null}
                    </Section>
                    {!editSession.creationSourceDiagramId ? (
                        <>
                            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
                            <Section label="Comparison">
                                <DiagramComparisonMenuControl />
                            </Section>
                        </>
                    ) : null}
                </>
            )}
        </Tab>
    );
}
