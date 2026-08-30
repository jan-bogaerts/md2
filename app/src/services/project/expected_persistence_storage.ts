import type {
    CommitRequest,
    DeleteFileRequest,
    DeleteFolderRequest,
    MoveFilesRequest,
    ProjectReference,
    StorageService,
} from '../../data/data_types';
import { normalizePath } from '../../../../shared/path_utils.mjs';
import {
    type ExpectedPersistenceOutcome,
    ExpectedPersistenceOutcomes,
} from './expected_persistence_outcomes';

export interface ExpectedPersistenceStorageDependencies {
    outcomes: ExpectedPersistenceOutcomes;
    project(): ProjectReference | null;
    repositoryFiles(): string[];
    verifyRetainedOutcomes(): Promise<void>;
}

function commitOutcomes(request: CommitRequest): ExpectedPersistenceOutcome[] {
    return [
        ...(request.moves ?? []).flatMap(({ content, encoding, fromPath, toPath }) => [
            { kind: 'absent' as const, path: fromPath },
            { content, ...(encoding ? { encoding } : {}), kind: 'present' as const, path: toPath },
        ]),
        ...request.files.map(({ content, encoding, path }) => ({
            content,
            ...(encoding ? { encoding } : {}),
            kind: 'present' as const,
            path,
        })),
    ];
}

function moveOutcomes(request: MoveFilesRequest): ExpectedPersistenceOutcome[] {
    return request.moves.flatMap(({ content, encoding, fromPath, toPath }) => [
        { kind: 'absent' as const, path: fromPath },
        { content, ...(encoding ? { encoding } : {}), kind: 'present' as const, path: toPath },
    ]);
}

function folderDeleteOutcomes(request: DeleteFolderRequest, repositoryFiles: string[]): ExpectedPersistenceOutcome[] {
    const normalizedFolder = normalizePath(request.path).replace(/\/+$/u, '');
    const prefix = `${normalizedFolder}/`;

    return repositoryFiles
        .map(normalizePath)
        .filter((path) => path.startsWith(prefix))
        .map((path) => ({ kind: 'absent' as const, path }));
}

class ExpectedPersistenceStorage {
    private readonly storage: StorageService;
    private readonly dependencies: ExpectedPersistenceStorageDependencies;

    constructor(storage: StorageService, dependencies: ExpectedPersistenceStorageDependencies) {
        this.storage = storage;
        this.dependencies = dependencies;
    }

    canTrack(branch: string) {
        const project = this.dependencies.project();

        return !!this.storage.watchProject && project?.branch === branch;
    }

    async track<T>(branch: string, outcomes: ExpectedPersistenceOutcome[], mutation: () => Promise<T>): Promise<T> {
        if (!this.canTrack(branch) || outcomes.length === 0) return mutation();
        if (this.dependencies.outcomes.shouldVerifyBeforeRegister(outcomes)) {
            await this.dependencies.verifyRetainedOutcomes();
            if (this.dependencies.outcomes.shouldVerifyBeforeRegister(outcomes)) {
                throw new Error('Expected persistence outcome limit remains exceeded after repository verification');
            }
        }

        const operationId = this.dependencies.outcomes.registerOperation(outcomes);
        try {
            return await mutation();
        } finally {
            this.dependencies.outcomes.settleOperation(operationId);
        }
    }

    commit(request: CommitRequest) {
        return this.track(request.branch, commitOutcomes(request), () => this.storage.commit(request));
    }

    deleteFile(request: DeleteFileRequest) {
        const outcomes: ExpectedPersistenceOutcome[] = [{ kind: 'absent', path: request.path }];

        return this.track(request.branch, outcomes, () => this.storage.deleteFile(request));
    }

    deleteFolder(request: DeleteFolderRequest) {
        const outcomes = folderDeleteOutcomes(request, this.dependencies.repositoryFiles());

        return this.track(request.branch, outcomes, () => this.storage.deleteFolder(request));
    }

    moveFiles(request: MoveFilesRequest) {
        return this.track(request.branch, moveOutcomes(request), () => this.storage.moveFiles(request));
    }
}

/** Adds expected-outcome registration to watcher-producing storage mutations. */
export function withExpectedPersistenceOutcomes(
    storage: StorageService,
    dependencies: ExpectedPersistenceStorageDependencies,
): StorageService {
    const expectedStorage = new ExpectedPersistenceStorage(storage, dependencies);

    return new Proxy(storage, {
        get(target, property, receiver) {
            if (property === 'commit') return expectedStorage.commit.bind(expectedStorage);
            if (property === 'deleteFile') return expectedStorage.deleteFile.bind(expectedStorage);
            if (property === 'deleteFolder') return expectedStorage.deleteFolder.bind(expectedStorage);
            if (property === 'moveFiles') return expectedStorage.moveFiles.bind(expectedStorage);

            const value: unknown = Reflect.get(target, property, receiver);

            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}
