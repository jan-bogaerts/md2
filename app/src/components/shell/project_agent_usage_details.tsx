import { Box, Divider, Stack, Typography } from '@mui/material'
import type { AgentTokenUsage } from '../../data/data_types'
import type { AgentUsageVersion } from '../../services/agents/agent_usage'
import { AgentUsageDisplay } from '../agents/agent_usage_display'

interface ProjectAgentUsageDetailsProps {
    projectUsage: AgentTokenUsage
    versions: AgentUsageVersion[]
}

/** Shared project-agent usage detail content for desktop and mobile surfaces. */
export function ProjectAgentUsageDetails(props: ProjectAgentUsageDetailsProps) {
    const { projectUsage, versions } = props

    return (
        <Box sx={{ maxWidth: '100%', minWidth: { md: 360 }, overflow: 'auto' }}>
            <Box sx={{ p: 2 }}>
                <Typography id="project-agent-usage-title" component="h2" sx={{ color: 'text.primary', fontWeight: 700 }} variant="subtitle2">
                    Project agent usage
                </Typography>
                <AgentUsageDisplay usage={projectUsage} />
            </Box>
            <Divider />
            <Stack divider={<Divider flexItem />}>
                {versions.map((version) => (
                    <Box key={version.name} sx={{ p: 2 }}>
                        <Typography sx={{ color: 'text.primary', fontWeight: 600 }} variant="body2">{version.name}</Typography>
                        <AgentUsageDisplay usage={version.usage} />
                    </Box>
                ))}
            </Stack>
        </Box>
    )
}
