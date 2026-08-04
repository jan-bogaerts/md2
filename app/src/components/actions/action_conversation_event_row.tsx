import { Box } from '@mui/material'
import { memo } from 'react'
import type { AgentConversationEventEntry } from '../../data/data_types'
import { AgentToolEvent } from './agent_tool_event'
import { CommandExecutionEvent } from './command_execution_event'
import { ReasoningEvent } from './reasoning_event'

interface ActionConversationEventRowProps {
    entry: AgentConversationEventEntry
}

/** Renders one referentially stable transcript event. */
export const ActionConversationEventRow = memo(function ActionConversationEventRow({ entry }: ActionConversationEventRowProps) {
    if (entry.type === 'reasoning') return <Box sx={{ minWidth: 0 }}><ReasoningEvent event={entry} /></Box>
    if (entry.type === 'commandExecution') return <Box sx={{ minWidth: 0 }}><CommandExecutionEvent event={entry} /></Box>

    return <Box sx={{ minWidth: 0 }}><AgentToolEvent event={entry} /></Box>
})
