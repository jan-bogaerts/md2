import { Box, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import type { ReactNode } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import { ResizablePopper } from '../../../resizable_popper'
import type { WorktreeAssignmentTarget } from '../../../worktree_selector'
import { MarkdownTypeaheadLayerProvider } from '../../../editor/markdown_typeahead_layer_provider'
import { NO_DRAG_REGION } from '../../../shell/drag_region'
import { ActionConversationPickerOwner } from '../../conversation/action_conversation_picker_owner'
import type { ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionRunBindingStore } from '../state/action_run_binding_store'
import { ActionSelector } from './action_selector'
import type { ActionPopupContentProps } from './action_popup_types'
import { ActionWorktreeSelectorOwner } from './action_worktree_selector_owner'

export const CARD_RUN_POPUP_SIZE_STORAGE_KEY = 'md2.cardRunPopupSize'
export const PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY = 'md2.projectAgentPopupSize'

interface ActionPopupFrameProps {
    bindingStore: ActionRunBindingStore
    children: ReactNode
    contentProps: ActionPopupContentProps
    conversationStore: ActionConversationStore
}

function worktreeAssignmentTarget(context: ActionContext): WorktreeAssignmentTarget | null {
    if (context.kind === 'project') return { kind: 'project' }
    if ((context.kind === 'card' || context.kind === 'file') && context.file && context.cardInternalId) {
        return { cardInternalId: context.cardInternalId, kind: 'card', path: context.file }
    }

    return null
}

/** Shared popup surface, toolbar, and action selector. */
export function ActionPopupFrame({ bindingStore, children, contentProps, conversationStore }: ActionPopupFrameProps) {
    const {
        action, actions, anchorElement, assignmentContext, baseContext, draggable, fullHeight, onActivate,
        onClose, onSelectAction, onToggleFullHeight, open, primaryPath, readOnlyMessage, stackPosition,
        target, targetTitle, titleId,
    } = contentProps
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const sizeStorageKey = baseContext.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY
    const parsedWorktree = assignmentContext.worktree && /^[1-9]\d*$/u.test(assignmentContext.worktree)
        ? Number.parseInt(assignmentContext.worktree, 10)
        : null
    const worktreeAssignment = {
        worktree: parsedWorktree,
        worktreeError: assignmentContext.worktreeError ?? null,
        worktreeValue: assignmentContext.worktree ?? null,
    }
    const assignmentTarget = baseContext.kind === 'card' || baseContext.kind === 'file' || baseContext.kind === 'project'
        ? worktreeAssignmentTarget(baseContext)
        : null
    // The badge stays a span carrying only tabIndex: a button or a role attribute would match the
    // popper's INTERACTIVE_SELECTOR, which would stop a pointer press on the badge from dragging the popup.
    const targetBadge = target ? (
        <Box
            component="span"
            sx={{
                bgcolor: 'custom.primaryBg', borderRadius: '5px', color: 'primary.main', flexShrink: 0,
                fontFamily: '"Roboto Mono", ui-monospace, monospace', fontSize: 11.5, fontWeight: 600,
                px: 0.875, py: 0.25,
            }}
            tabIndex={0}
        >
            {target}
        </Box>
    ) : null

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
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: isMobile ? 0 : '14px',
                boxShadow: '0 24px 60px rgba(16,24,40,0.28)',
                flexDirection: 'column',
                height: isMobile ? '100dvh !important' : undefined,
                left: isMobile ? '0 !important' : undefined,
                margin: isMobile ? '0 !important' : undefined,
                maxHeight: isMobile ? 'none' : undefined,
                maxWidth: isMobile ? 'none' : undefined,
                top: isMobile ? '0 !important' : undefined,
                transform: isMobile ? 'none !important' : undefined,
                width: isMobile ? '100vw !important' : undefined,
            }}
            resizeFromAllSides
            resizeHorizontallyWhenFullHeight={!isMobile}
            resizeLabel="Resize action popup"
            stackPosition={stackPosition}
            storageKey={isMobile ? undefined : sizeStorageKey}
        >
            <MarkdownTypeaheadLayerProvider stackPosition={stackPosition ?? 0}>
                <Typography
                    id={titleId}
                    sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
                >
                    {target ? `Run actions for ${target}` : 'Run actions'}
                </Typography>
                <Box
                    data-drag-handle={!isMobile && draggable ? 'true' : undefined}
                    sx={{
                        borderBottom: 1, borderColor: 'divider', cursor: !isMobile && draggable ? 'move' : undefined,
                        display: 'flex', flexDirection: 'column', flexShrink: 0, gap: 1, px: 1.5, py: 1.5,
                    }}
                >
                    <Box data-testid="action-popup-toolbar" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        {targetBadge && targetTitle ? <Tooltip title={targetTitle}>{targetBadge}</Tooltip> : targetBadge}
                        {assignmentTarget && !readOnlyMessage ? (
                            <ActionWorktreeSelectorOwner
                                assignment={worktreeAssignment}
                                assignmentTarget={assignmentTarget}
                                bindingStore={bindingStore}
                                primaryPath={primaryPath}
                            />
                        ) : null}
                        {action.type === 'agent' ? (
                            <ActionConversationPickerOwner
                                actionId={action.id}
                                bindingStore={bindingStore}
                                context={assignmentContext}
                                store={conversationStore}
                            />
                        ) : null}
                        <Box sx={{ flex: 1 }} />
                        {!isMobile ? (
                            <Tooltip title={fullHeight ? 'Collapse downward' : 'Expand upward'}>
                                <IconButton
                                    aria-label={fullHeight ? 'Collapse downward' : 'Expand upward'}
                                    onClick={onToggleFullHeight}
                                    size="small"
                                    sx={{ flexShrink: 0, height: 30, width: 30 }}
                                >
                                    {fullHeight
                                        ? <ArrowCollapseVertical sx={{ fontSize: 18 }} />
                                        : <ArrowExpandVertical sx={{ fontSize: 18 }} />}
                                </IconButton>
                            </Tooltip>
                        ) : null}
                        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ flexShrink: 0, height: 30, width: 30 }}>
                            <Close sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                    <ActionSelector
                        actions={actions}
                        context={assignmentContext}
                        onSelect={onSelectAction}
                        selectedAction={action}
                    />
                </Box>
                {children}
            </MarkdownTypeaheadLayerProvider>
        </ResizablePopper>
    )
}
