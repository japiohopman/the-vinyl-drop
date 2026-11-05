import { asc, count, or, sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { profiles } from '../../db/schema/profiles';

type DbInstance = ReturnType<typeof getDb>;

export interface PublicPersonSearchRecord {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PublicPeopleSearchRows {
  items: PublicPersonSearchRecord[];
  totalCount: number;
}

/**
 * Search only the fields that already form the public profile identity.
 *
 * Keep the SELECT projection deliberately narrow: profile IDs, website URLs,
 * bios, locations, timestamps and authentication data are not search results.
 */
export async function searchPublicPeople(
  normalizedQuery: string,
  options: { limit: number; offset: number },
  dbOverride?: DbInstance
): Promise<PublicPeopleSearchRows> {
  const database = dbOverride || getDb();
  const query = normalizedQuery.normalize('NFKC').trim().toLowerCase();

  if (Array.from(query).length < 2) {
    return { items: [], totalCount: 0 };
  }

  const exactUsername = sql`lower(${profiles.username}) = ${query}`;
  const usernamePrefix = sql`left(lower(${profiles.username}), char_length(${query})) = ${query}`;
  const displayNameContains = sql`strpos(lower(coalesce(${profiles.displayName}, '')), ${query}) > 0`;
  const predicate = or(exactUsername, usernamePrefix, displayNameContains);

  if (!predicate) return { items: [], totalCount: 0 };

  const rank = sql<number>`CASE
    WHEN lower(${profiles.username}) = ${query} THEN 0
    WHEN left(lower(${profiles.username}), char_length(${query})) = ${query} THEN 1
    ELSE 2
  END`;

  const requestedLimit = Number.isFinite(options.limit) ? Math.floor(options.limit) : 1;
  const requestedOffset = Number.isFinite(options.offset) ? Math.floor(options.offset) : 0;
  const safeLimit = Math.min(20, Math.max(1, requestedLimit));
  const safeOffset = Math.min(20 * 20, Math.max(0, requestedOffset));

  const [rows, countRows] = await Promise.all([
    database
      .select({
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(profiles)
      .where(predicate)
      .orderBy(
        asc(rank),
        asc(sql`lower(coalesce(${profiles.displayName}, ${profiles.username}))`),
        asc(sql`lower(${profiles.username})`)
      )
      .limit(safeLimit)
      .offset(safeOffset),
    database
      .select({ totalCount: count() })
      .from(profiles)
      .where(predicate),
  ]);

  return {
    items: rows,
    totalCount: Number(countRows[0]?.totalCount ?? 0),
  };
}
