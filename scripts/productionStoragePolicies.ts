export interface StoragePolicyRow {
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
}

export interface ExpectedStoragePolicy {
  name: string;
  allowSupabaseSuffix: boolean;
  permissive: 'PERMISSIVE';
  roles: '{public}' | '{authenticated}';
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  qual: string | null;
  withCheck: string | null;
}

/**
 * The controlled release accepts the original seven listing-photo/private-source
 * policies, or that exact set plus the two owner-scoped profile-avatar write policies.
 * The profile-avatars bucket is public-read; no additional SELECT policy is needed.
 *
 * Predicate strings are PostgreSQL's normalized pg_policies expressions,
 * whitespace-insensitive but otherwise compared exactly. This deliberately
 * rejects additional clauses, OR-based widening, unexpected roles/commands,
 * restrictive-policy substitutions and extra storage.objects policies.
 */
export const EXPECTED_STORAGE_POLICIES: readonly ExpectedStoragePolicy[] = [
  {
    name: 'Authenticated Seller Delete for listing-photos',
    allowSupabaseSuffix: false,
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'DELETE',
    qual: "((bucket_id='listing-photos'::text)AND(auth.role()='authenticated'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=auth.uid())))))",
    withCheck: null,
  },
  {
    name: 'Authenticated Seller Insert for listing-photos',
    allowSupabaseSuffix: false,
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'INSERT',
    qual: null,
    withCheck: "((bucket_id='listing-photos'::text)AND(auth.role()='authenticated'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=auth.uid())))))",
  },
  {
    name: 'Authenticated Seller Update for listing-photos',
    allowSupabaseSuffix: false,
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'UPDATE',
    qual: "((bucket_id='listing-photos'::text)AND(auth.role()='authenticated'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=auth.uid())))))",
    withCheck: "((bucket_id='listing-photos'::text)AND(auth.role()='authenticated'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=auth.uid())))))",
  },
  {
    name: 'Scoped Read Access for listing-photos',
    allowSupabaseSuffix: false,
    permissive: 'PERMISSIVE',
    roles: '{public}',
    cmd: 'SELECT',
    qual: "((bucket_id='listing-photos'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND((listings.status='published'::listing_status)OR(listings.seller_id=auth.uid()))))))",
    withCheck: null,
  },
  {
    name: 'listing-photo-originals-select-owner',
    allowSupabaseSuffix: true,
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'SELECT',
    qual: "((bucket_id='listing-photo-originals'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=(SELECTauth.uid()ASuid))))))",
    withCheck: null,
  },
  {
    name: 'listing-photo-originals-insert-owner',
    allowSupabaseSuffix: true,
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'INSERT',
    qual: null,
    withCheck: "((bucket_id='listing-photo-originals'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=(SELECTauth.uid()ASuid))))))",
  },
  {
    name: 'listing-photo-originals-delete-owner',
    allowSupabaseSuffix: true,
    permissive: 'PERMISSIVE',
    roles: '{authenticated}',
    cmd: 'DELETE',
    qual: "((bucket_id='listing-photo-originals'::text)AND(EXISTS(SELECT1FROMlistingsWHERE(((listings.id)::text=(storage.foldername(objects.name))[2])AND(listings.seller_id=(SELECTauth.uid()ASuid))))))",
    withCheck: null,
  },
] as const;

function normalizePolicyName(policyName: string): string {
  const sourcePolicyName = policyName.match(
    /^(listing-photo-originals-(?:select|insert|delete)-owner)(?: [A-Za-z0-9_]+)?$/
  );
  return sourcePolicyName ? sourcePolicyName[1] : policyName;
}

function normalizePredicate(value: string | null): string | null {
  return value === null ? null : value.replace(/\s+/g, '');
}

