import postgres from 'postgres';
import { getPostgresConnectionOptions } from '../src/db/connectionOptions';
import { basename } from 'node:path';
import { assertExactStoragePolicySet } from './productionStoragePolicies';
import type { StoragePolicyRow } from './productionStoragePolicies';

const EXPECTED_PROJECT_REF = 'anxhmlalxjvatrufcjei';
const EXPECTED_POOLER_HOST = 'aws-0-eu-west-1.pooler.supabase.com';

function getApprovedProductionConnectionString(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is missing.');

  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.PRODUCTION_DB_PROJECT_REF !== EXPECTED_PROJECT_REF ||
    process.env.TVD_CONFIRM_PRODUCTION_DB_PROJECT_REF !== EXPECTED_PROJECT_REF ||
    process.env.PRODUCTION_DB_HOST !== EXPECTED_POOLER_HOST
  ) {
    throw new Error('The process-only production target confirmation does not match the approved project.');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL URL.');
  }

  const username = decodeURIComponent(url.username);
  const queryParameters = [...url.searchParams.entries()];
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname.toLowerCase() !== EXPECTED_POOLER_HOST ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    username !== `postgres.${EXPECTED_PROJECT_REF}` ||
    !url.password ||
    queryParameters.length !== 1 ||
    queryParameters[0][0] !== 'sslmode' ||
    queryParameters[0][1] !== 'require'
  ) {
    throw new Error('DATABASE_URL does not identify the approved production session pooler with TLS required.');
  }

  return connectionString;
}

async function main(): Promise<void> {
  const connectionString = getApprovedProductionConnectionString();
  const client = postgres(connectionString, {
    ...getPostgresConnectionOptions('production'),
    max: 1,
    connect_timeout: 8,
    idle_timeout: 15,
    prepare: false,
    connection: { application_name: 'tvd-production-storage-policy-preflight' },
  });

  try {
    const result = await client.begin('read only', async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '8000ms'");
      await tx.unsafe("SET LOCAL lock_timeout = '2000ms'");

      const bucketRows = await tx.unsafe<{ is_private: boolean }[]>(
        "SELECT (public IS FALSE) AS is_private FROM storage.buckets WHERE id = 'listing-photo-originals';"
      );
      if (bucketRows.length !== 1 || bucketRows[0].is_private !== true) {
        throw new Error('The listing-photo-originals bucket is missing or is not private.');
      }

      const rlsRows = await tx.unsafe<{ rls_enabled: boolean }[]>(
        `SELECT c.relrowsecurity AS rls_enabled
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'storage' AND c.relname = 'objects';`
      );
      if (rlsRows.length !== 1 || rlsRows[0].rls_enabled !== true) {
        throw new Error('Row Level Security is not enabled on storage.objects.');
      }

      const policyRows = await tx.unsafe<StoragePolicyRow[]>(
        `SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check
         FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
         ORDER BY policyname;`
      );
      assertExactStoragePolicySet(policyRows);

      return { policyCount: policyRows.length };
    });

    console.log(JSON.stringify({
      status: 'passed',
      target: 'approved production project',
      privateOriginalsBucket: true,
      storageObjectsRls: true,
      exactStoragePolicyCount: result.policyCount,
    }, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

const invokedFile = basename(process.argv[1] || '').toLowerCase();
if (invokedFile === 'verifyproductionstoragepolicies.ts' || invokedFile === 'verifyproductionstoragepolicies.js') {
  void main().catch((error: unknown) => {
    const reason = error instanceof Error && (
      error.message.startsWith('Storage policy preflight failed:') ||
      error.message.startsWith('The listing-photo-originals bucket') ||
      error.message.startsWith('Row Level Security')
    )
      ? error.message
      : 'The read-only production Storage preflight could not be completed; migrations are blocked.';
    console.error(JSON.stringify({ status: 'failed', reason }, null, 2));
    process.exitCode = 1;
  });
}
