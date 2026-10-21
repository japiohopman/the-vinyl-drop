# The Vinyl Drop — Manual Backup and Recovery Plan

**Status: proposed operational plan; NOT YET VERIFIED by a real backup/restore.**  
**Owner approval required:** before this plan is treated as the accepted pilot risk decision.  
**Last reviewed:** 21 October 2026.  
**Scope:** Supabase Free project, Express application database, Auth identities and listing-photo Storage objects.

This document records a safe recovery design. No live export, backup, restore, project creation, plan upgrade or provider setting change was performed to write it. Do not treat the existence of this document as evidence that a backup exists or can be restored.

## 1. Verified platform boundary

Supabase's current official documentation states that automatic daily database backups are for Pro, Team and Enterprise plans; Free projects are advised to export regularly with the CLI and keep an off-site copy. Supabase database backups do **not** include the actual Storage object bytes. A default `supabase db dump` excludes managed schemas such as `auth` and `storage`, and by default it does not include data or custom roles.

Sources checked 21 October 2026:

- Database backups: https://supabase.com/docs/guides/platform/backups
- CLI `db dump` reference: https://supabase.com/docs/reference/cli/supabase-inspect-db-role-configs
- Downloading Storage objects: https://supabase.com/docs/guides/storage/management/download-objects
- Auth user management/export: https://supabase.com/docs/guides/auth/managing-user-data

**Conclusion:** a single SQL dump is not a complete restore plan for The Vinyl Drop.

## 2. Required recovery components

A recovery set is complete only when each relevant component has a separately verified path:

1. **Application schema and migrations:** the repository's Drizzle migration files and the custom SQL/policies/functions that define the app. The restore must start from the exact main commit recorded in the backup manifest.
2. **Application database data:** the app-owned tables, relationships, constraints, sequences and required custom-schema data. Include both schema and data; a schema-only dump is not a data backup.
3. **Custom roles/grants:** record relevant role definitions and privileges. Default CLI dump behavior does not include custom roles; reset any role passwords that are not present in the backup.
4. **Supabase Auth:** user identities and identity-provider links are managed in the `auth` schema and are excluded from a default dump. An accepted procedure must explicitly cover the Auth records needed for recovery. Treat these files as highly sensitive because Auth exports can contain password hashes and identity metadata. Do not attempt to restore Supabase-managed Auth tables into an active project by hand.
5. **Storage metadata and bytes:** Storage metadata (bucket/object rows) is separate from the actual file bytes. Back up the configured `listing-photos` bucket's objects using a supported Storage CLI/S3-compatible download path and separately preserve the app's listing-photo references and bucket configuration. Verify object paths and bytes, not only database rows.
6. **Recovery notes/config inventory:** retain migration ordering, project region/plan, required non-secret setting names, allowed redirect/callback configuration, bucket names/policies and a list of service dependencies. Never put provider secrets, connection strings, access tokens or actual user email lists in the manifest.

## 3. Proposed low-cost cadence and retention (owner approval pending)

