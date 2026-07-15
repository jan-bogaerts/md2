import { useEffect, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../data/action_context'
import { actionExecutionService } from '../../services/action_execution_service'

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

export function useActionExecution(actionId: string, context: ActionContext) {
    useActionExecutionSnapshot()

    return actionExecutionService.getExecution(actionId, context)
}

export function useRunningActionForContext(context: ActionContext) {
    useActionExecutionSnapshot()

    return actionExecutionService.getRunningExecutionForContext(context)
}

export function useRunningActionForFile(filePath: string | null) {
    useActionExecutionSnapshot()

    return actionExecutionService.getRunningExecutionForFile(filePath)
}

export function useActionExecutions() {
    return useActionExecutionSnapshot().executions
}
