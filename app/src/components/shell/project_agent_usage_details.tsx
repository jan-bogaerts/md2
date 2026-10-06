import { Box, Divider, Stack, Typography } from '@mui/material'
import type { AgentTokenUsage } from '../../data/data_types'
import type { AgentUsageVersion } from '../../services/agents/agent_usage'
import { AgentUsageDisplay } from '../agents/agent_usage_display'

const COST_NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

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
                <Box sx={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
                    <AgentUsageDisplay usage={projectUsage} />
                    <Typography component="span" sx={{ color: 'text.secondary' }} variant="caption">
                        {projectUsage.costUsd === undefined
                            ? 'Cost: Data missing'
                            : `Cost: $${COST_NUMBER_FORMAT.format(projectUsage.costUsd)}`}
                    </Typography>
                </Box>
            </Box>
            <Divider />
            <Stack divider={<Divider flexItem />}>
                {versions.map((version) => (
                    <Box key={version.name} sx={{ p: 2 }}>
                        <Typography sx={{ color: 'text.primary', fontWeight: 600 }} variant="body2">{version.name}</Typography>
                        <Box sx={{ alignItems: 'baseline', display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between' }}>
                            <AgentUsageDisplay usage={version.usage} />
                            <Typography component="span" sx={{ color: 'text.secondary' }} variant="caption">
                                {version.usage.costUsd === undefined
                                    ? 'Cost: Data missing'
                                    : `Cost: $${COST_NUMBER_FORMAT.format(version.usage.costUsd)}`}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Stack>
        </Box>
    )
}
