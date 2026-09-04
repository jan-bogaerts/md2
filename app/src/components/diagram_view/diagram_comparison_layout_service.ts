const HORIZONTAL_DIVIDER_CHANGED_EVENT = 'horizontalDividerChanged';
const DEFAULT_HORIZONTAL_DIVIDER_RATIO = 0.5;

function clampRatio(ratio: number) {
    if (!Number.isFinite(ratio)) throw new Error('Horizontal diagram divider ratio must be finite');

    return Math.min(Math.max(ratio, 0), 1);
}

/** Owns comparison layout state without observing or changing diagram state. */
export class DiagramComparisonLayoutService extends EventTarget {
    private horizontalDividerRatio = DEFAULT_HORIZONTAL_DIVIDER_RATIO;

    readonly getHorizontalDividerSnapshot = () => this.horizontalDividerRatio;

    readonly subscribeHorizontalDivider = (listener: () => void) => {
        this.addEventListener(HORIZONTAL_DIVIDER_CHANGED_EVENT, listener);

        return () => this.removeEventListener(HORIZONTAL_DIVIDER_CHANGED_EVENT, listener);
    };

    setHorizontalDividerRatio(ratio: number) {
        const nextRatio = clampRatio(ratio);
        if (nextRatio === this.horizontalDividerRatio) return;

        this.horizontalDividerRatio = nextRatio;
        this.dispatchEvent(new Event(HORIZONTAL_DIVIDER_CHANGED_EVENT));
    }
}

export const diagramComparisonLayoutService = new DiagramComparisonLayoutService();
