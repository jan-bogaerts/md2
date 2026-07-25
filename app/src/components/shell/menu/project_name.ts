import type { ProjectReference } from '../../../data/data_types'

/** Returns the user-facing project name without exposing its full location. */
export function projectName(project: ProjectReference): string {
    if (project.owner !== undefined || project.repository !== undefined) {
        if (!project.repository) throw new Error('Cannot derive GitHub project name without repository')

        return project.repository
    }
    if (!project.rootPath) throw new Error('Cannot derive local or remote project name without rootPath')

    const normalizedRootPath = project.rootPath.replace(/[\\/]+$/gu, '')
    const name = normalizedRootPath.split(/[\\/]/gu).at(-1)
    if (!name) throw new Error('Cannot derive project name from rootPath')

    return name
}
