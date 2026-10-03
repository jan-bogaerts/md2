import { calculateMainToolbarLayout, TOOLBAR_SEARCH_WIDTH, type MainToolbarLayout } from './main_toolbar_layout';

interface ToolbarElements {
    navigation: HTMLElement;
    project: HTMLElement;
    safeArea: HTMLElement;
    search: HTMLElement;
    toolbar: HTMLElement;
    utilities: HTMLElement;
}

// scrollWidth rounds CSS pixels; leave room for fractional native font metrics.
const TEXT_MEASUREMENT_ALLOWANCE = 2;
const INITIAL_LAYOUT: MainToolbarLayout = { searchPresentation: 'full', searchWidth: TOOLBAR_SEARCH_WIDTH, titleLeft: 0, titleWidth: 0 };

/** Owns header measurements and observes native safe-area, navigation, font, and project-name changes. */
export class MainToolbarLayoutService extends EventTarget {
    private elements: ToolbarElements | null = null;
    private mutationObserver: MutationObserver | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private snapshot: MainToolbarLayout = INITIAL_LAYOUT;

    getSnapshot = () => this.snapshot;

    connect(elements: ToolbarElements) {
        this.disconnect();
        this.elements = elements;
        this.resizeObserver = new ResizeObserver(this.updateLayout);
        for (const element of Object.values(elements)) this.resizeObserver.observe(element);
        const metrics = elements.search.querySelector('[data-search-metrics]');
        if (!metrics) throw new Error('Header search measurements are missing');
        this.resizeObserver.observe(metrics);
        this.mutationObserver = new MutationObserver(this.updateLayout);
        this.mutationObserver.observe(elements.project, { characterData: true, childList: true, subtree: true });
        this.updateLayout();
    }

    disconnect() {
        this.resizeObserver?.disconnect();
        this.mutationObserver?.disconnect();
        this.resizeObserver = null;
        this.mutationObserver = null;
        this.elements = null;
    }

    private updateLayout = () => {
        if (!this.elements) return;
        const { navigation, project, safeArea, search, toolbar, utilities } = this.elements;
        const safeAreaRectangle = safeArea.getBoundingClientRect();
        if (safeAreaRectangle.width === 0) return;
        const metrics = search.querySelector<HTMLElement>('[data-search-metrics]');
        const label = search.querySelector<HTMLElement>('[data-search-label]');
        const word = search.querySelector<HTMLElement>('[data-search-word]');
        if (!metrics || !label || !word) throw new Error('Header search measurements are missing');
        const labelWidth = label.getBoundingClientRect().width;
        const fullWidth = Math.ceil(metrics.getBoundingClientRect().width);
        const gap = Number.parseFloat(getComputedStyle(metrics).columnGap);
        const labelElement = project.querySelector<HTMLElement>('[data-testid="project-name-label"]');
        const measurements = {
            navigationWidth: Math.ceil(navigation.getBoundingClientRect().width),
            safeAreaLeft: safeAreaRectangle.left - toolbar.getBoundingClientRect().left,
            safeAreaWidth: safeAreaRectangle.width,
            searchWidths: {
                full: fullWidth,
                search: Math.ceil(fullWidth - labelWidth + word.getBoundingClientRect().width),
                shortcut: Math.ceil(fullWidth - labelWidth - gap),
            },
            titleWidth: labelElement ? labelElement.scrollWidth + TEXT_MEASUREMENT_ALLOWANCE : 0,
            utilitiesWidth: Math.ceil(utilities.getBoundingClientRect().width),
            viewportWidth: toolbar.getBoundingClientRect().width,
        };
        const nextLayout = calculateMainToolbarLayout(measurements);
        if (nextLayout.searchPresentation === this.snapshot.searchPresentation && nextLayout.searchWidth === this.snapshot.searchWidth
            && nextLayout.titleLeft === this.snapshot.titleLeft && nextLayout.titleWidth === this.snapshot.titleWidth) return;
        this.snapshot = nextLayout;
        this.dispatchEvent(new Event('layoutChanged'));
    };
}

export const mainToolbarLayoutService = new MainToolbarLayoutService();

/** React's external-store adapter uses the service's standard EventTarget lifecycle. */
export function subscribeToolbarLayout(onStoreChange: () => void) {
    mainToolbarLayoutService.addEventListener('layoutChanged', onStoreChange);

    return () => mainToolbarLayoutService.removeEventListener('layoutChanged', onStoreChange);
}
