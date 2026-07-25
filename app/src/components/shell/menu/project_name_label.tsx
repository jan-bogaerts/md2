import { Typography } from '@mui/material'
import { useProjectState } from '../../hooks/use_project_state'
import { dataService, type DataService } from '../../../services/data/data_service'
import { projectName } from './project_name'

interface ProjectNameLabelProps {
    service?: DataService
}

/** Displays the active project name and updates when the project state changes. */
export function ProjectNameLabel({ service = dataService }: ProjectNameLabelProps) {
    const { project } = useProjectState(service)
    if (!project) return null

    return (
        <Typography
            color="text.secondary"
            data-testid="project-name-label"
            noWrap
            sx={{ fontWeight: 600, minWidth: 0 }}
            variant="body2"
        >
            {projectName(project)}
        </Typography>
    )
}
