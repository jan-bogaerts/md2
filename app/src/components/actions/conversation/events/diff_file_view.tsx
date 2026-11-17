import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import { alpha, Box, IconButton, Tooltip, Typography } from '@mui/material';
import { useState, type MouseEvent, type ReactNode, type Ref } from 'react';
import {
    Diff,
    Hunk,
    getChangeKey,
    isDelete,
    isInsert,
    type ChangeData,
    type DiffType,
    type FileData,
    type GutterOptions,
} from 'react-diff-view';
import type { OpenInEditorRequest } from '../../../../data/electron_action_bridge';
import { diffCommentService, type DiffCommentSide, type DiffCommentTarget } from './diff_comment_service';
import { DiffCommentThread } from './diff_comment_thread';

interface DiffFileViewProps {
    containerRef?: Ref<HTMLDivElement>;
    file: FileData;
    onOpenLine: (request: OpenInEditorRequest) => void;
    revision: string;
}

interface DiffCommentWidgetProps {
    changeKey: string;
    onEmpty: (changeKey: string) => void;
    targets: DiffCommentTarget[];
}

function changeLine(change: ChangeData, side: DiffCommentSide) {
    if (isInsert(change)) return side === 'new' ? change.lineNumber : null;
    if (isDelete(change)) return side === 'old' ? change.lineNumber : null;

    return side === 'old' ? change.oldLineNumber : change.newLineNumber;
}

function changeTypeLabel(type: DiffType) {
    if (type === 'add') return 'Added file';
    if (type === 'delete') return 'Deleted file';
    if (type === 'rename') return 'Renamed file';
    if (type === 'copy') return 'Copied file';

    return 'Modified file';
}

function DiffCommentWidget(props: DiffCommentWidgetProps) {
    const { changeKey, onEmpty, targets } = props;
    const handleEmpty = () => onEmpty(changeKey);

    return (
        <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: targets.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}>
            {targets.map((target) => (
                <DiffCommentThread key={`${target.side}:${target.line}`} onEmpty={handleEmpty} target={target} />
            ))}
        </Box>
    );
}

