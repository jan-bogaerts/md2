import { useCallback, useSyncExternalStore } from 'react';
import {
    PRIMARY_CHANGES_BUSY_EVENT,
    PRIMARY_CHANGES_LIST_EVENT,
    PRIMARY_CHANGES_MESSAGE_EVENT,
    PRIMARY_CHANGES_OPEN_EVENT,
    primaryChangesService,
} from '../../services/project/primary_changes_service';

function usePrimaryChangesValue<TValue>(eventName: string, getSnapshot: () => TValue) {
    const subscribe = useCallback((onStoreChange: () => void) => {
        primaryChangesService.addEventListener(eventName, onStoreChange);

        return () => primaryChangesService.removeEventListener(eventName, onStoreChange);
    }, [eventName]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function readOpen() {
    return primaryChangesService.isOpen();
}

function readChanges() {
    return primaryChangesService.getChanges();
}

function readMessage() {
    return primaryChangesService.getMessage();
}

function readBusy() {
    return primaryChangesService.isBusy();
}

function readConfirmable() {
    return primaryChangesService.canConfirm();
}

const CONFIRMABLE_EVENTS = [PRIMARY_CHANGES_BUSY_EVENT, PRIMARY_CHANGES_LIST_EVENT, PRIMARY_CHANGES_MESSAGE_EVENT];

function subscribeConfirmable(onStoreChange: () => void) {
    for (const eventName of CONFIRMABLE_EVENTS) primaryChangesService.addEventListener(eventName, onStoreChange);

    return () => {
        for (const eventName of CONFIRMABLE_EVENTS) primaryChangesService.removeEventListener(eventName, onStoreChange);
    };
}

/** Whether the primary changes review dialog is open. */
export function usePrimaryChangesOpen() {
    return usePrimaryChangesValue(PRIMARY_CHANGES_OPEN_EVENT, readOpen);
}

/** The reviewed primary worktree entries; the reference changes only when the list is replaced. */
export function usePrimaryChangesList() {
    return usePrimaryChangesValue(PRIMARY_CHANGES_LIST_EVENT, readChanges);
}

/** Whether OK may be used: idle and either nothing to commit or a commit message entered. */
export function usePrimaryChangesConfirmable() {
    return useSyncExternalStore(subscribeConfirmable, readConfirmable, readConfirmable);
}

export function usePrimaryChangesMessage() {
    return usePrimaryChangesValue(PRIMARY_CHANGES_MESSAGE_EVENT, readMessage);
}

export function usePrimaryChangesBusy() {
    return usePrimaryChangesValue(PRIMARY_CHANGES_BUSY_EVENT, readBusy);
}
