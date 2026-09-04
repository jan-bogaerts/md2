const HORIZONTAL_DIVIDER_CHANGED_EVENT = 'horizontalDividerChanged';
const VERTICAL_DIVIDER_CHANGED_EVENT = 'verticalDividerChanged';
const ACTIVE_TAB_CHANGED_EVENT = 'activeTabChanged';
const DEFAULT_HORIZONTAL_DIVIDER_RATIO = 0.5;
const DEFAULT_VERTICAL_DIVIDER_RATIO = 0.5;

function clampRatio(ratio: number, orientation: string) {
    if (!Number.isFinite(ratio)) throw new Error(`${orientation} diagram divider ratio must be finite`);

    return Math.min(Math.max(ratio, 0), 1);
}

export type DiagramComparisonTab = 'current' | 'new';

/** Owns comparison layout state without observing or changing diagram state. */
export class DiagramComparisonLayoutService extends EventTarget {
    private activeTab: DiagramComparisonTab = 'current';

    private horizontalDividerRatio = DEFAULT_HORIZONTAL_DIVIDER_RATIO;
    private verticalDividerRatio = DEFAULT_VERTICAL_DIVIDER_RATIO;

    readonly getActiveTabSnapshot = () => this.activeTab;

    readonly getHorizontalDividerSnapshot = () => this.horizontalDividerRatio;

    readonly getVerticalDividerSnapshot = () => this.verticalDividerRatio;

    readonly subscribeHorizontalDivider = (listener: () => void) => {
        this.addEventListener(HORIZONTAL_DIVIDER_CHANGED_EVENT, listener);

        return () => this.removeEventListener(HORIZONTAL_DIVIDER_CHANGED_EVENT, listener);
    };

    readonly subscribeVerticalDivider = (listener: () => void) => {
        this.addEventListener(VERTICAL_DIVIDER_CHANGED_EVENT, listener);

        return () => this.removeEventListener(VERTICAL_DIVIDER_CHANGED_EVENT, listener);
    };

    readonly subscribeActiveTab = (listener: () => void) => {
        this.addEventListener(ACTIVE_TAB_CHANGED_EVENT, listener);

        return () => this.removeEventListener(ACTIVE_TAB_CHANGED_EVENT, listener);
    };

    setActiveTab(tab: DiagramComparisonTab) {
        if (tab === this.activeTab) return;

        this.activeTab = tab;
        this.dispatchEvent(new Event(ACTIVE_TAB_CHANGED_EVENT));
    }

    setHorizontalDividerRatio(ratio: number) {
        const nextRatio = clampRatio(ratio, 'Horizontal');
        if (nextRatio === this.horizontalDividerRatio) return;

        this.horizontalDividerRatio = nextRatio;
        this.dispatchEvent(new Event(HORIZONTAL_DIVIDER_CHANGED_EVENT));
    }

    setVerticalDividerRatio(ratio: number) {
        const nextRatio = clampRatio(ratio, 'Vertical');
        if (nextRatio === this.verticalDividerRatio) return;

        this.verticalDividerRatio = nextRatio;
        this.dispatchEvent(new Event(VERTICAL_DIVIDER_CHANGED_EVENT));
    }
}

export const diagramComparisonLayoutService = new DiagramComparisonLayoutService();
