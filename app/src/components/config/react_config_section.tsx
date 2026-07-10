import type { ConfigSectionProps } from './config_section_props'
import { ConfigSectionLayout } from './config_section_layout'

const REACT_CONFIG_SECTION_ID = 'react'
const REACT_CONFIG_SECTION_LABEL = 'React app'

export function ReactConfigSection(props: ConfigSectionProps) {
    const { draft, entries, onChange, onValidityChange } = props
    const sectionEntries = entries.filter((entry) => entry.section === REACT_CONFIG_SECTION_ID)

    return (
        <ConfigSectionLayout
            draft={draft}
            entries={sectionEntries}
            id={REACT_CONFIG_SECTION_ID}
            label={REACT_CONFIG_SECTION_LABEL}
            onChange={onChange}
            onValidityChange={onValidityChange}
        />
    )
}