/** One parsed patch file with editor-line gutters and inline review widgets. */
export function DiffFileView(props: DiffFileViewProps) {
    const { containerRef, file, onOpenLine, revision } = props;
    const [activeWidgetKeys, setActiveWidgetKeys] = useState<ReadonlySet<string>>(() => new Set());
    const targetsByAction = new Map<string, DiffCommentTarget>();
    const targetsByChange = new Map<string, DiffCommentTarget[]>();

    for (const hunk of file.hunks) {
        for (const change of hunk.changes) {
            const changeKey = getChangeKey(change);
            const sides: DiffCommentSide[] = isInsert(change) ? ['new'] : isDelete(change) ? ['old'] : ['old', 'new'];
            const targets: DiffCommentTarget[] = [];
            for (const side of sides) {
                const line = changeLine(change, side);
                if (line === null) continue;
                const target = {
                    line,
                    lineContent: change.content,
                    path: side === 'old' ? file.oldPath : file.newPath,
                    revision,
                    side,
                };
                targets.push(target);
                targetsByAction.set(`${changeKey}:${side}`, target);
            }
            targetsByChange.set(changeKey, targets);
        }
    }

    const removeEmptyWidget = (changeKey: string) => {
        const targets = targetsByChange.get(changeKey) ?? [];
        const hasContent = targets.some((target) => {
            const snapshot = diffCommentService.getSnapshot(target);

            return snapshot.comments.length > 0 || !!snapshot.composer;
        });
        if (hasContent) return;
        setActiveWidgetKeys((current) => {
            const next = new Set(current);
            next.delete(changeKey);

            return next;
        });
    };
    const handleOpenLine = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const { actionKey } = event.currentTarget.dataset;
        const target = actionKey ? targetsByAction.get(actionKey) : null;
        if (target) onOpenLine({ line: target.line, path: target.path });
    };
    const handleAddComment = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        const { actionKey, changeKey } = event.currentTarget.dataset;
        const target = actionKey ? targetsByAction.get(actionKey) : null;
        if (!target || !changeKey) return;
        diffCommentService.openComposer(target);
        setActiveWidgetKeys((current) => new Set([...current, changeKey]));
    };
    const renderGutter = (options: GutterOptions): ReactNode => {
        const { change, inHoverState, renderDefault, side } = options;
        const changeKey = getChangeKey(change);
        const actionKey = `${changeKey}:${side}`;
        const target = targetsByAction.get(actionKey);
        if (!target) return renderDefault();

        return (
            <Box sx={{ alignItems: 'center', display: 'flex', minWidth: 7 }}>
                <Box
                    aria-label={`Open ${side} line ${target.line} in editor`}
                    component="button"
                    data-action-key={actionKey}
                    onClick={handleOpenLine}
                    sx={{
                        bgcolor: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', font: 'inherit', minWidth: 3,
                        p: 0, '&:focus-visible': { color: 'primary.main', outlineColor: 'primary.main' },
                    }}
                    type="button"
                >
                    {renderDefault()}
                </Box>
                <Tooltip title="Add comment">
                    <IconButton
                        aria-label={`Add comment on ${side} line ${target.line}`}
                        data-action-key={actionKey}
                        data-change-key={changeKey}
                        onClick={handleAddComment}
                        size="small"
                        sx={{
                            color: 'custom.text3', height: 26, opacity: inHoverState ? 1 : 0, width: 26,
                            '&:focus-visible': { opacity: 1 }, '&:hover': { bgcolor: 'custom.track', color: 'primary.main', opacity: 1 },
                        }}
                    >
                        <AddCommentOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            </Box>
        );
    };

    const widgets: Record<string, ReactNode> = {};
    for (const [changeKey, targets] of targetsByChange) {
        const hasContent = targets.some((target) => {
            const snapshot = diffCommentService.getSnapshot(target);

            return snapshot.comments.length > 0 || !!snapshot.composer;
        });
        if (!activeWidgetKeys.has(changeKey) && !hasContent) continue;
        widgets[changeKey] = (
            <DiffCommentWidget changeKey={changeKey} onEmpty={removeEmptyWidget} targets={targets} />
        );
    }

    const oldPath = file.oldPath || file.newPath;
    const newPath = file.newPath || file.oldPath;
    const hasTextHunks = file.hunks.length > 0 && !file.isBinary;

    return (
        <Box ref={containerRef} sx={{ mt: 1.5 }}>
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', mb: 0.5 }}>
                <Typography sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }} variant="caption">{oldPath}</Typography>
                <Typography sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }} variant="caption">{newPath}</Typography>
            </Box>
            {!hasTextHunks ? (
                <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                    <Typography color="text.secondary" variant="body2">
                        {changeTypeLabel(file.type)}: no text changes available for review.
                    </Typography>
                </Box>
            ) : (
                <Box
                    sx={(theme) => ({
                        '& .diff': { bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', color: 'text.primary', width: '100%' },
                        '& .diff-code, & .diff-gutter': { borderColor: 'divider' },
                        '& .diff-code': { bgcolor: 'background.paper', color: 'text.primary' },
                        '& .diff-code-insert, & .diff-gutter-insert': { bgcolor: alpha(theme.palette.success.main, 0.12) },
                        '& .diff-code-delete, & .diff-gutter-delete': { bgcolor: alpha(theme.palette.error.main, 0.12) },
                        '& .diff-gutter': { bgcolor: 'custom.track', color: 'custom.text3', p: 0 },
                        '& .diff-widget-content': { bgcolor: 'background.default', p: 0 },
                    })}
                >
                    <Diff diffType={file.type} hunks={file.hunks} renderGutter={renderGutter} viewType="split" widgets={widgets}>
                        {(hunks) => hunks.map((hunk) => <Hunk hunk={hunk} key={hunk.content} />)}
                    </Diff>
                </Box>
            )}
        </Box>
    );
}
