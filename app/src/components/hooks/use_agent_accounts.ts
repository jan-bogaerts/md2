import { useCallback, useSyncExternalStore } from 'react';
import {
    agentAccountService,
    agentAccountStatusChangedEvent,
    agentAccountsChangedEvent,
} from '../../services/agents/agent_account_service';

function subscribeToAccountEvent(eventName: string, listener: () => void) {
    agentAccountService.addEventListener(eventName, listener);

    return () => agentAccountService.removeEventListener(eventName, listener);
}

/** Subscribes to the account list of one agent in configuration order. */
export function useAgentAccounts(agent: string) {
    const subscribe = useCallback((listener: () => void) => subscribeToAccountEvent(agentAccountsChangedEvent(agent), listener), [agent]);
    const getSnapshot = useCallback(() => agentAccountService.getAccounts(agent), [agent]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribes to the metadata of one account of an agent. */
export function useAgentAccount(agent: string, accountId: string) {
    const subscribe = useCallback((listener: () => void) => subscribeToAccountEvent(agentAccountsChangedEvent(agent), listener), [agent]);
    const getSnapshot = useCallback(() => agentAccountService.getAccount(accountId), [accountId]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Subscribes to the login status of one account. */
export function useAgentAccountStatus(accountId: string) {
    const subscribe = useCallback((listener: () => void) => (
        subscribeToAccountEvent(agentAccountStatusChangedEvent(accountId), listener)
    ), [accountId]);
    const getSnapshot = useCallback(() => agentAccountService.getStatus(accountId), [accountId]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
