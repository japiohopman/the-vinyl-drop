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

### B. Proposed application database export

**Recommended method:** use a logical PostgreSQL dump in custom format for the actual app schemas so each artifact contains both schema definitions and data. Use the existing approved database connection only after the project reference/host has been verified. The following is a command template, not authorization to run it:

    pg_dump --dbname="$SUPABASE_DB_URL" --format=custom --schema=public --schema=private --file="$BACKUP_DIR/application.dump"
    supabase db dump --linked --role-only --file="$BACKUP_DIR/custom-roles.sql"

Before running, verify the current CLI and PostgreSQL client help, confirm the actual application schemas and that the selected connection can read them. If direct `pg_dump` is not available in the local environment, stop and select a supported export path rather than silently assuming a default CLI dump includes everything. Never echo or store the connection string in the repository. The dump may include every app row, so encrypt it immediately and restrict access.

The `supabase db dump` command is still useful for migrations/schema details, but its default managed-schema exclusions make it insufficient on its own. Review exit codes, file sizes and SHA-256 checksums only; never paste SQL/data into GitHub.

### C. Proposed Supabase Auth export

Auth user migration is supported with PostgreSQL logical export/import, but it is a separate sensitive component. Supabase's guide confirms the `auth` schema includes user and identity records and password hashes, and warns that JWT secret differences invalidate existing tokens. It does not provide a one-size-fits-all Auth-only script:
https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects

The proposed export artifact is a separate direct Auth-schema dump:

    pg_dump --dbname="$SUPABASE_DB_URL" --format=custom --schema=auth --file="$BACKUP_DIR/auth.dump"

This command is a template only. First confirm the installed client version, source schema compatibility, privileges and Supabase-supported migration guidance. The dump can contain email addresses, identity metadata and password hashes; encrypt it immediately, keep it outside the repository, and restrict access. Never restore it into the live staging/production Auth schema. The procedure is not accepted until the dump can be restored into a fresh, compatible **isolated** Supabase target and designated test-user sign-in succeeds. Different JWT secrets mean existing tokens will not be portable and users will need to sign in again.

### D. Storage object bytes and metadata

The database dump contains Storage metadata/references, not the listing-photo bytes. Download actual object bytes separately from the linked project's listing-photo bucket using the supported CLI `storage cp` operation or an S3-compatible client whose credentials have separately been authorized and protected.

The documented CLI shape is:

    supabase storage ls "<remote-bucket-path>" --recursive --experimental --linked
    supabase storage cp "<remote-bucket-path>" "$BACKUP_DIR/storage-objects/" --recursive --experimental --linked

These are shape examples only; confirm the installed CLI's `--help` for the exact remote-path notation and direction before any download. The remote bucket is the source and the protected local directory the destination. These commands have **not** been run. Do not upload, move or delete anything as part of a backup.

Record object counts and SHA-256 hashes, then compare exported paths against app database photo references. A path inventory or `storage.objects` rows are not a substitute for the actual file bytes. The restore test must recreate the intended bucket configuration/policies, restore objects through the supported Storage API so platform metadata is regenerated, and verify every expected path/byte checksum and listing reference.

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
