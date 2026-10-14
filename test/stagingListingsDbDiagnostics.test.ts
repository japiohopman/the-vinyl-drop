import {
  getApprovedStagingConnectionUrl,
  getHomeFeedQueryStage,
  hasHomeFeedInvocationStarted,
  hasExplicitRemoteDiagnosticConfirmation,
  isApprovedStagingPoolerUrl,
} from '../scripts/diagnoseStagingListingsDb';

const stagingRef = 'xuhzhdjmgvqzjxijmksu';
const transactionPoolerUrl =
  'postgresql://postgres.' + stagingRef +
  ':password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require';

describe('remote listings DB diagnostic safety', () => {
  describe('hasHomeFeedInvocationStarted', () => {
    it.each([
      { stage: 'transaction-not-started', expected: false },
      { stage: 'constructing-drizzle-client', expected: false },
      { stage: 'opening-read-only-transaction', expected: false },
      { stage: 'setting-statement-timeout', expected: false },
      { stage: 'running-drizzle-probe', expected: false },
      { stage: 'importing-listing-service', expected: false },
      { stage: 'listing-service-imported', expected: false },
      { stage: 'invoking-home-feed', expected: true },
      { stage: 'home-feed-returned', expected: true },
    ] as const)('maps execution stage $stage to $expected', ({ stage, expected }) => {
      expect(hasHomeFeedInvocationStarted(stage)).toBe(expected);
    });
  });

  describe('getHomeFeedQueryStage', () => {
    it.each([
      { count: 0, expected: 'no-query-observed' },
      { count: 1, expected: 'count-query' },
      { count: 2, expected: 'listing-rows-query' },
      { count: 3, expected: 'listing-photos-query' },
      { count: 4, expected: 'later-query' },
      { count: 12, expected: 'later-query' },
    ])('maps query-attempt count $count to a fixed label', ({ count, expected }) => {
      expect(getHomeFeedQueryStage(count)).toBe(expected);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'returns an unknown label for invalid query-attempt count %s',
      (count) => {
        expect(getHomeFeedQueryStage(count)).toBe('unknown-query-stage');
      }
    );
  });
  describe('isApprovedStagingPoolerUrl', () => {
    it.each([
      transactionPoolerUrl,
      'postgres://postgres.' + stagingRef + ':password@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
    ])('allows the known staging pooler URL shape %s', (url) => {
      expect(isApprovedStagingPoolerUrl(url)).toBe(true);
    });

    it.each([
      undefined,
      '',
      'not a URL',
      'https://localhost/database',
      'postgres://postgres:password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
      'postgres://postgres.otherproject:password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
      'postgres://postgres.' + stagingRef + ':password@db.' + stagingRef + '.supabase.co:5432/postgres',
      'postgres://postgres.' + stagingRef + ':password@aws-0-eu-west-1.pooler.supabase.com/postgres',
      'postgres://postgres.' + stagingRef + ':password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=disable',
      'postgres://postgres.' + stagingRef + ':password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&sslrootcert=somefile',
      'postgres://postgres.' + stagingRef + ':password@aws-0-eu-west-1.pooler.supabase.com:6543/otherdb',
    ])('refuses missing, malformed, non-staging, or unsafe URL %s', (url) => {
      expect(isApprovedStagingPoolerUrl(url)).toBe(false);
    });
  });

  describe('getApprovedStagingConnectionUrl', () => {
    it('uses the session-pooler port and removes URL SSL options in favor of explicit verified TLS', () => {
      const connectionUrl = getApprovedStagingConnectionUrl(transactionPoolerUrl);
      expect(connectionUrl).not.toBeNull();

      const parsed = new URL(connectionUrl as string);
      expect(parsed.port).toBe('5432');
      expect(parsed.searchParams.has('sslmode')).toBe(false);
      expect(parsed.hostname).toBe('aws-0-eu-west-1.pooler.supabase.com');
      expect(parsed.pathname).toBe('/postgres');
    });

    it('does not produce a connection URL for a non-allowlisted database', () => {
      expect(getApprovedStagingConnectionUrl('postgres://postgres:password@db.example.com:5432/postgres')).toBeNull();
    });
  });

  describe('hasExplicitRemoteDiagnosticConfirmation', () => {
    it('requires the exact one-command opt-in', () => {
      expect(hasExplicitRemoteDiagnosticConfirmation('CONFIRM_STAGING_READ_ONLY')).toBe(true);
      expect(hasExplicitRemoteDiagnosticConfirmation(undefined)).toBe(false);
      expect(hasExplicitRemoteDiagnosticConfirmation('true')).toBe(false);
    });
  });
});
