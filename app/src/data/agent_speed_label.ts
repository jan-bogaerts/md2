import { SPEED_MODE_OPTIONS, type SpeedMode } from './agent_profiles';

/** Distinguish a requested speed from the tier acknowledged by the provider. */
export function agentSpeedLabel(settings: { speedMode?: SpeedMode; acknowledgedServiceTier?: string | null }) {
    const { speedMode, acknowledgedServiceTier } = settings;
    const requested = speedMode ? `requested speed: ${SPEED_MODE_OPTIONS.find(({ value }) => value === speedMode)?.label}` : '';
    const acknowledged = acknowledgedServiceTier !== undefined ? `provider tier: ${acknowledgedServiceTier ?? 'provider default'}` : '';

    return [requested, acknowledged].filter((value) => !!value).join('; ');
}
