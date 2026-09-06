import DataUsageOutlined from '@mui/icons-material/DataUsageOutlined'
import { Button } from '@mui/material'
import { useMemo, useState, useSyncExternalStore, type MouseEvent } from 'react'
import {
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_PROJECT_FOLDER,
} from '../../data/data_types'
import { projectAgentTokenUsage } from '../../services/agents/agent_usage'
import { formatTokenCount } from '../agents/token_count'
import { projectAgentTokenUsageService } from '../../services/agents/project_agent_token_usage_service'
import { useProjectConfig } from '../hooks/use_project_config'
import { useProjectState } from '../hooks/use_project_state'
import { MobileStatusRow } from './mobile_status_row'
import { ProjectAgentUsageDetails } from './project_agent_usage_details'
import { StatusDetailsSurface } from './status_details_surface'

/** Status-bar project total with read-only current-version and release detail. */
interface ProjectAgentUsageSummaryProps {
    mobile?: boolean
}

export function ProjectAgentUsageSummary({ mobile = false }: ProjectAgentUsageSummaryProps) {
    const { snapshot } = useProjectState()
    const projectConfig = useProjectConfig()
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const archivedFolder = projectConfig?.archivedFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_ARCHIVED_FOLDER}`
    const summary = useSyncExternalStore(projectAgentTokenUsageService.subscribe, projectAgentTokenUsageService.getSnapshot)
    const totals = useMemo(
        () => summary ? projectAgentTokenUsage(snapshot, archivedFolder, summary) : null,
        [archivedFolder, snapshot, summary],
    )

    const openSummary = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const closeSummary = () => {
        setAnchorElement(null)
    }

    const versions = totals ? [totals.current, totals.archived, ...totals.releases] : []
    const totalLabel = totals ? `${formatTokenCount(totals.project.totalTokens)} tokens` : 'Usage unavailable'

    return (
        <>
            {mobile ? (
                <MobileStatusRow
                    accessibleName="Agent token usage summary"
                    icon={<DataUsageOutlined sx={{ fontSize: 18 }} />}
                    label="Project agent usage"
                    onClick={openSummary}
                    value={totalLabel}
                />
            ) : (
                <Button
                    aria-label="Agent token usage summary"
                    onClick={openSummary}
                    size="small"
                    startIcon={<DataUsageOutlined sx={{ fontSize: 14 }} />}
                    sx={{ color: 'text.secondary', fontSize: 'inherit', minWidth: 0, p: 0.5 }}
                >
                    {totalLabel}
                </Button>
            )}
            <StatusDetailsSurface
                anchorElement={anchorElement}
                labelId="project-agent-usage-title"
                mobile={mobile}
                onClose={closeSummary}
            >
                {totals ? <ProjectAgentUsageDetails projectUsage={totals.project} versions={versions} /> : null}
            </StatusDetailsSurface>
        </>
    )
}
