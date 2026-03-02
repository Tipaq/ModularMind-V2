import { useCallback, useEffect, useState } from "react";

export interface UseApiState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export interface UseApiOptions {
  /** Keep the last successful data when a refetch errors (useful for polling). */
  keepDataOnError?: boolean;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: UseApiOptions = {},
): UseApiState<T> & { refetch: () => Promise<void> } {
  const { keepDataOnError = false } = options;

  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    error: null,
    isLoading: true,
  });

  const execute = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await fetcher();
      setState({ data, error: null, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState((prev) => ({
        data: keepDataOnError ? prev.data : null,
        error: msg,
        isLoading: false,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, keepDataOnError]);

  useEffect(() => {
    execute();
  }, [execute]);

  return { ...state, refetch: execute };
}
