import { randomBytes } from 'crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  decrementRateLimitBucketWithClient,
  getSafeRateLimitCleanupFailureCategory,
  getSafeRateLimitCleanupFailureDiagnostics,
  incrementRateLimitBucketWithClient,
  pruneExpiredRateLimitBucketsWithClient,
  RateLimitBucket,
} from '../src/app/services/rateLimitService';

describe('shared rate-limit cleanup error classification', () => {
  it('exposes only allowlisted PostgreSQL SQLSTATE codes and never raw error details', () => {
    const postgresError = new postgres.PostgresError({
      code: '42501',
      message: 'sensitive connection or query detail',
    } as unknown as string);

    expect(getSafeRateLimitCleanupFailureCategory(postgresError)).toBe('postgres_sqlstate:42501');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: '42501',
      message: 'arbitrary object with a SQLSTATE-shaped code',
    })).toBe('unclassified');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'TOKEN',
      message: 'arbitrary five-character code',
    })).toBe('unclassified');

    expect(getSafeRateLimitCleanupFailureCategory(
      new Error('sensitive driver message')
    )).toBe('unclassified');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'abcde',
    })).toBe('unclassified');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: '4250\n',
    })).toBe('unclassified');
  });

  it('classifies known Postgres.js connection failures without exposing arbitrary codes', () => {
    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'CONNECTION_CLOSED',
      message: 'host:port and other sensitive connection detail',
    })).toBe('postgres_js:CONNECTION_CLOSED');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'CONNECT_TIMEOUT',
      message: 'sensitive connection detail',
    })).toBe('postgres_js:CONNECT_TIMEOUT');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'UNDEFINED_VALUE',
      message: 'sensitive query detail',
    })).toBe('postgres_js:UNDEFINED_VALUE');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'ECONNRESET',
      message: 'sensitive socket detail',
    })).toBe('node_network:ECONNRESET');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'EPIPE',
      message: 'sensitive broken-pipe detail',
    })).toBe('node_network:EPIPE');

    expect(getSafeRateLimitCleanupFailureCategory({
      code: 'PRIVATE_DRIVER_ERROR',
      message: 'this value must never be logged',
    })).toBe('unclassified');
  });

  it('fails closed when a code property accessor throws', () => {
    const malformedError = Object.defineProperty({}, 'code', {
      get() {
        throw new Error('sensitive accessor detail');
      },
    });

    expect(getSafeRateLimitCleanupFailureCategory(malformedError)).toBe('unclassified');
    expect(getSafeRateLimitCleanupFailureDiagnostics(malformedError)).toEqual({
      failureCategory: 'unclassified',
      failureType: 'other_object',
      codeSource: 'unreadable',
      codeState: 'unreadable',
    });
  });

  it('records only a fixed built-in error type when no code is present', () => {
    expect(getSafeRateLimitCleanupFailureDiagnostics(
      new TypeError('sensitive driver detail')
    )).toEqual({
      failureCategory: 'unclassified',
      failureType: 'type_error',
      codeSource: 'none',
      codeState: 'missing',
    });
  });

  it('classifies an allowlisted code on the first nested cause', () => {
    const error = new Error('sensitive outer detail', {
      cause: Object.assign(new Error('sensitive inner detail'), { code: 'ECONNRESET' }),
    });

    expect(getSafeRateLimitCleanupFailureDiagnostics(error)).toEqual({
      failureCategory: 'node_network:ECONNRESET',
      failureType: 'error',
      codeSource: 'cause_1',
      codeState: 'recognized',
    });
  });

  it('classifies an allowlisted code no deeper than the second nested cause', () => {
    const error = new Error('sensitive outer detail', {
      cause: new Error('sensitive middle detail', {
        cause: new postgres.PostgresError({
          code: '42501',
          message: 'sensitive database detail',
        } as unknown as string),
      }),
    });

    expect(getSafeRateLimitCleanupFailureDiagnostics(error)).toEqual({
      failureCategory: 'postgres_sqlstate:42501',
      failureType: 'error',
      codeSource: 'cause_2',
      codeState: 'recognized',
    });
  });

  it('does not expose arbitrary nested codes or messages', () => {
    const error = new Error('sensitive outer detail', {
      cause: { code: 'PRIVATE_DRIVER_ERROR', message: 'must never be logged' },
    });

    expect(getSafeRateLimitCleanupFailureDiagnostics(error)).toEqual({
      failureCategory: 'unclassified',
      failureType: 'error',
      codeSource: 'cause_1',
      codeState: 'unknown_string',
    });
  });

  it('handles a throwing cause accessor and cyclic causes without throwing', () => {
    const unreadableCause = Object.defineProperty({}, 'cause', {
      get() {
        throw new Error('sensitive cause detail');
      },
    });

    expect(getSafeRateLimitCleanupFailureDiagnostics(unreadableCause)).toEqual({
      failureCategory: 'unclassified',
      failureType: 'other_object',
      codeSource: 'unreadable',
      codeState: 'unreadable',
    });

    const cyclicError: { cause?: unknown } = {};
    cyclicError.cause = cyclicError;
    expect(getSafeRateLimitCleanupFailureDiagnostics(cyclicError)).toEqual({
      failureCategory: 'unclassified',
      failureType: 'other_object',
      codeSource: 'none',
      codeState: 'missing',
    });
  });
});

