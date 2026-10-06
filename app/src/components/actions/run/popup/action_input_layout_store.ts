import { applicationStorage } from '../../../../services/storage/application_storage';

const MIN_PROMPT_HEIGHT = 72;
const MIN_ADJACENT_HEIGHT = 96;
const MIN_QUESTIONS_HEIGHT = 96;
const DEFAULT_INPUT_HEIGHT = 140;
const QUESTIONS_INITIAL_MAX_FRACTION = 0.4;
const RESIZE_STEP = 24;
const SHORT_LAYOUT_ADJACENT_FRACTION = 1 / 3;

type PrimaryRegion = 'prompt' | 'questions';
type QuestionIdentity = string | number | object | null;

interface InputLayoutSnapshot {
    promptHeight: number;
    blockHeight: number | null;
    questionsMaxHeight: number;
    questionsMinHeight: number;
    promptMinHeight: number;
    primaryRegion: PrimaryRegion;
    empty: boolean;
    hasQuestions: boolean;
    resizing: boolean;
    minimum: number;
    maximum: number;
    value: number;
}

function readStoredHeight(key: string) {
    const stored = applicationStorage.getItem(key);
    if (stored === null) return null;
    const height = Number.parseInt(stored, 10);
    return Number.isFinite(height) && height >= 0 ? height : null;
}


/** Owns one action layout's input allocation, question focus, and persisted splitter height. */
export class ActionInputLayoutStore extends EventTarget {
    private readonly storageKey: string;
    readonly kind: 'command' | 'agent';
    private preferredPromptHeight = DEFAULT_INPUT_HEIGHT;
    private preferredBlockHeight: number | null = null;
    private promptHeight = DEFAULT_INPUT_HEIGHT;
    private blockHeight: number | null = null;
    private container: HTMLElement | null = null;
    private promptBlock: HTMLElement | null = null;
    private questions: HTMLElement | null = null;
    private observer: ResizeObserver | null = null;
    private availableHeight: number | null = null;
    private empty = true;
    private questionIdentity: QuestionIdentity = null;
    private primaryRegion: PrimaryRegion = 'questions';
    private pointerStart: { y: number; height: number } | null = null;
    private snapshot: InputLayoutSnapshot;

    constructor(kind: 'command' | 'agent') {
        super();
        this.kind = kind;
        this.storageKey = kind === 'command' ? 'md2.commandActionInputHeight' : 'md2.actionPromptHeight';
        this.snapshot = this.createSnapshot();
    }

    getSnapshot = () => this.snapshot;

    subscribe = (listener: () => void) => {
        this.addEventListener('inputLayout', listener);
        return () => this.removeEventListener('inputLayout', listener);
    };

    /** Reads storage only after mount, once application storage has been initialized. */
    attachContainer = (container: HTMLElement | null) => {
        window.removeEventListener('resize', this.measure);
        this.observer?.disconnect();
        this.observer = null;
        this.container = container;
        if (!container) return;

        this.preferredPromptHeight = readStoredHeight(this.storageKey) ?? DEFAULT_INPUT_HEIGHT;
        this.measure();
        if (typeof ResizeObserver !== 'undefined') {
            this.observer = new ResizeObserver(this.measure);
            this.observer.observe(container);
        }
        window.addEventListener('resize', this.measure);
    };

    dispose = () => {
        this.observer?.disconnect();
        this.observer = null;
        window.removeEventListener('resize', this.measure);
        this.container = null;
        this.pointerStart = null;
    };

    attachPromptBlock = (surface: HTMLElement | null) => {
        this.promptBlock = surface;
    };

    attachQuestions = (surface: HTMLElement | null) => {
        this.questions = surface;
    };

    setInput(empty: boolean, questionIdentity: QuestionIdentity) {
        if (questionIdentity !== this.questionIdentity) {
            this.primaryRegion = 'questions';
            this.preferredBlockHeight = questionIdentity === null
                ? null : readStoredHeight('md2.actionQuestionsBlockHeight');
        }
        this.empty = empty;
        this.questionIdentity = questionIdentity;
        if (this.disabled) this.pointerStart = null;
        this.clampHeights();
        this.publish();
    }

    activatePrompt = (value: string) => {
        if (value.trim().length > 0) this.activateRegion('prompt');
    };

    activateQuestions = () => this.activateRegion('questions');

    beginResize(y: number) {
        if (this.disabled) return;
        this.pointerStart = { y, height: this.currentHeight() };
        this.publish();
    }

    moveResize(y: number) {
        if (!this.pointerStart || this.disabled) return;
        const direction = this.kind === 'command' ? 1 : -1;
        this.setHeight(this.pointerStart.height + (y - this.pointerStart.y) * direction);
    }

    finishResize() {
        if (!this.pointerStart) return;
        this.pointerStart = null;
        if (!this.disabled) this.persistHeight();
        this.publish();
    }

    resizeByKey(key: string) {
        if (this.disabled || (key !== 'ArrowDown' && key !== 'ArrowUp')) return false;
        const direction = this.kind === 'command' ? 1 : -1;
        this.setHeight(this.currentHeight() + (key === 'ArrowDown' ? RESIZE_STEP : -RESIZE_STEP) * direction);
        this.persistHeight();
        return true;
    }

    private get disabled() {
        return this.empty && this.questionIdentity === null;
    }

