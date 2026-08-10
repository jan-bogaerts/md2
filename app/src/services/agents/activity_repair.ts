import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { repairActivityFile } from '../../../../shared/card_activity.mjs'
import {
    activityFilePath,
    activityOriginFromPath,
    conversationActivityReference,
    parseConversationActivityReference,
} from '../../../../shared/activity_paths.mjs'
import type {
    AgentConversation,
    Card,
    MarkdownFile,
    ProjectReference,
    StorageService,
} from '../../data/data_types'

export interface ProjectActivityRepairResult {
    activitiesByPath: Map<string, CardActivityFile>
    conversationsByReference: Map<string, AgentConversation>
    knownActivityPaths: Set<string>
    projectConversationReferences: string[]
    referencesByCardPath: Map<string, string[]>
    repairedFiles: MarkdownFile[]
}

interface ActivityLoadResult {
    activity: CardActivityFile | null
    file: MarkdownFile | null
    path: string
}

function referencedActivityPath(reference: string) {
    try {
        return parseConversationActivityReference(reference).activityPath
    } catch {
        return null
    }
}

async function loadAndRepairActivity(
    path: string,
    project: ProjectReference,
    repositoryFiles: Set<string>,
    storage: StorageService,
): Promise<ActivityLoadResult> {
    const origin = activityOriginFromPath(path)
    if (!origin || !repositoryFiles.has(path)) return { activity: null, file: null, path }
    if (!storage.loadTextFile) throw new Error('Activity repair requires raw text file loading')

    try {
        const sourceFile = await storage.loadTextFile(project, path)
        const repair = repairActivityFile(sourceFile.content, origin)
        if (!repair.activity) return { activity: null, file: null, path }
        const file = repair.changed
            ? { ...sourceFile, content: `${JSON.stringify(repair.activity, null, 2)}\n`, path }
            : null

        return { activity: repair.activity, file, path }
    } catch {
        return { activity: null, file: null, path }
    }
}

function validCardReferences(
    card: Card,
    conversationsByReference: Map<string, AgentConversation>,
    knownActivityPaths: Set<string>,
) {
    const cardInternalId = card.header.internalId
    if (!cardInternalId) return card.header.agentLogReferences

    return card.header.agentLogReferences.filter((reference) => {
        const activityPath = referencedActivityPath(reference)
        if (!activityPath || !knownActivityPaths.has(activityPath)) return false
        const conversation = conversationsByReference.get(reference)

        return conversation?.cardInternalId === cardInternalId
    })
}

/** Read each activity once and plan canonical content plus valid card references. */
export async function repairProjectActivities(
    cards: Card[],
    project: ProjectReference,
    projectFolder: string,
    repositoryFilePaths: string[],
    storage: StorageService,
): Promise<ProjectActivityRepairResult> {
    const projectActivityPath = activityFilePath(projectFolder, { kind: 'project' })
    const knownActivityPaths = new Set([projectActivityPath])
    for (const card of cards) {
        card.header.agentLogReferences.forEach((reference) => {
            const activityPath = referencedActivityPath(reference)
            if (activityPath) knownActivityPaths.add(activityPath)
        })
    }

    const repositoryFiles = new Set(repositoryFilePaths)
    const loaded = await Promise.all([...knownActivityPaths].map((path) => (
        loadAndRepairActivity(path, project, repositoryFiles, storage)
    )))
    const activitiesByPath = new Map<string, CardActivityFile>()
    const conversationsByReference = new Map<string, AgentConversation>()
    const repairedFiles: MarkdownFile[] = []
    for (const { activity, file, path } of loaded) {
        if (!activity) continue
        activitiesByPath.set(path, activity)
        if (file) repairedFiles.push(file)
        for (const conversation of activity.conversations) {
            const reference = conversationActivityReference(path, conversation.id)
            conversationsByReference.set(reference, { ...conversation, path: reference })
        }
    }

    const projectConversationReferences = activitiesByPath.get(projectActivityPath)?.conversations
        .map(({ id }) => conversationActivityReference(projectActivityPath, id)) ?? []
    const referencesByCardPath = new Map(cards.map((card) => [
        card.path,
        validCardReferences(card, conversationsByReference, knownActivityPaths),
    ]))

    return {
        activitiesByPath,
        conversationsByReference,
        knownActivityPaths,
        projectConversationReferences,
        referencesByCardPath,
        repairedFiles,
    }
}