describe('shared rate-limit raw timestamp parameters', () => {
  it('passes an ISO timestamp string with an explicit timestamptz cast to postgres.js', async () => {
    let capturedQuery = '';
    let capturedParameters: unknown[] = [];
    const client = {
      async unsafe(query: string, parameters: unknown[]) {
        capturedQuery = query;
        capturedParameters = parameters;
        return [];
      },
    } as never;

    const nowMs = Date.parse('2026-11-06T08:00:00.000Z');
    await pruneExpiredRateLimitBucketsWithClient(client, nowMs);

    expect(capturedQuery).toContain('expires_at <= $1::timestamptz');
    expect(capturedParameters).toEqual([new Date(nowMs).toISOString()]);
    expect(capturedParameters.some((value) => value instanceof Date)).toBe(false);
  });
});

const databaseUrl = process.env.RATE_LIMIT_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('PostgreSQL shared rate-limit reservation release', () => {
  let client: ReturnType<typeof postgres>;

  beforeAll(async () => {
    client = postgres(databaseUrl as string, { max: 4 });
    await client.unsafe('CREATE SCHEMA IF NOT EXISTS private');
    await client.unsafe(
      'CREATE TABLE IF NOT EXISTS private.rate_limit_buckets (' +
      'bucket_key text NOT NULL, ' +
      'window_start timestamptz NOT NULL, ' +
      'hit_count integer NOT NULL CHECK (hit_count > 0), ' +
      'expires_at timestamptz NOT NULL, ' +
      'updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), ' +
      'PRIMARY KEY (bucket_key, window_start), ' +
      'CHECK (expires_at > window_start))'
    );
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('removes expired buckets at and before the expiry boundary while retaining active buckets', async () => {
    const nowMs = Date.now();
    const expiredBucketKey = randomBytes(32).toString('hex');
    const boundaryBucketKey = randomBytes(32).toString('hex');
    const activeBucketKey = randomBytes(32).toString('hex');

    const expiredWindowStart = nowMs - 3 * 60 * 1000;
    const expiredAt = nowMs - 60 * 1000;
    const boundaryWindowStart = nowMs - 2 * 60 * 1000;
    const activeWindowStart = nowMs - 60 * 1000;
    const activeExpiresAt = nowMs + 60 * 60 * 1000;

    try {
      await client.unsafe(
        'INSERT INTO private.rate_limit_buckets ' +
        '(bucket_key, window_start, hit_count, expires_at) VALUES ' +
        '($1, $2, 1, $3), ($4, $5, 1, $6), ($7, $8, 1, $9)',
        [
          expiredBucketKey,
          new Date(expiredWindowStart),
          new Date(expiredAt),
          boundaryBucketKey,
          new Date(boundaryWindowStart),
          new Date(nowMs),
          activeBucketKey,
          new Date(activeWindowStart),
          new Date(activeExpiresAt),
        ]
      );

      await pruneExpiredRateLimitBucketsWithClient(client, nowMs);

      const rows = await client.unsafe(
        'SELECT bucket_key FROM private.rate_limit_buckets ' +
        'WHERE bucket_key IN ($1, $2, $3)',
        [expiredBucketKey, boundaryBucketKey, activeBucketKey]
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].bucket_key).toBe(activeBucketKey);
    } finally {
      await client.unsafe(
        'DELETE FROM private.rate_limit_buckets WHERE bucket_key IN ($1, $2, $3)',
        [expiredBucketKey, boundaryBucketKey, activeBucketKey]
      );
    }
  });

  it('runs raw rate-limit timestamp operations after Drizzle installs transparent serializers', async () => {
    const drizzledClient = postgres(databaseUrl as string, { max: 1 });
    const database = drizzle(drizzledClient);
    expect(database).toBeTruthy();

    const nowMs = Date.now();
    const bucket: RateLimitBucket = {
      bucketKey: randomBytes(32).toString('hex'),
      windowStartMs: nowMs - 2 * 60 * 1000,
      expiresAtMs: nowMs - 60 * 1000,
    };

    try {
      expect(await incrementRateLimitBucketWithClient(drizzledClient, bucket)).toBe(1);
      expect(await incrementRateLimitBucketWithClient(drizzledClient, bucket)).toBe(2);
      await decrementRateLimitBucketWithClient(drizzledClient, bucket);
      await pruneExpiredRateLimitBucketsWithClient(drizzledClient, nowMs);

      const rows = await drizzledClient.unsafe(
        'SELECT bucket_key FROM private.rate_limit_buckets WHERE bucket_key = $1',
        [bucket.bucketKey]
      );
      expect(rows).toHaveLength(0);
    } finally {
      await drizzledClient.unsafe(
        'DELETE FROM private.rate_limit_buckets WHERE bucket_key = $1',
        [bucket.bucketKey]
      );
      await drizzledClient.end();
    }
  });

  it('deletes no more than 1,000 expired fixture buckets in one cleanup pass', async () => {
    const nowMs = Date.now();
    const fixtureKeys = Array.from(
      { length: 1001 },
      () => randomBytes(32).toString('hex')
    );
    const windowStart = new Date(nowMs - 2 * 60 * 1000);
    const expiresAt = new Date(nowMs - 60 * 1000);
    const valuePlaceholders = fixtureKeys.map((_, index) => {
      const firstParameter = index * 3 + 1;
      return '($' + firstParameter + ', $' + (firstParameter + 1) +
        ', 1, $' + (firstParameter + 2) + ')';
    }).join(', ');
    const values = fixtureKeys.flatMap((bucketKey) => [
      bucketKey,
      windowStart,
      expiresAt,
    ]);
    const keyPlaceholders = fixtureKeys.map((_, index) => '$' + (index + 1)).join(', ');

    try {
      await client.unsafe(
        'INSERT INTO private.rate_limit_buckets ' +
        '(bucket_key, window_start, hit_count, expires_at) VALUES ' +
        valuePlaceholders,
        values
      );

      await pruneExpiredRateLimitBucketsWithClient(client, nowMs);

      const remaining = await client.unsafe(
        'SELECT bucket_key FROM private.rate_limit_buckets ' +
        'WHERE bucket_key IN (' + keyPlaceholders + ')',
        fixtureKeys
      );

      expect(remaining.length).toBeGreaterThanOrEqual(1);
    } finally {
      await client.unsafe(
        'DELETE FROM private.rate_limit_buckets WHERE bucket_key IN (' +
        keyPlaceholders + ')',
        fixtureKeys
      );
    }
  });

  it('serializes concurrent releases with a failed-attempt increment without losing either failure', async () => {
    // One failed attempt plus two successful reservations are already counted.
    // The concurrent increment adds another failed attempt; two releases must
    // leave both failed attempts in the shared counter.
    const bucket: RateLimitBucket = {
      bucketKey: randomBytes(32).toString('hex'),
      windowStartMs: Date.parse('2026-10-31T09:00:00.000Z'),
      expiresAtMs: Date.parse('2026-10-31T10:00:00.000Z'),
    };

    try {
      await client.unsafe(
        'INSERT INTO private.rate_limit_buckets ' +
        '(bucket_key, window_start, hit_count, expires_at) VALUES ($1, $2, 3, $3)',
        [bucket.bucketKey, new Date(bucket.windowStartMs), new Date(bucket.expiresAtMs)]
      );

      await Promise.all([
        decrementRateLimitBucketWithClient(client, bucket),
        decrementRateLimitBucketWithClient(client, bucket),
        incrementRateLimitBucketWithClient(client, bucket),
      ]);

      const rows = await client.unsafe(
        'SELECT hit_count FROM private.rate_limit_buckets WHERE bucket_key = $1 AND window_start = $2',
        [bucket.bucketKey, new Date(bucket.windowStartMs)]
      );

      expect(rows).toHaveLength(1);
      expect(Number(rows[0].hit_count)).toBe(2);
    } finally {
      await client.unsafe(
        'DELETE FROM private.rate_limit_buckets WHERE bucket_key = $1 AND window_start = $2',
        [bucket.bucketKey, new Date(bucket.windowStartMs)]
      );
    }
  });
});
