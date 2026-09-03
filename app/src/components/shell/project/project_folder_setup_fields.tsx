import { Autocomplete, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material'
import type { AutocompleteRenderInputParams } from '@mui/material'
import { FolderOpen } from 'mdi-material-ui'
import type { MouseEvent, SyntheticEvent } from 'react'
import { DEFAULT_PROJECT_CONFIG } from '../../../data/data_types'
import {
    resolvedSetupFolders,
    type ProjectFolderSetupResolution,
    type ProjectFolderValues,
} from '../../../services/project/project_session_service'

type FolderField = keyof ProjectFolderValues

interface FolderFieldDescriptor {
    field: FolderField
    helperText: string
    label: string
}

interface ProjectFolderSetupFieldsProps {
    isLoading: boolean
    resolution: ProjectFolderSetupResolution
    values: ProjectFolderValues
    onBrowseFolder: ((field: FolderField) => void) | null
    onValuesChange: (values: ProjectFolderValues) => void
}

const FOLDER_FIELDS: FolderFieldDescriptor[] = [
    { field: 'projectFolder', helperText: 'Repository-root folder holding everything MD² owns.', label: 'Project folder' },
    { field: 'workingFolder', helperText: 'Active cards, inside the project folder.', label: 'Working folder' },
    { field: 'archivedFolder', helperText: 'Archived cards, inside the project folder.', label: 'Archived folder' },
    { field: 'actionsFolder', helperText: 'Action definitions, inside the project folder.', label: 'Actions folder' },
    { field: 'releasesFolder', helperText: 'Release history, inside the project folder.', label: 'Releases folder' },
    { field: 'diagramsFolder', helperText: 'Generated JSON diagram data, inside the project folder.', label: 'Diagrams folder' },
]

/** Resolved repository path of one field, so the form can show what will be created. */
function resolvedFolderPath(values: ProjectFolderValues, field: FolderField) {
    const config = { ...DEFAULT_PROJECT_CONFIG, ...values }
    if (field === 'projectFolder') return values.projectFolder.trim()

    const [workingFolder, archivedFolder, actionsFolder, releasesFolder, diagramsFolder] = resolvedSetupFolders(config)
    if (field === 'workingFolder') return workingFolder
    if (field === 'archivedFolder') return archivedFolder
    if (field === 'actionsFolder') return actionsFolder
    if (field === 'diagramsFolder') return diagramsFolder

    return releasesFolder
}

/** Five editable folder fields, marking the ones that MD² will create on confirm. */
export function ProjectFolderSetupFields(props: ProjectFolderSetupFieldsProps) {
    const { isLoading, onBrowseFolder, onValuesChange, resolution, values } = props
    const existingFolders = new Set(resolution.existingFolderPaths)
    const topLevelFolderOptions = resolution.folders.map(({ path }) => path)
    const projectFolderPrefix = `${values.projectFolder.trim().replace(/\/+$/u, '')}/`
    const subFolderOptions = resolution.existingFolderPaths
        .filter((folderPath) => folderPath.startsWith(projectFolderPrefix))
        .map((folderPath) => folderPath.slice(projectFolderPrefix.length))

    const handleBrowseClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (!onBrowseFolder) return

        onBrowseFolder(event.currentTarget.value as FolderField)
    }

    const renderFolderInput = (descriptor: FolderFieldDescriptor, isMissing: boolean) => {
        function renderInput(params: AutocompleteRenderInputParams) {
            return (
                <TextField
                    {...params}
                    helperText={isMissing ? `${descriptor.helperText} Will be created.` : descriptor.helperText}
                    label={descriptor.label}
                    size="small"
                    slotProps={{
                        ...params.slotProps,
                        input: {
                            ...params.slotProps.input,
                            endAdornment: onBrowseFolder ? (
                                <InputAdornment position="end">
                                    <Tooltip title={`Choose ${descriptor.label.toLowerCase()}`}>
                                        <span>
                                            <IconButton
                                                aria-label={`Choose ${descriptor.label.toLowerCase()}`}
                                                disabled={isLoading}
                                                edge="end"
                                                onClick={handleBrowseClick}
                                                value={descriptor.field}
                                            >
                                                <FolderOpen />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </InputAdornment>
                            ) : params.slotProps.input.endAdornment,
                        },
                    }}
                />
            )
        }

        return renderInput
    }

    return (
        <Stack spacing={2}>
            <Typography variant="body2">
                {resolution.hasProjectConfig
                    ? 'Check where this project keeps its folders. Missing folders are created when you confirm.'
                    : 'Choose where MD² should keep this project. Missing folders are created when you confirm.'}
            </Typography>
            {FOLDER_FIELDS.map((descriptor) => {
                const resolvedPath = resolvedFolderPath(values, descriptor.field)
                const isMissing = resolvedPath.length > 0 && !existingFolders.has(resolvedPath)
                const handleInputChange = (_event: SyntheticEvent, value: string) => {
                    onValuesChange({ ...values, [descriptor.field]: value })
                }

                return (
                    <Autocomplete
                        disabled={isLoading}
                        freeSolo
                        inputValue={values[descriptor.field]}
                        key={descriptor.field}
                        onInputChange={handleInputChange}
                        options={descriptor.field === 'projectFolder' ? topLevelFolderOptions : subFolderOptions}
                        renderInput={renderFolderInput(descriptor, isMissing)}
                    />
                )
            })}
        </Stack>
    )
}