    private measure = () => {
        const height = this.container?.getBoundingClientRect().height ?? 0;
        const children = this.container ? Array.from(this.container.children) as HTMLElement[] : [];
        const gap = this.container ? Number.parseFloat(getComputedStyle(this.container).rowGap) || 0 : 0;
        const fixedHeight = children.filter((child) => child !== this.promptBlock && !child.hasAttribute('data-layout-adjacent'))
            .reduce((total, child) => total + child.getBoundingClientRect().height, 0);
        // A zero measurement means layout is not available yet (hidden popup or test DOM).
        this.availableHeight = height > 0 ? Math.max(0, height - fixedHeight - gap * Math.max(0, children.length - 1)) : null;
        this.clampHeights();
        this.publish();
    };

    private maximumHeight() {
        if (this.availableHeight === null) return Number.MAX_SAFE_INTEGER;
        const minimumInput = this.questionIdentity === null ? MIN_PROMPT_HEIGHT : MIN_PROMPT_HEIGHT + MIN_QUESTIONS_HEIGHT;
        const adjacent = this.availableHeight < minimumInput + MIN_ADJACENT_HEIGHT
            ? this.availableHeight * SHORT_LAYOUT_ADJACENT_FRACTION : MIN_ADJACENT_HEIGHT;
        return Math.max(0, this.availableHeight - adjacent);
    }

    private minimumHeight() {
        const minimum = this.questionIdentity === null ? MIN_PROMPT_HEIGHT : MIN_PROMPT_HEIGHT + MIN_QUESTIONS_HEIGHT;
        return Math.min(minimum, this.maximumHeight());
    }

    private clamp(height: number) {
        return Math.min(Math.max(height, this.minimumHeight()), this.maximumHeight());
    }

    private clampHeights() {
        this.blockHeight = this.preferredBlockHeight === null ? null : this.clamp(this.preferredBlockHeight);
        const maximum = this.maximumHeight();
        const questionsHeight = this.questionIdentity === null ? 0 : Math.min(
            MIN_QUESTIONS_HEIGHT, this.questions?.getBoundingClientRect().height ?? MIN_QUESTIONS_HEIGHT,
        );
        this.promptHeight = Math.min(Math.max(this.preferredPromptHeight, Math.min(MIN_PROMPT_HEIGHT, maximum)),
            Math.max(0, maximum - questionsHeight));
    }

    private currentHeight() {
        if (this.questionIdentity === null) return this.promptHeight;
        return this.blockHeight ?? this.clamp(this.promptBlock?.getBoundingClientRect().height
            || MIN_PROMPT_HEIGHT + MIN_QUESTIONS_HEIGHT);
    }

    private activateRegion(region: PrimaryRegion) {
        if (this.questionIdentity === null || this.primaryRegion === region) return;
        this.preferredBlockHeight ??= this.currentHeight();
        this.blockHeight = this.clamp(this.preferredBlockHeight);
        this.primaryRegion = region;
        this.publish();
    }

    private setHeight(height: number) {
        if (this.questionIdentity === null) {
            this.preferredPromptHeight = this.clamp(height);
            this.promptHeight = this.preferredPromptHeight;
        } else {
            this.preferredBlockHeight = this.clamp(height);
            this.blockHeight = this.preferredBlockHeight;
        }
        this.publish();
    }

    private persistHeight() {
        const key = this.questionIdentity === null ? this.storageKey : 'md2.actionQuestionsBlockHeight';
        applicationStorage.setItem(key, String(Math.round(this.currentHeight())));
    }

    private createSnapshot(): InputLayoutSnapshot {
        const hasQuestions = this.questionIdentity !== null;
        const maximum = this.maximumHeight();
        const questionsMinHeight = Math.min(MIN_QUESTIONS_HEIGHT, Math.max(0, maximum - Math.min(MIN_PROMPT_HEIGHT, maximum / 2)));
        const promptMinHeight = Math.min(MIN_PROMPT_HEIGHT, Math.max(0, maximum - questionsMinHeight));
        const promptHeight = this.blockHeight === null ? this.promptHeight
            : this.primaryRegion === 'prompt' ? Math.max(0, this.blockHeight - questionsMinHeight)
                : Math.max(0, Math.min(promptMinHeight, this.blockHeight - questionsMinHeight));
        const questionsMaxHeight = Math.min(maximum, Math.max(questionsMinHeight,
            (this.availableHeight ?? 0) * QUESTIONS_INITIAL_MAX_FRACTION));
        return {
            promptHeight, blockHeight: this.blockHeight, questionsMaxHeight, questionsMinHeight, promptMinHeight,
            primaryRegion: this.primaryRegion, empty: this.empty, hasQuestions, resizing: !!this.pointerStart,
            minimum: this.minimumHeight(), maximum, value: hasQuestions
                ? this.clamp(this.blockHeight ?? promptHeight + questionsMaxHeight) : promptHeight,
        };
    }

    private publish() {
        const next = this.createSnapshot();
        const unchanged = Object.keys(next).every((key) =>
            next[key as keyof InputLayoutSnapshot] === this.snapshot[key as keyof InputLayoutSnapshot]);
        if (unchanged) return;
        this.snapshot = next;
        this.dispatchEvent(new Event('inputLayout'));
    }
}
