import postgres from 'postgres';

export type SafeErrorLocationSource =
  | 'browseController'
  | 'listingService'
  | 'listingRepository'
  | 'listingCardViewModel'
  | 'dbSchema'
  | 'drizzle-orm'
  | 'postgres.js'
  | 'node_modules'
  | 'runtime';

export interface SafeErrorLocation {
  source: SafeErrorLocationSource;
  line: number;
  column: number;
}

function readCause(error: unknown): unknown {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
  try {
    return (error as { cause?: unknown }).cause;
  } catch {
    return undefined;
  }
}

/** Exposes only a validated SQLSTATE from postgres.js, following a bounded cause chain. */
export function getSafeSqlState(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) return undefined;
    seen.add(current);
    if (current instanceof postgres.PostgresError) {
      const code = (current as Error & { code?: unknown }).code;
      return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
    }
    current = readCause(current);
  }
  return undefined;
}

/** Returns only allowlisted type labels from a bounded, cycle-safe cause chain. */
export function getSafeErrorTypeChain(error: unknown): string[] {
  const seen = new Set<unknown>();
  const types: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) break;
    seen.add(current);
    if (current instanceof postgres.PostgresError || (current instanceof Error && current.name === 'PostgresError')) {
      types.push('PostgresError');
    } else if (current instanceof Error) {
      const name = current.name;
      types.push(['DrizzleQueryError', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'Error'].includes(name) ? name : 'OtherError');
    } else {
      types.push('NonErrorObject');
    }
    current = readCause(current);
  }
  return types.length > 0 ? types : ['UnknownError'];
}

/** Extract only allowlisted source labels and numeric source positions from stack frames. */
export function getSafeErrorLocations(error: unknown): SafeErrorLocation[] {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return [];
  const locations: SafeErrorLocation[] = [];
  const seen = new Set<string>();
  for (const rawFrame of error.stack.split('\n').slice(1, 25)) {
    let frame = rawFrame.trim();
    const openParen = frame.lastIndexOf('(');
    if (openParen >= 0) frame = frame.slice(openParen + 1).replace(/\)?$/, '');
    frame = frame.replace(/^at\s+/, '').replace(/^file:\/\//i, '');
    const lastColon = frame.lastIndexOf(':');
    const previousColon = frame.lastIndexOf(':', lastColon - 1);
    if (lastColon < 0 || previousColon < 0) continue;
    const lineText = frame.slice(previousColon + 1, lastColon);
    const columnText = frame.slice(lastColon + 1);
    if (!/^\d+$/.test(lineText) || !/^\d+$/.test(columnText)) continue;
    const filePath = frame.slice(0, previousColon).replace(/\\/g, '/').toLowerCase();
    const line = Number(lineText);
    const column = Number(columnText);
    if (!filePath || !Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) continue;
    let source: SafeErrorLocationSource = 'runtime';
    if (filePath.includes('/src/app/controllers/browsecontroller.')) source = 'browseController';
    else if (filePath.includes('/src/app/services/listingservice.')) source = 'listingService';
    else if (filePath.includes('/src/app/repositories/listingrepository.')) source = 'listingRepository';
    else if (filePath.includes('/src/app/view-models/listingcardviewmodel.')) source = 'listingCardViewModel';
    else if (filePath.includes('/src/db/schema/')) source = 'dbSchema';
    else if (filePath.includes('/node_modules/drizzle-orm/')) source = 'drizzle-orm';
    else if (filePath.includes('/node_modules/postgres/')) source = 'postgres.js';
    else if (filePath.includes('/node_modules/')) source = 'node_modules';
    const key = `${source}:${line}:${column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ source, line, column });
  }
  const priorities: Record<SafeErrorLocationSource, number> = {
    browseController: 0, listingRepository: 1, listingService: 2, listingCardViewModel: 3,
    dbSchema: 4, 'drizzle-orm': 5, 'postgres.js': 6, node_modules: 7, runtime: 8,
  };
  return locations.sort((a, b) => priorities[a.source] - priorities[b.source]).slice(0, 6);
}
