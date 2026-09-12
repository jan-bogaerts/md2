export interface StatsDurationComponents {
    agent: number;
    reasoning: number;
    tool: number;
    unmeasured: number;
}

export type StatsDurationComponentKey = keyof StatsDurationComponents;

export interface StatsDurationComponentDescriptor {
    colorGroup: string;
    key: StatsDurationComponentKey;
    label: string;
}

/** Fixed bottom-to-top stacking order; every component is emitted so the legend stays complete. */
export const DURATION_COMPONENTS: readonly StatsDurationComponentDescriptor[] = [
    { colorGroup: 'duration:tool', key: 'tool', label: 'Tools' },
    { colorGroup: 'duration:reasoning', key: 'reasoning', label: 'Reasoning' },
    { colorGroup: 'duration:agent', key: 'agent', label: 'Agent' },
    { colorGroup: 'duration:unmeasured', key: 'unmeasured', label: 'Unmeasured' },
];

export function emptyDurationComponents(): StatsDurationComponents {
    return { agent: 0, reasoning: 0, tool: 0, unmeasured: 0 };
}

/**
 * Splits one run's measured total. A run without a stored split contributes its whole duration to
 * `unmeasured`, so totals and averages that include it stay correct; agent time is always derived,
 * never stored, and the parts are clamped so they can never add up past the total.
 */
export function durationComponents(
    elapsedMs: number,
    reasoningMs: number | null,
    toolMs: number | null,
): StatsDurationComponents {
    if (reasoningMs === null || toolMs === null) return { ...emptyDurationComponents(), unmeasured: elapsedMs };
    const tool = Math.min(Math.max(toolMs, 0), elapsedMs);
    const reasoning = Math.min(Math.max(reasoningMs, 0), elapsedMs - tool);

    return { agent: elapsedMs - tool - reasoning, reasoning, tool, unmeasured: 0 };
}

export function addDurationComponents(left: StatsDurationComponents, right: StatsDurationComponents): StatsDurationComponents {
    return {
        agent: left.agent + right.agent,
        reasoning: left.reasoning + right.reasoning,
        tool: left.tool + right.tool,
        unmeasured: left.unmeasured + right.unmeasured,
    };
}

/** Divides every component by the same run count, so the segments still add up to the average. */
export function scaleDurationComponents(components: StatsDurationComponents, divisor: number): StatsDurationComponents {
    if (divisor === 0) return emptyDurationComponents();

    return {
        agent: components.agent / divisor,
        reasoning: components.reasoning / divisor,
        tool: components.tool / divisor,
        unmeasured: components.unmeasured / divisor,
    };
}

export function totalDurationComponents(components: StatsDurationComponents) {
    return components.agent + components.reasoning + components.tool + components.unmeasured;
}

export function durationComponentShare(value: number, total: number) {
    if (total <= 0) return '0%';

    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format((value / total) * 100)}%`;
}
