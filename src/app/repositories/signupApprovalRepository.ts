import { sql } from 'drizzle-orm';
import { getDb } from '../../db';

type DbInstance = ReturnType<typeof getDb>;

/** Records a short-lived approval after the HIBP check succeeds. */
export async function createPasswordCheckedSignupApproval(
  approvalId: string,
  email: string,
  dbOverride?: DbInstance
): Promise<void> {
  const db = getDb(dbOverride);
  const normalizedEmail = email.trim().toLowerCase();
  await db.execute(sql`
    DELETE FROM private.password_checked_signup_approvals
    WHERE expires_at <= pg_catalog.clock_timestamp()
       OR (consumed_at IS NOT NULL AND consumed_at < pg_catalog.clock_timestamp() - INTERVAL '1 day')
  `);
  await db.execute(sql`
    INSERT INTO private.password_checked_signup_approvals (approval_id, email_normalized, expires_at)
    VALUES (${approvalId}::uuid, ${normalizedEmail}, now() + INTERVAL '5 minutes')
  `);
}
