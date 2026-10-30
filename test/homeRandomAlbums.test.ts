import {
  findHomeDiscoveryListingsByCursor,
  JoinedListingRecord,
} from '../src/app/repositories/listingRepository';

type QueryRecord = {
  where: unknown[];
  limits: number[];
  orderByCalls: number;
};

function createFakeDatabase(responses: unknown[][]) {
  const queries: QueryRecord[] = [];
  const db = {
    select: jest.fn(() => {
      const response = responses.shift() || [];
      const queryRecord: QueryRecord = { where: [], limits: [], orderByCalls: 0 };
      queries.push(queryRecord);

      const builder: any = {
        from: jest.fn(() => builder),
        innerJoin: jest.fn(() => builder),
        where: jest.fn((condition: unknown) => {
          queryRecord.where.push(condition);
          return builder;
        }),
        orderBy: jest.fn(() => {
          queryRecord.orderByCalls += 1;
          return builder;
        }),
        limit: jest.fn((limit: number) => {
          queryRecord.limits.push(limit);
          return builder;
        }),
        then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(response).then(resolve, reject),
      };

      return builder;
    }),
  };

  return { db, queries };
}

function makeRecord(id: string): JoinedListingRecord {
  return {
    listing: { id } as JoinedListingRecord['listing'],
    physicalCopy: {} as JoinedListingRecord['physicalCopy'],
    release: {} as JoinedListingRecord['release'],
    seller: {} as JoinedListingRecord['seller'],
    primaryPhotoPath: null,
  };
}

describe('Home Random Albums selection (#258)', () => {
  it('uses a bounded indexed range and wraps once to fill a partial selection', async () => {
    const first = makeRecord('10000000-0000-4000-8000-000000000001');
    const wrapped = makeRecord('00000000-0000-4000-8000-000000000002');
    const photo = {
      id: 'photo-one',
      listingId: wrapped.listing.id,
      storagePath: 'listings/wrapped-front.webp',
    };
    const { db, queries } = createFakeDatabase([
      [first],       // IDs at/after the fresh cursor
      [wrapped],     // Wrap to lower IDs for the one remaining slot
      [photo],       // One bulk primary-photo lookup for the selected IDs
    ]);

    const result = await findHomeDiscoveryListingsByCursor(
      '80000000-0000-4000-8000-000000000000',
      2,
      ['recent-one', 'recent-two'],
      db as never
    );

    expect(result.map((record) => record.listing.id)).toEqual([
      first.listing.id,
      wrapped.listing.id,
    ]);
    expect(new Set(result.map((record) => record.listing.id)).size).toBe(2);
    expect(result.find((record) => record.listing.id === wrapped.listing.id)?.primaryPhotoPath)
      .toBe('listings/wrapped-front.webp');

    // One initial range, one bounded wrap query, and one bulk photo query.
    expect(db.select).toHaveBeenCalledTimes(3);
    expect(queries[0].limits).toEqual([2]);
    expect(queries[1].limits).toEqual([1]);
    expect(queries[0].orderByCalls).toBe(1);
    expect(queries[1].orderByCalls).toBe(1);
    expect(queries[0].where).toHaveLength(1);
    expect(queries[1].where).toHaveLength(1);
  });

  it('returns a small eligible pool as-is without inventing or duplicating records', async () => {
    const onlyOne = makeRecord('30000000-0000-4000-8000-000000000003');
    const { db, queries } = createFakeDatabase([
      [onlyOne],
      [],
      [],
    ]);

    const result = await findHomeDiscoveryListingsByCursor(
      '20000000-0000-4000-8000-000000000002',
      6,
      ['recent-one'],
      db as never
    );

    expect(result).toHaveLength(1);
    expect(result[0].listing.id).toBe(onlyOne.listing.id);
    expect(queries[0].limits).toEqual([6]);
    expect(queries[1].limits).toEqual([5]);
  });

  it('returns an empty selection safely when no eligible published listings exist', async () => {
    const { db, queries } = createFakeDatabase([[], []]);

    const result = await findHomeDiscoveryListingsByCursor(
      '40000000-0000-4000-8000-000000000004',
      6,
      [],
      db as never
    );

    expect(result).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(queries[0].limits).toEqual([6]);
    expect(queries[1].limits).toEqual([6]);
  });

  it('clamps discovery selection size to the six-card Home contract', async () => {
    const records = Array.from({ length: 6 }, (_, index) =>
      makeRecord(`50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
    );
    const { db, queries } = createFakeDatabase([records, []]);

    const result = await findHomeDiscoveryListingsByCursor(
      '00000000-0000-4000-8000-000000000000',
      100,
      [],
      db as never
    );

    expect(result).toHaveLength(6);
    expect(queries[0].limits).toEqual([6]);
  });
});
