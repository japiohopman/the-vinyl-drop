CREATE UNIQUE INDEX IF NOT EXISTS "profiles_username_lower_idx" ON "profiles" (LOWER("username"));
