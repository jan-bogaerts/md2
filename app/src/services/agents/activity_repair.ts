import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { repairActivityFile } from '../../../../shared/card_activity.mjs'
import { activityFilePath, parseConversationActivityReference } from '../../../../shared/activity_paths.mjs'
import type { AgentConversation, Card, MarkdownFile, ProjectReference, StorageService } from '../../data/data_types'
import { mapWithConcurrency } from '../concurrency'

const ACTIVITY_LOAD_CONCURRENCY = 8

interface LoadedActivity {
    activity: CardActivityFile | null
    changedFile: MarkdownFile | null
}

export interface CardActivityReferenceRepair {
    cardPath: string
    references: string[]
}

export interface ProjectActivityRepairPlan {
    cardRepairs: CardActivityReferenceRepair[]
    changedFiles: MarkdownFile[]
    conversationsByCardInternalId: Map<string, AgentConversation[]>
    projectConversations: AgentConversation[]
}

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/')
}

function serializeActivity(activity: CardActivityFile) {
    return `${JSON.stringify(activity, null, 2)}\n`
}

async function loadActivity(
    path: string,
    project: ProjectReference,
    storage: StorageService,
): Promise<[string, LoadedActivity]> {
    if (!storage.loadTextFile) throw new Error('Activity repair requires repository text file loading')

    try {
        const file = await storage.loadTextFile(project, path)
        const repaired = repairActivityFile(file.content, path)
        const changedFile = repaired.activity && repaired.changed
            ? { ...file, content: serializeActivity(repaired.activity) }
            : null

        return [path, { activity: repaired.activity, changedFile }]
    } catch {
        return [path, { activity: null, changedFile: null }]
    }
}

function findReferencedConversation(activity: CardActivityFile | null, conversationId: string) {
    return activity?.conversations.find(({ id }) => id === conversationId) ?? null
}

function addConversation(
    conversationsByCardInternalId: Map<string, AgentConversation[]>,
    cardInternalId: string,
    conversation: AgentConversation,
) {
    const conversations = conversationsByCardInternalId.get(cardInternalId) ?? []
    if (conversations.some(({ id }) => id === conversation.id)) return

    conversationsByCardInternalId.set(cardInternalId, [...conversations, conversation])
}

function repairCardReferences(cards: Card[], activities: Map<string, LoadedActivity>) {
    const cardRepairs: CardActivityReferenceRepair[] = []
    const conversationsByCardInternalId = new Map<string, AgentConversation[]>()
    for (const card of cards) {
        const cardInternalId = card.header.internalId
        if (!cardInternalId) throw new Error(`Cannot repair activity references without an internal ID: ${card.path}`)
        const references = card.header.agentLogReferences.filter((reference) => {
            try {
                const { activityPath, conversationId } = parseConversationActivityReference(reference)
                const activity = activities.get(normalizePath(activityPath))?.activity ?? null
                const conversation = findReferencedConversation(activity, conversationId)
                if (!conversation || conversation.cardInternalId !== cardInternalId) return false

                addConversation(conversationsByCardInternalId, cardInternalId, { ...conversation, path: reference })

                return true
            } catch {
                return false
            }
        })
        const changed = references.length !== card.header.agentLogReferences.length
            || references.some((reference, index) => reference !== card.header.agentLogReferences[index])
        if (changed) cardRepairs.push({ cardPath: card.path, references })
    }

    return { cardRepairs, conversationsByCardInternalId }
}

/** Loads every referenced activity once and plans canonical files plus valid card links. */
export async function planProjectActivityRepair(
    cards: Card[],
    project: ProjectReference,
    projectFolder: string,
    repositoryFiles: string[],
    storage: StorageService,
): Promise<ProjectActivityRepairPlan> {
    const repositoryPaths = new Set(repositoryFiles.map(normalizePath))
    const referencedPaths = cards.flatMap(({ header }) => header.agentLogReferences.flatMap((reference) => {
        try {
            return [normalizePath(parseConversationActivityReference(reference).activityPath)]
        } catch {
            return []
        }
    }))
    const projectPath = normalizePath(activityFilePath(projectFolder, { kind: 'project' }))
    const paths = [...new Set([
        ...referencedPaths.filter((path) => repositoryPaths.has(path)),
        ...(repositoryPaths.has(projectPath) ? [projectPath] : []),
    ])]
    const loaded = await mapWithConcurrency(paths, ACTIVITY_LOAD_CONCURRENCY, async (path) => (
        loadActivity(path, project, storage)
    ))
    const activities = new Map(loaded)
    const { cardRepairs, conversationsByCardInternalId } = repairCardReferences(cards, activities)
    const changedFiles = [...activities.values()].flatMap(({ changedFile }) => changedFile ? [changedFile] : [])
    const projectActivity = activities.get(projectPath)?.activity ?? null
    const projectConversations = projectActivity?.origin.kind === 'project'
        ? projectActivity.conversations.map((conversation) => ({ ...conversation, path: `${projectPath}#conversation=${conversation.id}` }))
        : []

    return { cardRepairs, changedFiles, conversationsByCardInternalId, projectConversations }
}
