import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import { actionExecutionService } from '../../services/actions/action_execution_service'

function useActionExecutionSnapshot() {
    return useSyncExternalStore(
        (listener) => {
            actionExecutionService.addEventListener('changed', listener)

            return () => actionExecutionService.removeEventListener('changed', listener)
        },
        () => actionExecutionService.getSnapshot(),
        () => actionExecutionService.getSnapshot(),
    )
}

function useRunningActionExecutionSnapshot() {
    return useSyncExternalStore(
        (listener) => {
            actionExecutionService.addEventListener('runningChanged', listener)

            return () => actionExecutionService.removeEventListener('runningChanged', listener)
        },
        () => actionExecutionService.getRunningSnapshot(),
        () => actionExecutionService.getRunningSnapshot(),
    )
}

function subscribeToRunningActionChanges(listener: () => void) {
    actionExecutionService.addEventListener('runningChanged', listener)

    return () => actionExecutionService.removeEventListener('runningChanged', listener)
}

function useRunningActionExecutionKey(getExecution: () => { executionId: string, status: string } | null) {
    const getExecutionKey = () => {
        const execution = getExecution()

        return execution ? `${execution.executionId}\u0000${execution.status}` : null
    }

    return useSyncExternalStore(subscribeToRunningActionChanges, getExecutionKey, getExecutionKey)
}

export function useActionExecution(actionId: string, context: ActionContext) {
    useActionExecutionSnapshot()

    return actionExecutionService.getExecution(actionId, context)
}

export function useRunningActionForContext(context: ActionContext) {
    const getExecution = () => actionExecutionService.getRunningExecutionForContext(context)
    const executionKey = useRunningActionExecutionKey(getExecution)
    if (!executionKey) return null

    return getExecution()
}

export function useRunningActionForFile(filePath: string | null) {
    const getExecution = () => actionExecutionService.getRunningExecutionForFile(filePath)
    const executionKey = useRunningActionExecutionKey(getExecution)
    if (!executionKey) return null

    return getExecution()
}

export function useActionExecutions() {
    return useActionExecutionSnapshot().executions
}

export function useRunningActionExecutions() {
    return useRunningActionExecutionSnapshot()
}
