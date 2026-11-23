import {
    createConversationSearchDocument,
    findConversationTextMatch,
    findConversationTextMatches,
    rangeForMatch,
    type ConversationSearchDirection,
    type ConversationSearchDocument,
    type ConversationTextMatch,
} from '../../actions/conversation/search/action_conversation_search_service';

/** `files` searches file links and focuses them; `file` searches rendered diff text and selects it. */
export type DiffWorkspaceSearchViewportKind = 'file' | 'files';

interface DiffWorkspaceSearchKeyboardEvent {
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    preventDefault: () => void;
    stopPropagation: () => void;
}

interface DiffWorkspaceSearchViewport {
    element: HTMLElement;
    kind: DiffWorkspaceSearchViewportKind;
    textSelector?: string;
}

const ACTIVE_MATCH_CHANGED_EVENT = 'active-match-changed';
const CASE_SENSITIVE_CHANGED_EVENT = 'case-sensitive-changed';
const DRAFT_TERM_CHANGED_EVENT = 'draft-term-changed';
const FOCUS_REQUESTED_EVENT = 'focus-requested';
const OPEN_CHANGED_EVENT = 'open-changed';
const RESULT_COUNT_CHANGED_EVENT = 'result-count-changed';
const SUBMITTED_TERM_CHANGED_EVENT = 'submitted-term-changed';
const VIEWPORT_MOUNTED_CHANGED_EVENT = 'viewport-mounted-changed';
const SEARCH_DEBOUNCE_MS = 800;
const FILE_LINK_SELECTOR = '[data-path]';

function createSearchDocument(viewport: DiffWorkspaceSearchViewport) {
    return createConversationSearchDocument(viewport.element, viewport.textSelector);
}

/** Diff-workspace search: searches only the registered viewport of the active tab and never loads other tabs. */
export class DiffWorkspaceSearchService extends EventTarget {
    private activeMatch: ConversationTextMatch | null = null;
    private caseSensitive = false;
    private draftTerm = '';
    private mutationObserver: MutationObserver | null = null;
    private open = false;
    private resultCount: number | null = null;
    private searchTimer: ReturnType<typeof setTimeout> | null = null;
    private submittedTerm = '';
    private viewport: DiffWorkspaceSearchViewport | null = null;

    readonly getActiveMatchIndex = () => {
        if (!this.activeMatch || !this.viewport || !this.submittedTerm) return null;

        const matches = this.findMatches(createSearchDocument(this.viewport));

        return matches.findIndex(({ end, start }) => start === this.activeMatch?.start && end === this.activeMatch.end);
    };

    readonly getCaseSensitive = () => this.caseSensitive;
    readonly getDraftTerm = () => this.draftTerm;
    readonly getOpen = () => this.open;
    readonly getResultCount = () => this.resultCount;
    readonly getSubmittedTerm = () => this.submittedTerm;
    readonly getViewportMounted = () => !!this.viewport;

    readonly subscribeActiveMatch = this.subscribe(ACTIVE_MATCH_CHANGED_EVENT);
    readonly subscribeCaseSensitive = this.subscribe(CASE_SENSITIVE_CHANGED_EVENT);
    readonly subscribeDraftTerm = this.subscribe(DRAFT_TERM_CHANGED_EVENT);
    readonly subscribeFocusRequested = this.subscribe(FOCUS_REQUESTED_EVENT);
    readonly subscribeOpen = this.subscribe(OPEN_CHANGED_EVENT);
    readonly subscribeResultCount = this.subscribe(RESULT_COUNT_CHANGED_EVENT);
    readonly subscribeSubmittedTerm = this.subscribe(SUBMITTED_TERM_CHANGED_EVENT);
    readonly subscribeViewportMounted = this.subscribe(VIEWPORT_MOUNTED_CHANGED_EVENT);

    /** Register the active tab's content; results are recalculated for it and follow its DOM changes. */
    registerViewport(element: HTMLElement, kind: DiffWorkspaceSearchViewportKind, textSelector?: string) {
        const wasMounted = this.getViewportMounted();
        const viewport = { element, kind, textSelector };
        this.disconnectObserver();
        this.viewport = viewport;
        this.mutationObserver = new MutationObserver(this.refreshMatches);
        this.mutationObserver.observe(element, { characterData: true, childList: true, subtree: true });
        this.setActiveMatch(null);
        this.refreshMatches();
        if (!wasMounted) this.publish(VIEWPORT_MOUNTED_CHANGED_EVENT);

        return () => {
            if (this.viewport !== viewport) return;

            this.disconnectObserver();
            this.clearOwnedSelection();
            this.viewport = null;
            this.setActiveMatch(null);
            this.publish(VIEWPORT_MOUNTED_CHANGED_EVENT);
        };
    }

    openSearch() {
        if (!this.viewport) return;

        if (!this.open) {
            this.open = true;
            this.publish(OPEN_CHANGED_EVENT);
        }
        this.publish(FOCUS_REQUESTED_EVENT);
    }

    closeSearch() {
        this.cancelPendingSearch();
        if (!this.open) return;

        this.open = false;
        this.publish(OPEN_CHANGED_EVENT);
    }

    /** Clear term, case setting, results, and row state, as when the diff source changes. */
    reset() {
        this.closeSearch();
        this.clearOwnedSelection();
        this.setActiveMatch(null);
        this.setResultCount(null);
        if (this.caseSensitive) {
            this.caseSensitive = false;
            this.publish(CASE_SENSITIVE_CHANGED_EVENT);
        }
        if (this.draftTerm) {
            this.draftTerm = '';
            this.publish(DRAFT_TERM_CHANGED_EVENT);
        }
        if (!this.submittedTerm) return;

        this.submittedTerm = '';
        this.publish(SUBMITTED_TERM_CHANGED_EVENT);
    }

