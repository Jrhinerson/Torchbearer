import { requestJson } from '../../lib/api'

export const githubVerificationUrl = 'https://github.com/login/device'

export interface GitHubConnection {
  available: boolean
  unavailable_reason: string
  account: {
    id: number
    login: string
    name: string
    connected_at: string
    reauthorization_required: boolean
  } | null
  authorization: {
    id: string
    state: 'pending' | 'failed' | 'expired'
    user_code: string
    verification_url: string
    expires_at: string | null
    poll_after: number
    error: string
  } | null
}

export function getGitHubConnection(signal?: AbortSignal) {
  return requestJson<GitHubConnection>('connections/github/', {
    signal,
    cache: 'no-store',
  })
}

async function connectionRequest(
  path: string,
  method = 'POST',
  authorizationId?: string,
  signal?: AbortSignal,
) {
  const { csrfToken } = await requestJson<{ csrfToken: string }>('csrf/', {
    signal,
  })
  return requestJson<GitHubConnection>(`connections/github/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: authorizationId
      ? JSON.stringify({ authorization_id: authorizationId })
      : undefined,
    signal,
  })
}

export const connectGitHub = () => connectionRequest('connect/')
export const disconnectGitHub = () => connectionRequest('', 'DELETE')
export const cancelGitHub = (id: string) =>
  connectionRequest('cancel/', 'POST', id)
export const pollGitHub = (id: string, signal?: AbortSignal) =>
  connectionRequest('poll/', 'POST', id, signal)
