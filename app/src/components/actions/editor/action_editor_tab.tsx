import { Tab, Tooltip, type TabProps } from '@mui/material'

interface ActionEditorTabProps extends Omit<TabProps, 'label'> {
    error?: string
    label: string
}

/** Action-editor section tab with validation feedback attached to the affected section. */
export function ActionEditorTab(props: ActionEditorTabProps) {
    const { error, label, ...tabProps } = props
    const tabLabel = error ? (
        <Tooltip describeChild title={error}>
            <span>{label}</span>
        </Tooltip>
    ) : label

    return (
        <Tab
            {...tabProps}
            label={tabLabel}
            sx={error ? { color: 'error.main', '&.Mui-selected': { color: 'error.main' } } : undefined}
        />
    )
}
