import type { ActionContext } from '../app/src/data/action_context.ts'

export function normalizeLogFileValue(value: string): string
export function projectLogFolder(projectFolder: string): string
export function logScopeValue(scopePath: string, projectFolder: string): string
export function conversationLogFileName(scopePath: string, conversationId: string, projectFolder: string): string
export function historyLogFileName(context: ActionContext, actionId: string, projectFolder: string): string
