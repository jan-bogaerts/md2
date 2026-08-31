import type { LoadedStatsSource, StatsControls, StatsOptions } from './project_stats_types';
import { accountSeriesIdentity, modelIdentity } from './stats_identities';

function optionList(entries: Array<[string, string]>) {
    return [...new Map(entries).entries()]
        .map(([identity, label]) => ({ identity, label }))
        .sort((left, right) => left.label.localeCompare(right.label) || left.identity.localeCompare(right.identity));
}

/** Derives the selectable action, agent, model, and account-series catalogs from one loaded source. */
export function buildOptions(source: LoadedStatsSource): StatsOptions {
    const attributed = source.stats.conversations.filter(({ agent, isRootConversation, model }) => isRootConversation && agent && model);
    const actions = optionList([
        ...source.stats.actions.map(({ actionId, actionLabel }) => [actionId, actionLabel] as [string, string]),
        ...source.stats.conversations.flatMap(({ actionId, actionLabel }) => (
            actionId ? [[actionId, actionLabel ?? actionId] as [string, string]] : []
        )),
    ]);
    const agents = optionList(attributed.map(({ agent }) => [agent!, agent!]));
    const models = optionList(attributed.map(({ agent, model }) => [modelIdentity(agent!, model!), `${agent} - ${model}`]));
    const accountSeries = [...new Map(source.accountRows.map((row) => [accountSeriesIdentity(row), {
        identity: accountSeriesIdentity(row),
        limitId: row.limitId,
        provider: row.provider,
        windowDurationMinutes: row.windowDurationMinutes,
        windowId: row.windowId,
    }])).values()].sort((left, right) => left.identity.localeCompare(right.identity));

    return { accountSeries, actions, agents, models };
}

function retainValidSelections(selected: string[], available: Set<string>) {
    return selected.filter((identity) => available.has(identity));
}

/** Drops entity selections that the freshly loaded source no longer offers. */
export function reconcileControls(controls: StatsControls, options: StatsOptions): StatsControls {
    return {
        ...controls,
        performanceActionIds: retainValidSelections(
            controls.performanceActionIds,
            new Set(options.actions.map(({ identity }) => identity)),
        ),
        performanceAgentIds: retainValidSelections(controls.performanceAgentIds, new Set(options.agents.map(({ identity }) => identity))),
        performanceModelIds: retainValidSelections(controls.performanceModelIds, new Set(options.models.map(({ identity }) => identity))),
    };
}
