import {
  EXPECTED_STORAGE_POLICIES,
  getStoragePolicyValidationErrors,
} from '../scripts/productionStoragePolicies';
import type { StoragePolicyRow } from '../scripts/productionStoragePolicies';

function validPolicyRows(): StoragePolicyRow[] {
  return EXPECTED_STORAGE_POLICIES.map((policy) => ({
    policyname: policy.allowSupabaseSuffix ? `${policy.name} vmdo66_0` : policy.name,
    permissive: policy.permissive,
    roles: policy.roles,
    cmd: policy.cmd,
    qual: policy.qual,
    with_check: policy.withCheck,
  }));
}

describe('production Storage policy preflight', () => {
  test('accepts the exact reviewed legacy seven-policy set', () => {
    expect(getStoragePolicyValidationErrors(validPolicyRows())).toEqual([]);
  });

  test('accepts the exact owner-scoped avatar insert/delete pair without changing listing policies', () => {
    const rows = validPolicyRows();
    const ownerPredicate = "((bucket_id = 'profile-avatars') AND (storage.foldername(objects.name))[1] = 'profiles' AND (storage.foldername(objects.name))[2] = (SELECT auth.uid()::text))";
    rows.push({
      policyname: 'profile-avatars-owner-insert',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'INSERT',
      qual: null,
      with_check: ownerPredicate,
    });
    rows.push({
      policyname: 'profile-avatars-owner-delete',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'DELETE',
      qual: ownerPredicate,
      with_check: null,
    });
    expect(getStoragePolicyValidationErrors(rows)).toEqual([]);
  });

  test('rejects a widened or incomplete profile-avatar policy pair', () => {
    const rows = validPolicyRows();
    rows.push({
      policyname: 'profile-avatars-owner-insert',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'INSERT',
      qual: null,
      with_check: "bucket_id = 'profile-avatars' OR true",
    });
    rows.push({
      policyname: 'profile-avatars-owner-delete',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'DELETE',
      qual: "bucket_id = 'profile-avatars' OR true",
      with_check: null,
    });
    expect(getStoragePolicyValidationErrors(rows).join(' ')).toMatch(/owner predicate/);
  });

  test('rejects any additional permissive policy, including a generic public reader', () => {
    const rows = validPolicyRows();
    rows.push({
      policyname: 'unexpected-storage-reader',
      permissive: 'PERMISSIVE',
      roles: '{authenticated}',
      cmd: 'SELECT',
      qual: 'true',
      with_check: null,
    });

    expect(getStoragePolicyValidationErrors(rows).join(' ')).toMatch(/exactly 7 legacy policies or 9 policies/);
    expect(getStoragePolicyValidationErrors(rows).join(' ')).toMatch(/unrecognized Storage policy/);
  });

  test('rejects an OR-widened private source predicate', () => {
    const rows = validPolicyRows();
    const selectPolicy = rows.find((row) => row.policyname.startsWith('listing-photo-originals-select-owner'));
    if (!selectPolicy || !selectPolicy.qual) throw new Error('Private source SELECT fixture missing');
    selectPolicy.qual = `${selectPolicy.qual} OR true`;

    expect(getStoragePolicyValidationErrors(rows).join(' ')).toMatch(/USING predicate does not exactly match/);
  });

  test('rejects a changed role or restrictive policy mode', () => {
    const wrongRole = validPolicyRows();
    const sourceSelect = wrongRole.find((row) => row.policyname.startsWith('listing-photo-originals-select-owner'));
    if (!sourceSelect) throw new Error('Private source SELECT fixture missing');
    sourceSelect.roles = '{public}';
    expect(getStoragePolicyValidationErrors(wrongRole).join(' ')).toMatch(/expected role set/);

    const restrictive = validPolicyRows();
    const listingDelete = restrictive.find((row) => row.policyname === 'Authenticated Seller Delete for listing-photos');
    if (!listingDelete) throw new Error('Listing DELETE fixture missing');
    listingDelete.permissive = 'RESTRICTIVE';
    expect(getStoragePolicyValidationErrors(restrictive).join(' ')).toMatch(/expected PERMISSIVE policy mode/);
  });

  test('rejects a missing source policy and duplicate generated names', () => {
    const missing = validPolicyRows().filter((row) => !row.policyname.startsWith('listing-photo-originals-delete-owner'));
    expect(getStoragePolicyValidationErrors(missing).join(' ')).toMatch(/missing Storage policy/);

    const duplicates = validPolicyRows();
    const duplicate = duplicates.find((row) => row.policyname.startsWith('listing-photo-originals-select-owner'));
    if (!duplicate) throw new Error('Private source SELECT fixture missing');
    duplicates.push({ ...duplicate, policyname: 'listing-photo-originals-select-owner another_suffix' });
    expect(getStoragePolicyValidationErrors(duplicates).join(' ')).toMatch(/duplicate Storage policy/);
  });
});
