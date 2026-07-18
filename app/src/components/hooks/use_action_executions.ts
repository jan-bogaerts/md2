import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import { actionExecutionService } from '../../services/actions/action_execution_service'

function useActionExecutionSnapshot() {
    useEffect(() => {
        actionExecutionService.start()
    }, [])

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
    useEffect(() => {
        actionExecutionService.start()
    }, [])

    return useSyncExternalStore(
        (listener) => {
            actionExecutionService.addEventListener('runningChanged', listener)

            return () => actionExecutionService.removeEventListener('runningChanged', listener)
        },
        () => actionExecutionService.getRunningSnapshot(),
        () => actionExecutionService.getRunningSnapshot(),
    )
}

export function useActionExecution(actionId: string, context: ActionContext) {
    useActionExecutionSnapshot()

    return actionExecutionService.getExecution(actionId, context)
}

export function useRunningActionForContext(context: ActionContext) {
    useRunningActionExecutionSnapshot()

    return actionExecutionService.getRunningExecutionForContext(context)
}

export function useRunningActionForFile(filePath: string | null) {
    useRunningActionExecutionSnapshot()

    return actionExecutionService.getRunningExecutionForFile(filePath)
}

export function useActionExecutions() {
    return useActionExecutionSnapshot().executions
}

export function useRunningActionExecutions() {
    return useRunningActionExecutionSnapshot()
}
