import type { ConfigEntry, ConfigKey, ConfigValues } from '../../services/config_service'

export interface ConfigSectionProps {
    draft: ConfigValues
    entries: ConfigEntry[]
    onChange: (key: ConfigKey, value: unknown) => void
    onValidityChange: (key: ConfigKey, valid: boolean) => void
}
