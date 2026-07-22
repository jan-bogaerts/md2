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

function subscribeToRunningActionChanges(listener: () => void) {
    actionExecutionService.addEventListener('runningChanged', listener)

    return () => actionExecutionService.removeEventListener('runningChanged', listener)
}

function useRunningActionExecutionId(getExecutionId: () => string | null) {
    useEffect(() => {
        actionExecutionService.start()
    }, [])

    return useSyncExternalStore(subscribeToRunningActionChanges, getExecutionId, getExecutionId)
}

export function useActionExecution(actionId: string, context: ActionContext) {
    useActionExecutionSnapshot()

    return actionExecutionService.getExecution(actionId, context)
}

export function useRunningActionForContext(context: ActionContext) {
    const getExecutionId = () => actionExecutionService.getRunningExecutionForContext(context)?.executionId ?? null
    const executionId = useRunningActionExecutionId(getExecutionId)
    if (!executionId) return null

    return actionExecutionService.getRunningExecutionForContext(context)
}

export function useRunningActionForFile(filePath: string | null) {
    const getExecutionId = () => actionExecutionService.getRunningExecutionForFile(filePath)?.executionId ?? null
    const executionId = useRunningActionExecutionId(getExecutionId)
    if (!executionId) return null

    return actionExecutionService.getRunningExecutionForFile(filePath)
}

export function useActionExecutions() {
    return useActionExecutionSnapshot().executions
}

export function useRunningActionExecutions() {
    return useRunningActionExecutionSnapshot()
}
