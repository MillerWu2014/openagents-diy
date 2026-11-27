import { getApiBaseUrl } from '@/lib/api-base';

/** The one project a local backend opens with no account. */

export interface LocalProject {
  slug: string;
  token: string;
  name?: string;
  directory?: string;
}

export function readLocalProject(status: number, body: unknown): LocalProject | null {
  if (status < 200 || status >= 300 || !body || typeof body !== 'object') return null;
  const wrapped = body as { data?: unknown };
  const project = (wrapped.data && typeof wrapped.data === 'object' ? wrapped.data : body) as {
    slug?: unknown;
    token?: unknown;
  };
  if (typeof project.slug !== 'string' || !project.slug) return null;
  if (typeof project.token !== 'string' || !project.token) return null;
  const result: LocalProject = { slug: project.slug, token: project.token };
  if (typeof project.name === 'string' && project.name) result.name = project.name;
  if (typeof project.directory === 'string' && project.directory) result.directory = project.directory;
  return result;
}

/** The local project list, from `{ data: [...] }`. */
export function readLocalProjects(status: number, body: unknown): LocalProject[] {
  if (status < 200 || status >= 300 || !body || typeof body !== 'object') return [];
  const rows = (body as { data?: unknown }).data;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const project = readLocalProject(200, row);
    return project ? [project] : [];
  });
}

export async function listLocalProjects(): Promise<LocalProject[]> {
  const res = await fetch(`${getApiBaseUrl()}/v1/local/projects`);
  return readLocalProjects(res.status, await res.json().catch(() => null));
}

export function localProjectHref(project: LocalProject): string {
  return `/${encodeURIComponent(project.slug)}?token=${encodeURIComponent(project.token)}`;
}
