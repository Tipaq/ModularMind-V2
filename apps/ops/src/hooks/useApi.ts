import { useCallback, useEffect, useRef, useState } from "react";

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

  const fetcherRef = useRef(fetcher);
  const keepDataOnErrorRef = useRef(keepDataOnError);
  useEffect(() => {
    fetcherRef.current = fetcher;
    keepDataOnErrorRef.current = keepDataOnError;
  });

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const execute = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (!mountedRef.current) return;
      setState({ data, error: null, isLoading: false });
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState((prev) => ({
        data: keepDataOnErrorRef.current ? prev.data : null,
        error: msg,
        isLoading: false,
      }));
    }
  }, []);

  // Re-execute when actual deps change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { execute(); }, deps);

  return { ...state, refetch: execute };
}
