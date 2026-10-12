import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '../../../../data/action_types';
import type { ActionContext } from '../../../../data/action_context';
import { actionRunRegistry } from '../../../../services/actions/action_run_registry';
import { ActionHistoryStore } from '../state/action_history_store';
import { ActionPopupSessionService } from './action_popup_session_service';

const action = { id: 'review', label: 'Review', type: 'agent' } as ActionDefinition;
const context: ActionContext = { cardInternalId: 'card-1', file: 'design/card.md', kind: 'card' };

describe('ActionPopupSessionService', () => {
    const service = new ActionPopupSessionService();

    beforeEach(() => {
        vi.spyOn(ActionHistoryStore.prototype, 'load').mockResolvedValue();
    });
    afterEach(() => {
        service.dispose();
        vi.restoreAllMocks();
    });

    it('keeps bindings through assignment and path changes for the same card', () => {
        const listener = vi.fn();
        const unsubscribe = service.subscribe(listener);
        service.select(action, context);
        const initial = service.getSnapshot();
        const renamedContext = { ...context, file: 'design/renamed.md', title: 'Renamed' };
        service.select(action, renamedContext);

        expect(service.getSnapshot()?.runtime.bindingStore).toBe(initial?.runtime.bindingStore);
        expect(service.getSnapshot()?.runtime.conversationStore.context).toBe(renamedContext);
        expect(service.getSnapshot()?.context).toBe(renamedContext);
        expect(listener).toHaveBeenCalledTimes(2);
        service.select(action, renamedContext);
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        service.select({ ...action, id: 'other' }, context);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('replaces action state and releases outgoing run and usage subscriptions', () => {
        const unsubscribeRun = vi.fn();
        vi.spyOn(actionRunRegistry, 'subscribeRun').mockReturnValue(unsubscribeRun);
        service.select(action, context, 'review-run');
        const outgoing = service.getSnapshot()?.runtime;
        if (!outgoing) throw new Error('Missing selected runtime');
        const stop = vi.spyOn(outgoing.usageValuesService, 'stop');
        const dispose = vi.spyOn(outgoing.bindingStore, 'dispose');

        service.select({ ...action, id: 'build' }, context, 'build-run');

        const incoming = service.getSnapshot()?.runtime;
        expect(incoming?.bindingStore.getSnapshot()).toBe('build-run');
        expect(incoming?.conversationStore.actionId).toBe('build');
        expect(incoming?.conversationStore.getSnapshot().selectedConversation).toBeNull();
        expect(incoming?.inputStore).not.toBe(outgoing.inputStore);
        expect(incoming?.resultStore).not.toBe(outgoing.resultStore);
        expect(stop).toHaveBeenCalledOnce();
        expect(dispose).toHaveBeenCalledOnce();
        expect(unsubscribeRun).toHaveBeenCalledOnce();
        service.dispose();
        expect(unsubscribeRun).toHaveBeenCalledTimes(2);
        expect(service.getSnapshot()).toBeNull();
    });

    it('uses explicit history selection instead of a requested active run', () => {
        service.select(action, context, 'current-run', 'activity.json#conversation=historical');
        expect(service.getSnapshot()?.runtime.bindingStore.getSnapshot()).toBeNull();
        service.select({ ...action, id: 'other' }, context, 'other-run');
        expect(service.getSnapshot()?.runtime.bindingStore.getSnapshot()).toBe('other-run');
    });
});
