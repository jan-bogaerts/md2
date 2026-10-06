import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { actionCompactService } from '../../services/actions/action_compact_service';

/** Subscribes to actual compact requests for one conversation. */
export function useActionCompactRequests(conversationId: string | null) {
    const subscribe = useCallback((listener: () => void) => {
        const eventType = `compact:${conversationId}`;
        actionCompactService.addEventListener(eventType, listener);
        return () => actionCompactService.removeEventListener(eventType, listener);
    }, [conversationId]);
    const getSnapshot = useCallback(() => actionCompactService.getSnapshot(conversationId), [conversationId]);
    useEffect(() => { actionCompactService.connect(); }, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
