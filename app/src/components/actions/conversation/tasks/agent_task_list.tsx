import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import PendingOutlined from '@mui/icons-material/PendingOutlined'
import RadioButtonUncheckedOutlined from '@mui/icons-material/RadioButtonUncheckedOutlined'
import { Accordion, AccordionDetails, AccordionSummary, Stack, Typography } from '@mui/material'
import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { AgentTask, AgentTaskList as AgentTaskListValue, AgentTaskStatus } from '../../../../data/data_types'
import type { ActionRun } from '../../../../services/actions/action_run_registry'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import type { ActionConversationStore } from '../state/action_conversation_store'

const TASK_LIST_MAX_HEIGHT_SPACING = 20

interface AgentTaskListProps {
    bindingStore: ActionRunBindingStore
    store: ActionConversationStore
}

const selectLiveConversationId = (run: ActionRun | null) => run?.conversation?.id ?? null
const selectLiveTaskList = (run: ActionRun | null) => run?.conversation?.taskList

function taskStatusIcon(status: AgentTaskStatus): ReactNode {
    if (status === 'completed') {
        return <CheckCircleOutlineOutlined aria-label="Completed" sx={{ color: 'success.main', flexShrink: 0, fontSize: 16 }} />
    }
    if (status === 'inProgress') {
        return <PendingOutlined aria-label="In progress" sx={{ color: 'primary.main', flexShrink: 0, fontSize: 16 }} />
    }

    return <RadioButtonUncheckedOutlined aria-label="Pending" sx={{ color: 'custom.text4', flexShrink: 0, fontSize: 16 }} />
}

function taskText(task: AgentTask) {
    return task.status === 'inProgress' ? task.activeForm ?? task.subject : task.subject
}

/** Displays task progress for the live or historical conversation selected by one popup runtime. */
export function AgentTaskList({ bindingStore, store }: AgentTaskListProps) {
    const boundRunId = useBoundRunId(bindingStore)
    const liveConversationId = useRunSelector(boundRunId, selectLiveConversationId)
    const liveTaskList = useRunSelector(boundRunId, selectLiveTaskList)
    const getSelectedConversationId = useCallback(
        () => store.getSnapshot().selectedConversation?.id ?? null,
        [store],
    )
    const getSelectedTaskList = useCallback(
        () => store.getSnapshot().selectedConversation?.taskList,
        [store],
    )
    const selectedConversationId = useSyncExternalStore(store.subscribe, getSelectedConversationId, getSelectedConversationId)
    const selectedTaskList = useSyncExternalStore(store.subscribe, getSelectedTaskList, getSelectedTaskList)
    const taskList: AgentTaskListValue | undefined = selectedConversationId && selectedConversationId !== liveConversationId
        ? selectedTaskList
        : liveConversationId ? liveTaskList : selectedTaskList

    if (!taskList || taskList.tasks.length === 0) return null

    const completedCount = taskList.tasks.filter(({ status }) => status === 'completed').length

    return (
        <Accordion
            aria-label="Agent tasks"
            defaultExpanded
            disableGutters
            elevation={0}
            role="region"
            sx={{
                '&::before': { display: 'none' },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                flexShrink: 0,
                overflow: 'hidden',
            }}
        >
            <AccordionSummary
                aria-label="Toggle agent tasks"
                expandIcon={<ExpandMoreOutlined sx={{ fontSize: 18 }} />}
                sx={{
                    '& .MuiAccordionSummary-content': { alignItems: 'center', justifyContent: 'space-between', my: 0 },
                    '&:hover, &:focus-visible': { bgcolor: 'custom.track' },
                    color: 'text.secondary',
                    minHeight: 32,
                    px: 1,
                }}
            >
                <Typography variant="caption">Tasks</Typography>
                <Typography color="custom.text3" variant="caption">{completedCount}/{taskList.tasks.length}</Typography>
            </AccordionSummary>
            <AccordionDetails
                sx={{
                    borderColor: 'divider',
                    borderTop: '1px solid',
                    maxHeight: (theme) => theme.spacing(TASK_LIST_MAX_HEIGHT_SPACING),
                    overflowY: 'auto',
                    p: 0,
                }}
            >
                <Stack aria-label="Task list" component="ul" role="list" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                    {taskList.tasks.map((task) => (
                        <Stack
                            component="li"
                            direction="row"
                            key={task.id}
                            spacing={0.75}
                            sx={{ alignItems: 'center', minWidth: 0, px: 1, py: 0.5 }}
                        >
                            {taskStatusIcon(task.status)}
                            <Typography color="text.secondary" sx={{ minWidth: 0, overflowWrap: 'anywhere' }} variant="caption">
                                {taskText(task)}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            </AccordionDetails>
        </Accordion>
    )
}
