import { sql } from 'drizzle-orm';
import { getDb } from '../../db';
import { RegistrationConsentRecord } from '../services/registrationConsent';

type DbInstance = ReturnType<typeof getDb>;

/** Minimal server-side audit; the table is private to the application database role. */
export async function saveRegistrationConsent(userId: string, consent: RegistrationConsentRecord, dbOverride?: DbInstance): Promise<void> {
  await getDb(dbOverride).execute(sql`
    INSERT INTO private.registration_consents (user_id, terms_version, terms_accepted_at, age_attested_at)
    VALUES (${userId}::uuid, ${consent.termsVersion}, ${consent.termsAcceptedAt}::timestamptz, ${consent.ageAttestedAt}::timestamptz)
    ON CONFLICT (user_id) DO UPDATE
      SET terms_version = EXCLUDED.terms_version, terms_accepted_at = EXCLUDED.terms_accepted_at, age_attested_at = EXCLUDED.age_attested_at
  `);
}

export async function hasRegistrationConsent(userId: string, dbOverride?: DbInstance): Promise<boolean> {
  const rows = await getDb(dbOverride).execute(sql`SELECT user_id FROM private.registration_consents WHERE user_id = ${userId}::uuid LIMIT 1`);
  return rows.length > 0;
}
