import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const message = String(error);
        if (message.includes('401') || message.includes('403')) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
