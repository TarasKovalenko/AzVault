import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from './queryClient';

const retry = queryClient.getDefaultOptions().queries?.retry as (
  failureCount: number,
  error: unknown,
) => boolean;

describe('queryClient defaults', () => {
  it('never retries an auth failure', () => {
    expect(retry(0, new Error('401 unauthorized'))).toBe(false);
    expect(retry(0, new Error('403 forbidden'))).toBe(false);
  });

  it('retries other failures twice', () => {
    expect(retry(0, new Error('500 boom'))).toBe(true);
    expect(retry(1, new Error('500 boom'))).toBe(true);
    expect(retry(2, new Error('500 boom'))).toBe(false);
  });

  it('keeps data fresh for half a minute and does not refetch on focus', () => {
    const queries = queryClient.getDefaultOptions().queries;
    expect(queries?.staleTime).toBe(30_000);
    expect(queries?.refetchOnWindowFocus).toBe(false);
  });
});

describe('queryClient behaviour', () => {
  afterEach(() => {
    queryClient.clear();
  });

  it('gives up on an auth failure after a single attempt', async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error('401 unauthorized'));
    await expect(
      queryClient.fetchQuery({ queryKey: ['auth-failure'], queryFn, retryDelay: 0 }),
    ).rejects.toThrow('401');
    // Retrying a 401 only spends another CLI round trip on the same rejection.
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('retries a server failure twice before surfacing it', async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error('500 boom'));
    await expect(
      queryClient.fetchQuery({ queryKey: ['server-failure'], queryFn, retryDelay: 0 }),
    ).rejects.toThrow('500');
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('serves a cached result inside the stale window instead of refetching', async () => {
    const queryFn = vi.fn().mockResolvedValue(['alpha']);
    const queryKey = ['stale-window'];

    await expect(queryClient.fetchQuery({ queryKey, queryFn })).resolves.toEqual(['alpha']);
    await expect(queryClient.fetchQuery({ queryKey, queryFn })).resolves.toEqual(['alpha']);

    // staleTime is 30s, so the second read is a cache hit, not a second list call.
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('refetches once the data is older than the stale window', async () => {
    const queryFn = vi.fn().mockResolvedValue(['alpha']);
    const queryKey = ['stale-window-expired'];

    await queryClient.fetchQuery({ queryKey, queryFn });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 30_001);
    await queryClient.fetchQuery({ queryKey, queryFn });
    vi.useRealTimers();

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
