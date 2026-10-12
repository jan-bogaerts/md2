import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { ActionPopupFrame } from './action_popup_frame';
import { ActionPopupSession } from './action_popup_session';
import { ActionPopupSessionService } from './action_popup_session_service';
import type { ActionPopupContentProps } from './action_popup_types';

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_frame';

/** Keeps the popup surface and agent editor mounted while services switch action bindings. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const { action, assignmentContext, historicalEntries, initialConversationPath, initialRunId } = props;
    const [service] = useState(() => new ActionPopupSessionService());
    const selected = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
    useLayoutEffect(() => {
        service.select(action, assignmentContext, initialRunId, initialConversationPath, historicalEntries);
    }, [action, assignmentContext, historicalEntries, initialConversationPath, initialRunId, service]);
    useLayoutEffect(() => () => service.dispose(), [service]);
    if (!selected) return null;

    const contentProps = { ...props, action: selected.action, assignmentContext: selected.context };
    const { bindingStore, conversationSearchService, conversationStore } = selected.runtime;
    return (
        <ActionPopupFrame bindingStore={bindingStore} contentProps={contentProps}
            conversationSearchService={conversationSearchService} conversationStore={conversationStore}>
            <ActionPopupSession {...contentProps} runtime={selected.runtime} />
        </ActionPopupFrame>
    );
}
