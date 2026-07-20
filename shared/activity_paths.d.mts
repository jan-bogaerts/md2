export function projectActivityFolder(projectFolder: string): string
export function cardActivityFileName(cardInternalId: string): string
export function projectActivityFileName(): string
export function activityFilePath(projectFolder: string, origin: { kind: 'card'; cardInternalId: string } | { kind: 'project' }): string
export function conversationActivityReference(activityPath: string, conversationId: string): string
export function parseConversationActivityReference(reference: string): { activityPath: string; conversationId: string }
