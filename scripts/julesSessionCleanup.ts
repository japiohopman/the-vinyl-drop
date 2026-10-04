import { runJulesSessionCleanup } from '../src/workflow/julesSessionCleanup';

export async function runCliMain(): Promise<void> {
  const repository = process.env.REPOSITORY || process.env.GITHUB_REPOSITORY || '';
  const sessionInputs = process.env.SESSION_IDS || process.env.SESSION_NAMES || '';
  const confirmationToken = process.env.CONFIRMATION_TOKEN || '';
  const dryRun = process.env.DRY_RUN !== 'false';
  const julesApiKey = process.env.JULES_API_KEY || '';

  console.log('--------------------------------------------------');
  console.log('🧹 Jules Manual Stale-Session Cleanup Engine');
  console.log('--------------------------------------------------');
  console.log(`Repository:            ${repository || '(none)'}`);
  console.log(`Mode:                  ${dryRun ? 'DRY RUN (Inspection Only)' : 'LIVE DELETION'}`);
  console.log(`Confirmation Token:    ${confirmationToken ? '(provided)' : '(omitted)'}`);

  const result = await runJulesSessionCleanup({
    repository,
    sessionInputs,
    confirmationToken,
    dryRun,
    julesApiKey,
  });

  console.log('\n--- Cleanup Summary ---');
  console.log(`Inspected Sessions:    ${result.inspectedCount}`);
  console.log(`Deleted Sessions:      ${result.deletedCount}`);
  console.log(`Deletion Authorized:   ${result.deletionAuthorized}`);

  console.log('\n--- Session Results ---');
  for (const s of result.sessions) {
    console.log(`• [${s.sessionId}] Name: ${s.normalizedSessionName}`);
    console.log(`  State:      ${s.state || 'N/A'}`);
    console.log(`  Source:     ${s.source || 'N/A'}`);
    console.log(`  Deletable:  ${s.isDeletable}`);
    console.log(`  Deleted:    ${s.deleted}`);
    console.log(`  Reason:     ${s.reason}`);
  }

  if (result.errors.length > 0) {
    console.error('\n❌ Errors / Guard Failures:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
  }

  if (!result.success) {
    console.error('\n❌ Cleanup completed with failures or fail-closed conditions.');
    process.exit(1);
  } else {
    console.log('\n✅ Cleanup execution completed successfully.');
  }
}

if (require.main === module) {
  runCliMain().catch((err) => {
    console.error('Unhandled exception during cleanup execution:', err);
    process.exit(1);
  });
}
