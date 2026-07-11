import { Autocomplete, Stack, TextField, Typography } from '@mui/material'
import type { AutocompleteRenderInputParams } from '@mui/material'
import type { SyntheticEvent } from 'react'
import type { TopLevelFolderReference } from '../../../data/data_types'

interface ProjectFolderSetupFormProps {
    folders: TopLevelFolderReference[]
    projectFolder: string
    onProjectFolderChange: (projectFolder: string) => void
}

function renderProjectFolderInput(params: AutocompleteRenderInputParams) {
    return <TextField {...params} label="Project folder" />
}

/** Select or enter the root folder that will contain an MD² project. */
export function ProjectFolderSetupForm(props: ProjectFolderSetupFormProps) {
    const { folders, onProjectFolderChange, projectFolder } = props
    const options = folders.map(({ path }) => path)

    const handleInputChange = (_event: SyntheticEvent, value: string) => {
        onProjectFolderChange(value)
    }

    return (
        <Stack spacing={2}>
            <Typography variant="body2">
                Select an existing root folder or enter a new project folder. MD² will create its active workspace from the template.
            </Typography>
            <Autocomplete
                freeSolo
                inputValue={projectFolder}
                onInputChange={handleInputChange}
                options={options}
                renderInput={renderProjectFolderInput}
            />
        </Stack>
    )
}
