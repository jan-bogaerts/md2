import { Button, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { hasActionRunBackend } from '../data/electron_action_bridge'
import { AgentChatFab } from './agents/agent_chat_fab'
import { useProjectReference } from './hooks/use_project_reference'
import { useWorkspaceView } from './hooks/use_workspace_view'
import { requestOpenProjectDialog } from './project_command_events'

interface ProjectWorkspaceAvailabilityProps {
    children: ReactNode
}

function openProjectDialog() {
    requestOpenProjectDialog()
}

/** Show project workspace content only while a project is open. */
export function ProjectWorkspaceAvailability({ children }: ProjectWorkspaceAvailabilityProps) {
    const project = useProjectReference()
    const { viewMode } = useWorkspaceView()

    if (project) return <>{children}{hasActionRunBackend() && viewMode !== 'diagrams' ? <AgentChatFab /> : null}</>

    return (
        <Stack
            spacing={2}
            sx={{ alignItems: 'center', flex: 1, justifyContent: 'center', px: 3, textAlign: 'center' }}
        >
            <Typography component="h2" variant="h6">No project open</Typography>
            <Typography color="text.secondary" variant="body2">
                Open a GitHub repository or local folder to work with project cards.
            </Typography>
            <Button onClick={openProjectDialog} variant="contained">Open project...</Button>
        </Stack>
    )
}
