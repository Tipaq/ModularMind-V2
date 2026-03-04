/** Convert a snake_case string to camelCase. */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Shallow-map all keys of an object from snake_case to camelCase.
 * Useful for converting API response objects to idiomatic TS.
 */
export function mapKeysToCamel<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] } {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [snakeToCamel(k), v]),
  ) as never;
}

/** Convert snake_case literal type to camelCase. */
type CamelCase<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<CamelCase<T>>}`
  : S;
