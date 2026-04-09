type SetState = (partial: Record<string, unknown>) => void;

export const handleStoreError = (err: unknown, fallbackMessage: string): string =>
  err instanceof Error ? err.message : fallbackMessage;

export interface PaginatedState {
  page: number;
  totalPages: number;
  total: number;
}

export const createPaginatedState = (): PaginatedState => ({
  page: 1,
  totalPages: 1,
  total: 0,
});

interface ActionOptions {
  showLoading?: boolean;
  rethrowOnError?: boolean;
}

export async function withAction<T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
  options: ActionOptions = {},
): Promise<T | undefined> {
  const { showLoading = false, rethrowOnError = false } = options;
  if (showLoading) set({ loading: true, error: null });
  else set({ error: null });

  try {
    const result = await action();
    if (showLoading) set({ loading: false });
    return result;
  } catch (err) {
    const errorMessage = handleStoreError(err, errorPrefix);
    if (showLoading) set({ loading: false, error: errorMessage });
    else set({ error: errorMessage });
    if (rethrowOnError) throw err;
    return undefined;
  }
}

export const withLoading = <T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
): Promise<T | undefined> => withAction(set, action, errorPrefix, { showLoading: true });

export const withError = <T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
): Promise<T | undefined> => withAction(set, action, errorPrefix);

export const withErrorRethrow = <T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
): Promise<T> =>
  withAction(set, action, errorPrefix, { rethrowOnError: true }) as Promise<T>;
