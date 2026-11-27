export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status = 0, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function requestJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1/${path}`, {
      credentials: 'same-origin',
      ...options,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError(
      'Could not reach the local service. Check that Torchbearer is running.',
    )
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const messages = body && typeof body === 'object' ? Object.values(body) : []
    const message = messages
      .flat()
      .find((value): value is string => typeof value === 'string')
    throw new ApiError(
      message ?? 'The request failed. Please try again.',
      response.status,
      body,
    )
  }
  return body as T
}
