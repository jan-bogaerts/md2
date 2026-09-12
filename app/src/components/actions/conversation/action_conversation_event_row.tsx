import { Box, Stack } from '@mui/material'
import { memo } from 'react'
import type { AgentConversationEventEntry } from '../../../data/data_types'
import { AgentToolEvent } from './agent_tool_event'
import { CommandExecutionEvent } from './command_execution_event'
import { ReasoningEvent } from './reasoning_event'
import { ActionConversationCopyButton } from './action_conversation_copy_button'
import { actionConversationEventMarkdown } from './action_conversation_event_markdown'

interface ActionConversationEventRowProps {
    entry: AgentConversationEventEntry
    grouped: boolean
}

/** Renders one referentially stable transcript event. */
export const ActionConversationEventRow = memo(function ActionConversationEventRow({ entry, grouped }: ActionConversationEventRowProps) {
    const event = entry.type === 'reasoning'
        ? <ReasoningEvent event={entry} />
        : entry.type === 'commandExecution'
            ? <CommandExecutionEvent event={entry} grouped={grouped} />
            : <AgentToolEvent event={entry} grouped={grouped} />

    return (
        <Stack
            className="conversation-event-row"
            direction="row"
            sx={{ alignItems: 'flex-start', minWidth: 0, width: '100%' }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>{event}</Box>
            <Box
                sx={{
                    flexShrink: 0,
                    opacity: 0,
                    transition: (theme) => theme.transitions.create('opacity'),
                    width: 28,
                    '@media (hover: none)': { opacity: 1 },
                    '.conversation-event-row:hover &': { opacity: 1 },
                    '.conversation-event-row:focus-within &': { opacity: 1 },
                }}
            >
                <ActionConversationCopyButton label="Copy event" text={actionConversationEventMarkdown(entry)} />
            </Box>
        </Stack>
    )
})
