import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { searchListings } from '../src/app/repositories/listingRepository';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import {
  getVinylFormatPostgresPattern,
  isExplicitWhiteLabel,
  matchesVinylFormatFilter,
  parseVinylFormatFilters,
  resolveWhiteLabelFilter,
  toggleVinylFormatFilter,
  VINYL_FORMAT_FILTERS,
  WHITE_LABEL_POSTGRES_PATTERN,
} from '../src/domain/releaseFormat';

describe('Browse vinyl format filters — metadata semantics', () => {
  it('parses repeated query values, removes duplicates, and ignores unknown values', () => {
    expect(parseVinylFormatFilters(['LP', '7-inch', 'lp', 'invalid', 12])).toEqual(['lp', '7-inch']);
    expect(parseVinylFormatFilters('12-inch')).toEqual(['12-inch']);
    expect(parseVinylFormatFilters(undefined)).toEqual([]);
    expect(toggleVinylFormatFilter(['lp', '7-inch'], 'lp')).toEqual(['7-inch']);
    expect(toggleVinylFormatFilter(['lp'], '12-inch')).toEqual(['lp', '12-inch']);
    expect(resolveWhiteLabelFilter('1', true)).toBe(false);
    expect(resolveWhiteLabelFilter('', true)).toBe(true);
    expect(resolveWhiteLabelFilter(['1'], false)).toBe(false);
  });

  it('distinguishes LP release type from explicit physical diameter', () => {
    const examples = [
      { format: 'Vinyl, LP, Album, Reissue', lp: true, twelve: false, seven: false },
      { format: 'Vinyl, 12", 45 RPM, Single', lp: false, twelve: true, seven: false },
      { format: 'Vinyl, 12-inch, Single', lp: false, twelve: true, seven: false },
      { format: 'Vinyl, 7", 45 RPM, Single', lp: false, twelve: false, seven: true },
      { format: 'Vinyl, 7 inch, Single', lp: false, twelve: false, seven: true },
      { format: 'Vinyl, Long Playing, Album', lp: true, twelve: false, seven: false },
      { format: 'Vinyl, LP, 12", Album', lp: true, twelve: true, seven: false },
      { format: 'Vinyl, Single, 45 RPM', lp: false, twelve: false, seven: false },
      { format: 'Vinyl', lp: false, twelve: false, seven: false },
    ];

    for (const item of examples) {
      expect(matchesVinylFormatFilter(item.format, 'lp')).toBe(item.lp);
      expect(matchesVinylFormatFilter(item.format, '12-inch')).toBe(item.twelve);
      expect(matchesVinylFormatFilter(item.format, '7-inch')).toBe(item.seven);
    }
  });

  it('uses PostgreSQL regex patterns that match the same representative stored formats', async () => {
    const database = new PGlite();
    try {
      const examples = [
        { format: 'Vinyl, LP, Album, Reissue', filter: 'lp' as const, expected: true },
        { format: 'Vinyl, 12", 45 RPM, Single', filter: '12-inch' as const, expected: true },
        { format: 'Vinyl, 12-inch, Single', filter: 'lp' as const, expected: false },
        { format: 'Vinyl, 7 inch, Single', filter: '7-inch' as const, expected: true },
        { format: 'Vinyl, Single, 45 RPM', filter: '7-inch' as const, expected: false },
      ];
      for (const item of examples) {
        const result = await database.query<{ matches: boolean }>(
          'SELECT $1::text ~* $2::text AS matches',
          [item.format, getVinylFormatPostgresPattern(item.filter)]
        );
        expect(result.rows[0]?.matches).toBe(item.expected);
      }
    } finally {
      await database.close();
    }
  });

  it('recognizes White label only from an explicit release-label marker', () => {
    expect(isExplicitWhiteLabel('White Label')).toBe(true);
    expect(isExplicitWhiteLabel('Acme White-Label Records')).toBe(true);
    expect(isExplicitWhiteLabel('White Label Promo')).toBe(true);
    expect(isExplicitWhiteLabel('Unknown label')).toBe(false);
    expect(isExplicitWhiteLabel(null)).toBe(false);
  });
});

describe('Browse format filters — rendered state and responsive controls', () => {
  it('renders selected chips and preserves format and other filters in navigation URLs', async () => {
    const html = await ejs.renderFile(path.join(process.cwd(), 'views/browse/index.ejs'), {
      title: 'Browse',
      listings: [],
      filters: {
        q: 'De La Soul',
        genre: 'Hip Hop',
        condition: 'VG+',
        minPrice: '5',
        maxPrice: '500',
        sort: 'price_asc',
        view: 'list',
        formats: ['lp', '7-inch'],
        whiteLabel: true,
      },
      pagination: { totalCount: 37, page: 2, limit: 12, totalPages: 3 },
      formatOptions: VINYL_FORMAT_FILTERS,
      whiteLabelAvailable: true,
    });

    expect(html).toContain('name="formatToggle" value="lp"');
    expect(html).toContain('name="formatToggle" value="7-inch"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('name="whiteLabelToggle"');
    expect(html).toContain('format=lp');
    expect(html).toContain('format=7-inch');
    expect(html).toContain('whiteLabel=1');
    expect(html).toContain('view=list');
    expect(html).toContain('q=De%20La%20Soul');
    expect(html).toContain('page=2'); // View-mode links preserve current page as well as every filter.
  });

  it('keeps responsive inputs shrinkable and quick-filter touch targets at least 44px', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'public/css/style.css'), 'utf8');
    expect(css).toContain('.browse-keyword-control input');
    expect(css).toContain('min-width: 0');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr)');
  });
});


describe('Browse format filters — repository query integration', () => {
  it('wires selected formats into the repository WHERE clause and combines independent filters with AND', async () => {
    const whereClauses: Array<{ sql: string; params: unknown[] }> = [];
    const builder = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn((condition: SQL | undefined) => {
        if (condition) {
          whereClauses.push(new PgDialect().sqlToQuery(condition));
        }
        return Promise.resolve([{ total: 0 }]);
      }),
    };
    const db = {
      select: jest.fn().mockReturnValue(builder),
    } as unknown as NonNullable<Parameters<typeof searchListings>[1]>;

    const result = await searchListings({
      formats: ['lp', '12-inch'],
      whiteLabel: true,
      genre: 'Hip Hop',
    }, db);

    expect(result.totalCount).toBe(0);
    expect(whereClauses).toHaveLength(1);

    const where = whereClauses[0];
    expect(where.sql.toLowerCase()).toContain(' or ');
    expect(where.sql.toLowerCase()).toContain(' and ');
    expect(where.sql.match(/"releases"\."format" ~\*/g)).toHaveLength(2);
    expect(where.sql).toContain('"releases"."label" ~*');
    expect(where.params).toContain(getVinylFormatPostgresPattern('lp'));
    expect(where.params).toContain(getVinylFormatPostgresPattern('12-inch'));
    expect(where.params).toContain(WHITE_LABEL_POSTGRES_PATTERN);
    expect(where.params).toContain('%Hip Hop%');
  });
});
