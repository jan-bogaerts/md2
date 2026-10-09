import { actionContextIdentity, type ActionContext } from '../../../../data/action_context';
import type { ActionDefinition } from '../../../../data/action_types';
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge';
import { actionRunSettingsService } from '../../../../services/actions/action_run_settings_service';
import { createActionPopupBindings, worktreeValidationMessage } from './action_popup_runtime';
import type { ActionPopupRuntime } from './action_popup_types';

interface ActionPopupSessionSnapshot {
    action: ActionDefinition;
    context: ActionContext;
    historicalEntries: ActionRunHistoryEntry[] | null;
    identity: string;
    runtime: ActionPopupRuntime;
}

/** Owns the selected action's bindings independently of the mounted popup surface. */
export class ActionPopupSessionService extends EventTarget {
    private snapshot: ActionPopupSessionSnapshot | null = null;

    readonly getSnapshot = () => this.snapshot;

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('selectionChanged', listener);
        return () => this.removeEventListener('selectionChanged', listener);
    };

    select(
        action: ActionDefinition,
        context: ActionContext,
        initialRunId?: string,
        initialConversationPath?: string,
        historicalEntries: ActionRunHistoryEntry[] | null = null,
    ) {
        const contextIdentity = actionContextIdentity(context);
        const identity = `${action.id}\u0000${contextIdentity}`;
        const current = this.snapshot;
        if (current?.action === action && current.context === context && current.historicalEntries === historicalEntries) return;

        const sameSelection = current?.identity === identity;
        if (!sameSelection) this.dispose();
        const bindings = sameSelection
            ? current.runtime
            : createActionPopupBindings(action, context, initialRunId, initialConversationPath, historicalEntries);
        bindings.conversationStore.setContext(context);
        bindings.historyStore.configure(action, context, historicalEntries);
        bindings.usageValuesService.setContext(context);
        const settingsStore = context.cardInternalId
            ? actionRunSettingsService.getCardStore(context.cardInternalId, action.id)
            : actionRunSettingsService.getSessionStore(action.id, contextIdentity, context.kind);
        const runtime = { ...bindings, runValidationError: worktreeValidationMessage(action, context), settingsStore };
        this.snapshot = { action, context, historicalEntries, identity, runtime };
        if (!sameSelection) bindings.usageValuesService.start();
        this.dispatchEvent(new Event('selectionChanged'));
    }

    dispose() {
        this.snapshot?.runtime.usageValuesService.stop();
        this.snapshot?.runtime.bindingStore.dispose();
        this.snapshot = null;
    }
}
