import { and, asc, desc, eq, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../../db';
import { listings, physicalCopies, releases } from '../../db/schema';

const ACCENT_GROUPS: Record<string, string> = {
  a: 'àáâãäåāăąǎǟǡǻȁȃȧạảấầẩẫậắằẳẵặ',
  e: 'èéêëēĕėęěȅȇẹẻẽếềểễệ',
  i: 'ìíîïĩīĭįǐȉȋịỉ',
  o: 'òóôõöōŏőǒǫǭǿȍȏȫȭȯȱọỏốồổỗộớờởỡợ',
  u: 'ùúûüũūŭůűųǔȕȗụủứừửữự',
  y: 'ýÿŷȳỳỵỷỹ',
  n: 'ñńņň',
  c: 'çćĉċč',
  s: 'śŝşšș',
  z: 'źżž',
  l: 'ĺļľŀ',
  r: 'ŕŗř',
  t: 'ţťŧ',
  d: 'ďđ',
  g: 'ğĝģġ',
  h: 'ĥħ',
  j: 'ĵ',
  k: 'ķ',
  w: 'ŵẃẁẅ',
};
const ACCENTED_CHARACTERS = Object.values(ACCENT_GROUPS).join('');
const ASCII_CHARACTERS = Object.entries(ACCENT_GROUPS)
  .map(([replacement, characters]) => replacement.repeat(Array.from(characters).length))
  .join('');

type DbInstance = ReturnType<typeof getDb>;
export type CatalogueSuggestionKind = 'artist' | 'release' | 'label';

export interface CatalogueSuggestionRow {
  kind: CatalogueSuggestionKind;
  value: string;
  context: string | null;
  rank: number;
  similarity: number;
}

function normalizedFieldExpression(field: SQL): SQL<string> {
  return sql<string>`regexp_replace(translate(lower(${field}), ${ACCENTED_CHARACTERS}, ${ASCII_CHARACTERS}), '[[:space:][:punct:]]+', '', 'g')`;
}

function isMissingCatalogueExtension(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return ['42883', '3F000', '42704'].includes(code) ||
    /extensions\.(?:similarity|%)|gin_trgm_ops.*does not exist|operator does not exist/i.test(message);
}

async function searchField(
  db: DbInstance,
  field: SQL,
  kind: CatalogueSuggestionKind,
  query: string,
  normalizedQuery: string,
  useExtensions: boolean,
  contextField?: SQL
): Promise<CatalogueSuggestionRow[]> {
  const normalizedValue = normalizedFieldExpression(field);
  const fuzzyMatch = useExtensions && Array.from(normalizedQuery).length >= 3
    ? sql<boolean>`${field} OPERATOR(extensions.%) ${query}`
    : sql<boolean>`false`;

  const matchingCondition = or(
    eq(normalizedValue, normalizedQuery),
    sql<boolean>`${normalizedValue} LIKE ${normalizedQuery + '%'}`,
    sql<boolean>`${normalizedValue} LIKE ${'%' + normalizedQuery + '%'}`,
    fuzzyMatch
  )!;
  const matchRank = sql<number>`CASE
    WHEN ${normalizedValue} = ${normalizedQuery} THEN 0
    WHEN ${normalizedValue} LIKE ${normalizedQuery + '%'} THEN 1
    WHEN ${normalizedValue} LIKE ${'%' + normalizedQuery + '%'} THEN 2
    ELSE 3 END`;
  const similarityScore = useExtensions
    ? sql<number>`MAX(extensions.similarity(${field}, ${query}))`
    : sql<number>`0::real`;
  const valueExpression = sql<string>`MIN(${field})`;
  const contextExpression = contextField
    ? sql<string>`MIN(${contextField})`
    : sql<string>`NULL::text`;
  const grouping = contextField ? [normalizedValue, contextField] : [normalizedValue];

  const rows = await db.select({
    value: valueExpression,
    context: contextExpression,
    rank: matchRank,
    similarity: similarityScore,
  })
    .from(releases)
    .innerJoin(physicalCopies, eq(physicalCopies.releaseId, releases.id))
    .innerJoin(listings, eq(listings.physicalCopyId, physicalCopies.id))
    .where(and(
      eq(listings.status, 'published'),
      sql`${field} IS NOT NULL`,
      matchingCondition
    ))
    .groupBy(...grouping)
    .orderBy(asc(matchRank), desc(similarityScore), asc(valueExpression))
    .limit(8);

  return rows
    .filter((row) => typeof row.value === 'string' && row.value.trim().length > 0)
    .map((row) => ({
      kind,
      value: row.value,
      context: row.context,
      rank: Number(row.rank),
      similarity: Number(row.similarity || 0),
    }));
}

/** Query public artist, release-title and label text only for releases with published listings. */
export async function searchCatalogueSuggestionRows(
  query: string,
  normalizedQuery: string,
  dbOverride?: DbInstance
): Promise<CatalogueSuggestionRow[]> {
  const db = dbOverride || getDb();
  const fields = [
    { kind: 'artist' as const, field: sql`${releases.artist}` },
    { kind: 'release' as const, field: sql`${releases.title}`, context: sql`${releases.artist}` },
    { kind: 'label' as const, field: sql`${releases.label}` },
  ];

  const runQueries = async (useExtensions: boolean): Promise<CatalogueSuggestionRow[]> => {
    const result: CatalogueSuggestionRow[] = [];
    for (const item of fields) {
      result.push(...await searchField(
        db, item.field, item.kind, query, normalizedQuery, useExtensions, item.context
      ));
    }
    return result;
  };

  try {
    return await runQueries(true);
  } catch (error) {
    // New app code can deploy before migration 0020 during a rolling deploy.
    if (!isMissingCatalogueExtension(error)) throw error;
    return runQueries(false);
  }
}
