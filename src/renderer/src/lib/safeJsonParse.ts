/** Parses JSON with a runtime type-guard. Returns `fallback` when parsing
 *  fails or the guard rejects the result. */
export function safeJsonParse<T>(
  raw: string,
  fallback: T,
  guard: (value: unknown) => value is T
): T
/** Parses JSON with only parse-error protection. Use when the shape is trusted
 *  (e.g. localStorage where we control both writer and reader). */
export function safeJsonParse<T>(raw: string, fallback: T): T
export function safeJsonParse<T>(
  raw: string,
  fallback: T,
  guard?: (value: unknown) => value is T
): T {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (guard) return guard(parsed) ? parsed : fallback
    return parsed as T
  } catch {
    return fallback
  }
}