    setDraftTerm(term: string) {
        if (this.draftTerm === term) return;

        this.draftTerm = term;
        this.publish(DRAFT_TERM_CHANGED_EVENT);
        this.cancelPendingSearch();
        if (!term) {
            this.clearCompletedSearch();
            return;
        }
        this.searchTimer = setTimeout(this.runDebouncedSearch, SEARCH_DEBOUNCE_MS);
    }

    toggleCaseSensitive() {
        this.caseSensitive = !this.caseSensitive;
        this.publish(CASE_SENSITIVE_CHANGED_EVENT);
        this.cancelPendingSearch();
        if (this.draftTerm) this.runDraftSearch(false);
    }

    submitSearch() {
        this.cancelPendingSearch();
        this.runDraftSearch(true);
    }

    selectNext() {
        if (!this.submittedTerm) return;

        this.searchFrom(this.activeMatch?.end ?? 0, 'next', true);
    }

    selectPrevious() {
        if (!this.submittedTerm) return;

        this.searchFrom(this.activeMatch?.start ?? 0, 'previous', true);
    }

    /** `Ctrl+F` opens and focuses the row, `Escape` closes it, and `F3` selects the next result. */
    handleKeyDown(event: DiffWorkspaceSearchKeyboardEvent) {
        const opensSearch = event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f';
        if (opensSearch && this.viewport) {
            event.preventDefault();
            event.stopPropagation();
            this.openSearch();
            return;
        }
        if (event.key === 'Escape' && this.open) {
            event.preventDefault();
            event.stopPropagation();
            this.closeSearch();
            return;
        }
        if (event.key !== 'F3' || !this.submittedTerm || !this.viewport) return;

        event.preventDefault();
        this.selectNext();
    }

    private readonly runDebouncedSearch = () => {
        this.searchTimer = null;
        this.runDraftSearch(false);
    };

    private readonly refreshMatches = () => {
        if (!this.viewport || !this.submittedTerm) return;

        const matches = this.findMatches(createSearchDocument(this.viewport));
        this.setResultCount(matches.length);
        if (!this.activeMatch) return;

        const retained = matches.some(({ end, start }) => start === this.activeMatch?.start && end === this.activeMatch.end);
        if (!retained) this.setActiveMatch(null);
    };

    private runDraftSearch(focusMatch: boolean) {
        if (!this.draftTerm) return;

        if (this.submittedTerm !== this.draftTerm) {
            this.submittedTerm = this.draftTerm;
            this.publish(SUBMITTED_TERM_CHANGED_EVENT);
        }
        this.searchFrom(0, 'next', focusMatch);
    }

    private searchFrom(offset: number, direction: ConversationSearchDirection, focusMatch: boolean) {
        if (!this.viewport) return;

        const searchDocument = createSearchDocument(this.viewport);
        const matches = this.findMatches(searchDocument);
        this.setResultCount(matches.length);
        const match = findConversationTextMatch(matches, offset, direction);
        if (!match) return;

        this.selectMatch(this.viewport.kind, searchDocument, match, focusMatch);
    }

    /** Files: scroll to (and on explicit navigation focus) the file link. File tab: select the text and scroll to its line. */
    private selectMatch(
        kind: DiffWorkspaceSearchViewportKind,
        searchDocument: ConversationSearchDocument,
        match: ConversationTextMatch,
        focusMatch: boolean,
    ) {
        const range = rangeForMatch(searchDocument, match);
        if (!range) return;

        this.setActiveMatch(match);
        if (kind === 'files') {
            const link = range.startContainer.parentElement?.closest<HTMLElement>(FILE_LINK_SELECTOR);
            link?.scrollIntoView?.({ block: 'nearest' });
            if (focusMatch) link?.focus();
            return;
        }

        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        range.startContainer.parentElement?.scrollIntoView?.({ block: 'nearest' });
    }

    private findMatches(searchDocument: ConversationSearchDocument) {
        return findConversationTextMatches(searchDocument.text, this.submittedTerm, this.caseSensitive);
    }

    private clearOwnedSelection() {
        if (!this.activeMatch || this.viewport?.kind !== 'file') return;

        window.getSelection()?.removeAllRanges();
    }

    private cancelPendingSearch() {
        if (this.searchTimer === null) return;

        clearTimeout(this.searchTimer);
        this.searchTimer = null;
    }

    private clearCompletedSearch() {
        this.clearOwnedSelection();
        this.setActiveMatch(null);
        this.setResultCount(null);
        if (!this.submittedTerm) return;

        this.submittedTerm = '';
        this.publish(SUBMITTED_TERM_CHANGED_EVENT);
    }

    private setActiveMatch(match: ConversationTextMatch | null) {
        if (this.activeMatch?.start === match?.start && this.activeMatch?.end === match?.end) return;

        this.activeMatch = match;
        this.publish(ACTIVE_MATCH_CHANGED_EVENT);
    }

    private setResultCount(count: number | null) {
        if (this.resultCount === count) return;

        this.resultCount = count;
        this.publish(RESULT_COUNT_CHANGED_EVENT);
    }

    private disconnectObserver() {
        this.mutationObserver?.disconnect();
        this.mutationObserver = null;
    }

    private subscribe(eventType: string) {
        return (listener: () => void) => {
            this.addEventListener(eventType, listener);

            return () => this.removeEventListener(eventType, listener);
        };
    }

    private publish(eventType: string) {
        this.dispatchEvent(new Event(eventType));
    }
}
