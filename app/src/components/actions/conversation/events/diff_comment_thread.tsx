import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useSyncExternalStore, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import {
    diffCommentService,
    type DiffCommentService,
    type DiffCommentTarget,
} from './diff_comment_service';

interface DiffCommentThreadProps {
    onEmpty?: () => void;
    service?: DiffCommentService;
    target: DiffCommentTarget;
}

function stopPropagation(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
}

/** One changed-line comment thread. State stays in DiffCommentService across component unmounts. */
export function DiffCommentThread(props: DiffCommentThreadProps) {
    const { onEmpty, service = diffCommentService, target } = props;
    const subscribe = useCallback(
        (onStoreChange: () => void) => service.subscribe(target, onStoreChange),
        [service, target],
    );
    const getSnapshot = useCallback(
        () => service.getSnapshot(target),
        [service, target],
    );
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const handleDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
        service.updateDraft(target, event.target.value);
    };
    const handleSave = () => {
        service.saveComposer(target);
    };
    const handleCancel = () => {
        service.cancelComposer(target);
        if (service.getSnapshot(target).comments.length === 0) onEmpty?.();
    };
    const handleEdit = (event: MouseEvent<HTMLButtonElement>) => {
        const { commentId } = event.currentTarget.dataset;
        if (commentId) service.editComment(target, commentId);
    };
    const handleDelete = (event: MouseEvent<HTMLButtonElement>) => {
        const { commentId } = event.currentTarget.dataset;
        if (!commentId) return;
        service.deleteComment(target, commentId);
        const nextSnapshot = service.getSnapshot(target);
        if (nextSnapshot.comments.length === 0 && !nextSnapshot.composer) onEmpty?.();
    };
    const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            handleCancel();
            return;
        }
        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            handleSave();
        }
    };

    if (snapshot.comments.length === 0 && !snapshot.composer) return null;

    return (
        <Box
            aria-label={`${target.side} line ${target.line} comments`}
            onClick={stopPropagation}
            sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, m: 1, p: 1.5 }}
        >
            <Typography color="text.secondary" variant="caption">
                {target.side === 'old' ? 'Old' : 'New'} line {target.line} · Comments last only for this application session.
            </Typography>
            <Stack spacing={1} sx={{ mt: 1 }}>
                {snapshot.comments.map((comment) => (
                    <Box key={comment.id} sx={{ bgcolor: 'custom.track', borderRadius: 1, p: 1 }}>
                        <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body2">{comment.body}</Typography>
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', mt: 0.5 }}>
                            <Button data-comment-id={comment.id} onClick={handleEdit} size="small" variant="text">Edit</Button>
                            <Button color="error" data-comment-id={comment.id} onClick={handleDelete} size="small" variant="text">Delete</Button>
                        </Stack>
                    </Box>
                ))}
                {snapshot.composer ? (
                    <Box>
                        <Typography color="text.secondary" sx={{ mb: 0.75 }} variant="caption">Review comment</Typography>
                        <TextField
                            slotProps={{ htmlInput: { 'aria-label': 'Review comment' } }}
                            autoFocus
                            error={!!snapshot.composer.validationError}
                            fullWidth
                            helperText={snapshot.composer.validationError ?? 'Session-only: this comment is not saved or published.'}
                            multiline
                            onChange={handleDraftChange}
                            onKeyDown={handleComposerKeyDown}
                            rows={3}
                            value={snapshot.composer.draft}
                        />
                        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1 }}>
                            <Button onClick={handleCancel} size="small" variant="outlined">Cancel</Button>
                            <Button onClick={handleSave} size="small" variant="contained">
                                {snapshot.composer.editingCommentId ? 'Save edit' : 'Save comment'}
                            </Button>
                        </Stack>
                    </Box>
                ) : null}
            </Stack>
        </Box>
    );
}
