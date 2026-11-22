import { requestJson } from '../../lib/api'

export interface Project {
  id: string
  name: string
  path: string
  archived: boolean
  created_at: string
  updated_at: string
}

interface FolderLocation {
  name: string
  path: string
}

export interface FolderListing {
  path: string
  parent: string | null
  is_repository: boolean
  breadcrumbs: FolderLocation[]
  locations: FolderLocation[]
  folders: (FolderLocation & { is_repository: boolean })[]
}

export function listProjects(signal?: AbortSignal) {
  return requestJson<Project[]>('projects/', { signal })
}

async function projectRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/', {
    signal,
  })
  return requestJson<T>(`projects/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
}

export function addProject(data: {
  name?: string
  path: string
  source: 'local' | 'clone'
  url?: string
}) {
  return projectRequest<Project>('', 'POST', data)
}

export function renameProject(id: string, name: string) {
  return projectRequest<Project>(`${encodeURIComponent(id)}/`, 'PATCH', {
    name,
  })
}

export function removeProject(id: string) {
  return projectRequest<void>(`${encodeURIComponent(id)}/`, 'DELETE')
}

export function browseFolders(path?: string, signal?: AbortSignal) {
  return projectRequest<FolderListing>(
    'folders/',
    'POST',
    path ? { path } : {},
    signal,
  )
}
