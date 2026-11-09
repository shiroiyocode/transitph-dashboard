// Run with: npm test
import assert from 'node:assert/strict'
import test from 'node:test'
import { mapRouteRow, mapRouteRows } from '../src/lib/routeRows.ts'
import { createRoutesApi, RoutesApiError } from '../src/lib/routesApiClient.ts'

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  contributor_id: 'uid-1',
  contributor_name: 'Rider One',
  status: 'published',
  data: {
    startLocation: 'Monumento',
    endLocation: 'Malabon',
    isEdited: true,
    editCount: 2,
    editedAt: '2026-11-01T02:00:00.000Z',
    eta: '10',
    price: 'PHP 13',
    distance: '3 km',
    distanceMeters: 3000,
    pathPoints: [{ lat: 14.65, lng: 120.98 }, { lat: 'bad', lng: 1 }],
    stepBoundaries: [1, 'x'],
    steps: [
      { mode: 'Jeepney', instruction: 'Ride', boarding: 'designated', stops: [{ lat: 1, lng: 2, name: 'Stop' }] },
      { mode: 'Jeepney', instruction: 'Again' },
      { mode: 'Train', instruction: 'Ride', stops: [{ lat: 3, lng: 4 }] },
    ],
  },
  views: 7,
  upvotes: 3,
  downvotes: 1,
  feedback_summary: { fareAccurateYes: 4 },
  created_at: '2026-11-01T02:00:00.000Z',
  updated_at: '2026-11-02T02:00:00.000Z',
  ...extra,
})

test('published shows as approved, and the other statuses stay', () => {
  assert.equal(mapRouteRow(row()).status, 'approved')
  assert.equal(mapRouteRow(row({ status: 'pending' })).status, 'pending')
  assert.equal(mapRouteRow(row({ status: 'rejected' })).status, 'rejected')
})

test('details come from data, and owner and counters from the columns', () => {
  const route = mapRouteRow(row())
  assert.equal(route.startLocation, 'Monumento')
  assert.equal(route.contributorId, 'uid-1')
  assert.equal(route.contributorName, 'Rider One')
  assert.equal(route.views, 7)
  assert.equal(route.upvotes, 3)
  assert.equal(route.downvotes, 1)
  assert.equal(route.eta, '10')
  assert.equal(route.price, 'PHP 13')
  assert.equal(route.distanceMeters, 3000)
  assert.equal(route.isEdited, true)
  assert.equal(route.editCount, 2)
})

test('dates become Timestamps, because the pages call toDate and toMillis', () => {
  const route = mapRouteRow(row())
  assert.equal(route.createdAt?.toDate().toISOString(), '2026-11-01T02:00:00.000Z')
  assert.equal(route.updatedAt?.toMillis(), Date.parse('2026-11-02T02:00:00.000Z'))
  assert.equal(route.editedAt?.toDate().toISOString(), '2026-11-01T02:00:00.000Z')
})

test('a missing or broken date is no date, not a crash', () => {
  const route = mapRouteRow(row({ created_at: null, updated_at: 'not a date' }))
  assert.equal(route.createdAt, undefined)
  assert.equal(route.updatedAt, undefined)
})

test('bad points and boundaries are skipped', () => {
  const route = mapRouteRow(row())
  assert.equal(route.pathPoints?.length, 1)
  assert.deepEqual(route.stepBoundaries, [1])
})

test('stops show for trains and designated steps only, and modes are unique', () => {
  const route = mapRouteRow(row())
  assert.equal(route.steps?.[0].stops?.[0].name, 'Stop')
  assert.equal(route.steps?.[1].stops, undefined)
  assert.equal(route.steps?.[2].stops?.length, 1)
  assert.deepEqual(route.transportModes, ['Jeepney', 'Train'])
})

test('a row with almost nothing still maps', () => {
  const route = mapRouteRow({ id: 'r2', status: 'pending' })
  assert.equal(route.startLocation, 'Unknown')
  assert.equal(route.contributorId, '')
  assert.equal(route.views, 0)
  assert.deepEqual(route.steps, [])
  assert.equal(route.feedbackSummary, undefined)
})

