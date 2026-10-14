import {
  getApprovedStagingConnectionUrl,
  getHomeFeedQueryStage,
  hasExplicitRemoteDiagnosticConfirmation,
  isApprovedStagingPoolerUrl,
} from '../scripts/diagnoseStagingListingsDb';

const stagingRef = 'xuhzhdjmgvqzjxijmksu';
const transactionPoolerUrl =
  'postgresql://postgres.' + stagingRef +
  ':password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require';

describe('remote listings DB diagnostic safety', () => {
  describe('getHomeFeedQueryStage', () => {
    it.each([
      [0, 'no-query-observed'],
      [1, 'count-query'],
      [2, 'listing-rows-query'],
      [3, 'listing-photos-query'],
      [4, 'later-query'],
      [12, 'later-query'],
    ])('maps query-attempt count %i to the fixed label %s', (count, expected) => {
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