export function getStoragePolicyValidationErrors(rows: readonly StoragePolicyRow[]): string[] {
  const errors: string[] = [];
  const found = new Map<string, StoragePolicyRow>();

  for (const row of rows) {
    const normalizedName = normalizePolicyName(row.policyname);
    if (found.has(normalizedName)) {
      errors.push(`duplicate Storage policy after name normalization: ${normalizedName}`);
    } else {
      found.set(normalizedName, row);
    }
  }

  const profileAvatarPolicyNames = new Set([
    'profile-avatars-owner-insert',
    'profile-avatars-owner-delete',
  ]);
  const hasProfileAvatarPolicies = [...found.keys()].some((name) => profileAvatarPolicyNames.has(name));
  if (rows.length !== EXPECTED_STORAGE_POLICIES.length && rows.length !== EXPECTED_STORAGE_POLICIES.length + 2) {
    errors.push(`expected exactly 7 legacy policies or 9 policies including profile avatars, found ${rows.length}`);
  }
  if (hasProfileAvatarPolicies && [...profileAvatarPolicyNames].some((name) => !found.has(name))) {
    errors.push('profile avatar Storage policies must be present as a complete insert/delete pair');
  }

  const expectedNames = new Set(EXPECTED_STORAGE_POLICIES.map((policy) => policy.name));
  for (const name of profileAvatarPolicyNames) expectedNames.add(name);
  for (const policy of EXPECTED_STORAGE_POLICIES) {
    const actual = found.get(policy.name);
    if (!actual) {
      errors.push(`missing Storage policy: ${policy.name}`);
      continue;
    }

    const validName = policy.allowSupabaseSuffix
      ? new RegExp(`^${policy.name}(?: [A-Za-z0-9_]+)?$`).test(actual.policyname)
      : actual.policyname === policy.name;
    if (!validName) errors.push(`unexpected policy name: ${actual.policyname}`);

    if (actual.permissive !== policy.permissive) {
      errors.push(`${policy.name}: expected ${policy.permissive} policy mode`);
    }
    if (actual.roles !== policy.roles) {
      errors.push(`${policy.name}: expected role set ${policy.roles}`);
    }
    if (actual.cmd !== policy.cmd) {
      errors.push(`${policy.name}: expected command ${policy.cmd}`);
    }
    if (normalizePredicate(actual.qual) !== policy.qual) {
      errors.push(`${policy.name}: USING predicate does not exactly match the reviewed expression`);
    }
    if (normalizePredicate(actual.with_check) !== policy.withCheck) {
      errors.push(`${policy.name}: WITH CHECK predicate does not exactly match the reviewed expression`);
    }
  }

  for (const normalizedName of found.keys()) {
    if (!expectedNames.has(normalizedName)) {
      errors.push(`unrecognized Storage policy: ${normalizedName}`);
      continue;
    }
    if (!profileAvatarPolicyNames.has(normalizedName)) continue;
    const actual = found.get(normalizedName);
    if (!actual) continue;
    const isInsert = normalizedName === 'profile-avatars-owner-insert';
    if (
      actual.policyname !== normalizedName ||
      actual.permissive !== 'PERMISSIVE' ||
      actual.roles !== '{authenticated}' ||
      actual.cmd !== (isInsert ? 'INSERT' : 'DELETE') ||
      (isInsert ? actual.qual !== null : actual.with_check !== null)
    ) {
      errors.push(`${normalizedName}: expected a PERMISSIVE authenticated ${isInsert ? 'INSERT' : 'DELETE'} policy`);
      continue;
    }
    const predicate = (normalizePredicate(isInsert ? actual.with_check : actual.qual) || '').replace(/\\bobjects\\./g, '');
    const requiredFragments = [
      "bucket_id='profile-avatars'::text",
      "(storage.foldername(name))[1]='profiles'::text",
      "(storage.foldername(name))[2]=",
      "auth.uid()",
    ];
    if (
      requiredFragments.some((fragment) => !predicate.includes(fragment)) ||
      /OR|TRUE|NOT/.test(predicate)
    ) {
      errors.push(`${normalizedName}: owner predicate must bind the profile-avatars bucket and the caller's profiles/<uid> path`);
    }
  }

  return errors;
}

export function assertExactStoragePolicySet(rows: readonly StoragePolicyRow[]): void {
  const errors = getStoragePolicyValidationErrors(rows);
  if (errors.length > 0) {
    throw new Error(`Storage policy preflight failed: ${errors.join('; ')}`);
  }
}