test('the latest decision carries its reasons and note', () => {
  const route = mapRouteRow(
    row({
      status: 'rejected',
      latest_decision: { decision: 'rejected', reason_codes: ['wrong_fare', 'other'], note: 'Check it' },
    }),
  )
  assert.deepEqual(route.latestDecision, { decision: 'rejected', reasonCodes: ['wrong_fare', 'other'], note: 'Check it' })
})

test('a correction mid-merge is left out of lists', () => {
  const rows = mapRouteRows([row({ id: 'a' }), row({ id: 'b', status: 'withdrawn' })])
  assert.deepEqual(rows.map((r) => r.id), ['a'])
})

// The API caller

type Answer = { status: number; body: unknown }

function client(answers: Answer[], tokens: (string | null)[] = ['saved', 'fresh']) {
  const requests: { url: string; auth: string; body: Record<string, unknown> }[] = []
  const tokenRequests: boolean[] = []
  const call = createRoutesApi({
    baseUrl: 'https://x.supabase.co',
    getToken: async (forceRefresh) => {
      tokenRequests.push(forceRefresh)
      return tokens[forceRefresh ? 1 : 0]
    },
    fetchFn: (async (url: string, init: RequestInit) => {
      requests.push({
        url,
        auth: new Headers(init.headers).get('Authorization') ?? '',
        body: JSON.parse(String(init.body)),
      })
      const answer = answers.shift()!
      const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body)
      return new Response(text, { status: answer.status })
    }) as typeof fetch,
  })
  return { call, requests, tokenRequests }
}

test('sends the action, body and token, and returns the data', async () => {
  const { call, requests } = client([{ status: 200, body: { ok: true, data: { done: 1 } } }])
  assert.deepEqual(await call('decide', { routeId: 'r1' }), { done: 1 })
  assert.equal(requests[0].url, 'https://x.supabase.co/functions/v1/routes-api')
  assert.equal(requests[0].auth, 'Bearer saved')
  assert.deepEqual(requests[0].body, { routeId: 'r1', action: 'decide' })
})

test('an expired token is refreshed and retried once', async () => {
  const { call, requests, tokenRequests } = client([
    { status: 401, body: { ok: false, error: 'unauthenticated' } },
    { status: 200, body: { ok: true, data: [] } },
  ])
  assert.deepEqual(await call('staff_list'), [])
  assert.deepEqual(tokenRequests, [false, true])
  assert.equal(requests[1].auth, 'Bearer fresh')
})

test('two 401s give up, without a third try', async () => {
  const { call, requests } = client([
    { status: 401, body: { ok: false, error: 'unauthenticated' } },
    { status: 401, body: { ok: false, error: 'unauthenticated' } },
  ])
  await assert.rejects(call('staff_list'), (e: RoutesApiError) => e.status === 401 && e.code === 'unauthenticated')
  assert.equal(requests.length, 2)
})

test('a refusal keeps its code, for telling a conflict from a failure', async () => {
  const { call } = client([{ status: 409, body: { ok: false, error: 'conflict' } }])
  await assert.rejects(call('decide'), (e: RoutesApiError) => e.status === 409 && e.code === 'conflict')
})

test('a reply that is not ours is an error, not a success', async () => {
  const { call } = client([{ status: 503, body: 'Service Unavailable' }])
  await assert.rejects(call('decide'), (e: RoutesApiError) => e.status === 503 && e.code === 'bad_response')
})

test('no signed-in user stops before calling the server', async () => {
  const { call, requests } = client([], [null, null])
  await assert.rejects(call('decide'), (e: RoutesApiError) => e.status === 401)
  assert.equal(requests.length, 0)
})

test('a missing server address says so', async () => {
  const call = createRoutesApi({ baseUrl: undefined, getToken: async () => 'x' })
  await assert.rejects(call('decide'), /VITE_SUPABASE_URL/)
})
