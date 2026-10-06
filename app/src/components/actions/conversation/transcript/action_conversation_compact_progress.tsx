import { CircularProgress, Stack, Typography } from '@mui/material';
import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useActionCompactRequests } from '../../../hooks/use_action_compact_requests';
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker';

interface ActionConversationCompactProgressProps {
    tracker: ActionConversationChatlogTracker;
    onContentChange: () => void;
}

/** Shows active compaction in the displayed chat without republishing transcript data. */
export function ActionConversationCompactProgress({ tracker, onContentChange }: ActionConversationCompactProgressProps) {
    const conversationId = useSyncExternalStore(
        tracker.subscribeConversation, tracker.getConversationIdentity, tracker.getConversationIdentity,
    );
    const requests = useActionCompactRequests(conversationId);
    const running = requests.some(({ state }) => state === 'running');
    useLayoutEffect(onContentChange, [onContentChange, running]);
    if (!running) return null;

    return (
        <Stack aria-live="polite" direction="row" role="status" spacing={1}
            sx={{ alignItems: 'center', flexShrink: 0, px: 1, py: 0.5 }}>
            <CircularProgress aria-label="Compacting conversation" size={16} />
            <Typography color="text.secondary" variant="body2">Compacting conversation…</Typography>
        </Stack>
    );
}
