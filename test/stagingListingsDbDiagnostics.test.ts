import {
  hasExplicitRemoteDiagnosticConfirmation,
  isApprovedStagingPoolerUrl,
} from '../scripts/diagnoseStagingListingsDb';

const stagingRef = 'xuhzhdjmgvqzjxijmksu';

describe('remote listings DB diagnostic safety', () => {
  describe('isApprovedStagingPoolerUrl', () => {
    it.each([
      'postgresql://postgres.' + stagingRef + ':password@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require',
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
      'postgres://postgres.' + stagingRef + ':password@aws-0-eu-west-1.pooler.supabase.com:6543/otherdb',
    ])('refuses missing, malformed, non-staging, or unsafe URL %s', (url) => {
      expect(isApprovedStagingPoolerUrl(url)).toBe(false);
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
