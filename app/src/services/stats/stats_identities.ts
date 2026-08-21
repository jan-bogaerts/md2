import type { UsageMetricsAccountRow } from '../agents/project_usage_metrics_service';
import type { StatsAccountSeriesOption, StatsCardDescriptor } from './project_stats_types';

/** NUL joins identity parts so no agent, model, or limit name can forge a composite identity. */
export const IDENTITY_SEPARATOR = String.fromCodePoint(0);

export function modelIdentity(agent: string, model: string) {
    return `${agent}${IDENTITY_SEPARATOR}${model}`;
}

export function accountSeriesIdentity(row: UsageMetricsAccountRow) {
    return `${row.provider}${IDENTITY_SEPARATOR}${row.limitId}${IDENTITY_SEPARATOR}${row.windowId}`;
}

export function accountSeriesLabel(series: StatsAccountSeriesOption) {
    return `${series.provider} / ${series.limitId} / ${series.windowId}`;
}

export function actionLabel(actionId: string, storedLabel: string | null) {
    return storedLabel ?? actionId;
}

/** Prefers the visible card ID for display while keeping title and path in the tooltip. */
export function cardDisplay(cardInternalId: string, cardPath: string | null, cardsById: Map<string, StatsCardDescriptor>) {
    const card = cardsById.get(cardInternalId);
    if (card) return { label: card.visibleId, tooltip: `${card.visibleId}: ${card.title}; ${card.path}` };
    const fallback = cardPath ?? cardInternalId;

    return { label: fallback, tooltip: fallback };
}
