import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { getDb } from '../src/db';
import { searchPublicPeople } from '../src/app/repositories/peopleSearchRepository';
import { searchPeople } from '../src/app/services/peopleSearchService';

describe('public people search repository', () => {
  let pg: PGlite;
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        username text NOT NULL,
        display_name text,
        avatar_url text,
        bio text,
        location text,
        website_url text
      );
    `);

    const rows = [
      ['10000000-0000-4000-8000-000000000001', 'CrateKing', 'Vinyl Royalty', 'https://images.example/one.webp', 'PRIVATE BIO ONE', 'PRIVATE LOCATION ONE', 'https://private.example/one'],
      ['10000000-0000-4000-8000-000000000002', 'crateking_nl', 'Collector Two', null, 'PRIVATE BIO TWO', 'PRIVATE LOCATION TWO', null],
      ['10000000-0000-4000-8000-000000000003', 'recordfan', 'The CrateKing', null, 'PRIVATE BIO THREE', 'PRIVATE LOCATION THREE', null],
      ['10000000-0000-4000-8000-000000000004', 'soulselector', 'Soul Selector', null, 'PRIVATE BIO FOUR', 'PRIVATE LOCATION FOUR', null],
    ];

    for (const row of rows) {
      await pg.query(
        'INSERT INTO public.profiles (id, username, display_name, avatar_url, bio, location, website_url) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        row
      );
    }

    for (let index = 5; index <= 29; index += 1) {
      const id = '10000000-0000-4000-8000-' + String(index).padStart(12, '0');
      await pg.query(
        'INSERT INTO public.profiles (id, username, display_name, bio, location) VALUES ($1, $2, $3, $4, $5)',
        [id, 'crate_member_' + index, 'Crate member ' + index, 'PRIVATE BIO', 'PRIVATE LOCATION']
      );
    }

    db = drizzle(pg) as unknown as ReturnType<typeof getDb>;
  });

  afterAll(async () => {
    await pg.close();
  });

  it('ranks exact username before username prefix and display-name matches', async () => {
    const result = await searchPublicPeople('crateking', { limit: 20, offset: 0 }, db);

    expect(result.items.slice(0, 3).map((person) => person.username)).toEqual([
      'CrateKing',
      'crateking_nl',
      'recordfan',
    ]);
  });

  it('matches usernames and display names without case sensitivity', async () => {
    const exact = await searchPublicPeople('CRATEKING', { limit: 20, offset: 0 }, db);
    const displayName = await searchPublicPeople('crateki', { limit: 20, offset: 0 }, db);

    expect(exact.items[0]?.username).toBe('CrateKing');
    expect(displayName.items.some((person) => person.username === 'recordfan')).toBe(true);
  });

  it('returns no rows for an unmatched query', async () => {
    const result = await searchPublicPeople('not-a-real-member', { limit: 20, offset: 0 }, db);
    expect(result).toEqual({ items: [], totalCount: 0 });
  });

  it('projects only public username, display name and avatar fields', async () => {
    const result = await searchPublicPeople('crateking', { limit: 8, offset: 0 }, db);

    expect(Object.keys(result.items[0] || {}).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'username',
    ]);
    expect(JSON.stringify(result.items)).not.toContain('PRIVATE BIO');
    expect(JSON.stringify(result.items)).not.toContain('PRIVATE LOCATION');
    expect(JSON.stringify(result.items)).not.toContain('private.example');
    expect(JSON.stringify(result.items)).not.toContain('10000000-0000-4000-8000-000000000001');
  });

  it('caps result rows at the requested safe limit while retaining the total count', async () => {
    const result = await searchPublicPeople('crate', { limit: 100, offset: 0 }, db);

    expect(result.items).toHaveLength(20);
    expect(result.totalCount).toBe(28);
  });

  it('bounds page size and page count for the rendered search results', async () => {
    const firstPage = await searchPeople('crate', 1, db);
    const lastAllowedPage = await searchPeople('crate', 999, db);

    expect(firstPage.items).toHaveLength(12);
    expect(firstPage.totalCount).toBe(27);
    expect(firstPage.page).toBe(1);
    expect(firstPage.totalPages).toBe(3);
    expect(lastAllowedPage.page).toBe(3);
    expect(lastAllowedPage.items).toHaveLength(4);
  });
});
