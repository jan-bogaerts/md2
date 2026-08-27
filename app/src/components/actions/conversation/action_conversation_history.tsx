import { memo } from 'react'
import type { ActionConversationRenderGroup } from './action_conversation_render_groups'
import type { ActionConversationRenderProjection } from './action_conversation_render_projection'
import { ActionConversationGroupList } from './action_conversation_group_list'

interface ActionConversationHistoryProps {
    cardInternalId: string | null
    groups: ActionConversationRenderGroup[]
    projection: ActionConversationRenderProjection
}

/** Renders sealed conversation groups only when their stable group array changes. */
export const ActionConversationHistory = memo(function ActionConversationHistory(
    { cardInternalId, groups, projection }: ActionConversationHistoryProps,
) {
    return <ActionConversationGroupList cardInternalId={cardInternalId} groups={groups} projection={projection} />
})
