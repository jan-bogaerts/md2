import type { ConfigSectionProps } from './config_section_props'
import { ConfigSectionLayout } from './config_section_layout'
import { worktreeService } from '../../services/project/worktree_service'
import { WorktreeConfigList } from './worktree_config_list'

const PROJECT_CONFIG_SECTION_ID = 'project'
const PROJECT_CONFIG_SECTION_LABEL = 'Project'

interface ProjectConfigSectionProps extends ConfigSectionProps {
    disabled?: boolean
}

export function ProjectConfigSection(props: ProjectConfigSectionProps) {
    const { disabled = false, draft, entries, onChange, onValidityChange } = props
    const sectionEntries = entries.filter((entry) => entry.section === PROJECT_CONFIG_SECTION_ID)

    return (
        <>
            <ConfigSectionLayout
                disabled={disabled}
                draft={draft}
                entries={sectionEntries}
                id={PROJECT_CONFIG_SECTION_ID}
                label={PROJECT_CONFIG_SECTION_LABEL}
                onChange={onChange}
                onValidityChange={onValidityChange}
            />
            {worktreeService.isSupported() && !disabled ? <WorktreeConfigList /> : null}
        </>
    )
}