- Create a recovery set **weekly**, and immediately before a migration, destructive data operation or material release/configuration change.
- Keep the **four most recent weekly sets** plus the most recent pre-change set; remove older sets after 30 days unless an incident has a documented preservation need.
- Re-apply valid deletion requests after a restore where necessary; a restore must not silently reintroduce records that were lawfully deleted.
- Use a dedicated backup directory outside the repository and outside any synced project folder. Encrypt the completed archive at rest with a strong unique password. Keep the password separate from the archive (for example, in the owner's password manager); do not commit backup artifacts or keys to GitHub.
- Generate a SHA-256 checksum manifest for each file and a count/list inventory for Storage objects. A checksum proves file integrity after copying; it does not prove the files can be restored.

These cadence/retention values are a proposed practical baseline for owner review, not an already approved retention policy or a statement that automatic expiry exists.

## 4. Execution sequence — only after explicit authorization

### A. Preflight and destination

- Confirm the linked Supabase project ref and host against the approved staging project before any read command. Do not infer project identity solely from a local .env file.
- Create a unique timestamped directory outside the repo and ensure it has restricted filesystem permissions.
- Confirm available free disk space and the current CLI versions via `supabase --version`, `supabase db dump --help` and `supabase storage cp --help`. CLI flags can change; use the installed CLI's help before copying data.
- Never echo secrets or use a production/service-role key in a browser/client environment. Do not run any command that restores, migrates, deletes or writes to the linked project during backup.

### B. Application database schema and data

After the project target is confirmed and the owner explicitly authorizes a read/export operation, the starting CLI commands are:

    supabase db dump --linked --schema public,private --file "$BACKUP_DIR/app-schema.sql"
    supabase db dump --linked --data-only --schema public,private --file "$BACKUP_DIR/app-data.sql"
    supabase db dump --linked --role-only --file "$BACKUP_DIR/custom-roles.sql"

Run these only after reviewing installed CLI help and confirming the actual app-owned schemas. Do not put exports under the repository. Review the output filenames and exit status without pasting SQL/data into GitHub. Do not assume these commands include Auth, Storage metadata, Storage bytes, or custom role passwords.

If `--schema public,private` is not compatible with the installed CLI version or the actual schema inventory, stop and revise the procedure before export rather than improvising against a live project.

### C. Auth data

Do not mark recovery complete using only the three files above. Choose one explicitly supported Auth recovery approach, validate it against the current Supabase CLI/platform version and the target schema version, and ensure it includes the necessary identity records. Auth export files may contain sensitive identifiers and password hashes; encrypt them immediately and restrict access. Do not post sample rows or export output in an issue.

### D. Storage objects

Use the documented Supabase CLI `storage` copy/list command, or the official S3-compatible Storage endpoint if the operator has separately approved and secured its credentials. The intended operation is a **download to the protected local backup directory** for the bucket used by listing images, not an upload or delete. Check the installed CLI help and current docs first; confirm source and destination direction before execution.

Record object counts and SHA-256 hashes, then compare the exported file list to the relevant app database photo references. Do not treat a list of paths or Storage metadata as a copy of the actual file bytes.

## 5. Isolated restore acceptance test

**Never test restoration against the live staging project or production.** A restore test must use a disposable isolated local Supabase stack or a separately authorized, isolated test project with no production users/data. Do not provision another project or alter account settings without separate owner approval.

A restore is accepted only if all checks pass:

- Restore application schema, application data, custom roles/grants and migrations in the documented order without bypassing RLS or default-privilege protections.
- Check required tables, key relationships, migration history, constraints, RLS and policies. Compare table row counts to the backup manifest.
- Restore Auth identities using the chosen supported procedure; verify identity counts and perform sign-in with a designated non-sensitive test account. Document any password-hash/provider migration limitation explicitly.
- Restore Storage objects and verify every expected object path and byte count/checksum; confirm listing-photo database references point to restored objects and expected public/private access matches the intended configuration.
- Exercise essential application behavior against the isolated restored stack: app startup/health, browse listings, listing detail/photo loading, authentication and registration-consent audit behavior.
- Record the isolated target, tool versions, start/end times, pass/fail counts and sanitized errors only. Never record passwords, tokens, database URLs or object contents in the manifest or GitHub.
- If Auth identities or Storage bytes/references cannot be restored and verified, record a blocker. Do not call the plan verified or invite testers on the premise that the system is recoverable.

## 6. Recovery manifest template

Keep a text manifest beside the encrypted archive, containing only:

- backup timestamp and approved project identifier/region (no connection URL);
- source commit SHA and migration range;
- CLI/tool versions;
- artifact filenames, sizes and SHA-256 checksums;
- application table row counts and Storage object inventory/count;
- encryption confirmation (never the password/key);
- protected storage location identifier;
- retention/delete-after date;
- restore-test status and isolated target identifier;
- unresolved limitations and the owner's residual-risk decision.

## 7. Current disposition

- [x] Supabase Free-tier backup limits are documented from current official guidance.
- [x] The plan explicitly separates application schema/data, Auth, Storage metadata and Storage object bytes.
- [x] Encryption, off-repository storage, proposed retention and isolated restore criteria are specified.
- [ ] Owner approves or revises the proposed cadence, retention and whether the pilot remains blocked pending a successful isolated restore.
- [ ] Authorized backup set created and integrity checks recorded.
- [ ] Isolated restore covering app data, Auth identities/sign-in and Storage bytes/references passes.
- [ ] Owner explicitly accepts residual risk or marks #155 as a hard release blocker.

**Until the last two runtime/owner decisions are complete, #155 remains OPEN and beta recovery is not verified.**
