import { auth } from '@/lib/firebase'
import { createRoutesApi } from '@/lib/routesApiClient'

export { RoutesApiError } from '@/lib/routesApiClient'

/** Every route read and change goes through the server, which checks the login. */
export const callRoutesApi = createRoutesApi({
  baseUrl: import.meta.env.VITE_SUPABASE_URL,
  getToken: async (forceRefresh) => (await auth.currentUser?.getIdToken(forceRefresh)) ?? null,
})
