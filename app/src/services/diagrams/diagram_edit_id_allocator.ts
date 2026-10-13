const MAX_ID_GENERATION_ATTEMPTS = 100;

/** Allocates IDs against current session indexes without exposing those indexes. */
export class DiagramEditIdAllocator {
    private readonly createId: () => string;
    private readonly hasNode: (id: string) => boolean;
    private readonly hasEdge: (id: string) => boolean;

    constructor(
        createId: () => string,
        hasNode: (id: string) => boolean,
        hasEdge: (id: string) => boolean,
    ) {
        this.createId = createId;
        this.hasNode = hasNode;
        this.hasEdge = hasEdge;
    }

    selectableId() {
        return this.objectId((candidate) => this.hasNode(candidate) || this.hasEdge(candidate));
    }

    objectId(taken: (candidate: string) => boolean) {
        for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt += 1) {
            const candidate = this.createId();
            if (candidate && !taken(candidate)) return candidate;
        }

        throw new Error('Could not generate a collision-free diagram object id');
    }

    reservedObjectId(reservedIds: Set<string>) {
        const id = this.objectId((candidate) => reservedIds.has(candidate));
        reservedIds.add(id);
        return id;
    }
}
