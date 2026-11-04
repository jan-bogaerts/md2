import { Box, Dialog, DialogContent, DialogTitle, useMediaQuery, useTheme } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import type { CardTypeConfig, StateConfig } from '../../../data/data_types'
import { diagramEditSessionService, type DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramSaveService } from '../../../services/diagrams/diagram_save_service'
import { useProjectConfig } from '../../hooks/use_project_config'
import { DiagramChangeReviewActions, type DiagramCardCreationService } from './diagram_change_review_actions'
import { DiagramChangeReviewCardFields } from './diagram_change_review_card_fields'
import { DiagramChangeReviewList } from './diagram_change_review_list'
import { DiagramChangeReviewReport } from './diagram_change_review_report'
import {
    diagramChangeReviewService, type DiagramChangeReviewService,
} from './diagram_change_review_service'

const DESKTOP_DIALOG_HEIGHT = 720
const DESKTOP_DIALOG_WIDTH = 820
const MINIMUM_DIALOG_HEIGHT = 480
const MINIMUM_DIALOG_WIDTH = 560

/** Resizable card-creation shell retaining semantic change inspection. */
export function DiagramChangeReviewDialog({
    cardTypes,
    project,
    review = diagramChangeReviewService,
    save,
    session = diagramEditSessionService,
    states,
}: {
    cardTypes?: CardTypeConfig[]
    project?: DiagramCardCreationService
    review?: DiagramChangeReviewService
    save?: DiagramSaveService
    session?: DiagramEditSessionService
    states?: StateConfig[]
}) {
    const open = useSyncExternalStore(review.subscribeOpen, review.getOpenSnapshot, review.getOpenSnapshot)
    const projectConfig = useProjectConfig()
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const configuredCardTypes = cardTypes ?? projectConfig?.cardTypes ?? []
    const configuredStates = states ?? projectConfig?.states ?? []
    const handleClose = useCallback(() => review.close(), [review])

    return (
        <Dialog
            aria-labelledby="diagram-implementation-dialog-title"
            fullScreen={isMobile}
            maxWidth={false}
            onClose={handleClose}
            open={open}
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: isMobile ? 0 : '14px',
                        display: 'flex',
                        height: isMobile ? '100dvh' : DESKTOP_DIALOG_HEIGHT,
                        maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 32px)',
                        maxWidth: isMobile ? '100%' : 'calc(100vw - 32px)',
                        minHeight: isMobile ? 0 : MINIMUM_DIALOG_HEIGHT,
                        minWidth: isMobile ? 0 : MINIMUM_DIALOG_WIDTH,
                        overflow: 'hidden',
                        resize: isMobile ? 'none' : 'both',
                        width: isMobile ? '100%' : DESKTOP_DIALOG_WIDTH,
                    },
                },
            }}
        >
            <DialogTitle id="diagram-implementation-dialog-title" sx={{ flexShrink: 0 }}>
                Add card to implement diagram
            </DialogTitle>
            <DialogContent
                dividers
                sx={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'hidden' }}
            >
                <DiagramChangeReviewCardFields
                    cardTypes={configuredCardTypes}
                    isMobile={isMobile}
                    review={review}
                    states={configuredStates}
                />
                <Box sx={{ flex: '0 1 auto', maxHeight: isMobile ? 160 : 180, minHeight: 0, overflowY: 'auto' }}>
                    <DiagramChangeReviewList review={review} session={session} />
                </Box>
                <DiagramChangeReviewReport review={review} />
            </DialogContent>
            <DiagramChangeReviewActions
                cardTypes={configuredCardTypes}
                project={project}
                review={review}
                save={save}
                session={session}
                states={configuredStates}
            />
        </Dialog>
    )
}
