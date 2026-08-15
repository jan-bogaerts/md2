import DataUsageOutlined from '@mui/icons-material/DataUsageOutlined'
import { Button } from '@mui/material'
import { useMemo, useState, type MouseEvent } from 'react'
import {
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_RELEASES_FOLDER,
} from '../../data/data_types'
import { projectAgentTokenUsage } from '../../services/agents/agent_usage'
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
    const releasesFolder = projectConfig?.releasesFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_RELEASES_FOLDER}`
    const archivedFolder = projectConfig?.archivedFolder ?? `${DEFAULT_PROJECT_FOLDER}/${DEFAULT_ARCHIVED_FOLDER}`
    const totals = useMemo(
        () => projectAgentTokenUsage(snapshot, releasesFolder, archivedFolder),
        [archivedFolder, releasesFolder, snapshot],
    )

    const openSummary = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const closeSummary = () => {
        setAnchorElement(null)
    }

    const versions = [totals.current, totals.archived, ...totals.releases]

    return (
        <>
            {mobile ? (
                <MobileStatusRow
                    accessibleName="Agent token usage summary"
                    icon={<DataUsageOutlined sx={{ fontSize: 18 }} />}
                    label="Project agent usage"
                    onClick={openSummary}
                    value={`${totals.project.totalTokens.toLocaleString('en-US')} tokens`}
                />
            ) : (
                <Button
                    aria-label="Agent token usage summary"
                    onClick={openSummary}
                    size="small"
                    startIcon={<DataUsageOutlined sx={{ fontSize: 14 }} />}
                    sx={{ color: 'text.secondary', fontSize: 'inherit', minWidth: 0, p: 0.5 }}
                >
                    {totals.project.totalTokens.toLocaleString('en-US')} tokens
                </Button>
            )}
            <StatusDetailsSurface
                anchorElement={anchorElement}
                labelId="project-agent-usage-title"
                mobile={mobile}
                onClose={closeSummary}
            >
                <ProjectAgentUsageDetails projectUsage={totals.project} versions={versions} />
            </StatusDetailsSurface>
        </>
    )
}
