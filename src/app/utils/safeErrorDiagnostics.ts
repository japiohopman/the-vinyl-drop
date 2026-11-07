import postgres from 'postgres';

/**
 * Expose only a validated SQLSTATE from a real postgres.js PostgresError.
 * Drizzle may wrap the driver error in one or more causes; never return its
 * message, detail, query, parameters or connection information.
 */
export function getSafeSqlState(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (
      !current ||
      (typeof current !== 'object' && typeof current !== 'function') ||
      seen.has(current)
    ) {
      return undefined;
    }

    seen.add(current);

    if (current instanceof postgres.PostgresError) {
      const code = (current as Error & { code?: unknown }).code;
      return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
    }

    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return undefined;
}

/**
 * Return only allowlisted error type labels from a bounded, cycle-safe cause
 * chain. Never expose messages, SQL, connection data or arbitrary class names.
 */
export function getSafeErrorTypeChain(error: unknown): string[] {
  const seen = new Set<unknown>();
  const types: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (
      !current ||
      (typeof current !== 'object' && typeof current !== 'function') ||
      seen.has(current)
    ) {
      break;
    }

    seen.add(current);

    if (current instanceof postgres.PostgresError || (current instanceof Error && current.name === 'PostgresError')) {
      types.push('PostgresError');
    } else if (current instanceof Error) {
      const name = current.name;
      types.push(
        ['DrizzleQueryError', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'Error'].includes(name)
          ? name
          : 'OtherError'
      );
    } else {
      types.push('NonErrorObject');
    }

    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return types.length > 0 ? types : ['UnknownError'];
}
