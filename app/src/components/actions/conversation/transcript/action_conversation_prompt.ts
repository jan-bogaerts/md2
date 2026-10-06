import type { AgentConversationMessageEntry } from '../../../../data/data_types';
import type { ActionQueuedPrompt } from '../../../../data/action_run_types';

export interface ActionConversationPromptSnapshot {
    content: string;
    error?: string;
    prompt: ActionQueuedPrompt | null;
    runId: string | null;
    state: 'transmitting' | 'queued' | 'sending' | 'sent' | 'failed';
}

/** Keeps one message object alive while backend acknowledgements advance its delivery state. */
export class ActionConversationPrompt extends EventTarget {
    readonly entry: AgentConversationMessageEntry;
    private snapshot: ActionConversationPromptSnapshot;
    private notifiedSnapshot: ActionConversationPromptSnapshot;

    constructor(id: string, snapshot: ActionConversationPromptSnapshot) {
        super();
        this.entry = { content: snapshot.content, id, kind: 'message', role: 'user', timestamp: new Date().toISOString() };
        this.snapshot = snapshot;
        this.notifiedSnapshot = snapshot;
    }

    readonly getSnapshot = () => this.snapshot;

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener);

        return () => this.removeEventListener('changed', listener);
    };

    apply(snapshot: ActionConversationPromptSnapshot, message?: AgentConversationMessageEntry) {
        const previous = this.snapshot;
        if (message) Object.assign(this.entry, message);
        this.entry.content = snapshot.content;
        if (previous.content === snapshot.content && previous.error === snapshot.error
            && previous.prompt === snapshot.prompt && previous.runId === snapshot.runId && previous.state === snapshot.state) return;
        this.snapshot = snapshot;
    }

    notify() {
        if (this.notifiedSnapshot === this.snapshot) return;
        this.notifiedSnapshot = this.snapshot;
        this.dispatchEvent(new Event('changed'));
    }
}
