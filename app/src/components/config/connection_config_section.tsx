import type { ConfigSectionProps } from './config_section_props'
import { ConfigSectionLayout } from './config_section_layout'

const CONNECTION_CONFIG_SECTION_ID = 'connection'
const CONNECTION_CONFIG_SECTION_LABEL = 'Connection'

export function ConnectionConfigSection(props: ConfigSectionProps) {
    const { draft, entries, onChange, onValidityChange } = props
    const sectionEntries = entries.filter((entry) => entry.section === CONNECTION_CONFIG_SECTION_ID)

    return (
        <ConfigSectionLayout
            draft={draft}
            entries={sectionEntries}
            id={CONNECTION_CONFIG_SECTION_ID}
            label={CONNECTION_CONFIG_SECTION_LABEL}
            onChange={onChange}
            onValidityChange={onValidityChange}
        />
    )
}
