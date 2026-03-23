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

export const withLoading = async <T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
): Promise<T | undefined> => {
  set({ loading: true, error: null });
  try {
    const result = await action();
    set({ loading: false });
    return result;
  } catch (err) {
    set({ loading: false, error: handleStoreError(err, errorPrefix) });
    return undefined;
  }
};

export const withError = async <T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
): Promise<T | undefined> => {
  set({ error: null });
  try {
    return await action();
  } catch (err) {
    set({ error: handleStoreError(err, errorPrefix) });
    return undefined;
  }
};

export const withErrorRethrow = async <T>(
  set: SetState,
  action: () => Promise<T>,
  errorPrefix: string,
): Promise<T> => {
  set({ error: null });
  try {
    return await action();
  } catch (err) {
    set({ error: handleStoreError(err, errorPrefix) });
    throw err;
  }
};
