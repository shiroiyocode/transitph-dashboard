export class RoutesApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code)
    this.name = 'RoutesApiError'
    this.status = status
    this.code = code
  }
}

type Options = {
  baseUrl: string | undefined
  getToken: (forceRefresh: boolean) => Promise<string | null>
  fetchFn?: typeof fetch
}

/**
 * Builds the caller for the `routes-api` server function. It's kept apart from
 * Firebase so it can be tested without signing in.
 */
export function createRoutesApi({ baseUrl, getToken, fetchFn = (...args) => fetch(...args) }: Options) {
  async function send(action: string, body: object, token: string) {
    return fetchFn(`${baseUrl}/functions/v1/routes-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, action }),
    })
  }

  return async function callRoutesApi<T = unknown>(action: string, body: object = {}): Promise<T> {
    if (!baseUrl) throw new Error('VITE_SUPABASE_URL is not set')

    const token = await getToken(false)
    if (!token) throw new RoutesApiError(401, 'unauthenticated')
    let response = await send(action, body, token)

    // A login token lasts about an hour, and this tab can stay open longer.
    if (response.status === 401) {
      const fresh = await getToken(true)
      if (!fresh) throw new RoutesApiError(401, 'unauthenticated')
      response = await send(action, body, fresh)
    }

    // A gateway fault or a paused project can answer with something else.
    const answer = await response.json().catch(() => null)
    if (answer?.ok === true) return answer.data as T
    throw new RoutesApiError(response.status, typeof answer?.error === 'string' ? answer.error : 'bad_response')
  }
}
