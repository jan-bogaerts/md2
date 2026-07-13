import type { ConfigSectionProps } from './config_section_props'
import { ConfigSectionLayout } from './config_section_layout'
import { getElectronDataBridge } from '../../data/electron_data_bridge'
import { WorktreeConfigList } from './worktree_config_list'

const PROJECT_CONFIG_SECTION_ID = 'project'
const PROJECT_CONFIG_SECTION_LABEL = 'Project'

export function ProjectConfigSection(props: ConfigSectionProps) {
    const { draft, entries, onChange, onValidityChange } = props
    const sectionEntries = entries.filter((entry) => entry.section === PROJECT_CONFIG_SECTION_ID)

    return (
        <>
            <ConfigSectionLayout
                draft={draft}
                entries={sectionEntries}
                id={PROJECT_CONFIG_SECTION_ID}
                label={PROJECT_CONFIG_SECTION_LABEL}
                onChange={onChange}
                onValidityChange={onValidityChange}
            />
            {getElectronDataBridge() ? <WorktreeConfigList /> : null}
        </>
    )
}
