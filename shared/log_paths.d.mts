import type { ActionContext } from '../app/src/data/action_context.ts'

export function normalizeLogFileValue(value: string): string
export function projectActivityFolder(projectFolder: string): string
export function cardActivityFileName(cardInternalId: string): string
export function projectActivityFileName(): string
export function activityFilePath(projectFolder: string, origin: { kind: 'card'; cardInternalId: string } | { kind: 'project' }): string
export function conversationActivityReference(activityPath: string, conversationId: string): string
export function parseConversationActivityReference(reference: string): { activityPath: string; conversationId: string }
export function projectLogFolder(projectFolder: string): string
export function logScopeValue(scopePath: string, projectFolder: string): string
export function conversationLogFileName(scopePath: string, conversationId: string, projectFolder: string): string
export function historyLogFileName(context: ActionContext, actionId: string, projectFolder: string): string
