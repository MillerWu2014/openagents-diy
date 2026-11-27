export interface BoundAgent {
  name?: string
  network?: string | null
  path?: string | null
}

/**
 * Agents installed on this computer that belong to the project but are still
 * bound somewhere else. One process can listen to one project, so opening a
 * project has to move them onto it.
 */
export function agentsToMove(
  members: readonly string[],
  installed: readonly BoundAgent[],
  slug: string,
  directory: string,
): string[] {
  const folder = directory.trim()
  return members.filter((name) => {
    const agent = installed.find((item) => item.name === name)
    if (!agent?.name) return false
    return agent.network !== slug || (folder !== "" && agent.path !== folder)
  })
}
