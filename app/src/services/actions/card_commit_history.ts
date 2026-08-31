import type { ActivityCommitReference, ActivityRecord, CardActivityFile } from '../../../../shared/card_activity.mjs'
import { parseActivityValueForMigration } from '../../../../shared/card_activity.mjs'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import { markdownParsingService } from '../data/markdown_parsing_service'

export interface CardCommit extends ActivityCommitReference {
    record: ActivityRecord
}

export interface CardBodyDiff {
    newBody: string
    newExists: boolean
    oldBody: string
    oldExists: boolean
}

/** Load visible commits for one stable card identity, newest first. */
export async function loadCardCommits(cardInternalId: string): Promise<CardCommit[]> {
    const bridge = getElectronActionBridge()
    if (!bridge?.loadCardActivity) return []
    const rawActivity = await bridge.loadCardActivity({ cardInternalId })
    const activity = parseActivityValueForMigration(rawActivity, { cardInternalId, kind: 'card' }) as CardActivityFile

    return activity.records
        .flatMap((record) => record.commits.map((commit) => ({ ...commit, record })))
        .sort((left, right) => right.committedAt.localeCompare(left.committedAt))
}

export function cardCommitLabel(record: ActivityRecord) {
    return record.type === 'system' ? record.label : record.rootActionLabel
}

/** Read both historical card revisions and exclude frontmatter from diff input. */
export async function loadCardBodyDiff(commit: CardCommit, path: string): Promise<CardBodyDiff> {
    if (commit.available === false) throw new Error('Commit is no longer available in this repository')
    const bridge = getElectronActionBridge()
    if (!bridge?.readFileAtCommit) throw new Error('Card commit diff requires Electron local mode')
    const [oldFile, newFile] = await Promise.all([
        bridge.readFileAtCommit({ commit: commit.commit, parent: true, path }),
        bridge.readFileAtCommit({ commit: commit.commit, parent: false, path }),
    ])

    return {
        newBody: newFile.exists ? markdownParsingService.parse(newFile.content).body : '',
        newExists: newFile.exists,
        oldBody: oldFile.exists ? markdownParsingService.parse(oldFile.content).body : '',
        oldExists: oldFile.exists,
    }
}
