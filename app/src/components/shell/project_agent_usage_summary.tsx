import DataUsageOutlined from '@mui/icons-material/DataUsageOutlined'
import { Box, Button, Divider, Popover, Stack, Typography } from '@mui/material'
import { useMemo, useState, type MouseEvent } from 'react'
import { DEFAULT_PROJECT_FOLDER } from '../../data/data_types'
import { projectAgentTokenUsage } from '../../services/agents/agent_usage'
import { AgentUsageDisplay } from '../agents/agent_usage_display'
import { useProjectConfig } from '../hooks/use_project_config'
import { useProjectState } from '../hooks/use_project_state'

/** Status-bar project total with read-only current-version and release detail. */
export function ProjectAgentUsageSummary() {
    const { snapshot } = useProjectState()
    const projectConfig = useProjectConfig()
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const projectFolder = projectConfig?.projectFolder ?? DEFAULT_PROJECT_FOLDER
    const totals = useMemo(() => projectAgentTokenUsage(snapshot, projectFolder), [projectFolder, snapshot])

    const openSummary = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const closeSummary = () => {
        setAnchorElement(null)
    }

    const versions = [totals.current, ...totals.releases]

    return (
        <>
            <Button
                aria-label="Agent token usage summary"
                onClick={openSummary}
                size="small"
                startIcon={<DataUsageOutlined sx={{ fontSize: 14 }} />}
                sx={{ color: 'text.secondary', fontSize: 'inherit', minWidth: 0, p: 0.5 }}
            >
                {totals.project.totalTokens.toLocaleString('en-US')} tokens
            </Button>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
                onClose={closeSummary}
                open={!!anchorElement}
                transformOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                <Box sx={{ minWidth: 360 }}>
                    <Box sx={{ p: 2 }}>
                        <Typography component="h2" sx={{ color: 'text.primary', fontWeight: 700 }} variant="subtitle2">
                            Project agent usage
                        </Typography>
                        <AgentUsageDisplay usage={totals.project} />
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
            </Popover>
        </>
    )
}
