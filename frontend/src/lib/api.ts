export class ApiError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function requestJson<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  return (await requestJsonWithMetadata<T>(path, options)).data as T
}

export async function requestJsonWithMetadata<T>(
  path: string,
  options?: RequestInit,
): Promise<{ data: T | null; etag: string | null }> {
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

  const etag = response.headers.get('ETag')
  if (response.status === 304) return { data: null, etag }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const messages = body && typeof body === 'object' ? Object.values(body) : []
    const message = messages
      .flat()
      .find((value): value is string => typeof value === 'string')
    throw new ApiError(
      message ?? 'The request failed. Please try again.',
      response.status,
    )
  }
  return { data: body as T, etag }
}
