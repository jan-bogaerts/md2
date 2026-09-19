/**
 * Announces conversation view-state changes made on the backend to every attached window.
 *
 * Only the canonical conversation id and the new `viewed` value travel: a renderer already holds the
 * conversation, so it needs the one field that changed, not a republished conversation or card.
 * One instance lives in the bridge dispatch, which every window shares, so a write made in one
 * window reaches all of them.
 */
const CONVERSATION_VIEWED_EVENT = 'conversationViewed';

class ConversationViewEvents extends EventTarget {
    /** Registers a listener and returns the cleanup that removes it. */
    subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('Conversation view subscription requires a listener');
        const handleViewed = (event) => {
            try {
                listener(event.detail);
            } catch (error) {
                console.error('Conversation view listener failed', error);
            }
        };
        this.addEventListener(CONVERSATION_VIEWED_EVENT, handleViewed);

        return () => this.removeEventListener(CONVERSATION_VIEWED_EVENT, handleViewed);
    }

    /** Reports a completed view-state write. A failing listener must not stop the others. */
    emit(event) {
        this.dispatchEvent(new CustomEvent(CONVERSATION_VIEWED_EVENT, { detail: event }));
    }
}

module.exports = { ConversationViewEvents };
