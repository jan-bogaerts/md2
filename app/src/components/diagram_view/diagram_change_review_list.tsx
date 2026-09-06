import { Alert, List, Stack, Typography } from '@mui/material'
import { diagramEditSessionService, type DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramChangeReviewService,
    groupDiagramChangeIds,
    type DiagramChangeReviewService,
} from './diagram_change_review_service'
import { DiagramChangeReviewRow } from './diagram_change_review_row'
import { useEditableDiagramChangeIds } from './use_editable_diagram'

/** Change-list host; subscription covers ordered change IDs only. */
export function DiagramChangeReviewList({
    review = diagramChangeReviewService,
    session = diagramEditSessionService,
}: {
    review?: DiagramChangeReviewService
    session?: DiagramEditSessionService
}) {
    const changeIds = useEditableDiagramChangeIds(session)
    const groups = groupDiagramChangeIds(changeIds, session)
    if (changeIds.length === 0) return <Alert severity="info">No diagram changes to review.</Alert>

    return (
        <Stack spacing={1.5}>
            {groups.map((group) => (
                <Stack key={group.label} spacing={0.5}>
                    <Typography color="custom.colHead" variant="overline">{group.label}</Typography>
                    <List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        {group.changeIds.map((changeId) => (
                            <DiagramChangeReviewRow
                                changeId={changeId}
                                key={changeId}
                                review={review}
                                session={session}
                            />
                        ))}
                    </List>
                </Stack>
            ))}
        </Stack>
    )
}
