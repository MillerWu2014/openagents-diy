import { expect, it } from 'vitest'
import { localProjectHref, readLocalProject, readLocalProjects } from './local-project'

it('reads the local project envelope', () => {
  expect(readLocalProject(200, { data: { slug: 'project', token: 'local-project' } })).toEqual({
    slug: 'project',
    token: 'local-project',
  })
})

it('rejects the hosted 404 that used to leave the splash up', () => {
  expect(readLocalProject(404, { detail: 'Not Found' })).toBeNull()
  expect(readLocalProject(200, { data: {} })).toBeNull()
})

it('reads every project on this computer', () => {
  expect(readLocalProjects(200, { data: [
    { slug: 'blog', name: 'blog', token: 't1', directory: '/tmp/blog' },
    { slug: 'no-token' },
  ] })).toEqual([{ slug: 'blog', name: 'blog', token: 't1', directory: '/tmp/blog' }])
  expect(readLocalProjects(403, { data: [] })).toEqual([])
})

it('builds a route that carries the token', () => {
  expect(localProjectHref({ slug: 'project', token: 'a b' })).toBe('/project?token=a%20b')
})
