import { QueryClient } from '@tanstack/react-query'

// Realtime is delivered via WebSocket; refetching on focus would cause flicker
// and double-fetch when the user already has a fresh ws-pushed state.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})
