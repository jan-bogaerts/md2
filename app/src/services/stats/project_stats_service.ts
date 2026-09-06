import { projectUsageMetricsService } from '../agents/project_usage_metrics_service';
import { configService } from '../config/config_service';
import type { AgentProfile } from '../../data/agent_profiles';
import { register } from '../service_injector';
import { ProjectStatsLoader, type StatsCalculator } from './project_stats_loader';
import {
    INITIAL_SNAPSHOT,
    type LoadedStatsSource,
    type ProjectStatsSnapshot,
    type StatsCardDescriptor,
    type StatsControls,
    type StatsProjectBinding,
} from './project_stats_types';
import { buildSnapshot } from './stats_snapshot_builder';

function isValidIsoTimestamp(value: string) {
    const milliseconds = Date.parse(value);

    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function validateRangeTimestamp(value: string | null, field: string) {
    if (value !== null && !isValidIsoTimestamp(value)) throw new Error(`Invalid stats ${field}`);
}

/** Owns the stats viewing session: binding, load coordination, control updates, and snapshot notifications. */
export class ProjectStatsService extends EventTarget {
    private abortController: AbortController | null = null;
    private readonly loader: ProjectStatsLoader;
    private loadRevision = 0;
    private binding: StatsProjectBinding | null = null;
    private cards: StatsCardDescriptor[] = [];
    private isOpen = false;
    private projectKey: string | null = null;
    private snapshot = INITIAL_SNAPSHOT;
    private source: LoadedStatsSource | null = null;

    constructor(calculateStats?: StatsCalculator) {
        super();
        this.loader = new ProjectStatsLoader(calculateStats);
    }

    getSnapshot = () => this.snapshot;

    subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener);

        return () => this.removeEventListener('changed', listener);
    };

    bindProject(binding: StatsProjectBinding) {
        const projectKey = `${binding.project.id}:${binding.project.branch}`;
        if (projectKey !== this.projectKey) this.clear();
        this.projectKey = projectKey;
        this.binding = binding;
    }

    clear() {
        this.close();
        this.binding = null;
        this.projectKey = null;
    }

    async open(cards: StatsCardDescriptor[], agentProfiles: AgentProfile[] = configService.get('desktop.agentProfiles')) {
        if (!this.binding) throw new Error('Project stats are not bound to a project');
        if (this.isOpen) return;
        this.cards = cards;
        this.isOpen = true;
        this.abortController = new AbortController();
        await this.load(this.binding, agentProfiles, this.abortController.signal);
    }

    close() {
        this.loadRevision += 1;
        this.abortController?.abort();
        this.abortController = null;
        this.cards = [];
        this.isOpen = false;
        this.source = null;
        projectUsageMetricsService.clear();
        this.publish({ ...INITIAL_SNAPSHOT, controls: this.snapshot.controls });
    }

    setControls(changes: Partial<StatsControls>) {
        const controls = { ...this.snapshot.controls, ...changes };
        validateRangeTimestamp(controls.startUtc, 'startUtc');
        validateRangeTimestamp(controls.endUtc, 'endUtc');
        if (controls.startUtc && controls.endUtc && Date.parse(controls.startUtc) > Date.parse(controls.endUtc)) {
            throw new Error('Stats start date must not be after end date');
        }
        // A display-only control changes no aggregated row, so keep the existing rows object
        // instead of paying for a full rebuild.
        const changedKeys = Object.keys(changes) as (keyof StatsControls)[];
        const displayOnly = changedKeys.length > 0
            && changedKeys.every((key) => key === 'shortTokenCounts');
        if (!this.source || displayOnly) {
            this.publish({ ...this.snapshot, controls });
            return;
        }

        this.publish(buildSnapshot(this.source, controls));
    }

    private async load(binding: StatsProjectBinding, agentProfiles: AgentProfile[], signal: AbortSignal) {
        const revision = ++this.loadRevision;
        const isCurrent = () => this.isCurrentLoad(revision, binding, signal);
        this.publish({ ...this.snapshot, error: null, rows: [], status: 'loading' });
        try {
            const source = await this.loader.loadSource(binding, this.cards, signal, isCurrent);
            if (!source) return;
            this.source = { ...source, agentProfiles };
            this.publish(buildSnapshot(this.source, this.snapshot.controls));
        } catch (error) {
            if (!isCurrent()) return;
            const normalizedError = error instanceof Error ? error : new Error(String(error));
            this.source = null;
            this.publish({ ...this.snapshot, error: normalizedError, rows: [], status: 'error' });
        }
    }

    private isCurrentLoad(revision: number, binding: StatsProjectBinding, signal: AbortSignal) {
        return !signal.aborted && this.isOpen && revision === this.loadRevision && binding === this.binding;
    }

    private publish(snapshot: ProjectStatsSnapshot) {
        this.snapshot = snapshot;
        this.dispatchEvent(new Event('changed'));
    }
}

export const projectStatsService = register('projectStatsService', new ProjectStatsService());
