import {
    CURRENT_RELEASE_IDENTITY,
    type LoadedStatsSource,
    type StatsControls,
    type StatsDatasetSource,
    type StatsOptions,
    type StatsReleaseOption,
} from './project_stats_types';
import { accountSeriesIdentity, modelIdentity } from './stats_identities';

function optionList(entries: Array<[string, string]>) {
    return [...new Map(entries).entries()]
        .map(([identity, label]) => ({ identity, label }))
        .sort((left, right) => left.label.localeCompare(right.label) || left.identity.localeCompare(right.identity));
}

export function completedReleaseIdentity(releaseName: string) {
    return `completed-release:${releaseName}`;
}

/** Builds stable release choices without treating persistence paths as release identity. */
export function buildReleaseOptions(source: LoadedStatsSource): StatsReleaseOption[] {
    const completedReleases = Object.keys(source.releaseStats)
        .sort((left, right) => left.localeCompare(right))
        .map((releaseName) => ({ identity: completedReleaseIdentity(releaseName), label: releaseName, releaseName }));

    return [{ identity: CURRENT_RELEASE_IDENTITY, label: 'Current release', releaseName: null }, ...completedReleases];
}

/** Derives entity and account-series catalogs from selected release plus release choices. */
export function buildOptions(source: StatsDatasetSource, releases: StatsReleaseOption[]): StatsOptions {
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

    return { accountSeries, actions, agents, models, releases };
}

function retainValidSelections(selected: string[], available: Set<string>) {
    return selected.filter((identity) => available.has(identity));
}

/** Drops entity selections that the freshly loaded source no longer offers. */
export function reconcileControls(controls: StatsControls, options: StatsOptions): StatsControls {
    const releaseIdentity = options.releases.some(({ identity }) => identity === controls.releaseIdentity)
        ? controls.releaseIdentity
        : CURRENT_RELEASE_IDENTITY;

    return {
        ...controls,
        performanceActionIds: retainValidSelections(
            controls.performanceActionIds,
            new Set(options.actions.map(({ identity }) => identity)),
        ),
        performanceAgentIds: retainValidSelections(controls.performanceAgentIds, new Set(options.agents.map(({ identity }) => identity))),
        performanceModelIds: retainValidSelections(controls.performanceModelIds, new Set(options.models.map(({ identity }) => identity))),
        releaseIdentity,
    };
}
