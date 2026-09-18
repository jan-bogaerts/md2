const { readCardIdentity } = require('../../../../shared/markdown_header_fields.mjs');

const MARKDOWN_EXTENSION = '.md';

/**
 * Detects card `status` transitions on the backend, straight from the card files.
 *
 * A card is identified by its `internalId`, never by its path, so renaming or moving a card
 * reports no transition. The remembered status of a card is dropped only once the last path
 * holding that `internalId` is gone, which keeps a rename silent whichever order the watcher
 * reports the removal and the creation in.
 *
 * The first status seen for an `internalId` is remembered without reporting a transition:
 * there is no earlier status to have moved away from. Project activation seeds every card
 * this way, so the first write after startup is a real transition rather than a first sighting.
 */
class CardStateTracker {
    /** `readCardFile(path)` resolves the file content, or null when the file cannot be read. */
    constructor({ readCardFile }) {
        if (typeof readCardFile !== 'function') throw new Error('Card state tracking requires a card file reader');
        this.readCardFile = readCardFile;
        this.statusByInternalId = new Map();
        this.pathsByInternalId = new Map();
        this.internalIdByPath = new Map();
        // Watcher events arrive independently, and each one reads a file. Serializing them keeps
        // two writes to the same card from comparing against the same remembered status.
        this.pendingWork = Promise.resolve();
    }

    reset() {
        this.statusByInternalId.clear();
        this.pathsByInternalId.clear();
        this.internalIdByPath.clear();
    }

    /** Records the starting status of every card, reporting nothing. */
    seed(files) {
        this.reset();
        for (const file of files ?? []) {
            if (!isCardPath(file?.path)) continue;
            const identity = readIdentity(file.content);
            if (!identity) continue;
            this.rememberPath(file.path, identity.internalId);
            this.statusByInternalId.set(identity.internalId, identity.status);
        }
    }

    /**
     * Handles one settled watcher event. Resolves to `{ cardInternalId, state }` when the card
     * moved to a different, non-empty status, and to null in every other case.
     */
    observeChange(event) {
        const work = this.pendingWork.then(() => this.applyChange(event));
        // A failed read must not stop later events, so the chain continues past a rejection.
        this.pendingWork = work.then(() => undefined, () => undefined);

        return work;
    }

    async applyChange(event) {
        const path = event?.path;
        if (!isCardPath(path)) return null;

        if (event.changeKind === 'removed') {
            this.forgetPath(path);

            return null;
        }

        const content = await this.readCardFile(path);
        if (typeof content !== 'string') return null;

        const identity = readIdentity(content);
        if (!identity) {
            // The file stopped being a card, so the path no longer holds any identity.
            this.forgetPath(path);

            return null;
        }

        this.rememberPath(path, identity.internalId);
        const previousStatus = this.statusByInternalId.get(identity.internalId);
        this.statusByInternalId.set(identity.internalId, identity.status);
        if (previousStatus === undefined || previousStatus === identity.status) return null;
        if (identity.status.length === 0) return null;

        return { cardInternalId: identity.internalId, state: identity.status };
    }

    rememberPath(path, internalId) {
        const previousInternalId = this.internalIdByPath.get(path);
        if (previousInternalId !== undefined && previousInternalId !== internalId) this.forgetPath(path);
        this.internalIdByPath.set(path, internalId);
        const paths = this.pathsByInternalId.get(internalId) ?? new Set();
        paths.add(path);
        this.pathsByInternalId.set(internalId, paths);
    }

    forgetPath(path) {
        const internalId = this.internalIdByPath.get(path);
        if (internalId === undefined) return;
        this.internalIdByPath.delete(path);
        const paths = this.pathsByInternalId.get(internalId);
        if (!paths) return;
        paths.delete(path);
        if (paths.size > 0) return;
        this.pathsByInternalId.delete(internalId);
        this.statusByInternalId.delete(internalId);
    }
}

function isCardPath(path) {
    return typeof path === 'string' && path.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

function readIdentity(content) {
    if (typeof content !== 'string') return null;
    try {
        return readCardIdentity(content);
    } catch {
        return null;
    }
}

module.exports = { CardStateTracker };
