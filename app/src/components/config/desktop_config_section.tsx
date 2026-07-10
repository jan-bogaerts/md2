import type { ConfigSectionProps } from './config_section_props'
import { ConfigSectionLayout } from './config_section_layout'

const DESKTOP_CONFIG_SECTION_ID = 'desktop'
const DESKTOP_CONFIG_SECTION_LABEL = 'Desktop'

interface DesktopConfigSectionProps extends ConfigSectionProps {
    disabled: boolean
}

export function DesktopConfigSection(props: DesktopConfigSectionProps) {
    const { disabled, draft, entries, onChange, onValidityChange } = props
    const sectionEntries = entries.filter((entry) => entry.section === DESKTOP_CONFIG_SECTION_ID)

    return (
        <ConfigSectionLayout
            disabled={disabled}
            draft={draft}
            entries={sectionEntries}
            id={DESKTOP_CONFIG_SECTION_ID}
            label={DESKTOP_CONFIG_SECTION_LABEL}
            onChange={onChange}
            onValidityChange={onValidityChange}
        />
    )
}
