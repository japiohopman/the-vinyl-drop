import { randomBytes } from 'crypto';
import postgres from 'postgres';
import {
  decrementRateLimitBucketWithClient,
  incrementRateLimitBucketWithClient,
  RateLimitBucket,
} from '../src/app/services/rateLimitService';

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
