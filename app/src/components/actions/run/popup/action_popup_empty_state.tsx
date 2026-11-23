import { Box, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import type { ActionContext } from '../../../../data/action_context'
import { ResizablePopper } from '../../../resizable_popper'
import { NO_DRAG_REGION } from '../../../shell/drag_region'
import { ActionSelector } from './action_selector'
import { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_frame'
import { ActionPopupTargetBadge } from './action_popup_target_badge'
import { ActionPopupTitle } from './action_popup_title'
import type { ActionVisibilityMode } from './action_visibility_mode_store'

interface ActionPopupEmptyStateProps {
    actionVisibilityMode: ActionVisibilityMode
    anchorElement: HTMLElement | null
    assignmentContext: ActionContext
    baseContext: ActionContext
    draggable?: boolean
    fullHeight: boolean
    onActivate?: () => void
    onClose: () => void
    onToggleFullHeight: () => void
    onVisibilityModeChange: (mode: ActionVisibilityMode) => void
    open: boolean
    readOnlyMessage: string | null
    stackPosition?: number
    subscribeFocusRequest?: (listener: () => void) => () => void
    titleId: string
}

function ignoreActionSelection() {}

/** Popup shell retained while no actions match the selected visibility mode. */
export function ActionPopupEmptyState(props: ActionPopupEmptyStateProps) {
    const {
        actionVisibilityMode, anchorElement, assignmentContext, baseContext, draggable, fullHeight, onActivate,
        onClose, onToggleFullHeight, onVisibilityModeChange, open, readOnlyMessage, stackPosition,
        subscribeFocusRequest, titleId,
    } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const sizeStorageKey = baseContext.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY

    return (
        <ResizablePopper
            anchorElement={anchorElement}
            bottomInset={0}
            draggable={isMobile ? false : draggable}
            fullHeight={isMobile || fullHeight}
            initialSize={{ height: 450, width: 400 }}
            labelId={titleId}
            onActivate={onActivate}
            onClose={onClose}
            open={open}
            paperSx={{
                ...NO_DRAG_REGION,
                bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: isMobile ? 0 : '14px',
                boxShadow: '0 24px 60px rgba(16,24,40,0.28)', flexDirection: 'column',
                height: isMobile ? '100dvh !important' : undefined, left: isMobile ? '0 !important' : undefined,
                margin: isMobile ? '0 !important' : undefined, maxHeight: isMobile ? 'none' : undefined,
                maxWidth: isMobile ? 'none' : undefined, top: isMobile ? '0 !important' : undefined,
                transform: isMobile ? 'none !important' : undefined, width: isMobile ? '100vw !important' : undefined,
            }}
            resizeFromAllSides
            resizeHorizontallyWhenFullHeight={!isMobile}
            resizeLabel="Resize action popup"
            stackPosition={stackPosition}
            storageKey={isMobile ? undefined : sizeStorageKey}
            subscribeFocusRequest={subscribeFocusRequest}
        >
            <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                <ActionPopupTitle context={baseContext} titleId={titleId} />
                <Box
                    data-drag-handle={!isMobile && draggable ? 'true' : undefined}
                    sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1, px: 1.5, py: 1.5 }}
                >
                    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, minWidth: 0 }}>
                        <ActionPopupTargetBadge context={baseContext} />
                        <Box sx={{ flex: 1 }} />
                        {!isMobile ? (
                            <Tooltip title={fullHeight ? 'Collapse downward' : 'Expand upward'}>
                                <IconButton aria-label={fullHeight ? 'Collapse downward' : 'Expand upward'}
                                    onClick={onToggleFullHeight} size="small">
                                    {fullHeight ? <ArrowCollapseVertical /> : <ArrowExpandVertical />}
                                </IconButton>
                            </Tooltip>
                        ) : null}
                        <IconButton aria-label="Close" onClick={onClose} size="small"><Close /></IconButton>
                    </Box>
                    <ActionSelector
                        actions={[]}
                        context={assignmentContext}
                        onSelect={ignoreActionSelection}
                        onVisibilityModeChange={onVisibilityModeChange}
                        selectedAction={null}
                        visibilityMode={actionVisibilityMode}
                    />
                </Box>
                {readOnlyMessage ? (
                    <Typography color="text.secondary" role="note" sx={{ p: 1.5 }} variant="caption">
                        {readOnlyMessage}
                    </Typography>
                ) : null}
            </Box>
        </ResizablePopper>
    )
}
