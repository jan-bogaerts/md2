import type { ProjectConfig, ProjectReference } from '../data/data_types'
import type { GithubStorageContext } from './github_storage_context'
import type { GithubStorageGitData } from './github_storage_git_data'
import type { GithubStorageWriter } from './github_storage_writer'
import { PROJECT_CONFIG_PATH } from './github_storage_types'

export class GithubProjectConfigStorage {
    private readonly context: GithubStorageContext
    private readonly gitData: GithubStorageGitData
    private readonly writer: GithubStorageWriter

    constructor(context: GithubStorageContext, gitData: GithubStorageGitData, writer: GithubStorageWriter) {
        this.context = context
        this.gitData = gitData
        this.writer = writer
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        this.context.requireGithubProject(project)
        const file = await this.gitData.readOptionalFile(project, PROJECT_CONFIG_PATH)
        if (!file) return null

        return JSON.parse(file.content) as Partial<ProjectConfig>
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig) {
        this.context.requireGithubProject(project)
        const existingFile = await this.gitData.readOptionalFile(project, PROJECT_CONFIG_PATH)
        await this.writer.commit({
            branch: project.branch,
            files: [{
                content: `${JSON.stringify(config, null, 2)}\n`,
                path: PROJECT_CONFIG_PATH,
                sha: existingFile?.sha,
            }],
            message: 'Update MD² project config',
        })
    }
}
