export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

type CamelCase<S extends string> = S extends `${infer H}_${infer T}`
  ? `${H}${Capitalize<CamelCase<T>>}`
  : S;

type CamelCaseKeys<T extends Record<string, unknown>> = {
  [K in keyof T as K extends string ? CamelCase<K> : K]: T[K];
};

export function mapKeysToCamel<T extends Record<string, unknown>>(
  obj: T,
): CamelCaseKeys<T> {
  const entries = Object.entries(obj).map(
    ([key, value]) => [snakeToCamel(key), value] as const,
  );
  return Object.fromEntries(entries) as CamelCaseKeys<T>;
}
