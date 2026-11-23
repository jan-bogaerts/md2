import { Checkbox, FormControlLabel, Stack, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import { projectOpenFlowService } from '../../../services/project/project_open_flow_service'
import { useProjectOpenValue } from '../../hooks/use_project_open_value'

interface ProjectFolderGitInclusionCheckboxProps {
    disabled: boolean
}

/** Folder-setup choice whether a new local project commits its project folder or keeps it local. */
export function ProjectFolderGitInclusionCheckbox(props: ProjectFolderGitInclusionCheckboxProps) {
    const { disabled } = props
    const includeProjectFolderInGit = useProjectOpenValue('includeProjectFolderInGit')

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        projectOpenFlowService.setIncludeProjectFolderInGit(event.target.checked)
    }

    return (
        <Stack spacing={0.125}>
            <FormControlLabel
                control={<Checkbox checked={includeProjectFolderInGit} disabled={disabled} onChange={handleChange} size="small" />}
                label="Include project folder in Git"
            />
            <Typography sx={{ color: 'custom.text3', fontSize: 12 }}>
                When off, the project folder is added to .gitignore and its files stay local. md2.config.json is still committed.
            </Typography>
        </Stack>
    )
}
