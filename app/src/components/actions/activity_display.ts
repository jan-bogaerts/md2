import type { AgentConversationEvent } from '../../data/data_types'

const COMMAND_PREVIEW_LENGTH = 96

export function activityStatusLabel(status?: string) {
    if (!status) return 'Unknown'
    if (status === 'inProgress' || status === 'running' || status === 'started') return 'Running'
    if (status === 'completed') return 'Completed'
    if (status === 'failed') return 'Failed'
    if (status === 'declined') return 'Declined'

    return status
}

export function activityHasError(status?: string) {
    return status === 'failed' || status === 'declined'
}

export function commandPreview(command?: string) {
    const oneLine = command?.replace(/\s+/gu, ' ').trim() ?? ''
    const characters = Array.from(oneLine)
    if (characters.length <= COMMAND_PREVIEW_LENGTH) return oneLine

    return `${characters.slice(0, COMMAND_PREVIEW_LENGTH - 1).join('')}…`
}

export function readableActivityText(value?: string) {
    return value?.trim() ? value.split(/\r?\n/u) : []
}

export function activityIdentity(activity: AgentConversationEvent) {
    return activity.providerItemId ?? activity.id
}
